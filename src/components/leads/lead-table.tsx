"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useLeadFilters } from "@/hooks/use-lead-filters";
import type {
  LeadDetailed,
  MinidashCohort,
  PipelineStage,
  StageCategory,
  Tag,
} from "@/lib/types/database";
import {
  STAGE_CATEGORY_LABEL,
  STAGE_CATEGORIES,
} from "@/lib/types/database";
import { Input } from "@/components/ui/input";
import { StageBadge } from "@/components/dashboard/stage-badge";
import { LeadsMinidash } from "./leads-minidash";
import {
  DateRangePicker,
  endExclusiveToInclusiveLabel,
  formatRangeLabel,
  fromLocalDateInputEndExclusive,
  fromLocalDateInputStart,
  toLocalDateInput,
} from "./date-range-picker";
import { defaultMonthRangeLocal } from "@/lib/utils/date-range";
import { KanbanLeadEditModal } from "@/components/dashboard/kanban-lead-edit-modal";
import { createClient } from "@/lib/supabase/client";

interface LeadTableProps {
  domain: string;
}

const PAGE_SIZE = 30;
const MAX_TAGS_INLINE = 3;

const CATEGORY_ACCENT: Record<StageCategory, string> = {
  frio: "bg-sky-100 text-sky-800",
  quente: "bg-orange-100 text-orange-800",
  agendado: "bg-blue-100 text-blue-800",
  compareceu: "bg-violet-100 text-violet-800",
  orcamento: "bg-amber-100 text-amber-800",
  fechado: "bg-emerald-100 text-emerald-800",
  perdido: "bg-rose-100 text-rose-800",
};

/**
 * Tela de Leads (lista) — espelha a mesma fonte de dados do Kanban,
 * com a mesma mini-dash de categorias + filtros via URL params.
 *
 * Diferenças de comportamento vs. Kanban:
 * - Estado inicial sem categorias selecionadas → mostra mensagem
 *   instrutiva. Usuário precisa clicar em pelo menos uma categoria
 *   ou usar busca para ver leads.
 * - Paginação clássica numerada (PAGE_SIZE leads por página).
 * - Click na linha abre modal de edição (mesmo do Kanban).
 */
export function LeadTable({ domain }: LeadTableProps) {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const filters = useLeadFilters();

  const [items, setItems] = useState<LeadDetailed[]>([]);
  const [total, setTotal] = useState(0);
  const [minidash, setMinidash] = useState<MinidashCohort>({
    total: 0,
    frio: 0,
    quente: 0,
    agendado: 0,
    compareceu: 0,
    orcamento: 0,
    fechado: 0,
    perdido: 0,
    sem_categoria: 0,
  });
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tagsByLead, setTagsByLead] = useState<Record<string, Tag[]>>({});
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(filters.state.q);

  const monthDefault = useMemo(() => defaultMonthRangeLocal(), []);
  const effectiveRange = useMemo(() => {
    return {
      start: filters.state.start ?? monthDefault.start.toISOString(),
      end: filters.state.end ?? monthDefault.end.toISOString(),
    };
  }, [filters.state.start, filters.state.end, monthDefault]);

  // Debounce da busca para não bater na API a cada tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput !== filters.state.q) {
        filters.setFilters({ q: searchInput });
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Stages (para mostrar nome/categoria) — uma vez por companyId.
  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    void supabase
      .from("pipeline_stages")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .then(({ data }) => {
        setStages((data as unknown as PipelineStage[]) ?? []);
      });
  }, [companyId]);

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    for (const s of stages) map.set(s.id, s);
    return map;
  }, [stages]);

  const showInstructions =
    filters.state.categories.length === 0 && !filters.state.q;

  const fetchPage = useCallback(async () => {
    if (!companyId) return;
    setIsFetching(true);
    setError(null);

    try {
      const url = new URL("/api/leads", window.location.origin);
      url.searchParams.set("companyId", companyId);
      url.searchParams.set("start", effectiveRange.start);
      url.searchParams.set("end", effectiveRange.end);
      if (filters.state.categories.length > 0) {
        url.searchParams.set("categories", filters.state.categories.join(","));
      }
      if (filters.state.q) url.searchParams.set("q", filters.state.q);
      if (filters.state.assignee) {
        url.searchParams.set("assignee", filters.state.assignee);
      }
      if (filters.state.specialty) {
        url.searchParams.set("specialty", filters.state.specialty);
      }
      if (filters.state.source) {
        url.searchParams.set("sourceId", filters.state.source);
      }
      if (filters.state.tags.length > 0) {
        url.searchParams.set("tags", filters.state.tags.join(","));
      }
      url.searchParams.set("page", String(filters.state.page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));

      // Só busca a lista se há filtros — sem categoria nem busca, mostramos
      // estado instrutivo (mas a minidash continua sendo carregada).
      const wantsList = !showInstructions;

      const [listRes, miniRes] = await Promise.all([
        wantsList ? fetch(url.toString()) : Promise.resolve(null),
        fetch(
          `/api/leads/minidash?companyId=${companyId}&start=${encodeURIComponent(
            effectiveRange.start
          )}&end=${encodeURIComponent(effectiveRange.end)}`
        ),
      ]);

      if (listRes) {
        if (!listRes.ok) throw new Error("list fetch failed");
        const data = (await listRes.json()) as {
          items: LeadDetailed[];
          total: number;
        };
        setItems(data.items);
        setTotal(data.total);

        // Tags do batch atual (lookup leve por página).
        if (data.items.length > 0) {
          const supabase = createClient();
          const leadIds = data.items.map((l) => l.id);
          const [allTagsRes, leadTagRowsRes] = await Promise.all([
            supabase
              .from("tags")
              .select("*")
              .eq("company_id", companyId),
            supabase
              .from("lead_tags")
              .select("lead_id, tag_id")
              .in("lead_id", leadIds),
          ]);
          const allTags = (allTagsRes.data as unknown as Tag[] | null) ?? [];
          const rows =
            (leadTagRowsRes.data as
              | { lead_id: string; tag_id: string }[]
              | null) ?? [];
          const tagById = new Map(allTags.map((t) => [t.id, t] as const));
          const grouped: Record<string, Tag[]> = {};
          for (const row of rows) {
            const tag = tagById.get(row.tag_id);
            if (!tag) continue;
            if (!grouped[row.lead_id]) grouped[row.lead_id] = [];
            grouped[row.lead_id].push(tag);
          }
          setTagsByLead(grouped);
        } else {
          setTagsByLead({});
        }
      } else {
        setItems([]);
        setTotal(0);
        setTagsByLead({});
      }

      if (miniRes.ok) {
        const md = (await miniRes.json()) as { minidash: MinidashCohort };
        setMinidash(md.minidash);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar leads."
      );
    } finally {
      setIsFetching(false);
    }
  }, [
    companyId,
    effectiveRange,
    filters.state.categories,
    filters.state.q,
    filters.state.assignee,
    filters.state.specialty,
    filters.state.source,
    filters.state.tags,
    filters.state.page,
    showInstructions,
  ]);

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setItems([]);
      setTotal(0);
      setIsFetching(false);
      return;
    }
    void fetchPage();
  }, [companyLoading, companyId, fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = filters.state.page;

  return (
    <div className="space-y-4">
      <LeadsMinidash
        cohort={minidash}
        selected={filters.state.categories}
        onToggle={(cat: StageCategory) => filters.toggleCategory(cat)}
        onClearAll={() => filters.setFilters({ categories: [] })}
        isPending={isFetching}
        rangeControl={
          <button
            type="button"
            onClick={() => setShowRangePicker((v) => !v)}
            title="Alterar período"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            {formatRangeLabel(effectiveRange.start, effectiveRange.end)}
          </button>
        }
      />

      {showRangePicker && (
        <DateRangePicker
          initialStart={toLocalDateInput(effectiveRange.start)}
          initialEndInclusive={endExclusiveToInclusiveLabel(effectiveRange.end)}
          isPending={isFetching}
          onCancel={() => setShowRangePicker(false)}
          onApply={(startStr, endStr) => {
            const start = fromLocalDateInputStart(startStr);
            const end = fromLocalDateInputEndExclusive(endStr);
            const isDefault =
              start.getTime() === monthDefault.start.getTime() &&
              end.getTime() === monthDefault.end.getTime();
            filters.setFilters({
              start: isDefault ? null : start.toISOString(),
              end: isDefault ? null : end.toISOString(),
            });
            setShowRangePicker(false);
          }}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STAGE_CATEGORIES.map((cat) => {
            const active = filters.state.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => filters.toggleCategory(cat)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? CATEGORY_ACCENT[cat]
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                }`}
              >
                {STAGE_CATEGORY_LABEL[cat]}
                <span className="text-[10px] opacity-70">
                  {minidash[cat]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder="Buscar por nome, telefone, e-mail…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {showInstructions ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <svg
            className="h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 8.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Zm9.75-9.75A2.25 2.25 0 0 1 15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-700">
            Selecione uma ou mais categorias acima
          </p>
          <p className="mt-1 text-xs text-gray-500">
            ou digite uma busca para listar os leads do período.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {items.length === 0 && !isFetching ? (
              <div className="px-6 py-12 text-center text-gray-500">
                Nenhum lead encontrado com os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-6 py-3">Nome</th>
                      <th className="px-6 py-3">Contato</th>
                      <th className="px-6 py-3">Categoria</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Tags</th>
                      <th className="px-6 py-3">Fonte</th>
                      <th className="px-6 py-3">Responsável</th>
                      <th className="px-6 py-3">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((lead) => {
                      const stage = stageById.get(lead.stage_id);
                      const cat = lead.stage_category ?? stage?.category;
                      const leadTags = tagsByLead[lead.id] ?? [];
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => setEditingLeadId(lead.id)}
                          className="cursor-pointer transition-colors hover:bg-gray-50"
                        >
                          <td className="whitespace-nowrap px-6 py-3 font-medium text-gray-900">
                            {lead.name}
                          </td>
                          <td className="px-6 py-3 text-gray-600">
                            <div className="flex flex-col">
                              {lead.phone && (
                                <span className="text-sm">{lead.phone}</span>
                              )}
                              {lead.email && (
                                <span className="text-xs text-gray-400">
                                  {lead.email}
                                </span>
                              )}
                              {!lead.phone && !lead.email && "—"}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-3">
                            {cat ? (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_ACCENT[cat]}`}
                              >
                                {STAGE_CATEGORY_LABEL[cat]}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-3">
                            <StageBadge
                              stageName={stage?.name ?? lead.stage_name}
                              stageColor={stage?.color ?? lead.stage_color}
                              fallbackStatus={lead.status}
                            />
                          </td>
                          <td className="px-6 py-3">
                            <TagsCell tags={leadTags} />
                          </td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-600">
                            {lead.source_name || "—"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-600">
                            {lead.assigned_to_name || "—"}
                          </td>
                          <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500">
                            {new Date(lead.created_at).toLocaleDateString(
                              "pt-BR"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            isFetching={isFetching}
            onChange={(p) => filters.setPage(p)}
          />
        </>
      )}

      {editingLeadId && (
        <KanbanLeadEditModal
          domain={domain}
          leadId={editingLeadId}
          onClose={() => setEditingLeadId(null)}
          onSaved={() => {
            setEditingLeadId(null);
            void fetchPage();
          }}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  isFetching,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  isFetching: boolean;
  onChange: (page: number) => void;
}) {
  const windowed = useMemo(() => {
    const pages: (number | "…")[] = [];
    const push = (v: number | "…") => pages.push(v);
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) push(i);
    } else {
      push(1);
      if (page > 3) push("…");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) push(i);
      if (page < totalPages - 2) push("…");
      push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-gray-500">
        {total} lead{total !== 1 ? "s" : ""} no período
        {isFetching && " · atualizando…"}
      </p>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1 || isFetching}
          onClick={() => onChange(page - 1)}
          className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Anterior
        </button>
        {windowed.map((p, idx) =>
          p === "…" ? (
            <span key={`gap-${idx}`} className="px-1 text-xs text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              disabled={isFetching}
              onClick={() => onChange(p)}
              className={`min-w-[2rem] rounded border px-2 py-1 text-xs font-medium ${
                p === page
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages || isFetching}
          onClick={() => onChange(page + 1)}
          className="rounded border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

function TagsCell({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) {
    return <span className="text-sm text-gray-300">—</span>;
  }
  const visible = tags.slice(0, MAX_TAGS_INLINE);
  const remaining = tags.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
          }}
        >
          {tag.name}
        </span>
      ))}
      {remaining > 0 && (
        <span
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600"
          title={tags
            .slice(MAX_TAGS_INLINE)
            .map((t) => t.name)
            .join(", ")}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
