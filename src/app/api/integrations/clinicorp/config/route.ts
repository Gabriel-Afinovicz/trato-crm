import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";

/**
 * Carrega (GET) e salva (PUT) a configuracao da integracao Clinicorp por
 * empresa, persistida em `company_integrations` (provider=clinicorp).
 *
 * Seguranca: o GET retorna uma visao REDIGIDA — nunca devolve o token em
 * texto puro ao browser. Devolve apenas se esta configurado, o username, o
 * subscriber_id e o status. O PUT recebe as credenciais e grava.
 */
const PROVIDER = "clinicorp";

interface RedactedConfig {
  configured: boolean;
  status: "active" | "disabled" | "error" | null;
  username: string | null;
  subscriberId: string | null;
  hasToken: boolean;
  lastError: string | null;
  lastCheckAt: string | null;
}

function ensureAdmin(
  role: string | null,
  profileCompanyId: string | null | undefined,
  companyId: string
): boolean {
  const isOwnAdmin = role === "admin" && profileCompanyId === companyId;
  const isSuperAdmin = role === "super_admin";
  return isOwnAdmin || isSuperAdmin;
}

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
  if (!ensureAdmin(role, profile.company_id, companyId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_integrations")
    .select("credentials, status, last_error, last_check_at")
    .eq("company_id", companyId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    console.error("[GET /api/integrations/clinicorp/config] db error", error);
    const f = friendlyDbError(error, "list");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  const creds = (data?.credentials ?? {}) as Partial<ClinicorpCredentials>;
  const redacted: RedactedConfig = {
    configured: Boolean(creds.username && creds.token && creds.subscriber_id),
    status: (data?.status as RedactedConfig["status"]) ?? null,
    username: creds.username ?? null,
    subscriberId: creds.subscriber_id ?? null,
    hasToken: Boolean(creds.token),
    lastError: (data?.last_error as string | null) ?? null,
    lastCheckAt: (data?.last_check_at as string | null) ?? null,
  };
  return NextResponse.json({ config: redacted });
}

interface PutPayload {
  companyId?: string;
  username?: string;
  token?: string;
  subscriberId?: string;
  /** Permite desabilitar sem apagar as credenciais. */
  status?: "active" | "disabled";
}

export async function PUT(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: PutPayload;
  try {
    body = (await req.json()) as PutPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyId = body.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  if (!ensureAdmin(role, profile.company_id, companyId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const username = body.username?.trim();
  const token = body.token?.trim();
  const subscriberId = body.subscriberId?.trim();
  const status: "active" | "disabled" =
    body.status === "disabled" ? "disabled" : "active";

  if (!username || !token || !subscriberId) {
    return NextResponse.json(
      { error: "Usuário, token e subscriber ID são obrigatórios." },
      { status: 400 }
    );
  }

  const credentials: ClinicorpCredentials = {
    username,
    token,
    subscriber_id: subscriberId,
  };

  const supabase = await createClient();
  // Upsert por (company_id, provider) — unique constraint garante 1 linha.
  const { error } = await supabase.from("company_integrations").upsert(
    {
      company_id: companyId,
      provider: PROVIDER,
      credentials,
      status,
      last_error: null,
    },
    { onConflict: "company_id,provider" }
  );

  if (error) {
    console.error("[PUT /api/integrations/clinicorp/config] db error", error);
    const f = friendlyDbError(error, "save_setting");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  return NextResponse.json({ ok: true });
}
