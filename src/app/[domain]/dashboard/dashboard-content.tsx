"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useKanbanMinidash } from "@/hooks/use-kanban-minidash";
import { useLeadFilters } from "@/hooks/use-lead-filters";
import {
  LeadFunnel,
  type StageFunnelRow,
} from "@/components/dashboard/lead-funnel";
import { RecentLeads } from "@/components/dashboard/recent-leads";
import { LeadKanbanBoard } from "@/components/dashboard/lead-kanban-board";
import { KanbanErrorBoundary } from "@/components/dashboard/kanban-error-boundary";
import { AnaliticoPanel } from "@/components/dashboard/analitico-panel";
import { LeadsMinidash } from "@/components/leads/leads-minidash";
import {
  DateRangePicker,
  endExclusiveToInclusiveLabel,
  formatRangeLabel,
  fromLocalDateInputEndExclusive,
  fromLocalDateInputStart,
  toLocalDateInput,
} from "@/components/leads/date-range-picker";
import { defaultMonthRangeLocal } from "@/lib/utils/date-range";
import type {
  AnaliticoKpis,
  ClinicAnalyticsGoals,
  Lead,
  MinidashCohort,
  PipelineStage,
  Specialty,
  StageCategory,
} from "@/lib/types/database";
import type {
  KanbanLead,
  KanbanOperator,
} from "@/lib/supabase/dashboard-data";

type DashboardTab = "analitico" | "kanban" | "funil";

const DEFAULT_TAB: DashboardTab = "analitico";

function isValidTab(value: string | null): value is DashboardTab {
  return value === "analitico" || value === "kanban" || value === "funil";
}

interface DashboardContentProps {
  domain: string;
  companyName: string;
  initialRecentLeads: Lead[];
  initialKanbanLeads: KanbanLead[];
  initialOperators: KanbanOperator[];
  initialStages: PipelineStage[];
  initialSpecialties: Specialty[];
  initialLastActivity: Record<string, string>;
  initialKanbanMinidash: MinidashCohort;
  initialKanbanRange: { start: string; end: string };
  initialAnaliticoKpis: AnaliticoKpis;
  initialAnaliticoGoals: ClinicAnalyticsGoals;
  initialAnaliticoGoalsAreDefault: boolean;
  initialAnaliticoRange: { start: string; end: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deriva o funil a partir das etapas atuais do pipeline (uma linha por
 * coluna do kanban). O nome e a cor de cada cartão refletem exatamente a
 * etapa correspondente — adicionar/renomear/recolorir uma coluna propaga
 * automaticamente para o funil.
 */
function computeStageFunnel(
  leads: KanbanLead[],
  stages: PipelineStage[]
): StageFunnelRow[] {
  const now = Date.now();
  const cutoff7 = now - 7 * DAY_MS;
  const cutoff30 = now - 30 * DAY_MS;

  const counts = new Map<
    string,
    { total: number; last_7_days: number; last_30_days: number }
  >();
  for (const stage of stages) {
    counts.set(stage.id, { total: 0, last_7_days: 0, last_30_days: 0 });
  }

  for (const lead of leads) {
    const bucket = counts.get(lead.stage_id);
    if (!bucket) continue;
    bucket.total += 1;
    const createdAt = lead.created_at
      ? new Date(lead.created_at).getTime()
      : NaN;
    if (!Number.isNaN(createdAt)) {
      if (createdAt >= cutoff7) bucket.last_7_days += 1;
      if (createdAt >= cutoff30) bucket.last_30_days += 1;
    }
  }

  return stages.map((stage) => {
    const bucket = counts.get(stage.id) ?? {
      total: 0,
      last_7_days: 0,
      last_30_days: 0,
    };
    return {
      stageId: stage.id,
      label: stage.name,
      color: stage.color,
      total: bucket.total,
      last_7_days: bucket.last_7_days,
      last_30_days: bucket.last_30_days,
    };
  });
}

export function DashboardContent({
  domain,
  companyName,
  initialRecentLeads,
  initialKanbanLeads,
  initialOperators,
  initialStages,
  initialSpecialties,
  initialLastActivity,
  initialKanbanMinidash,
  initialKanbanRange,
  initialAnaliticoKpis,
  initialAnaliticoGoals,
  initialAnaliticoGoalsAreDefault,
  initialAnaliticoRange,
}: DashboardContentProps) {
  // Aba ativa é controlada via `?tab=` para que cliques no submenu da
  // sidebar (Analítico/Kanban/Funil) troquem de aba sem reload.
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: DashboardTab = isValidTab(urlTab) ? urlTab : DEFAULT_TAB;
  const [tab, setTabState] = useState<DashboardTab>(initialTab);

  // Sincroniza quando o usuário muda o tab via sidebar (ou navegação
  // back/forward do navegador). `useSearchParams` é reativo a
  // `router.push/replace`, então a sidebar continua funcionando.
  useEffect(() => {
    if (isValidTab(urlTab) && urlTab !== tab) {
      setTabState(urlTab);
    }
  }, [urlTab, tab]);

  // Troca de aba a partir dos botões do header. Atualizamos só o
  // estado e a URL no histórico do browser via `history.replaceState`
  // — isso evita o RSC re-fetch do `router.replace` que causava uma
  // piscada perceptível, especialmente em dev. A sidebar é notificada
  // via evento custom para refletir o sub-item ativo.
  const setTab = (next: DashboardTab) => {
    if (next === tab) return;
    setTabState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
      window.dispatchEvent(
        new CustomEvent("crm:dashboard-tab", { detail: next })
      );
    }
  };

  const [leads, setLeads] = useState<KanbanLead[]>(initialKanbanLeads);
  const [orderedStages, setOrderedStages] =
    useState<PipelineStage[]>(initialStages);
  const [showRangePicker, setShowRangePicker] = useState(false);

  const funnelData = useMemo(
    () => computeStageFunnel(leads, orderedStages),
    [leads, orderedStages]
  );

  // Estado da mini-dash compartilhado entre o header das tabs (pills
  // compactos) e o `LeadKanbanBoard` (que dispara `refetch` após DnD).
  const { companyId } = useCurrentCompany();
  const filters = useLeadFilters();
  const effectiveRange = useMemo(
    () => ({
      start: filters.state.start ?? initialKanbanRange.start,
      end: filters.state.end ?? initialKanbanRange.end,
    }),
    [filters.state.start, filters.state.end, initialKanbanRange]
  );
  const {
    cohort: minidashCohort,
    isFetching: minidashFetching,
    refetch: refetchMinidash,
  } = useKanbanMinidash(companyId, effectiveRange, initialKanbanMinidash);

  return (
    // O dashboard inteiro é preso à altura do `<main>` do AppShell
    // (que já hospeda a barra global do usuário). Somente o corpo de
    // cada coluna do Kanban (e listas internas das outras abas) pode
    // rolar — `overflow-hidden` aqui evita que o conteúdo gere scroll
    // global na página.
    <div className="flex h-full flex-col overflow-hidden">
      <main className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
        {/* Cabeçalho denso: título + tabs + pills da mini-dash + período,
            tudo na mesma linha. Em telas estreitas, faz wrap. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {/* Ordem fixada: Analítico, Kanban, Funil. */}
            <TabButton
              active={tab === "analitico"}
              onClick={() => setTab("analitico")}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              }
            >
              Analítico
            </TabButton>
            <TabButton
              active={tab === "kanban"}
              onClick={() => setTab("kanban")}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6a2.25 2.25 0 0 1 2.25-2.25h1.5A2.25 2.25 0 0 1 9.75 6v12a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18V6ZM14.25 6A2.25 2.25 0 0 1 16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v6A2.25 2.25 0 0 1 18 14.25h-1.5A2.25 2.25 0 0 1 14.25 12V6Z" />
                </svg>
              }
            >
              Kanban
            </TabButton>
            <TabButton
              active={tab === "funil"}
              onClick={() => setTab("funil")}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5L14.25 12v6.75L9.75 21v-9L3.75 5.25Z" />
                </svg>
              }
            >
              Funil
            </TabButton>
          </div>

          {/* Mini-dash compacta + período inline, somente no Kanban */}
          {tab === "kanban" && (
            <>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <LeadsMinidash
                  cohort={minidashCohort}
                  selected={filters.state.categories}
                  onToggle={(cat: StageCategory) =>
                    filters.toggleCategory(cat)
                  }
                  onClearAll={() => filters.setFilters({ categories: [] })}
                  isPending={minidashFetching}
                  compact
                />
              </div>
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
            </>
          )}
        </div>

        {showRangePicker && tab === "kanban" && (
          <DateRangePicker
            initialStart={toLocalDateInput(effectiveRange.start)}
            initialEndInclusive={endExclusiveToInclusiveLabel(
              effectiveRange.end
            )}
            isPending={minidashFetching}
            onCancel={() => setShowRangePicker(false)}
            onApply={(startStr, endStr) => {
              const start = fromLocalDateInputStart(startStr);
              const end = fromLocalDateInputEndExclusive(endStr);
              const monthDefault = defaultMonthRangeLocal();
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

        <div
          className={
            tab === "funil"
              ? "min-h-0 flex-1 space-y-6 overflow-y-auto pr-1"
              : "hidden"
          }
        >
          <LeadFunnel data={funnelData} />
          <RecentLeads
            domain={domain}
            initialLeads={initialRecentLeads}
            stages={orderedStages}
          />
        </div>
        <div
          className={
            tab === "kanban"
              ? "flex min-h-0 flex-1 flex-col"
              : "hidden"
          }
        >
          <KanbanErrorBoundary>
            <LeadKanbanBoard
              domain={domain}
              initialLeads={initialKanbanLeads}
              operators={initialOperators}
              stages={initialStages}
              specialties={initialSpecialties}
              lastActivityByLead={initialLastActivity}
              initialRange={initialKanbanRange}
              onLeadsChange={setLeads}
              onStagesChange={setOrderedStages}
              onLeadMoved={refetchMinidash}
            />
          </KanbanErrorBoundary>
        </div>
        {/* Painel Analítico sempre montado com `hidden` quando inativo
            — mesma estratégia de Kanban/Funil. Antes era condicional
            (`tab === "analitico" && ...`), o que o forçava a remontar
            e refazer fetch a cada troca de aba, causando piscada. */}
        <div
          className={
            tab === "analitico"
              ? "min-h-0 flex-1 overflow-y-auto pr-1"
              : "hidden"
          }
        >
          <AnaliticoPanel
            initialKpis={initialAnaliticoKpis}
            initialGoals={initialAnaliticoGoals}
            initialIsDefaultGoals={initialAnaliticoGoalsAreDefault}
            initialRange={initialAnaliticoRange}
          />
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors
        ${
          active
            ? "bg-blue-600 text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
    >
      {icon}
      {children}
    </button>
  );
}
