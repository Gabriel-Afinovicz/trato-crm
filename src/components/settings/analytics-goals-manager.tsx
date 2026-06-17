"use client";

import { useEffect, useState } from "react";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Input } from "@/components/ui/input";
import { DEFAULT_CLINIC_GOALS } from "@/lib/constants/analytics-goals";
import type { ClinicAnalyticsGoals } from "@/lib/types/database";

/**
 * Configuração das metas analíticas da clínica.
 *
 * As metas são porcentagens aplicadas em cascata no funil:
 *  - `appointment_pct`: agendamentos / total de leads
 *  - `attendance_pct`:  comparecimentos / agendamentos
 *  - `closing_pct`:     fechamentos / comparecimentos
 *
 * Quando a meta é atingida, o card correspondente no painel Analítico
 * fica verde; quando fica abaixo, fica vermelho. Default global é
 * 40 / 40 / 30 — aplicado pela API quando nada foi salvo.
 */
export function AnalyticsGoalsManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [goals, setGoals] = useState<ClinicAnalyticsGoals | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/clinic/analytics-goals?companyId=${companyId}`
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          goals: ClinicAnalyticsGoals;
          isDefault: boolean;
        };
        if (cancelled) return;
        setGoals(data.goals);
        setIsDefault(data.isDefault);
      } catch {
        if (!cancelled) {
          setFeedback({
            type: "error",
            text: "Não foi possível carregar as metas — tente recarregar.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, companyLoading]);

  /** Persiste um conjunto de metas e atualiza o estado/feedback. */
  async function persist(
    target: ClinicAnalyticsGoals,
    successText: string
  ) {
    if (!companyId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/clinic/analytics-goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          appointment_pct: target.appointment_pct,
          attendance_pct: target.attendance_pct,
          closing_pct: target.closing_pct,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Erro ao salvar.");
      }
      const data = (await res.json()) as {
        goals: ClinicAnalyticsGoals;
        isDefault: boolean;
      };
      setGoals(data.goals);
      setIsDefault(data.isDefault);
      setFeedback({ type: "success", text: successText });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!goals) return;
    void persist(goals, "Metas salvas com sucesso.");
  }

  /**
   * "Manter assim mesmo": grava os padrões 40/40/30 como metas oficiais da
   * clínica. Dá um caminho explícito para quem está satisfeito com os
   * padrões — sem isso, o único botão era "Salvar metas" e não ficava
   * claro que era preciso salvar para confirmar os valores sugeridos.
   */
  function handleKeepDefaults() {
    void persist(
      DEFAULT_CLINIC_GOALS,
      "Tudo certo! Mantivemos os padrões 40 / 40 / 30."
    );
  }

  if (loading || companyLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (!goals) {
    return (
      <p className="text-sm text-gray-500">
        Não foi possível carregar as metas analíticas.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">
          Metas analíticas
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Defina os percentuais esperados em cada etapa do funil. Cada KPI
          do painel Analítico fica verde quando atinge a meta e vermelho
          quando fica abaixo. Sugestão de partida: 40 / 40 / 30.
        </p>
      </div>

      {isDefault && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Você ainda está usando os padrões globais. Salve abaixo para
          personalizar.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <GoalInput
          label="Agendamentos / Leads"
          hint="% de leads do mês que viram agendamento"
          value={goals.appointment_pct}
          onChange={(v) =>
            setGoals((g) => (g ? { ...g, appointment_pct: v } : g))
          }
        />
        <GoalInput
          label="Comparecimentos / Agendamentos"
          hint="% de agendamentos que efetivamente compareceram"
          value={goals.attendance_pct}
          onChange={(v) =>
            setGoals((g) => (g ? { ...g, attendance_pct: v } : g))
          }
        />
        <GoalInput
          label="Fechamentos / Comparecimentos"
          hint="% de comparecimentos que fecharam negócio"
          value={goals.closing_pct}
          onChange={(v) =>
            setGoals((g) => (g ? { ...g, closing_pct: v } : g))
          }
        />
      </div>

      {feedback && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar metas"}
        </button>
        {isDefault && (
          <button
            type="button"
            onClick={handleKeepDefaults}
            disabled={saving}
            title="Salvar os padrões 40 / 40 / 30 como metas da clínica"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Manter assim mesmo
          </button>
        )}
      </div>
    </div>
  );
}

interface GoalInputProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}

function GoalInput({ label, hint, value, onChange }: GoalInputProps) {
  // Mantemos o valor como string local para suportar campo
  // temporariamente vazio enquanto o usuário digita.
  const [local, setLocal] = useState<string>(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  return (
    <div>
      <Input
        label={label}
        type="number"
        min={0}
        max={100}
        step={1}
        inputMode="numeric"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n <= 100) {
            onChange(Math.round(n));
          }
        }}
      />
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
