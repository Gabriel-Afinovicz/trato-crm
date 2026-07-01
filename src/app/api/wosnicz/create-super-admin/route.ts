import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/supabase/require-super-admin";

interface CreateSuperAdminPayload {
  name?: string;
  extension?: string;
  password?: string;
}

const EXTENSION_REGEX = /^[0-9]{2,10}$/;

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status = code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  let body: CreateSuperAdminPayload;
  try {
    body = (await req.json()) as CreateSuperAdminPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const extension = body.extension?.trim();
  const password = body.password;

  if (!name || !extension || !password) {
    return NextResponse.json(
      { error: "Nome, ramal e senha são obrigatórios." },
      { status: 400 }
    );
  }

  if (!EXTENSION_REGEX.test(extension)) {
    return NextResponse.json(
      { error: "Ramal inválido. Use apenas números (2 a 10 dígitos)." },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();

  // Organizacao-sistema que ancora os super admins.
  const { data: wosnicz, error: wosniczError } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("domain", "wosnicz")
    .maybeSingle();

  if (wosniczError || !wosnicz) {
    return NextResponse.json(
      { error: "Organização-sistema (wosnicz) não encontrada." },
      { status: 500 }
    );
  }

  const companyId = (wosnicz as { id: string }).id;

  // Ramal precisa ser unico dentro da organizacao-sistema.
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("company_id", companyId)
    .eq("extension_number", extension)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Já existe um super admin com esse ramal." },
      { status: 409 }
    );
  }

  const email = `${extension}@wosnicz.crm`;

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authUser?.user) {
    const message = authError?.message ?? "desconhecido";
    const conflict = /already|exists|registered/i.test(message);
    return NextResponse.json(
      {
        error: conflict
          ? "Já existe um usuário com esse ramal."
          : `Erro ao criar autenticação: ${message}`,
      },
      { status: conflict ? 409 : 500 }
    );
  }

  const { error: profileError } = await supabaseAdmin.from("users").insert({
    company_id: companyId,
    auth_id: authUser.user.id,
    name,
    email,
    extension_number: extension,
    role: "super_admin",
    is_active: true,
    can_manage_organizations: false,
  });

  if (profileError) {
    // Rollback do usuario de autenticacao para nao deixar lixo orfao.
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json(
      { error: `Erro ao registrar super admin: ${profileError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, name, extension });
}
