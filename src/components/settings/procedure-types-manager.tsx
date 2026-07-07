"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import type { ProcedureType } from "@/lib/types/database";

interface DraftState {
  name: string;
  duration: number;
  value: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  duration: 30,
  value: "",
};

function parseValue(input: string): number | null {
  if (!input.trim()) return null;
  const normalized = input.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatValue(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function ProcedureTypesManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [items, setItems] = useState<ProcedureType[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [clinicorpEnabled, setClinicorpEnabled] = useState(false);

  async function fetchAll() {
    if (!companyId) return;
    const supabase = createClient();
    const proceduresRes = await supabase
      .from("procedure_types")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (proceduresRes.data) {
      setItems(proceduresRes.data as unknown as ProcedureType[]);
    }
    setLoading(false);
  }

  async function checkClinicorp() {
    if (!companyId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("company_integrations")
      .select("status")
      .eq("company_id", companyId)
      .eq("provider", "clinicorp")
      .maybeSingle();
    const row = data as { status?: string } | null;
    setClinicorpEnabled(!!row && row.status !== "disabled");
  }

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setItems([]);
      setLoading(false);
      setClinicorpEnabled(false);
      return;
    }
    fetchAll();
    checkClinicorp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, companyId]);

  async function handleCreate() {
    if (!draft.name.trim() || !companyId) return;
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("procedure_types").insert({
      name: draft.name.trim(),
      default_duration_minutes: draft.duration,
      default_value: parseValue(draft.value),
      company_id: companyId,
    });
    if (insertError) {
      setError(`Erro ao criar serviço: ${insertError.message}`);
      setSaving(false);
      return;
    }
    setDraft(EMPTY_DRAFT);
    setSaving(false);
    await fetchAll();
  }

  async function handleUpdate(id: string) {
    if (!editDraft.name.trim()) return;
    setError(null);
    setOperatingId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("procedure_types")
      .update({
        name: editDraft.name.trim(),
        default_duration_minutes: editDraft.duration,
        default_value: parseValue(editDraft.value),
      })
      .eq("id", id);
    if (updateError) {
      setError(`Erro ao atualizar: ${updateError.message}`);
      setOperatingId(null);
      return;
    }
    setEditingId(null);
    setOperatingId(null);
    await fetchAll();
  }

  async function handleToggleActive(item: ProcedureType) {
    setOperatingId(item.id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("procedure_types")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (updateError) setError(`Erro: ${updateError.message}`);
    setOperatingId(null);
    await fetchAll();
  }

  function startEdit(item: ProcedureType) {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      duration: item.default_duration_minutes,
      value: item.default_value !== null ? String(item.default_value) : "",
    });
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {clinicorpEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm flex items-start gap-3 animate-fade-in">
          <svg
            className="h-5 w-5 text-amber-600 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div>
            <h4 className="font-semibold text-amber-900">Aviso de Sincronização (CliniCorp Ativa)</h4>
            <p className="mt-1 text-xs text-amber-800 leading-relaxed">
              Os serviços cadastrados ou alterados diretamente no CRM <strong>não serão sincronizados com a CliniCorp</strong>, pois a API deles não permite a criação externa de procedimentos. Para que um novo serviço funcione em ambas as plataformas, você deve <strong>cadastrá-lo primeiro na CliniCorp</strong> e depois realizar a <strong>importação de procedimentos</strong> nas configurações da integração.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Novo serviço</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Cadastre os serviços que sua organização oferece. A duração é usada
            como sugestão ao agendar e o valor aparece nos relatórios.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Nome
            </label>
            <input
              type="text"
              placeholder="Ex: Consulta, Corte de cabelo, Aula..."
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Duração (min)
            </label>
            <input
              type="number"
              min={5}
              step={5}
              value={draft.duration}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  duration: parseInt(e.target.value, 10) || 30,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Valor (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={draft.value}
              onChange={(e) =>
                setDraft((d) => ({ ...d, value: e.target.value }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleCreate}
            disabled={saving || !draft.name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Nenhum serviço cadastrado.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div
                key={item.id}
                className={`px-5 py-3 transition-opacity ${
                  operatingId === item.id ? "opacity-50" : ""
                } ${!item.is_active ? "bg-gray-50/60" : ""}`}
              >
                {editingId === item.id ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
                        Nome
                      </label>
                      <input
                        type="text"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
                        Duração (min)
                      </label>
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={editDraft.duration}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            duration: parseInt(e.target.value, 10) || 30,
                          }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
                        Valor (R$)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editDraft.value}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, value: e.target.value }))
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleUpdate(item.id)}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white"
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {item.name}
                      </span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        {item.default_duration_minutes} min
                      </span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                        {formatValue(item.default_value)}
                      </span>
                      {!item.is_active && (
                        <span className="text-xs text-gray-400">(inativo)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(item)}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleActive(item)}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        {item.is_active ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
