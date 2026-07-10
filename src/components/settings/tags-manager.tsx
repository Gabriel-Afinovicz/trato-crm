"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/ui/confirm";
import type { Tag } from "@/lib/types/database";

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

export function TagsManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [clinicorpEnabled, setClinicorpEnabled] = useState(false);

  async function fetchTags() {
    if (!companyId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("tags")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    if (data) setTags(data as unknown as Tag[]);
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
      setTags([]);
      setLoading(false);
      setClinicorpEnabled(false);
      return;
    }
    fetchTags();
    checkClinicorp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, companyId]);

  async function handleCreate() {
    if (!newName.trim() || !companyId) return;
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("tags").insert({
      name: newName.trim(),
      color: newColor,
      company_id: companyId,
    });
    if (insertError) {
      setError(`Erro ao criar tag: ${insertError.message}`);
      setSaving(false);
      return;
    }
    setNewName("");
    setNewColor(PRESET_COLORS[0]);
    setSaving(false);
    await fetchTags();
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setError(null);
    setOperatingId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("tags").update({ name: editName.trim(), color: editColor }).eq("id", id);
    if (updateError) {
      setError(`Erro ao atualizar: ${updateError.message}`);
      setOperatingId(null);
      return;
    }
    setEditingId(null);
    setOperatingId(null);
    await fetchTags();
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: `Excluir a tag "${name}"?`,
      description:
        "A associacao com todos os leads sera removida. Esta acao nao pode ser desfeita.",
      confirmLabel: "Excluir tag",
      variant: "danger",
    });
    if (!ok) return;
    setError(null);
    setOperatingId(id);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("tags").delete().eq("id", id);
    if (deleteError) {
      setError(`Erro ao excluir: ${deleteError.message}`);
      setOperatingId(null);
      return;
    }
    setOperatingId(null);
    await fetchTags();
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />)}</div>;
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
              As tags cadastradas, alteradas ou excluídas diretamente no CRM <strong>não serão sincronizadas com a CliniCorp</strong>, pois a integração deles não possui suporte para o envio destas etiquetas. O uso de tags no CRM é de controle interno para a gestão do seu pipeline e automações locais.
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
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Nova Tag</h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Nome da tag"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${newColor === c ? "scale-110 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Criando...
              </span>
            ) : "Criar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {tags.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">
            Nenhuma tag criada ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tags.map((tag) => (
              <div key={tag.id} className={`flex items-center justify-between px-5 py-3 transition-opacity ${operatingId === tag.id ? "opacity-50" : ""}`}>
                {editingId === tag.id ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={`h-5 w-5 rounded-full transition-transform ${editColor === c ? "scale-110 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdate(tag.id)} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">Salvar</button>
                      <button onClick={() => setEditingId(null)} className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Badge color={tag.color}>{tag.name}</Badge>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(tag)} className="rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700">Editar</button>
                      <button onClick={() => handleDelete(tag.id, tag.name)} className="rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-700">Excluir</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
