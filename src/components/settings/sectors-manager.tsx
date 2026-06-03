"use client";

import { useEffect, useState } from "react";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Badge } from "@/components/ui/badge";
import type { Sector } from "@/lib/types/database";

// CRUD de Setores. Mesmo padrao visual do user-role-tags-manager.
// Exclusao bloqueia quando o setor tem leads vinculados: o modal abre
// um select para reatribuir antes de excluir.

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

interface DraftState {
  name: string;
  color: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  color: PRESET_COLORS[0],
};

interface DeleteModalState {
  sector: Sector;
  count: number;
  targetSectorId: string | null;
  submitting: boolean;
  error: string | null;
}

export function SectorsManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [items, setItems] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  async function fetchAll() {
    if (!companyId) return;
    const res = await fetch(
      `/api/sectors?companyId=${companyId}&includeInactive=1`
    );
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao carregar setores.");
      setLoading(false);
      return;
    }
    const payload = (await res.json()) as { items: Sector[] };
    setItems(payload.items);
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

  async function handleCreate() {
    if (!draft.name.trim() || !companyId) return;
    setError(null);
    setSaving(true);
    const res = await fetch("/api/sectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        name: draft.name.trim(),
        color: draft.color,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao criar setor.");
      return;
    }
    setDraft(EMPTY_DRAFT);
    await fetchAll();
  }

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

  async function handleToggleActive(item: Sector) {
    setOperatingId(item.id);
    const res = await fetch(`/api/sectors/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !item.is_active }),
    });
    setOperatingId(null);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Erro ao atualizar setor.");
      return;
    }
    await fetchAll();
  }

  async function handleDeleteRequest(item: Sector) {
    setError(null);
    setOperatingId(item.id);
    const res = await fetch(`/api/sectors/${item.id}`, { method: "DELETE" });
    setOperatingId(null);
    if (res.ok) {
      await fetchAll();
      return;
    }
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      count?: number;
    };
    if (res.status === 409 && payload.error === "SECTOR_HAS_LEADS") {
      setDeleteModal({
        sector: item,
        count: payload.count ?? 0,
        targetSectorId: null,
        submitting: false,
        error: null,
      });
      return;
    }
    setError(payload.error ?? "Erro ao excluir setor.");
  }

  async function handleConfirmDelete() {
    if (!deleteModal) return;
    setDeleteModal((m) => (m ? { ...m, submitting: true, error: null } : m));
    const reassignRes = await fetch(
      `/api/sectors/${deleteModal.sector.id}/reassign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSectorId: deleteModal.targetSectorId }),
      }
    );
    if (!reassignRes.ok) {
      const payload = (await reassignRes.json().catch(() => ({}))) as {
        error?: string;
      };
      setDeleteModal((m) =>
        m
          ? {
              ...m,
              submitting: false,
              error: payload.error ?? "Erro ao reatribuir leads.",
            }
          : m
      );
      return;
    }
    const deleteRes = await fetch(`/api/sectors/${deleteModal.sector.id}`, {
      method: "DELETE",
    });
    if (!deleteRes.ok) {
      const payload = (await deleteRes.json().catch(() => ({}))) as {
        error?: string;
      };
      setDeleteModal((m) =>
        m
          ? {
              ...m,
              submitting: false,
              error: payload.error ?? "Erro ao excluir setor.",
            }
          : m
      );
      return;
    }
    setDeleteModal(null);
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
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Novo setor</h3>
        <p className="mb-3 text-xs text-gray-500">
          Setores ajudam a distribuir leads dentro da organizacao (ex.: CRC Leads,
          CRC Follow-up, Atendimento). Nomenclatura livre — adapte ao seu
          negocio.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Ex: CRC Leads, CRC Follow-up..."
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Selecionar cor ${c}`}
                onClick={() => setDraft((d) => ({ ...d, color: c }))}
                className={`h-6 w-6 rounded-full transition-transform ${
                  draft.color === c
                    ? "scale-110 ring-2 ring-offset-1 ring-gray-400"
                    : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !draft.name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Nenhum setor cadastrado.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-5 py-3 transition-opacity ${
                  operatingId === item.id ? "opacity-50" : ""
                } ${!item.is_active ? "bg-gray-50/60" : ""}`}
              >
                {editingId === item.id ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
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
                  <>
                    <div className="flex items-center gap-2">
                      <Badge color={item.color}>{item.name}</Badge>
                      {!item.is_active && (
                        <span className="text-xs text-gray-400">
                          (inativo)
                        </span>
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
                      <button
                        onClick={() => handleDeleteRequest(item)}
                        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        Excluir
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteModal(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              Excluir setor &quot;{deleteModal.sector.name}&quot;?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Este setor tem{" "}
              <strong className="font-semibold text-gray-800">
                {deleteModal.count} lead{deleteModal.count === 1 ? "" : "s"}
              </strong>{" "}
              vinculado{deleteModal.count === 1 ? "" : "s"}. Para excluir,
              reatribua-os primeiro.
            </p>
            <label className="mt-3 block text-xs font-medium text-gray-700">
              Mover leads para
            </label>
            <select
              value={deleteModal.targetSectorId ?? ""}
              onChange={(e) =>
                setDeleteModal((m) =>
                  m ? { ...m, targetSectorId: e.target.value || null } : m
                )
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Sem setor</option>
              {items
                .filter(
                  (s) => s.id !== deleteModal.sector.id && s.is_active
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>

            {deleteModal.error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {deleteModal.error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                disabled={deleteModal.submitting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteModal.submitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteModal.submitting
                  ? "Excluindo..."
                  : "Reatribuir e excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
