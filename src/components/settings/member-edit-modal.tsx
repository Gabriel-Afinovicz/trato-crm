"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/**
 * Modal unificado de edicao de um membro: dados gerais + senha.
 *
 * Permissoes (refletem a regra do servidor):
 *  - admin/super_admin (`canEditAll`): edita nome, email, permissao,
 *    profissional e senha de qualquer membro.
 *  - operador (apenas o proprio, `isSelf` sem `canEditAll`): edita nome, email
 *    e senha.
 *
 * O ramal e exibido somente-leitura (identificador de login).
 */
interface MemberRecord {
  id: string;
  name: string;
  extension_number: string;
  email: string | null;
  invite_email: string | null;
  role: "operator" | "admin" | "super_admin";
  is_dentist: boolean;
}

interface MemberEditModalProps {
  memberId: string;
  domain: string;
  /** Papel de quem esta editando. */
  viewerRole: "operator" | "admin" | "super_admin";
  /** Id de quem esta editando (para detectar auto-edicao). */
  viewerId: string;
  onClose: () => void;
  onSaved?: () => void;
}

function realEmailOf(rec: MemberRecord): string {
  if (rec.invite_email) return rec.invite_email;
  if (rec.email && !/^\d+@.+\.crm$/.test(rec.email)) return rec.email;
  return "";
}

export function MemberEditModal({
  memberId,
  domain,
  viewerRole,
  viewerId,
  onClose,
  onSaved,
}: MemberEditModalProps) {
  const canEditAll = viewerRole === "admin" || viewerRole === "super_admin";
  const isSelf = viewerId === memberId;

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Campos editaveis.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleValue, setRoleValue] = useState<"operator" | "admin">("operator");
  const [isDentist, setIsDentist] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Valores iniciais (para enviar apenas o que mudou).
  const [initialName, setInitialName] = useState("");
  const [initialEmail, setInitialEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    (async () => {
      const { data, error: e } = await supabase
        .from("users")
        .select("id, name, extension_number, email, invite_email, role, is_dentist")
        .eq("id", memberId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !data) {
        setError("Não foi possível carregar os dados do membro.");
        setLoading(false);
        return;
      }
      const rec = data as unknown as MemberRecord;
      setMember(rec);
      setName(rec.name);
      setInitialName(rec.name);
      const em = realEmailOf(rec);
      setEmail(em);
      setInitialEmail(em);
      setRoleValue(rec.role === "admin" ? "admin" : "operator");
      setIsDentist(rec.is_dentist);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!member) return;

    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Email inválido (deixe em branco se preferir).");
      return;
    }
    if (password) {
      if (password.length < 6) {
        setError("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
    }

    const payload: Record<string, unknown> = { domain };
    if (name.trim() !== initialName) payload.name = name.trim();
    if (email.trim() !== initialEmail.trim()) payload.email = email.trim();
    if (password) payload.password = password;
    if (canEditAll) {
      if (roleValue !== member.role) payload.role = roleValue;
      if (isDentist !== member.is_dentist) payload.isDentist = isDentist;
    }

    // Nada para salvar alem do dominio.
    if (Object.keys(payload).length <= 1) {
      onClose();
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/operators/${memberId}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      warning?: string;
    };
    setSaving(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Erro ao salvar as alterações.");
      return;
    }
    toast.success("Membro atualizado.", {
      description: data.warning ? data.warning : undefined,
    });
    onSaved?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {isSelf ? "Editar meus dados" : "Editar membro"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : !member ? (
          <p className="mt-4 text-sm text-red-600">
            {error ?? "Membro não encontrado."}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <Input
              label="Nome *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Ramal
              </label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                <code>{member.extension_number}</code>
                <span className="ml-2 text-xs text-gray-400">
                  (identificador de login — não editável)
                </span>
              </div>
            </div>

            <Input
              label="Email"
              type="email"
              placeholder="membro@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            {canEditAll ? (
              <>
                <Select
                  label="Permissão"
                  value={roleValue}
                  onChange={(e) =>
                    setRoleValue(e.target.value as "operator" | "admin")
                  }
                  disabled={member.role === "super_admin"}
                  options={[
                    { value: "operator", label: "Operador" },
                    { value: "admin", label: "Administrador" },
                  ]}
                />

                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={isDentist}
                    onChange={(e) => setIsDentist(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                  />
                  <span>
                    É profissional
                    <span className="block text-xs text-gray-400">
                      Aparece na agenda, nos filtros e na disponibilidade.
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                Permissão e demais configurações são geridas por um
                administrador.
              </p>
            )}

            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-600">
                Alterar senha{" "}
                <span className="font-normal text-gray-400">
                  (deixe em branco para manter)
                </span>
              </p>
              <div className="space-y-3">
                <Input
                  label="Nova senha"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                {password && (
                  <Input
                    label="Confirmar nova senha"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
