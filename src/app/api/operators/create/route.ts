import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";
import { friendlyDbError } from "@/lib/api/friendly-db-error";

interface CreateOperatorPayload {
  domain?: string;
  name?: string;
  extension?: string;
  password?: string;
  /**
   * Email real do membro (opcional). Se informado, vira o
   * `auth.users.email` (substituindo o fake `ramal@dominio.crm`) e e
   * gravado em `users.email`/`users.invite_email`. Usado apenas para
   * "Esqueci minha senha" e futuras notificacoes — o login continua
   * sendo por ramal + senha.
   */
  email?: string;
  role?: "operator" | "admin";
  tagIds?: string[];
  sectorIds?: string[];
  /** Marca o membro como profissional (aparece na agenda, filtros e disponibilidade). */
  isDentist?: boolean;
}

const EXTENSION_REGEX = /^[0-9]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: CreateOperatorPayload;
  try {
    body = (await req.json()) as CreateOperatorPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  const name = body.name?.trim();
  const extension = body.extension?.trim();
  const password = body.password;
  const optionalEmail = body.email?.trim().toLowerCase() || null;
  const role: "operator" | "admin" =
    body.role === "admin" ? "admin" : "operator";
  const tagIds = Array.isArray(body.tagIds)
    ? body.tagIds.filter((t): t is string => typeof t === "string")
    : [];
  const sectorIds = Array.isArray(body.sectorIds)
    ? body.sectorIds.filter((t): t is string => typeof t === "string")
    : [];
  const isDentist = body.isDentist === true;

  if (optionalEmail && !EMAIL_REGEX.test(optionalEmail)) {
    return NextResponse.json(
      { error: "Email inválido. Deixe em branco se preferir cadastrar depois." },
      { status: 400 }
    );
  }

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

  if (!name || !extension || !password) {
    return NextResponse.json(
      { error: "Nome, ramal e senha são obrigatórios." },
      { status: 400 }
    );
  }

  if (!EXTENSION_REGEX.test(extension)) {
    return NextResponse.json(
      { error: "Ramal inválido. Use apenas números." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  const email = `${extension}@${domain}.crm`;
  const supabaseAdmin = createAdminClient();

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

  const { data: newUserId, error: rpcError } = await supabaseAdmin.rpc(
    "create_user",
    {
      p_company_id: ctx.companyId,
      p_name: name,
      p_email: email,
      p_extension_number: extension,
      p_password: password,
      p_role: role,
    }
  );

  if (rpcError) {
    console.error("[POST /api/operators/create] rpc error", rpcError);
    // Erros comuns: extensao ja em uso → 23505. friendlyDbError cuida.
    const f = friendlyDbError(rpcError, "save_user");
    // Mensagem mais especifica quando duplicidade.
    const msg =
      f.code === "duplicate"
        ? "Ja existe um membro com este ramal nesta organizacao."
        : f.message;
    return NextResponse.json({ error: msg }, { status: f.status });
  }

  const warnings: string[] = [];

  if (typeof newUserId === "string" && tagIds.length > 0) {
    const { error: tagErr } = await supabaseAdmin
      .from("user_role_tag_assignments")
      .insert(tagIds.map((tagId) => ({ user_id: newUserId, tag_id: tagId })));
    if (tagErr) {
      warnings.push(`erro ao salvar funções: ${tagErr.message}`);
    }
  }

  if (typeof newUserId === "string" && sectorIds.length > 0) {
    const { error: sectorErr } = await supabaseAdmin
      .from("user_sector_assignments")
      .insert(
        sectorIds.map((sectorId) => ({
          user_id: newUserId,
          sector_id: sectorId,
        }))
      );
    if (sectorErr) {
      warnings.push(`erro ao salvar setores: ${sectorErr.message}`);
    }
  }

  // Marca como profissional quando solicitado: faz o membro aparecer na
  // agenda, nos filtros e na disponibilidade. Usamos o override manual
  // (is_dentist_manual) para nao ser sobrescrito pela sincronizacao por tags;
  // is_dentist efetivo = manual OR tag, entao setamos ambos.
  if (typeof newUserId === "string" && isDentist) {
    const { error: dentistErr } = await supabaseAdmin
      .from("users")
      .update({ is_dentist_manual: true, is_dentist: true })
      .eq("id", newUserId);
    if (dentistErr) {
      warnings.push(`erro ao marcar como profissional: ${dentistErr.message}`);
    }
  }

  // Se o admin informou um email real, sincronizamos com auth.users
  // e populamos `users.email`/`users.invite_email` — mesmo fluxo do
  // convite, sem disparar o email de recuperacao. Isso habilita o
  // "Esqueci minha senha" futuramente para este membro.
  if (typeof newUserId === "string" && optionalEmail) {
    const { data: createdUser } = await supabaseAdmin
      .from("users")
      .select("auth_id")
      .eq("id", newUserId)
      .single();
    const authId = createdUser?.auth_id ?? null;
    if (authId) {
      const { error: updateAuthErr } =
        await supabaseAdmin.auth.admin.updateUserById(authId, {
          email: optionalEmail,
          email_confirm: true,
        });
      if (updateAuthErr) {
        // Nao removemos o user — o login por ramal+senha continua
        // funcionando com o email fake. Avisamos o admin via warning.
        const reason = updateAuthErr.message?.toLowerCase().includes("already")
          ? "este email ja esta vinculado a outro acesso no sistema"
          : "falha ao registrar o email no acesso";
        warnings.push(reason);
      } else {
        await supabaseAdmin
          .from("users")
          .update({ email: optionalEmail, invite_email: optionalEmail })
          .eq("id", newUserId);
      }
    }
  }

  if (warnings.length > 0) {
    return NextResponse.json({
      id: newUserId,
      name,
      extension,
      email: optionalEmail ?? email,
      warning: `Usuário criado, mas houve ${warnings.join("; ")}.`,
    });
  }
  return NextResponse.json({
    id: newUserId,
    name,
    extension,
    email: optionalEmail ?? email,
  });
}
