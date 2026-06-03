import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";
import { friendlyDbError } from "@/lib/api/friendly-db-error";

/**
 * Cria um membro e envia convite por email para que ele defina a propria
 * senha. Diferente de `/api/operators/create` (que pede senha agora),
 * aqui o admin so informa nome + ramal + email + role + tagIds + sectorIds.
 *
 * Fluxo:
 *  1. Gera senha temporaria aleatoria (sera substituida no fluxo de reset).
 *  2. RPC `create_user` cria o auth.users com email fake (`ext@dominio.crm`)
 *     e a linha em public.users.
 *  3. `auth.admin.updateUserById` troca o auth.users.email para o EMAIL REAL —
 *     a RPC `resolve_login` ja foi adaptada para retornar este e-mail
 *     (mesmo continuando a buscar por "dominio + ramal"), entao o login
 *     por ramal continua funcionando normalmente.
 *  4. Grava o email real em `users.email` e `users.invite_email`.
 *  5. `generateLink({ type: 'recovery', email: realEmail })` envia o email
 *     usando o SMTP configurado no Supabase. O link aterrissa em
 *     `/<domain>/redefinir-senha`, onde o convidado define a propria senha.
 *
 * O texto do email e o template padrao do Supabase (Recovery / Reset).
 * Configure-o em Settings > Auth > Email Templates para personalizar
 * a copy de boas-vindas.
 */
interface InvitePayload {
  domain?: string;
  name?: string;
  extension?: string;
  email?: string;
  role?: "operator" | "admin";
  tagIds?: string[];
  sectorIds?: string[];
}

const EXTENSION_REGEX = /^[0-9]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomPassword(): string {
  // 24 chars com letras+numeros+simbolos — usado so como placeholder
  // ate o convidado definir a propria senha via link.
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let out = "";
  const arr = new Uint32Array(24);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

export async function POST(req: NextRequest) {
  let body: InvitePayload;
  try {
    body = (await req.json()) as InvitePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  const name = body.name?.trim();
  const extension = body.extension?.trim();
  const inviteEmail = body.email?.trim().toLowerCase();
  const role: "operator" | "admin" =
    body.role === "admin" ? "admin" : "operator";
  const tagIds = Array.isArray(body.tagIds)
    ? body.tagIds.filter((t): t is string => typeof t === "string")
    : [];
  const sectorIds = Array.isArray(body.sectorIds)
    ? body.sectorIds.filter((t): t is string => typeof t === "string")
    : [];

  if (!domain) {
    return NextResponse.json({ error: "Domínio obrigatório." }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await requireAdminForDomain(domain);
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status =
      code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  if (!name || !extension || !inviteEmail) {
    return NextResponse.json(
      { error: "Nome, ramal e email são obrigatórios." },
      { status: 400 }
    );
  }
  if (!EXTENSION_REGEX.test(extension)) {
    return NextResponse.json(
      { error: "Ramal inválido. Use apenas números." },
      { status: 400 }
    );
  }
  if (!EMAIL_REGEX.test(inviteEmail)) {
    return NextResponse.json(
      { error: "Email inválido." },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();
  const authFakeEmail = `${extension}@${domain}.crm`;
  const tempPassword = randomPassword();

  // Pre-check: ramal ja existe na organizacao?
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("extension_number", extension)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Já existe um usuário com esse ramal nesta organização." },
      { status: 409 }
    );
  }

  // Nota: o Supabase tem unique constraint em auth.users.email. Se o
  // email real ja estiver vinculado a outro acesso, o update no
  // auth.users mais abaixo falha — neste caso fazemos rollback e
  // devolvemos 409 com mensagem amigavel.

  const { data: newUserId, error: rpcError } = await supabaseAdmin.rpc(
    "create_user",
    {
      p_company_id: ctx.companyId,
      p_name: name,
      // O `users.email` sera sobrescrito logo abaixo com o email real;
      // passamos o fake aqui apenas para a RPC funcionar.
      p_email: authFakeEmail,
      p_extension_number: extension,
      p_password: tempPassword,
      p_role: role,
    }
  );

  if (rpcError) {
    console.error("[POST /api/operators/invite] rpc error", rpcError);
    const f = friendlyDbError(rpcError, "save_user");
    const msg =
      f.code === "duplicate"
        ? "Ja existe um membro com este ramal nesta organizacao."
        : f.message;
    return NextResponse.json({ error: msg }, { status: f.status });
  }

  if (typeof newUserId !== "string") {
    return NextResponse.json(
      { error: "Falha ao criar o membro." },
      { status: 500 }
    );
  }

  // Recupera o auth_id para conseguir alterar o email no auth.users.
  const { data: createdUser } = await supabaseAdmin
    .from("users")
    .select("auth_id")
    .eq("id", newUserId)
    .single();
  const authId = createdUser?.auth_id ?? null;
  if (!authId) {
    return NextResponse.json(
      { error: "Membro criado, mas faltou auth_id para enviar o convite." },
      { status: 500 }
    );
  }

  // Troca o e-mail do auth.users para o real. A partir desse momento,
  // o login por ramal continua funcionando porque `resolve_login`
  // retorna `auth.users.email` (que agora e o real) — mesmo lookup,
  // outro destino. Em caso de email ja em uso por outro usuario do
  // Supabase Auth, o update falha com code "email_exists".
  const { error: updateAuthErr } =
    await supabaseAdmin.auth.admin.updateUserById(authId, {
      email: inviteEmail,
      email_confirm: true,
    });

  if (updateAuthErr) {
    // Rollback: remove o user recem-criado para nao deixar lixo orfao.
    await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => undefined);
    await supabaseAdmin.from("users").delete().eq("id", newUserId);

    const message = updateAuthErr.message?.toLowerCase().includes("already")
      ? "Este email ja esta vinculado a outro acesso no sistema. Use outro email."
      : "Nao foi possivel vincular o email ao acesso do membro.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  // Sincroniza users.email e users.invite_email com o email real.
  await supabaseAdmin
    .from("users")
    .update({ email: inviteEmail, invite_email: inviteEmail })
    .eq("id", newUserId);

  const warnings: string[] = [];

  if (tagIds.length > 0) {
    const { error: tagErr } = await supabaseAdmin
      .from("user_role_tag_assignments")
      .insert(tagIds.map((tagId) => ({ user_id: newUserId, tag_id: tagId })));
    if (tagErr) warnings.push(`erro ao salvar funções: ${tagErr.message}`);
  }
  if (sectorIds.length > 0) {
    const { error: sectorErr } = await supabaseAdmin
      .from("user_sector_assignments")
      .insert(
        sectorIds.map((sectorId) => ({
          user_id: newUserId,
          sector_id: sectorId,
        }))
      );
    if (sectorErr) warnings.push(`erro ao salvar setores: ${sectorErr.message}`);
  }

  // Envia o e-mail de boas-vindas / recuperacao. Usamos
  // `resetPasswordForEmail` (e nao `admin.generateLink`) porque o
  // generateLink apenas RETORNA a URL — ele so envia o email se voce
  // tiver setado um hook custom. Ja o resetPasswordForEmail dispara o
  // envio usando o SMTP configurado no Supabase (Auth > Email
  // Templates > Reset Password). O link aterrissa em
  // `/<domain>/redefinir-senha`.
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/${domain}/redefinir-senha`;

  let emailSent = true;
  let emailError: string | null = null;
  const { error: inviteErr } =
    await supabaseAdmin.auth.resetPasswordForEmail(inviteEmail, {
      redirectTo,
    });

  if (inviteErr) {
    emailSent = false;
    emailError = inviteErr.message;
    console.error("[invite] resetPasswordForEmail falhou:", inviteErr);
    warnings.push(
      "nao foi possivel enviar o email automaticamente. Verifique no Supabase em Authentication > Emails se o SMTP esta configurado, ou peca para o membro acessar 'Esqueci minha senha' na tela de login"
    );
  }

  return NextResponse.json({
    id: newUserId,
    name,
    extension,
    inviteEmail,
    emailSent,
    emailError,
    warning:
      warnings.length > 0
        ? `Membro criado, mas houve ${warnings.join("; ")}.`
        : undefined,
  });
}
