import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Atualizacao unificada de um membro (dados gerais + senha).
 *
 * Permissoes:
 *  - admin / super_admin: edita qualquer membro da sua organizacao (nome,
 *    email, permissao, profissional, senha).
 *  - operador: edita APENAS a si mesmo, e somente nome, email e senha.
 *
 * O ramal (extension_number) NAO e alteravel aqui — e o identificador de
 * login e exigiria migracao do acesso (auth). Campos ausentes nao sao tocados.
 */
interface UpdatePayload {
  domain?: string;
  name?: string;
  email?: string;
  role?: "operator" | "admin";
  isDentist?: boolean;
  password?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await ctx.params;

  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: UpdatePayload;
  try {
    body = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const isSelf = profile.id === userId;
  const isAdmin = role === "admin" || role === "super_admin";
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: targetRaw } = await admin
    .from("users")
    .select("id, company_id, auth_id, role")
    .eq("id", userId)
    .maybeSingle();
  const target = targetRaw as
    | { id: string; company_id: string; auth_id: string | null; role: string }
    | null;
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (role !== "super_admin" && target.company_id !== profile.company_id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  const warnings: string[] = [];

  // Nome (admin ou o proprio).
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });
    }
    updates.name = name;
  }

  // Permissao (somente admin). Protege o ultimo administrador da organizacao.
  if (isAdmin && (body.role === "operator" || body.role === "admin")) {
    if (body.role !== target.role && target.role !== "super_admin") {
      if (target.role === "admin" && body.role === "operator") {
        const { count } = await admin
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("company_id", target.company_id)
          .eq("role", "admin")
          .eq("is_active", true)
          .neq("id", userId);
        if (!count || count < 1) {
          return NextResponse.json(
            { error: "Não é possível rebaixar o último administrador da organização." },
            { status: 400 }
          );
        }
      }
      updates.role = body.role;
    }
  }

  // Profissional (somente admin): grava o override manual e sincroniza depois.
  let syncDentist = false;
  if (isAdmin && typeof body.isDentist === "boolean") {
    updates.is_dentist_manual = body.isDentist;
    syncDentist = true;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await admin
      .from("users")
      .update(updates)
      .eq("id", userId);
    if (updErr) {
      console.error("[POST /api/operators/[id]/update] update error", updErr);
      return NextResponse.json(
        { error: `Erro ao salvar: ${updErr.message}` },
        { status: 500 }
      );
    }
  }

  if (syncDentist) {
    await admin.rpc("sync_user_is_dentist_for", { p_user_id: userId });
  }

  // Email (admin ou o proprio): sincroniza com o acesso (auth) e grava em
  // users.email/invite_email. So quando vier preenchido.
  if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }
    if (target.auth_id) {
      const { error: authErr } = await admin.auth.admin.updateUserById(
        target.auth_id,
        { email, email_confirm: true }
      );
      if (authErr) {
        warnings.push(
          authErr.message?.toLowerCase().includes("already")
            ? "este email já está vinculado a outro acesso"
            : "falha ao registrar o email no acesso"
        );
      } else {
        await admin
          .from("users")
          .update({ email, invite_email: email })
          .eq("id", userId);
      }
    }
  }

  // Senha (admin ou o proprio): opcional.
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }
    if (!target.auth_id) {
      return NextResponse.json(
        { error: "Este membro não possui acesso de autenticação vinculado." },
        { status: 400 }
      );
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(
      target.auth_id,
      { password: body.password }
    );
    if (pwErr) {
      console.error("[POST /api/operators/[id]/update] password error", pwErr);
      return NextResponse.json(
        { error: `Erro ao atualizar a senha: ${pwErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  });
}
