import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";
import { evolution } from "@/lib/evolution/client";

interface DisconnectPayload {
  domain?: string;
}

interface InstanceRow {
  id: string;
  instance_name: string;
}

export async function POST(req: NextRequest) {
  let body: DisconnectPayload;
  try {
    body = (await req.json()) as DisconnectPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json(
      { error: "Dominio obrigatorio." },
      { status: 400 }
    );
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

  const supabaseAdmin = createAdminClient();
  const { data: instance } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, instance_name")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  const instanceRow = instance as InstanceRow | null;

  if (!instanceRow) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  // Desconectar de verdade exige zerar o cache do Baileys na Evolution.
  // Apenas `logout` mantem credenciais e permitiria a Evolution reabrir
  // a sessao no proximo connect sem gerar QR. `resetInstance` faz
  // logout + poll-ate-close + delete, garantindo que o proximo connect
  // passe pelo fluxo de QR novamente.
  if (evolution.isConfigured()) {
    try {
      await evolution.resetInstance(instanceRow.instance_name);
    } catch (err) {
      // Falha no servico externo nao deve impedir a desconexao local: a
      // proxima reconexao detectara estado inconsistente e refazera o
      // reset. Logamos para diagnostico interno.
      console.error("[whatsapp/disconnect] upstream reset failed", err);
    }
  }

  await supabaseAdmin
    .from("whatsapp_instances")
    .update({
      status: "disconnected",
      phone_number: null,
      connected_at: null,
      // Zera o token para sinalizar ao /connect que a instancia foi
      // removida na Evolution e precisa ser recriada (-> novo QR).
      evolution_token: null,
    })
    .eq("id", instanceRow.id);

  return NextResponse.json({ ok: true });
}
