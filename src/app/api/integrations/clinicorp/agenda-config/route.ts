import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";

/**
 * Configuracao de AGENDAMENTO da Clinicorp (separada das credenciais): qual
 * clinica (Clinic_BusinessId) recebe os agendamentos e o mapa opcional de
 * dentistas do CRM -> Dentist_PersonId. Persistido em
 * `company_integrations.config` (provider=clinicorp), sem tocar nas
 * credenciais.
 *
 * GET  ?companyId= -> { clinicBusinessId, dentistMap, configured }
 * PUT  { companyId, clinicBusinessId, dentistMap }
 */
const PROVIDER = "clinicorp";

function ensureAdmin(
  role: string | null,
  profileCompanyId: string | null | undefined,
  companyId: string
): boolean {
  const isOwnAdmin = role === "admin" && profileCompanyId === companyId;
  return isOwnAdmin || role === "super_admin";
}

function parseDentistMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
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
    .select("credentials, config")
    .eq("company_id", companyId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    console.error("[GET /api/integrations/clinicorp/agenda-config] db error", error);
    const f = friendlyDbError(error, "list");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  const creds = (data?.credentials ?? {}) as Record<string, unknown>;
  const cfg = (data?.config ?? {}) as Record<string, unknown>;
  const clinicBusinessId =
    typeof cfg.clinic_business_id === "string" ? cfg.clinic_business_id : "";
  const defaultDentistPersonId =
    typeof cfg.default_dentist_person_id === "string"
      ? cfg.default_dentist_person_id
      : "";
  const schedulingMode = cfg.scheduling_mode === "chair" ? "chair" : "professional";
  const defaultChairId =
    typeof cfg.default_chair_id === "string" ? cfg.default_chair_id : "";

  return NextResponse.json({
    configured: Boolean(creds.username && creds.token && creds.subscriber_id),
    clinicBusinessId,
    schedulingMode,
    defaultDentistPersonId,
    defaultChairId,
    dentistMap: parseDentistMap(cfg.dentist_map),
    roomChairMap: parseDentistMap(cfg.room_chair_map),
    procedureMap: parseDentistMap(cfg.procedure_map),
  });
}

interface PutPayload {
  companyId?: string;
  clinicBusinessId?: string;
  schedulingMode?: "professional" | "chair";
  defaultDentistPersonId?: string;
  defaultChairId?: string;
  dentistMap?: Record<string, string>;
  roomChairMap?: Record<string, string>;
  procedureMap?: Record<string, string>;
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

  const clinicBusinessId = (body.clinicBusinessId ?? "").trim();
  const schedulingMode = body.schedulingMode === "chair" ? "chair" : "professional";
  const defaultDentistPersonId = (body.defaultDentistPersonId ?? "").trim();
  const defaultChairId = (body.defaultChairId ?? "").trim();
  const dentistMap = parseDentistMap(body.dentistMap);
  const roomChairMap = parseDentistMap(body.roomChairMap);
  const procedureMap = parseDentistMap(body.procedureMap);

  const supabase = await createClient();
  // A integracao (credenciais) precisa existir antes de configurar a agenda.
  const { data: existing, error: readErr } = await supabase
    .from("company_integrations")
    .select("config")
    .eq("company_id", companyId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (readErr) {
    console.error("[PUT /api/integrations/clinicorp/agenda-config] read error", readErr);
    const f = friendlyDbError(readErr, "save_setting");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Configure as credenciais da Clinicorp antes de definir a agenda." },
      { status: 409 }
    );
  }

  const currentConfig =
    (existing.config as Record<string, unknown> | null | undefined) ?? {};
  const nextConfig = {
    ...currentConfig,
    clinic_business_id: clinicBusinessId,
    scheduling_mode: schedulingMode,
    default_dentist_person_id: defaultDentistPersonId,
    default_chair_id: defaultChairId,
    dentist_map: dentistMap,
    room_chair_map: roomChairMap,
    procedure_map: procedureMap,
  };

  const { error: updateErr } = await supabase
    .from("company_integrations")
    .update({ config: nextConfig })
    .eq("company_id", companyId)
    .eq("provider", PROVIDER);

  if (updateErr) {
    console.error("[PUT /api/integrations/clinicorp/agenda-config] update error", updateErr);
    const f = friendlyDbError(updateErr, "save_setting");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  return NextResponse.json({
    ok: true,
    clinicBusinessId,
    schedulingMode,
    defaultDentistPersonId,
    defaultChairId,
    dentistMap,
    roomChairMap,
    procedureMap,
  });
}
