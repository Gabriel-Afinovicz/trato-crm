"use client";

import { useEffect, useState } from "react";
import { useCurrentCompany } from "@/hooks/use-current-company";

// Configuracoes padrao da Agenda da clinica: duracao default e
// permissao de sobreposicao. Persistido em companies.settings.agenda.

interface AgendaSettings {
  default_appointment_minutes: number;
  allow_overlap: boolean;
}

const DEFAULTS: AgendaSettings = {
  default_appointment_minutes: 30,
  allow_overlap: false,
};

export function AgendaDefaultsManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [settings, setSettings] = useState<AgendaSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function fetchSettings() {
    if (!companyId) return;
    const res = await fetch(
      `/api/clinic/agenda-settings?companyId=${companyId}`
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao carregar configuracoes.");
      setLoading(false);
      return;
    }
    const payload = (await res.json()) as { settings: AgendaSettings };
    setSettings(payload.settings);
    setLoading(false);
  }

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setLoading(false);
      return;
    }
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, companyId]);

  async function handleSave() {
    if (!companyId) return;
    setError(null);
    setSaved(null);
    setSaving(true);
    const res = await fetch("/api/clinic/agenda-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        default_appointment_minutes: settings.default_appointment_minutes,
        allow_overlap: settings.allow_overlap,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao salvar configuracoes.");
      return;
    }
    const payload = (await res.json()) as { settings: AgendaSettings };
    setSettings(payload.settings);
    setSaved(new Date().toLocaleTimeString("pt-BR"));
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">
          Duracao padrao da consulta
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Usada como sugestao ao criar um novo agendamento (na tela Agenda
          e no formulario de cadastro de Lead). Aceita valores entre 5 e 480
          minutos.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={settings.default_appointment_minutes}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                default_appointment_minutes:
                  parseInt(e.target.value, 10) || s.default_appointment_minutes,
              }))
            }
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <span className="text-sm text-gray-600">minutos</span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">
          Permitir sobreposicao de horarios
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Quando ligado, agendar em um horario ocupado pelo mesmo profissional
          ou sala mostra um aviso de confirmacao. Conflitos com expediente,
          almoco, feriado ou bloqueio continuam sempre bloqueando.
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={settings.allow_overlap}
            onChange={(e) =>
              setSettings((s) => ({ ...s, allow_overlap: e.target.checked }))
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Permitir sobreposicao
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-xs text-emerald-600">
            Salvo as {saved}.
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
