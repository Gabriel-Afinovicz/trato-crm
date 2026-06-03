import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";

interface SetPasswordPayload {
  domain?: string;
  userId?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  let body: SetPasswordPayload;
  try {
    body = (await req.json()) as SetPasswordPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  const userId = body.userId?.trim();
  const password = body.password;

  if (!domain || !userId) {
    return NextResponse.json(
      { error: "domain e userId são obrigatórios." },
      { status: 400 }
    );
  }

  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  // Apenas `admin` (na propria organizacao) ou `super_admin` (qualquer
  // dominio) passam por aqui. Operadores recebem FORBIDDEN.
  let ctx;
  try {
    ctx = await requireAdminForDomain(domain);
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status =
      code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  const supabaseAdmin = createAdminClient();

  const { data: target } = await supabaseAdmin
    .from("users")
    .select("id, role, company_id, auth_id")
    .eq("id", userId)
    .single();

  const targetRecord = target as
    | { id: string; role: string; company_id: string; auth_id: string | null }
    | null;

  if (!targetRecord) {
    return NextResponse.json(
      { error: "Usuário não encontrado." },
      { status: 404 }
    );
  }

  // Escopo: admin/super_admin so altera senha de membros da organizacao do
  // dominio informado (requireAdminForDomain ja resolve company para ambos).
  if (targetRecord.company_id !== ctx.companyId) {
    return NextResponse.json(
      { error: "Usuário não pertence a esta organização." },
      { status: 403 }
    );
  }

  if (targetRecord.role !== "operator" && targetRecord.role !== "admin") {
    return NextResponse.json(
      { error: "Só é possível alterar a senha de operadores e administradores." },
      { status: 400 }
    );
  }

  if (!targetRecord.auth_id) {
    return NextResponse.json(
      { error: "Este membro não possui acesso de autenticação vinculado." },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
    targetRecord.auth_id,
    { password }
  );

  if (updateErr) {
    console.error("[POST /api/operators/set-password] update error", updateErr);
    return NextResponse.json(
      { error: `Erro ao atualizar a senha: ${updateErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
