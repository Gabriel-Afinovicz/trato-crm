import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";

/**
 * Define se um membro e profissional (`users.is_dentist`). Profissionais
 * aparecem na agenda (dropdown de profissional), nos filtros e na
 * disponibilidade de horarios. Admin-only.
 *
 * Body: { domain, isDentist: boolean }
 */
interface Payload {
  domain?: string;
  isDentist?: boolean;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await ctx.params;

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({ error: "Domínio obrigatório." }, { status: 400 });
  }
  const isDentist = body.isDentist === true;

  let adminCtx;
  try {
    adminCtx = await requireAdminForDomain(domain);
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status =
      code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  const supabaseAdmin = createAdminClient();

  // Garante que o membro pertence a organizacao do admin.
  const { data: target } = await supabaseAdmin
    .from("users")
    .select("id, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!target || (target as { company_id: string }).company_id !== adminCtx.companyId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Grava o override manual e recalcula o is_dentist efetivo (manual OR tag)
  // via a funcao de sincronizacao — assim quem e profissional por tag continua
  // profissional mesmo desligando o manual.
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_dentist_manual: isDentist })
    .eq("id", userId);

  if (error) {
    console.error("[POST /api/operators/[id]/dentist] update error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.rpc("sync_user_is_dentist_for", { p_user_id: userId });

  const { data: refreshed } = await supabaseAdmin
    .from("users")
    .select("is_dentist")
    .eq("id", userId)
    .maybeSingle();
  const effective =
    (refreshed as { is_dentist?: boolean } | null)?.is_dentist ?? isDentist;

  return NextResponse.json({ id: userId, is_dentist: effective });
}
