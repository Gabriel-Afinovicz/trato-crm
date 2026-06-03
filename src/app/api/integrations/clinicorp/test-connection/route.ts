import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { clinicorp } from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";

/**
 * Testa as credenciais Clinicorp informadas pelo admin SEM persisti-las.
 * Faz um GET /crm/list_active_campaigns: se as credenciais forem validas,
 * retorna as campanhas (que tambem alimentam o mapeamento de fontes).
 *
 * Body: { companyId, username, token, subscriberId }
 */
interface TestPayload {
  companyId?: string;
  username?: string;
  token?: string;
  subscriberId?: string;
}

export async function POST(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: TestPayload;
  try {
    body = (await req.json()) as TestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyId = body.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const isOwnAdmin = role === "admin" && profile.company_id === companyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const username = body.username?.trim();
  const token = body.token?.trim();
  const subscriberId = body.subscriberId?.trim();
  if (!username || !token || !subscriberId) {
    return NextResponse.json(
      { error: "Informe usuário, token e subscriber ID." },
      { status: 400 }
    );
  }

  try {
    const { campaigns } = await clinicorp.listActiveCampaigns({
      username,
      token,
      subscriber_id: subscriberId,
    });
    return NextResponse.json({ ok: true, campaigns });
  } catch (err) {
    console.error("[POST /api/integrations/clinicorp/test-connection]", err);
    const f = friendlyClinicorpError(err, "test_connection");
    return NextResponse.json(
      { ok: false, error: f.message },
      { status: f.status }
    );
  }
}
