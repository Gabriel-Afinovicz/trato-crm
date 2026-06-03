"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpIcon } from "@/components/ui/help-icon";
import { confirm } from "@/components/ui/confirm";
import { ComingSoonOverlay } from "@/components/ui/coming-soon";
import type { Sector, User, UserRoleTag } from "@/lib/types/database";

// Mesma paleta usada pelos gerenciadores dedicados (user-role-tags-manager
// e sectors-manager). Mantemos o array sincronizado para que itens criados
// inline aqui visualmente combinem com os criados nas abas dedicadas.
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

interface UserWithTags extends User {
  tagIds: string[];
  sectorIds: string[];
}

export function OperatorsManager() {
  const params = useParams<{ domain?: string }>();
  const domain = params?.domain;
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const { profile } = useAuth();

  const [users, setUsers] = useState<UserWithTags[]>([]);
  const [tags, setTags] = useState<UserRoleTag[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [extension, setExtension] = useState("");
  const [password, setPassword] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState<"operator" | "admin">("operator");
  const [createTagIds, setCreateTagIds] = useState<string[]>([]);
  const [createSectorIds, setCreateSectorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Modo do formulario: cria com senha imediata ou envia convite por
  // email para o membro definir a propria senha. UI muda os campos
  // exibidos e a rota de API utilizada.
  const [createMode, setCreateMode] = useState<"password" | "invite">(
    "password"
  );

  // Inline create de Função (mesma RLS/insert do user-role-tags-manager).
  // Aparece quando o admin clica "+ Nova" ao lado do label "Funções",
  // sem precisar trocar de aba.
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(PRESET_COLORS[0]);
  const [newRoleMarksAsDentist, setNewRoleMarksAsDentist] = useState(false);
  const [newRoleSaving, setNewRoleSaving] = useState(false);
  const [newRoleError, setNewRoleError] = useState<string | null>(null);

  // Inline create de Setor (passa pela API /api/sectors, mesma rota do
  // sectors-manager, para reusar validacoes e tracking).
  const [newSectorOpen, setNewSectorOpen] = useState(false);
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorColor, setNewSectorColor] = useState(PRESET_COLORS[1]);
  const [newSectorSaving, setNewSectorSaving] = useState(false);
  const [newSectorError, setNewSectorError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingTagsForId, setSavingTagsForId] = useState<string | null>(null);
  const [savingSectorsForId, setSavingSectorsForId] = useState<string | null>(
    null
  );
  const [listError, setListError] = useState<string | null>(null);

  async function fetchAll() {
    if (!companyId) return;
    const supabase = createClient();
    const [
      usersRes,
      tagsRes,
      assignmentsRes,
      sectorsRes,
      sectorAssignmentsRes,
    ] = await Promise.all([
      supabase
        .from("users")
        .select("*")
        .eq("company_id", companyId)
        .in("role", ["operator", "admin"])
        .order("name"),
      supabase
        .from("user_role_tags")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("user_role_tag_assignments")
        .select("user_id, tag_id"),
      supabase
        .from("sectors")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("user_sector_assignments")
        .select("user_id, sector_id"),
    ]);

    if (usersRes.error) {
      setListError(usersRes.error.message);
      setLoading(false);
      return;
    }

    const tagsByUser = new Map<string, string[]>();
    for (const a of (assignmentsRes.data as
      | { user_id: string; tag_id: string }[]
      | null) ?? []) {
      const arr = tagsByUser.get(a.user_id) ?? [];
      arr.push(a.tag_id);
      tagsByUser.set(a.user_id, arr);
    }
    const sectorsByUser = new Map<string, string[]>();
    for (const a of (sectorAssignmentsRes.data as
      | { user_id: string; sector_id: string }[]
      | null) ?? []) {
      const arr = sectorsByUser.get(a.user_id) ?? [];
      arr.push(a.sector_id);
      sectorsByUser.set(a.user_id, arr);
    }

    setListError(null);
    setUsers(
      ((usersRes.data ?? []) as unknown as User[]).map((u) => ({
        ...u,
        tagIds: tagsByUser.get(u.id) ?? [],
        sectorIds: sectorsByUser.get(u.id) ?? [],
      }))
    );
    setTags((tagsRes.data as unknown as UserRoleTag[]) ?? []);
    setSectors((sectorsRes.data as unknown as Sector[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setUsers([]);
      setTags([]);
      setLoading(false);
      return;
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, companyId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);

    if (!domain) {
      setCreateError("Domínio da organização não encontrado.");
      return;
    }
    if (!name.trim() || !extension.trim()) {
      setCreateError("Preencha nome e ramal.");
      return;
    }
    if (!/^[0-9]+$/.test(extension.trim())) {
      setCreateError("Ramal inválido. Use apenas números.");
      return;
    }

    if (createMode === "password") {
      if (!password) {
        setCreateError("Preencha a senha.");
        return;
      }
      if (password.length < 6) {
        setCreateError("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      // No modo "Definir senha agora", o email e OPCIONAL. Se preenchido,
      // precisa ser valido — pois sera vinculado ao acesso para suportar
      // "Esqueci minha senha" futuramente.
      if (
        inviteEmail.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())
      ) {
        setCreateError(
          "Email invalido. Deixe em branco se preferir cadastrar depois."
        );
        return;
      }
    } else {
      if (!inviteEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
        setCreateError("Informe um email valido para enviar o convite.");
        return;
      }
    }

    setSaving(true);
    const endpoint =
      createMode === "password"
        ? "/api/operators/create"
        : "/api/operators/invite";
    const payloadBody: Record<string, unknown> = {
      domain,
      name: name.trim(),
      extension: extension.trim(),
      role,
      tagIds: createTagIds,
      sectorIds: createSectorIds,
    };
    if (createMode === "password") {
      payloadBody.password = password;
      if (inviteEmail.trim()) payloadBody.email = inviteEmail.trim();
    } else {
      payloadBody.email = inviteEmail.trim();
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      warning?: string;
      emailSent?: boolean;
      inviteEmail?: string;
    };

    if (!res.ok) {
      setCreateError(payload.error ?? "Erro ao criar usuário.");
      setSaving(false);
      return;
    }

    if (createMode === "invite") {
      if (payload.emailSent) {
        toast.success("Convite enviado!", {
          description: `Um link de definição de senha foi enviado para ${payload.inviteEmail ?? inviteEmail.trim()}. Peça para o membro conferir a caixa de entrada e o spam.`,
          duration: 6000,
        });
      } else {
        toast.warning("Membro criado, mas o email não foi enviado", {
          description:
            "Verifique o SMTP em Settings > Auth do Supabase, ou peça ao membro para usar 'Esqueci minha senha' na tela de login.",
          duration: 8000,
        });
      }
    } else {
      toast.success(
        inviteEmail.trim()
          ? "Membro criado e email vinculado para recuperação de senha."
          : "Membro criado."
      );
      if (payload.warning) {
        toast.warning(payload.warning, { duration: 6000 });
      }
    }

    setName("");
    setExtension("");
    setPassword("");
    setInviteEmail("");
    setRole("operator");
    setCreateTagIds([]);
    setCreateSectorIds([]);
    setSaving(false);
    await fetchAll();
  }

  async function handleCreateRoleInline() {
    if (!companyId) return;
    const trimmed = newRoleName.trim();
    if (!trimmed) {
      setNewRoleError("Informe o nome da função.");
      return;
    }
    setNewRoleError(null);
    setNewRoleSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_role_tags")
      .insert({
        company_id: companyId,
        name: trimmed,
        color: newRoleColor,
        marks_as_dentist: newRoleMarksAsDentist,
      })
      .select("*")
      .single();
    setNewRoleSaving(false);
    if (error || !data) {
      setNewRoleError(error?.message ?? "Erro ao criar função.");
      return;
    }
    const created = data as unknown as UserRoleTag;
    // Adiciona a função à lista visivel e ja deixa selecionada no draft
    // do membro que esta sendo cadastrado, mantendo o foco no fluxo
    // principal sem reset.
    setTags((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCreateTagIds((prev) => [...prev, created.id]);
    setNewRoleOpen(false);
    setNewRoleName("");
    setNewRoleColor(PRESET_COLORS[0]);
    setNewRoleMarksAsDentist(false);
  }

  async function handleCreateSectorInline() {
    if (!companyId) return;
    const trimmed = newSectorName.trim();
    if (!trimmed) {
      setNewSectorError("Informe o nome do setor.");
      return;
    }
    setNewSectorError(null);
    setNewSectorSaving(true);
    const res = await fetch("/api/sectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        name: trimmed,
        color: newSectorColor,
      }),
    });
    setNewSectorSaving(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setNewSectorError(payload.error ?? "Erro ao criar setor.");
      return;
    }
    const payload = (await res.json()) as { sector: Sector };
    const created = payload.sector;
    setSectors((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCreateSectorIds((prev) => [...prev, created.id]);
    setNewSectorOpen(false);
    setNewSectorName("");
    setNewSectorColor(PRESET_COLORS[1]);
  }

  async function toggleSector(user: UserWithTags, sectorId: string) {
    if (!companyId) return;
    const has = user.sectorIds.includes(sectorId);
    setSavingSectorsForId(user.id);
    const supabase = createClient();
    const { error } = has
      ? await supabase
          .from("user_sector_assignments")
          .delete()
          .eq("user_id", user.id)
          .eq("sector_id", sectorId)
      : await supabase
          .from("user_sector_assignments")
          .insert({ user_id: user.id, sector_id: sectorId });
    setSavingSectorsForId(null);
    if (error) {
      setListError(error.message);
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? {
              ...u,
              sectorIds: has
                ? u.sectorIds.filter((t) => t !== sectorId)
                : [...u.sectorIds, sectorId],
            }
          : u
      )
    );
  }

  async function toggleTag(user: UserWithTags, tagId: string) {
    if (!companyId) return;
    const has = user.tagIds.includes(tagId);
    setSavingTagsForId(user.id);
    const supabase = createClient();
    const { error } = has
      ? await supabase
          .from("user_role_tag_assignments")
          .delete()
          .eq("user_id", user.id)
          .eq("tag_id", tagId)
      : await supabase
          .from("user_role_tag_assignments")
          .insert({ user_id: user.id, tag_id: tagId });
    setSavingTagsForId(null);
    if (error) {
      setListError(error.message);
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? {
              ...u,
              tagIds: has
                ? u.tagIds.filter((t) => t !== tagId)
                : [...u.tagIds, tagId],
            }
          : u
      )
    );
  }

  async function handleDelete(userId: string, displayName: string) {
    if (!domain) return;
    const confirmed = await confirm({
      title: `Excluir o membro "${displayName}"?`,
      description:
        "O acesso sera revogado imediatamente. Leads e agendamentos vinculados precisarao ser reatribuidos.",
      confirmLabel: "Excluir membro",
      variant: "danger",
    });
    if (!confirmed) return;

    setDeletingId(userId);
    const res = await fetch("/api/operators/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, userId }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setListError(payload.error ?? "Erro ao excluir usuário.");
      setDeletingId(null);
      return;
    }

    setDeletingId(null);
    await fetchAll();
  }

  const canRender = !companyLoading && companyId;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Novo membro</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          O login é feito com o ramal e uma senha.
        </p>

        <div className="mt-3 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setCreateMode("password")}
            className={`rounded-md px-3 py-1 font-medium ${
              createMode === "password"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Definir senha agora
          </button>
          <button
            type="button"
            onClick={() => setCreateMode("invite")}
            className={`rounded-md px-3 py-1 font-medium ${
              createMode === "invite"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Enviar convite por email
          </button>
        </div>

        <ComingSoonOverlay
          active={createMode === "invite"}
          title="Convite por email em breve"
          description="Em uma próxima atualização você poderá convidar membros enviando um link por email. Por enquanto, use 'Definir senha agora'."
          className="mt-4"
        >
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {createError}
            </div>
          )}

          <Input
            label="Nome *"
            placeholder="Ex: João Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Ramal *"
              placeholder="Ex: 1002"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
              inputMode="numeric"
            />
            {createMode === "password" ? (
              <Input
                label="Senha *"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            ) : (
              <Input
                label="Email *"
                type="email"
                placeholder="membro@exemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="email"
              />
            )}
            {createMode === "password" && (
              <div className="sm:col-span-3">
                <Input
                  label="Email (opcional)"
                  tooltip="Usado apenas para 'Esqueci minha senha' e futuras notificações. O login continua sendo por ramal + senha."
                  type="email"
                  placeholder="membro@exemplo.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Permissão *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "operator" | "admin")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="operator">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-700">
                Funções
                <HelpIcon>
                  Cargo/papel do membro (Vendedor, Consultor, Profissional,
                  etc.). Pode ser marcada como &quot;profissional&quot; para
                  aparecer na agenda.
                </HelpIcon>
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewRoleOpen((v) => !v);
                  setNewRoleError(null);
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {newRoleOpen ? "Cancelar" : "+ Nova função"}
              </button>
            </div>

            {tags.length === 0 && !newRoleOpen ? (
              <p className="text-xs text-gray-500">
                Nenhuma função cadastrada. Crie aqui ou na aba
                &quot;Funções&quot;.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const active = createTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setCreateTagIds((prev) =>
                          prev.includes(t.id)
                            ? prev.filter((x) => x !== t.id)
                            : [...prev, t.id]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-transparent text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                      style={
                        active
                          ? { backgroundColor: t.color, borderColor: t.color }
                          : undefined
                      }
                    >
                      {t.name}
                      {t.marks_as_dentist && " · profissional"}
                    </button>
                  );
                })}
              </div>
            )}

            {newRoleOpen && (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                {newRoleError && (
                  <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                    {newRoleError}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    placeholder="Nome da função (ex: Vendedor, Consultor...)"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    autoFocus
                  />
                  <ColorPicker
                    value={newRoleColor}
                    onChange={setNewRoleColor}
                  />
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={newRoleMarksAsDentist}
                    onChange={(e) =>
                      setNewRoleMarksAsDentist(e.target.checked)
                    }
                    className="rounded border-gray-300"
                  />
                  Marcar quem tem esta função como profissional (aparece em
                  filtros e na agenda)
                </label>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRoleOpen(false)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateRoleInline}
                    disabled={newRoleSaving || !newRoleName.trim()}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {newRoleSaving ? "Criando..." : "Criar função"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-700">
                Setores
                <HelpIcon>
                  Departamento ou area que agrupa membros e leads — ex:
                  Comercial, Suporte, Captacao. Um membro pode pertencer a
                  varios setores.
                </HelpIcon>
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewSectorOpen((v) => !v);
                  setNewSectorError(null);
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {newSectorOpen ? "Cancelar" : "+ Novo setor"}
              </button>
            </div>

            {sectors.length === 0 && !newSectorOpen ? (
              <p className="text-xs text-gray-500">
                Nenhum setor cadastrado. Crie aqui ou na aba
                &quot;Setores&quot;.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sectors.map((s) => {
                  const active = createSectorIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setCreateSectorIds((prev) =>
                          prev.includes(s.id)
                            ? prev.filter((x) => x !== s.id)
                            : [...prev, s.id]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-transparent text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                      style={
                        active
                          ? { backgroundColor: s.color, borderColor: s.color }
                          : undefined
                      }
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}

            {newSectorOpen && (
              <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                {newSectorError && (
                  <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                    {newSectorError}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    placeholder="Nome do setor (ex: Comercial, Atendimento...)"
                    value={newSectorName}
                    onChange={(e) => setNewSectorName(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    autoFocus
                  />
                  <ColorPicker
                    value={newSectorColor}
                    onChange={setNewSectorColor}
                  />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSectorOpen(false)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSectorInline}
                    disabled={newSectorSaving || !newSectorName.trim()}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {newSectorSaving ? "Criando..." : "Criar setor"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {createMode === "invite" && (
              <p className="text-xs text-gray-500">
                Enviaremos um link para o membro definir a propria senha.
              </p>
            )}
            <Button type="submit" loading={saving}>
              {createMode === "password" ? "Criar" : "Enviar convite"}
            </Button>
          </div>
        </form>
        </ComingSoonOverlay>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Membros da equipe
          </h2>
          <span className="text-xs text-gray-400">
            {users.length}{" "}
            {users.length === 1 ? "membro" : "membros"}
          </span>
        </div>

        {listError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {listError}
          </div>
        )}

        {!canRender || loading ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Carregando…
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Nenhum membro cadastrado ainda.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Nome
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Ramal
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Permissão
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Funções
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Setores
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => {
                  const isSelf = profile?.id === u.id;
                  const isDeleting = deletingId === u.id;
                  // O `users.email` pode ser o email fake interno
                  // (ramal@dominio.crm). Mostramos `invite_email` quando
                  // disponivel — esse e o e-mail real usado para reset
                  // de senha e notificacoes futuras.
                  const realEmail =
                    u.invite_email ??
                    (u.email && !/^\d+@.+\.crm$/.test(u.email)
                      ? u.email
                      : null);
                  return (
                    <tr key={u.id}>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {u.name}
                        </p>
                        {realEmail ? (
                          <p className="text-xs text-gray-500">{realEmail}</p>
                        ) : (
                          <p className="text-xs italic text-gray-400">
                            Sem email cadastrado
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {u.extension_number}
                        </code>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.role === "admin"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {u.role === "admin" ? "Admin" : "Operador"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tags.length === 0 ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            tags.map((t) => {
                              const active = u.tagIds.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  disabled={savingTagsForId === u.id}
                                  onClick={() => toggleTag(u, t.id)}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                                    active
                                      ? "border-transparent text-white"
                                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                  }`}
                                  style={
                                    active
                                      ? {
                                          backgroundColor: t.color,
                                          borderColor: t.color,
                                        }
                                      : undefined
                                  }
                                >
                                  {t.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sectors.length === 0 ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            sectors.map((s) => {
                              const active = u.sectorIds.includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  disabled={savingSectorsForId === u.id}
                                  onClick={() => toggleSector(u, s.id)}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                                    active
                                      ? "border-transparent text-white"
                                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                  }`}
                                  style={
                                    active
                                      ? {
                                          backgroundColor: s.color,
                                          borderColor: s.color,
                                        }
                                      : undefined
                                  }
                                >
                                  {s.name}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {u.is_active ? (
                          <span className="text-xs text-green-700">Ativo</span>
                        ) : (
                          <span className="text-xs text-gray-400">Inativo</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isSelf}
                          loading={isDeleting}
                          onClick={() => handleDelete(u.id, u.name)}
                        >
                          Excluir
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Seletor de cor compacto usado nos mini-forms inline. Mostra apenas
 * uma amostra circular clicavel; ao abrir, exibe os PRESET_COLORS como
 * grid de bolinhas. Mantemos a UI bem enxuta porque essas criacoes
 * inline sao para o caso "quero so um nome rapido"; refinamentos
 * (rename, ativar/desativar, etc.) seguem nas abas dedicadas.
 */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded border border-gray-300 bg-white hover:bg-gray-50"
        aria-label="Escolher cor"
      >
        <span
          className="block h-5 w-5 rounded-full"
          style={{ backgroundColor: value }}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 grid grid-cols-5 gap-1.5 rounded-lg border border-gray-200 bg-white p-2 shadow-md">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={`h-6 w-6 rounded-full transition ${
                c === value
                  ? "ring-2 ring-offset-1 ring-gray-400"
                  : "hover:scale-110"
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
