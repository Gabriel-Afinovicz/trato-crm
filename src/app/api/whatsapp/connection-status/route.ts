import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint leve (somente banco, sem tocar na Evolution API) para detectar se o
// WhatsApp esta desconectado e, em caso afirmativo, se a desconexao foi pelo
// CELULAR (aparelho removido dos dispositivos conectados) ou pelo proprio CRM.
//
// Como distinguimos sem coluna dedicada:
//  - Desconectar pelo CRM (/instance/disconnect) zera `evolution_token`.
//  - Desconectar pelo celular (webhook connection.update) mantem o token.
// Logo: status === "disconnected" && token != null  => caiu pelo celular.
//
// O token NUNCA e retornado ao client — calculamos o booleano no servidor.

interface InstanceRow {
  status: "disconnected" | "connecting" | "connected";
  evolution_token: string | null;
}

interface ConnectionStatusResponse {
  /** Existe instancia registrada para a empresa. */
  hasInstance: boolean;
  status: "disconnected" | "connecting" | "connected" | null;
  /** true quando caiu pelo celular (status disconnected + token presente). */
  phoneDisconnected: boolean;
}

const EMPTY: ConnectionStatusResponse = {
  hasInstance: false,
  status: null,
  phoneDisconnected: false,
};

export async function GET(
  req: NextRequest
): Promise<NextResponse<ConnectionStatusResponse>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(EMPTY, { status: 200 });
  }

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json(EMPTY, { status: 200 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("domain", domain)
    .single();
  const companyRow = company as { id: string } | null;
  if (!companyRow) {
    return NextResponse.json(EMPTY, { status: 200 });
  }

  // Admin client: precisamos ler `evolution_token` para derivar o motivo, mas
  // sem expor o valor. Mantemos o token estritamente no servidor.
  const supabaseAdmin = createAdminClient();
  const { data: row } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("status, evolution_token")
    .eq("company_id", companyRow.id)
    .maybeSingle();
  const instance = row as InstanceRow | null;

  if (!instance) {
    return NextResponse.json(EMPTY);
  }

  const phoneDisconnected =
    instance.status === "disconnected" && Boolean(instance.evolution_token);

  return NextResponse.json({
    hasInstance: true,
    status: instance.status,
    phoneDisconnected,
  });
}
