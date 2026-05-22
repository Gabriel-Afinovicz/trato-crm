"use client";

import {
  STAGE_CATEGORIES,
  STAGE_CATEGORY_LABEL,
  type MinidashCohort,
  type StageCategory,
} from "@/lib/types/database";

/**
 * Mini-dash de leads agrupados por categoria de stage no período.
 *
 * Cards clicáveis: cada toque alterna a categoria no filtro do caller
 * (via `onToggle`). O caller controla o estado de seleção (`selected`)
 * para permitir múltipla seleção e sincronização via URL.
 *
 * Tem dois layouts:
 * - Padrão (cards): usado na tela Leads e onde houver espaço vertical.
 * - `compact` (pills): usado embutido no header do Dashboard junto às
 *   tabs — ocupa uma linha só e cabe ao lado de outros controles.
 */

interface LeadsMinidashProps {
  cohort: MinidashCohort;
  selected: StageCategory[];
  onToggle: (cat: StageCategory) => void;
  /** Caller passa uma função para limpar todas as seleções. */
  onClearAll?: () => void;
  isPending?: boolean;
  /**
   * Slot opcional no canto direito — usado pela tela Leads para
   * encaixar o seletor de período (não usado no modo compacto, pois
   * o caller posiciona seus próprios controles externamente).
   */
  rangeControl?: React.ReactNode;
  /** Layout em linha única (pills), para usar inline com tabs. */
  compact?: boolean;
}

/** Borda esquerda + hover dos cards na versão padrão. */
const ACCENT: Record<StageCategory, string> = {
  frio: "border-l-sky-400 hover:bg-sky-50/60",
  quente: "border-l-orange-500 hover:bg-orange-50/60",
  agendado: "border-l-blue-500 hover:bg-blue-50/60",
  compareceu: "border-l-violet-500 hover:bg-violet-50/60",
  orcamento: "border-l-amber-500 hover:bg-amber-50/60",
  fechado: "border-l-emerald-500 hover:bg-emerald-50/60",
  perdido: "border-l-rose-500 hover:bg-rose-50/60",
};

const ACCENT_SELECTED: Record<StageCategory, string> = {
  frio: "ring-sky-300 bg-sky-50",
  quente: "ring-orange-300 bg-orange-50",
  agendado: "ring-blue-300 bg-blue-50",
  compareceu: "ring-violet-300 bg-violet-50",
  orcamento: "ring-amber-300 bg-amber-50",
  fechado: "ring-emerald-300 bg-emerald-50",
  perdido: "ring-rose-300 bg-rose-50",
};

/** Pills compactos: cor da bolinha + estado selecionado. */
const PILL_DOT: Record<StageCategory, string> = {
  frio: "bg-sky-400",
  quente: "bg-orange-500",
  agendado: "bg-blue-500",
  compareceu: "bg-violet-500",
  orcamento: "bg-amber-500",
  fechado: "bg-emerald-500",
  perdido: "bg-rose-500",
};

const PILL_SELECTED: Record<StageCategory, string> = {
  frio: "border-sky-400 bg-sky-50 text-sky-900",
  quente: "border-orange-500 bg-orange-50 text-orange-900",
  agendado: "border-blue-500 bg-blue-50 text-blue-900",
  compareceu: "border-violet-500 bg-violet-50 text-violet-900",
  orcamento: "border-amber-500 bg-amber-50 text-amber-900",
  fechado: "border-emerald-500 bg-emerald-50 text-emerald-900",
  perdido: "border-rose-500 bg-rose-50 text-rose-900",
};

export function LeadsMinidash({
  cohort,
  selected,
  onToggle,
  onClearAll,
  isPending,
  rangeControl,
  compact,
}: LeadsMinidashProps) {
  const selectedSet = new Set(selected);
  const total = cohort.total;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {STAGE_CATEGORIES.map((cat) => {
          const count = cohort[cat];
          const isSelected = selectedSet.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onToggle(cat)}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors ${
                isSelected
                  ? PILL_SELECTED[cat]
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
              title={`${STAGE_CATEGORY_LABEL[cat]} · ${count} no período`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${PILL_DOT[cat]}`} />
              <span>{STAGE_CATEGORY_LABEL[cat]}</span>
              <span className="font-bold tabular-nums">{count}</span>
            </button>
          );
        })}
        {selected.length > 0 && onClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="ml-1 text-[10px] font-medium text-gray-500 hover:text-gray-700"
          >
            limpar
          </button>
        )}
        {cohort.sem_categoria > 0 && (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
            title="Há leads em stages sem categoria. Mapeie em Configurações → Pipeline."
          >
            {cohort.sem_categoria} sem categoria
          </span>
        )}
        {isPending && (
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            atualizando…
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-gray-800">
            Distribuição no período
          </h3>
          <span className="text-xs text-gray-500">
            {total} {total === 1 ? "lead criado" : "leads criados"}
          </span>
          {cohort.sem_categoria > 0 && (
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
              title="Há leads em stages que ainda não possuem categoria definida pelo admin. Vá em Configurações → Pipeline para mapear."
            >
              {cohort.sem_categoria} sem categoria
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPending && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              atualizando…
            </span>
          )}
          {selected.length > 0 && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
            >
              Limpar seleção
            </button>
          )}
          {rangeControl}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {STAGE_CATEGORIES.map((cat) => {
          const count = cohort[cat];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isSelected = selectedSet.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onToggle(cat)}
              aria-pressed={isSelected}
              className={[
                "group relative rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-sm transition-all",
                "border-l-4",
                ACCENT[cat],
                isSelected ? `ring-2 ${ACCENT_SELECTED[cat]}` : "",
              ].join(" ")}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {STAGE_CATEGORY_LABEL[cat]}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-bold text-gray-900 tabular-nums">
                  {count}
                </span>
                {total > 0 && (
                  <span className="text-[11px] font-medium text-gray-500">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
