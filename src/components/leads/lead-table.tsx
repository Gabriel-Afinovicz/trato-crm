"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useCompanyTimezone } from "@/hooks/use-company-timezone";
import { useLeadFilters } from "@/hooks/use-lead-filters";
import { formatDateInTz } from "@/lib/utils/timezone";
import type {
  LeadDetailed,
  MinidashCohort,
  PipelineStage,
  Sector,
  StageCategory,
  Tag,
  User,
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
import { LostReasonModal } from "@/components/dashboard/lost-reason-modal";
import { WhatsAppLeadLink } from "@/components/whatsapp/whatsapp-lead-link";
import { confirm } from "@/components/ui/confirm";
import { createClient } from "@/lib/supabase/client";
import { moveLeadStage } from "@/lib/leads/move-stage";
import type { KanbanLead } from "@/lib/supabase/dashboard-data";

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
  const companyTz = useCompanyTimezone();
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
  const [sectors, setSectors] = useState<Sector[]>([]);
  // Operador restrito por setor: esconde o filtro "Todos setores" (o
  // servidor ja limita a listagem aos setores permitidos).
  const [sectorsRestricted, setSectorsRestricted] = useState(false);
  const [tagsByLead, setTagsByLead] = useState<Record<string, Tag[]>>({});
  const [members, setMembers] = useState<User[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(filters.state.q);

  // Selecao em lote (checkboxes na lista). Set por id evita custo
  // O(n) para verificar se uma linha esta selecionada. A barra de
  // acoes aparece quando ha pelo menos um id selecionado.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

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

  // Setores para popular o filtro de Setor.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetch(`/api/sectors?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: Sector[]; restricted?: boolean } | null) => {
        if (cancelled || !data?.items) return;
        setSectors(data.items);
        setSectorsRestricted(Boolean(data.restricted));
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Membros (operadores/admins) para o dropdown de reatribuicao em lote.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("users")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setMembers((data as unknown as User[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    for (const s of stages) map.set(s.id, s);
    return map;
  }, [stages]);

  const [totalCompanyLeads, setTotalCompanyLeads] = useState<number | null>(null);

  const showInstructions = totalCompanyLeads === 0;

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
      if (filters.state.sector) {
        url.searchParams.set("sector", filters.state.sector);
      }
      if (filters.state.source) {
        url.searchParams.set("sourceId", filters.state.source);
      }
      if (filters.state.tags.length > 0) {
        url.searchParams.set("tags", filters.state.tags.join(","));
      }
      url.searchParams.set("page", String(filters.state.page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));

      const miniUrl = new URL("/api/leads/minidash", window.location.origin);
      miniUrl.searchParams.set("companyId", companyId);
      miniUrl.searchParams.set("start", effectiveRange.start);
      miniUrl.searchParams.set("end", effectiveRange.end);
      if (filters.state.sector) {
        miniUrl.searchParams.set("sector", filters.state.sector);
      }

      const supabase = createClient();
      const [listRes, miniRes, countRes] = await Promise.all([
        fetch(url.toString()),
        fetch(miniUrl.toString()),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
      ]);

      if (countRes && !countRes.error && countRes.count !== null) {
        setTotalCompanyLeads(countRes.count);
      }

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
    filters.state.sector,
    filters.state.source,
    filters.state.tags,
    filters.state.page,
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

  // Limpa a selecao quando a pagina muda (qualquer filtro/paginacao).
  // Os ids selecionados poderiam ter saido da pagina visivel e gerar
  // confusao "marquei X mas vejo Y selecionados".
  useEffect(() => {
    setSelectedIds(new Set());
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = filters.state.page;

  // Ids visiveis na pagina atual — usado pelo checkbox "selecionar todos
  // da pagina" no header da tabela.
  const visibleIds = useMemo(() => items.map((l) => l.id), [items]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function runBulk(
    payload: { assigned_to?: string | null; sector_id?: string | null },
    confirmDescription: string
  ) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Aplicar a ${ids.length} lead${ids.length === 1 ? "" : "s"}?`,
      description: confirmDescription,
      confirmLabel: "Aplicar",
    });
    if (!ok) return;
    setBulkRunning(true);
    try {
      const res = await fetch("/api/leads/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, leadIds: ids, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        updated?: number;
        requested?: number;
      };
      if (!res.ok) {
        toast.error("Falha na atualizacao em lote", {
          description: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const updated = data.updated ?? 0;
      const requested = data.requested ?? ids.length;
      if (updated === 0) {
        toast.warning("Nenhum lead foi atualizado", {
          description:
            "Verifique se voce tem permissao para alterar esses leads.",
        });
      } else if (updated < requested) {
        toast.success(`${updated} de ${requested} leads atualizados`, {
          description: `${requested - updated} sem permissao ou nao encontrado(s).`,
        });
      } else {
        toast.success(`${updated} lead${updated === 1 ? "" : "s"} atualizado${updated === 1 ? "" : "s"}`);
      }
      setSelectedIds(new Set());
      await fetchPage();
    } finally {
      setBulkRunning(false);
    }
  }

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
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${active
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

        <div className="flex w-full items-center gap-2 sm:w-auto">
          {sectors.length > 0 && !sectorsRestricted && (
            <select
              value={filters.state.sector ?? ""}
              onChange={(e) =>
                filters.setFilters({ sector: e.target.value || null })
              }
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
            >
              <option value="">Todos setores</option>
              <option value="none">Sem setor</option>
              {sectors.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          )}
          {sectorsRestricted && sectors.length > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-500"
              title="Você vê apenas os leads do seu setor"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: sectors[0].color }}
                aria-hidden
              />
              {sectors[0].name}
            </span>
          )}
          <div className="w-full sm:w-72">
            <Input
              placeholder="Buscar por nome, telefone, e-mail…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          members={members}
          sectors={sectors}
          disabled={bulkRunning}
          onClear={() => setSelectedIds(new Set())}
          onAssign={(userId) =>
            runBulk(
              { assigned_to: userId },
              userId
                ? `Os leads selecionados serao atribuidos ao membro escolhido.`
                : `Os leads selecionados ficarao sem responsavel.`
            )
          }
          onSetSector={(sectorId) =>
            runBulk(
              { sector_id: sectorId },
              sectorId
                ? `Os leads selecionados serao movidos para o setor escolhido.`
                : `Os leads selecionados ficarao sem setor.`
            )
          }
        />
      )}

      {showInstructions ? (
        // Empty state coerente com o padrao dos outros (Kanban vazio,
        // Agenda sem horarios, Analitico zerado): card azul claro com
        // borda tracejada e CTAs concretas no lugar de instrucao seca.
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/60 px-6 py-12 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            <svg
              className="h-6 w-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 8.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Zm9.75-9.75A2.25 2.25 0 0 1 15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
              />
            </svg>
          </div>
          <p className="mt-3 text-base font-semibold text-gray-900">
            Comece selecionando categorias ou crie seu primeiro lead
          </p>
          <p className="mt-1 max-w-md text-sm text-gray-600">
            Clique nas <span className="font-medium">categorias acima</span>{" "}
            (Frio, Quente, Agendado…) para ver os leads do periodo, ou
            cadastre um novo agora.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a
              href={`/${domain}/leads/new`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Criar primeiro lead
            </a>
            <button
              type="button"
              onClick={() =>
                filters.setFilters({
                  categories: ["quente", "agendado", "fechado"],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Ver leads ativos
            </button>
          </div>
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
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos os leads da pagina"
                          checked={allVisibleSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleSelected;
                          }}
                          onChange={toggleAllVisible}
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-6 py-3">Nome</th>
                      <th className="px-6 py-3">Telefone</th>
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
                      const selected = selectedIds.has(lead.id);
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => setEditingLeadId(lead.id)}
                          className={`cursor-pointer transition-colors hover:bg-gray-50 ${selected ? "bg-blue-50/40" : ""}`}
                        >
                          <td
                            className="w-10 px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Selecionar lead ${lead.name}`}
                              checked={selected}
                              onChange={() => toggleId(lead.id)}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="whitespace-nowrap px-6 py-3 font-medium text-gray-900">
                            {lead.name}
                          </td>
                          <td className="px-6 py-3 text-gray-600">
                            <div className="flex flex-col">
                              {lead.phone && (
                                <span className="inline-flex items-center gap-2 text-sm">
                                  {lead.phone}
                                  <WhatsAppLeadLink
                                    domain={domain}
                                    phone={lead.phone}
                                    leadId={lead.id}
                                    stopRowPropagation
                                  />
                                </span>
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
                            {companyId ? (
                              <RowStageMenu
                                lead={lead}
                                stage={stage}
                                stages={stages}
                                companyId={companyId}
                                onChanged={fetchPage}
                              />
                            ) : (
                              <StageBadge
                                stageName={stage?.name ?? lead.stage_name}
                                stageColor={stage?.color ?? lead.stage_color}
                                fallbackStatus={lead.status}
                              />
                            )}
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
                            {formatDateInTz(lead.created_at, companyTz)}
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
              className={`min-w-[2rem] rounded border px-2 py-1 text-xs font-medium ${p === page
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

interface BulkActionsBarProps {
  count: number;
  members: User[];
  sectors: Sector[];
  disabled: boolean;
  onClear: () => void;
  onAssign: (userId: string | null) => void;
  onSetSector: (sectorId: string | null) => void;
}

/**
 * Barra fixa exibida no topo da lista de leads quando ha selecao.
 * Apresenta a contagem + dois selects de acao (responsavel/setor) +
 * botao "Limpar". Cada acao confirma antes via modal e exibe toast
 * com resultado.
 */
function BulkActionsBar({
  count,
  members,
  sectors,
  disabled,
  onClear,
  onAssign,
  onSetSector,
}: BulkActionsBarProps) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-2 shadow-sm backdrop-blur">
      <span className="text-sm font-medium text-blue-900">
        {count} lead{count === 1 ? "" : "s"} selecionado{count === 1 ? "" : "s"}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-600">
          Responsavel:{" "}
          <select
            disabled={disabled}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (v === "__none__") onAssign(null);
              else if (v) onAssign(v);
            }}
            className="ml-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="" disabled>
              Atribuir a...
            </option>
            <option value="__none__">— Sem responsavel</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {sectors.length > 0 && (
          <label className="text-xs text-gray-600">
            Setor:{" "}
            <select
              disabled={disabled}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = "";
                if (v === "__none__") onSetSector(null);
                else if (v) onSetSector(v);
              }}
              className="ml-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            >
              <option value="" disabled>
                Mover para...
              </option>
              <option value="__none__">— Sem setor</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="ml-auto text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
      >
        Limpar selecao
      </button>
    </div>
  );
}

/**
 * Badge de etapa clicavel na lista de leads. Abre um menu para mover o
 * lead de etapa reusando `moveLeadStage` (mesma rota/RPC do Kanban). O
 * container interrompe a propagacao do clique para nao abrir o modal de
 * edicao da linha.
 */
function RowStageMenu({
  lead,
  stage,
  stages,
  companyId,
  onChanged,
}: {
  lead: LeadDetailed;
  stage: PipelineStage | undefined;
  stages: PipelineStage[];
  companyId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingLostStageId, setPendingLostStageId] = useState<string | null>(
    null
  );
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function applyMove(toStageId: string, lostReason?: string | null) {
    if (toStageId === lead.stage_id) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await moveLeadStage({
      companyId,
      leadId: lead.id,
      fromStageId: lead.stage_id,
      toStageId,
      lostReason: lostReason ?? null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não foi possível mudar a etapa", {
        description: result.error,
      });
      return;
    }
    toast.success("Etapa atualizada");
    setOpen(false);
    setPendingLostStageId(null);
    onChanged();
  }

  function handleSelect(s: PipelineStage) {
    if (s.id === lead.stage_id) {
      setOpen(false);
      return;
    }
    if (s.is_lost) {
      setOpen(false);
      setPendingLostStageId(s.id);
      return;
    }
    void applyMove(s.id);
  }

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={saving || stages.length === 0}
        onClick={() => setOpen((v) => !v)}
        title="Clique para mudar a etapa"
        className="disabled:cursor-default"
      >
        <StageBadge
          stageName={stage?.name ?? lead.stage_name}
          stageColor={stage?.color ?? lead.stage_color}
          fallbackStatus={lead.status}
          className="cursor-pointer hover:bg-gray-50"
        />
      </button>
      {open && stages.length > 0 && (
        <div className="absolute left-0 z-30 mt-1.5 w-56 origin-top-left rounded-xl border border-slate-200/80 bg-white py-1.5 shadow-lg ring-1 ring-black/5">
          <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Mover para etapa
          </div>
          <div className="mt-1 max-h-64 overflow-y-auto">
            {stages.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={s.id === lead.stage_id}
                onClick={() => handleSelect(s)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate">{s.name}</span>
                {s.id === lead.stage_id && (
                  <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                    atual
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingLostStageId && (
        <LostReasonModal
          lead={{ name: lead.name } as unknown as KanbanLead}
          onConfirm={(reason) => applyMove(pendingLostStageId, reason)}
          onCancel={() => setPendingLostStageId(null)}
        />
      )}
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
