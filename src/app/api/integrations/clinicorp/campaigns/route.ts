import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { clinicorp } from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";

/**
 * Lista as campanhas ativas usando as credenciais JA SALVAS da empresa.
 * Usado para popular o dropdown de mapeamento de fontes -> campanha.
 *
 * Query: ?companyId=...
 */
export async function GET(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const isOwnAdmin = role === "admin" && profile.company_id === companyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // RLS permite admin ler company_integrations da propria empresa.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_integrations")
    .select("credentials, status")
    .eq("company_id", companyId)
    .eq("provider", "clinicorp")
    .maybeSingle();

  if (error) {
    console.error("[GET /api/integrations/clinicorp/campaigns] db error", error);
    return NextResponse.json(
      { error: "Não foi possível ler a configuração da integração." },
      { status: 500 }
    );
  }

  const creds = (data?.credentials ?? {}) as Partial<ClinicorpCredentials>;
  if (!creds.username || !creds.token || !creds.subscriber_id) {
    return NextResponse.json(
      { error: "Integração Clinicorp ainda não configurada.", campaigns: [] },
      { status: 409 }
    );
  }

  try {
    const { campaigns } = await clinicorp.listActiveCampaigns({
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    });
    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("[GET /api/integrations/clinicorp/campaigns] upstream", err);
    const f = friendlyClinicorpError(err, "list_campaigns");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
}
