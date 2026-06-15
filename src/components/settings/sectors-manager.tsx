"use client";

import { useEffect, useState } from "react";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Badge } from "@/components/ui/badge";
import type { Sector } from "@/lib/types/database";

// Os setores sao FIXOS no sistema: CRC Leads (entrada de todos os leads) e
// CRC Comercial (leads que viraram pacientes na Clinicorp). Esta tela
// permite apenas renomear e mudar a cor de cada um — criacao, exclusao e
// desativacao foram bloqueadas na API e no banco.

const PRESET_COLORS = [
  "#10b981",
  "#6366f1",
  "#06b6d4",
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
  "#ef4444",
  "#14b8a6",
];

const SYSTEM_SECTOR_INFO: Record<
  string,
  { title: string; description: string }
> = {
  crc_leads: {
    title: "Setor de entrada",
    description:
      "Todos os novos leads entram automaticamente neste setor. É aqui que o time trabalha o lead até o agendamento.",
  },
  crc_comercial: {
    title: "Setor de pacientes",
    description:
      "Leads são promovidos para este setor quando viram pacientes (comparecem à clínica e são cadastrados na Clinicorp).",
  },
};

interface DraftState {
  name: string;
  color: string;
}

export function SectorsManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [items, setItems] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>({
    name: "",
    color: PRESET_COLORS[0],
  });
  const [operatingId, setOperatingId] = useState<string | null>(null);

  async function fetchAll() {
    if (!companyId) return;
    const res = await fetch(`/api/sectors?companyId=${companyId}`);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao carregar setores.");
      setLoading(false);
      return;
    }
    const payload = (await res.json()) as { items: Sector[] };
    // Ordena com o setor de entrada (CRC Leads) primeiro.
    const order = (s: Sector) => (s.system_key === "crc_leads" ? 0 : 1);
    setItems([...payload.items].sort((a, b) => order(a) - order(b)));
    setLoading(false);
  }

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, companyId]);

  async function handleUpdate(id: string) {
    if (!editDraft.name.trim()) return;
    setError(null);
    setOperatingId(id);
    const res = await fetch(`/api/sectors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editDraft.name.trim(),
        color: editDraft.color,
      }),
    });
    setOperatingId(null);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao atualizar setor.");
      return;
    }
    setEditingId(null);
    await fetchAll();
  }

  function startEdit(item: Sector) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, color: item.color });
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
        <h3 className="text-sm font-semibold text-gray-700">
          Setores do fluxo CRC
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          O CRM trabalha com dois setores fixos: o de{" "}
          <strong>entrada de leads</strong> e o de{" "}
          <strong>pacientes confirmados</strong>. Você pode renomeá-los e
          mudar a cor para adaptar à sua operação, mas eles não podem ser
          criados, excluídos ou desativados.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Setores não encontrados para esta organização.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => {
              const info = item.system_key
                ? SYSTEM_SECTOR_INFO[item.system_key]
                : null;
              return (
                <div
                  key={item.id}
                  className={`px-5 py-4 transition-opacity ${
                    operatingId === item.id ? "opacity-50" : ""
                  }`}
                >
                  {editingId === item.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                        autoFocus
                      />
                      <div className="flex items-center gap-1">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Selecionar cor ${c}`}
                            onClick={() =>
                              setEditDraft((d) => ({ ...d, color: c }))
                            }
                            className={`h-5 w-5 rounded-full ${
                              editDraft.color === c
                                ? "ring-2 ring-gray-400"
                                : ""
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(item.id)}
                          disabled={!editDraft.name.trim()}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge color={item.color}>{item.name}</Badge>
                          {info && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {info.title}
                            </span>
                          )}
                        </div>
                        {info && (
                          <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                            {info.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => startEdit(item)}
                        className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        Renomear
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
