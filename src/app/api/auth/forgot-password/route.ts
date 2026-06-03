import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Solicita reset de senha por email.
 *
 * Recebe `{ domain, ramal }`. Como o login no CRM e por ramal (nao
 * por email), precisamos primeiro descobrir qual e o email REAL
 * cadastrado para esse ramal. Isso vem da coluna `users.invite_email`
 * (preenchida quando o admin cadastra um email ao criar o membro ou
 * envia um convite).
 *
 * Sem email cadastrado, a recuperacao nao tem para onde enviar — neste
 * caso retornamos 200 com `{ ok: true, hint: "no_email" }` para que o
 * frontend possa orientar o usuario a procurar o admin da organizacao.
 *
 * Comportamento "anti-enumeracao": em todos os cenarios devolvemos 200.
 * Logamos os erros tecnicos internamente para diagnostico mas nunca
 * expomos ao client.
 */
interface ForgotPasswordPayload {
  domain?: string;
  ramal?: string;
}

export async function POST(req: NextRequest) {
  let body: ForgotPasswordPayload;
  try {
    body = (await req.json()) as ForgotPasswordPayload;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  const ramal = body.ramal?.trim();
  if (!domain || !ramal) {
    return NextResponse.json(
      { error: "Informe o ramal." },
      { status: 400 }
    );
  }

  // Usamos service-role aqui (admin) porque a tabela `users` tem RLS
  // que so deixa o proprio user / admin ler — mas neste endpoint o
  // chamador esta DESLOGADO (esqueceu a senha). Sem service-role, o
  // SELECT abaixo retorna 0 linhas mesmo quando o ramal existe.
  const supabaseAdmin = createAdminClient();

  try {
    // Resolve ramal + domain → email real (invite_email).
    const { data: rows } = await supabaseAdmin
      .from("users")
      .select(
        "invite_email, companies!inner(domain, is_active), is_active"
      )
      .eq("extension_number", ramal)
      .eq("is_active", true)
      .eq("companies.domain", domain)
      .eq("companies.is_active", true)
      .limit(1);

    const row = rows?.[0] as
      | { invite_email: string | null; is_active: boolean }
      | undefined;
    const realEmail = row?.invite_email ?? null;

    if (!realEmail) {
      // Ramal nao existe OU existe mas nao tem email cadastrado.
      // Hint ajuda o frontend a mostrar a mensagem certa sem vazar
      // qual dos dois e o caso (anti-enumeracao). O admin da
      // organizacao pode resolver os dois cenarios.
      return NextResponse.json({ ok: true, hint: "no_email" });
    }

    const origin = new URL(req.url).origin;
    const redirectTo = `${origin}/${domain}/redefinir-senha`;

    const { error: resetErr } =
      await supabaseAdmin.auth.resetPasswordForEmail(realEmail, {
        redirectTo,
      });

    if (resetErr) {
      console.error(
        "[forgot-password] resetPasswordForEmail error:",
        resetErr.message
      );
      // Mesmo com falha de envio, devolvemos ok para nao vazar info.
      return NextResponse.json({ ok: true, hint: "send_failed" });
    }
  } catch (err) {
    console.error("[forgot-password] unexpected error:", err);
    return NextResponse.json({ ok: true, hint: "unexpected" });
  }

  return NextResponse.json({ ok: true, hint: "sent" });
}
