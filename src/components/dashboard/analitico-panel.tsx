"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { FunnelKpiCard, type FunnelKpiAccent } from "./funnel-kpi-card";
import {
  DateRangePicker,
  endExclusiveToInclusiveLabel,
  formatRangeLabel,
  fromLocalDateInputEndExclusive,
  fromLocalDateInputStart,
  toLocalDateInput,
} from "../leads/date-range-picker";
import type {
  AnaliticoKpis,
  ClinicAnalyticsGoals,
} from "@/lib/types/database";

/**
 * Formata um `Date` como "HH:mm:ss" em horário local — usado para
 * mostrar quando os KPIs foram atualizados pela última vez.
 */
function formatUpdatedAt(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Retorna uma string relativa curta tipo "há 12s", "há 3min", "há 2h".
 * Mantém o usuário ciente do quão fresca está a leitura sem ocupar
 * espaço com timestamps absolutos longos.
 */
function formatRelativeAge(updatedAt: Date, now: Date): string {
  const diffMs = Math.max(0, now.getTime() - updatedAt.getTime());
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours}h`;
}

/**
 * Painel executivo da aba "Analítico". Exibe 5 KPIs em uma única linha
 * (5 colunas em desktop, 2 em mobile) com semáforo vs. metas
 * configuráveis da clínica.
 *
 * Regras de cálculo (alinhadas com a RPC `get_analitico_kpis`):
 * - "Total de leads" é a base 100% do funil (accent neutro, sem %).
 * - Demais KPIs calculam a % sobre a ETAPA ANTERIOR do funil (cascata)
 *   e comparam contra a meta da clínica (verde se ≥ meta, vermelho c.c.).
 * - O modo é "mês operacional": eventos do mês entram independente da
 *   coorte. Por isso fechamentos de follow-up de meses anteriores
 *   aparecem em um badge separado para não confundir.
 */

interface AnaliticoPanelProps {
  initialKpis: AnaliticoKpis;
  initialGoals: ClinicAnalyticsGoals;
  initialIsDefaultGoals: boolean;
  initialRange: { start: string; end: string };
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Calcula a meta absoluta (floor) e o accent (verde/vermelho/neutro). */
function evaluateKpi(
  realized: number,
  base: number,
  goalPct: number
): { pct: number | null; goalValue: number; accent: FunnelKpiAccent } {
  if (base <= 0) {
    return { pct: null, goalValue: 0, accent: "neutral" };
  }
  const pct = Math.round((realized / base) * 100);
  const goalValue = Math.floor((goalPct / 100) * base);
  const accent: FunnelKpiAccent = realized >= goalValue ? "above" : "below";
  return { pct, goalValue, accent };
}

/* ────────── Ícones ────────── */
function IconLeads() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function IconTrophy() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
    </svg>
  );
}
function IconMoney() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V12Zm-12 0h.008v.008H6V12Z" />
    </svg>
  );
}

export function AnaliticoPanel({
  initialKpis,
  initialGoals,
  initialIsDefaultGoals,
  initialRange,
}: AnaliticoPanelProps) {
  const { companyId } = useCurrentCompany();
  const params = useParams<{ domain?: string }>();
  const domain = params?.domain;

  const [range, setRange] = useState(initialRange);
  const [kpis, setKpis] = useState<AnaliticoKpis>(initialKpis);
  const [goals, setGoals] = useState<ClinicAnalyticsGoals>(initialGoals);
  const [isDefaultGoals, setIsDefaultGoals] = useState(initialIsDefaultGoals);
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Carimbo do último fetch bem-sucedido de KPIs. Inicia com `null`
  // para evitar mismatch SSR/CSR — é populado no `useEffect` inicial
  // que sincroniza com o servidor e em cada refetch (manual ou ao
  // mudar o período).
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  // `now` força a re-renderização do label "há Xs" a cada segundo.
  const [now, setNow] = useState<Date>(() => new Date());

  // Tick relativo: re-renderiza o "há Xs" a cada segundo enquanto o
  // painel está visível. Não dispara fetches — apenas atualiza o texto.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Reaplica metas se mudarem em outra aba (ex: admin acaba de salvar
  // em Configurações e volta para o painel). Faz um polling leve apenas
  // quando o painel monta — sem WebSocket aqui ainda.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetch(`/api/clinic/analytics-goals?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setGoals(data.goals as ClinicAnalyticsGoals);
        setIsDefaultGoals(Boolean(data.isDefault));
      })
      .catch(() => {
        /* silencia — usamos os iniciais */
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  /** Buscador genérico — usado tanto para refetch manual quanto ao trocar o range. */
  const fetchKpis = useCallback(
    async (targetRange: { start: string; end: string }) => {
      if (!companyId) return;
      try {
        const url = new URL(
          "/api/analytics/analitico",
          window.location.origin
        );
        url.searchParams.set("companyId", companyId);
        url.searchParams.set("start", targetRange.start);
        url.searchParams.set("end", targetRange.end);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { kpis: AnaliticoKpis };
          setKpis(data.kpis);
          setLastUpdatedAt(new Date());
        }
      } catch {
        /* silencia — mantém valores antigos */
      }
    },
    [companyId]
  );

  // Marca a primeira renderização como "atualização inicial" — assim o
  // usuário vê "há 0s" desde o momento em que abre a aba, em vez de um
  // estado vazio ambíguo.
  useEffect(() => {
    setLastUpdatedAt(new Date());
  }, []);

  function applyRange(start: Date, end: Date) {
    const newRange = { start: start.toISOString(), end: end.toISOString() };
    setRange(newRange);
    startTransition(() => {
      void fetchKpis(newRange);
    });
  }

  function refreshNow() {
    startTransition(() => {
      void fetchKpis(range);
    });
  }

  const cards = useMemo(() => {
    const totalLeads = kpis.total_leads;
    const totalAgend = kpis.total_agendamentos;
    const totalComp = kpis.total_comparecimentos;
    const totalFech = kpis.total_fechamentos;

    const agendVs = evaluateKpi(totalAgend, totalLeads, goals.appointment_pct);
    const compVs = evaluateKpi(totalComp, totalAgend, goals.attendance_pct);
    const fechVs = evaluateKpi(totalFech, totalComp, goals.closing_pct);

    return { agendVs, compVs, fechVs };
  }, [kpis, goals]);

  return (
    <div className="space-y-5">
      {/* Cabeçalho + range + atualização */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Visão executiva
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Período: {formatRangeLabel(range.start, range.end)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Carimbo da última atualização — mostra horário absoluto e
              tempo relativo (atualizado a cada segundo). */}
          {lastUpdatedAt && (
            <span
              className="text-[11px] text-gray-500"
              title={`Última atualização: ${lastUpdatedAt.toLocaleString("pt-BR")}`}
            >
              Atualizado às{" "}
              <span className="font-medium text-gray-700 tabular-nums">
                {formatUpdatedAt(lastUpdatedAt)}
              </span>{" "}
              <span className="text-gray-400">
                ({formatRelativeAge(lastUpdatedAt, now)})
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={refreshNow}
            disabled={isPending || !companyId}
            title="Recarregar KPIs"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {isPending ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => setShowRangePicker((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            Alterar datas
          </button>
        </div>
      </div>

      {showRangePicker && (
        <DateRangePicker
          initialStart={toLocalDateInput(range.start)}
          initialEndInclusive={endExclusiveToInclusiveLabel(range.end)}
          isPending={isPending}
          onCancel={() => setShowRangePicker(false)}
          onApply={(startStr, endStr) => {
            applyRange(
              fromLocalDateInputStart(startStr),
              fromLocalDateInputEndExclusive(endStr)
            );
            setShowRangePicker(false);
          }}
        />
      )}

      {isDefaultGoals && domain && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p>
            Sua clínica ainda não definiu metas analíticas — estamos
            usando os padrões 40 / 40 / 30.{" "}
            <Link
              href={`/${domain}/settings?tab=analytics-goals`}
              className="font-semibold underline hover:text-amber-700"
            >
              Configurar agora
            </Link>
          </p>
        </div>
      )}

      {/* Grade dos 5 KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FunnelKpiCard
          title="Total de leads"
          value={kpis.total_leads}
          pct={null}
          accent="neutral"
          subtitle="base do funil"
          icon={<IconLeads />}
        />
        <FunnelKpiCard
          title="Agendamentos"
          value={kpis.total_agendamentos}
          pct={cards.agendVs.pct}
          goalPct={goals.appointment_pct}
          goalValue={cards.agendVs.goalValue}
          accent={cards.agendVs.accent}
          tooltip="% sobre total de leads"
          icon={<IconCalendar />}
        />
        <FunnelKpiCard
          title="Comparecimentos"
          value={kpis.total_comparecimentos}
          pct={cards.compVs.pct}
          goalPct={goals.attendance_pct}
          goalValue={cards.compVs.goalValue}
          accent={cards.compVs.accent}
          tooltip="% sobre agendamentos"
          icon={<IconCheck />}
        />
        <FunnelKpiCard
          title="Fechamentos"
          value={kpis.total_fechamentos}
          pct={cards.fechVs.pct}
          goalPct={goals.closing_pct}
          goalValue={cards.fechVs.goalValue}
          accent={cards.fechVs.accent}
          tooltip="% sobre comparecimentos"
          subtitle={
            kpis.fechamentos_follow_up > 0
              ? `${kpis.fechamentos_follow_up} de follow-up`
              : undefined
          }
          icon={<IconTrophy />}
        />
        <FunnelKpiCard
          title="Ticket médio"
          value={formatBRL(kpis.ticket_medio)}
          pct={null}
          accent="neutral"
          subtitle={
            kpis.total_fechamentos > 0
              ? `total ${formatBRL(kpis.soma_fechamento)}`
              : "sem fechamentos no período"
          }
          icon={<IconMoney />}
        />
      </div>

    </div>
  );
}

