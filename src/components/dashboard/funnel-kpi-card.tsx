"use client";

/**
 * Card de KPI executivo da aba "Analítico" — desenhado para o cliente
 * "bater o olho" e entender a operação. Layout enxuto:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ ICON     Total de Fechamentos               │
 *   │                                             │
 *   │  5  / 31%   ▲  meta 4 (30%)                 │
 *   │  subtítulo opcional                         │
 *   └─────────────────────────────────────────────┘
 *
 * Sinalização da meta é uma borda lateral de 4px à esquerda (verde para
 * acima/igual, vermelho para abaixo, cinza neutro quando não há meta ou
 * quando a base é zero). Optei por borda em vez de fundo colorido para
 * não poluir o painel — o cliente reclamou que a versão do concorrente
 * é "bagunçada".
 */

export type FunnelKpiAccent = "neutral" | "above" | "below";

interface FunnelKpiCardProps {
  title: string;
  /** Número absoluto principal (já formatado, ou número cru). */
  value: string | number;
  /** Porcentagem realizada no período. `null` significa "sem porcentagem"
   *  (usado no card "Total de leads", base 100%). */
  pct: number | null;
  /** Meta em porcentagem configurada pela clínica. Opcional. */
  goalPct?: number;
  /** Valor absoluto da meta (calculado a partir da base anterior). */
  goalValue?: number;
  accent?: FunnelKpiAccent;
  subtitle?: string;
  /** Quando true, exibe um pequeno tooltip-hint na lateral do card. */
  tooltip?: string;
  icon: React.ReactNode;
}

const ACCENT_STYLES: Record<
  FunnelKpiAccent,
  { border: string; iconBg: string; iconColor: string; pctColor: string }
> = {
  neutral: {
    border: "border-l-gray-300",
    iconBg: "bg-gray-100",
    iconColor: "text-gray-500",
    pctColor: "text-gray-500",
  },
  above: {
    border: "border-l-emerald-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    pctColor: "text-emerald-600",
  },
  below: {
    border: "border-l-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    pctColor: "text-red-600",
  },
};

const HOVER_STYLES: Record<FunnelKpiAccent, string> = {
  neutral: "hover:shadow-[0_15px_30px_rgba(59,130,246,0.06)] hover:border-blue-200",
  above: "hover:shadow-[0_15px_30px_rgba(16,185,129,0.06)] hover:border-emerald-200",
  below: "hover:shadow-[0_15px_30px_rgba(239,68,68,0.06)] hover:border-red-200",
};

export function FunnelKpiCard({
  title,
  value,
  pct,
  goalPct,
  goalValue,
  accent = "neutral",
  subtitle,
  tooltip,
  icon,
}: FunnelKpiCardProps) {
  const colors = ACCENT_STYLES[accent];
  const hasPct = pct !== null;

  // Seta só aparece quando há meta efetivamente comparável (acima/abaixo).
  const arrow =
    accent === "above" ? "▲" : accent === "below" ? "▼" : null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-l-4 ${colors.border} border-gray-200 bg-white p-5 shadow-sm group hover:-translate-y-1 ${HOVER_STYLES[accent]} transition-all duration-300`}
      title={tooltip}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-500 tracking-tight">{title}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colors.iconBg} group-hover:scale-110 group-hover:rotate-[4deg] transition-all duration-300`}
        >
          <span className={`${colors.iconColor} transition-transform`}>{icon}</span>
        </span>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-gray-900">
            {value}
          </span>
          {hasPct && (
            <span
              className={`text-xl font-semibold ${colors.pctColor}`}
              aria-label={`${pct} por cento`}
            >
              / {pct}%
            </span>
          )}
          {arrow && (
            <span
              className={`text-base font-semibold ${colors.pctColor}`}
              aria-hidden
            >
              {arrow}
            </span>
          )}
        </div>

        {(goalPct !== undefined || subtitle) && (
          <p className="mt-1 text-xs text-gray-400">
            {goalPct !== undefined && goalValue !== undefined && (
              <>
                meta {goalValue} ({goalPct}%)
                {subtitle && " · "}
              </>
            )}
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
