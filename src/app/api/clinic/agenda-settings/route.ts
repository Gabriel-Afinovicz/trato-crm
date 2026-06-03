import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";

// Configuracoes de Agenda por clinica (persistidas em
// companies.settings.agenda). Mesmo padrao da rota analytics-goals.
//
// - default_appointment_minutes: duracao default da consulta (min). Usado
//   pelo bloco de agendamento do form de Lead e como sugestao no modal
//   tradicional da Agenda.
// - allow_overlap: quando true, o cliente pode confirmar manualmente um
//   horario ja ocupado (a RPC continua bloqueando closed/lunch/holiday/block).

export interface AgendaSettings {
  default_appointment_minutes: number;
  allow_overlap: boolean;
}

export const DEFAULT_AGENDA_SETTINGS: AgendaSettings = {
  default_appointment_minutes: 30,
  allow_overlap: false,
};

function clampMinutes(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 5 || i > 480) return null;
  return i;
}

function parseSettings(raw: unknown): AgendaSettings {
  const obj =
    (raw as Record<string, unknown> | null | undefined)?.agenda ?? null;
  if (!obj || typeof obj !== "object") return { ...DEFAULT_AGENDA_SETTINGS };
  const o = obj as Record<string, unknown>;
  const minutes = clampMinutes(o.default_appointment_minutes);
  const overlap = typeof o.allow_overlap === "boolean" ? o.allow_overlap : null;
  return {
    default_appointment_minutes:
      minutes ?? DEFAULT_AGENDA_SETTINGS.default_appointment_minutes,
    allow_overlap: overlap ?? DEFAULT_AGENDA_SETTINGS.allow_overlap,
  };
}

export async function GET(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }
  if (role !== "super_admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    console.error("[GET /api/clinic/agenda-settings] db error", error);
    const f = friendlyDbError(error, "list");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  const settings = parseSettings(
    (data as { settings?: Record<string, unknown> } | null)?.settings
  );
  return NextResponse.json({ settings });
}

interface PutPayload {
  companyId?: string;
  default_appointment_minutes?: number;
  allow_overlap?: boolean;
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
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }

  const isOwnAdmin = role === "admin" && profile.company_id === companyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const minutes = clampMinutes(body.default_appointment_minutes);
  const allow_overlap =
    typeof body.allow_overlap === "boolean" ? body.allow_overlap : null;

  if (minutes === null || allow_overlap === null) {
    return NextResponse.json(
      {
        error:
          "default_appointment_minutes (5-480) e allow_overlap (boolean) sao obrigatorios.",
      },
      { status: 400 }
    );
  }

  const settings: AgendaSettings = {
    default_appointment_minutes: minutes,
    allow_overlap,
  };

  const supabase = await createClient();
  const { data: companyRow, error: readErr } = await supabase
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .maybeSingle();
  if (readErr) {
    console.error("[PUT /api/clinic/agenda-settings] read error", readErr);
    const f = friendlyDbError(readErr, "save_setting");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  const currentSettings =
    (companyRow?.settings as Record<string, unknown> | null | undefined) ?? {};

  const { error: updateErr } = await supabase
    .from("companies")
    .update({
      settings: { ...currentSettings, agenda: settings },
    })
    .eq("id", companyId);

  if (updateErr) {
    console.error("[PUT /api/clinic/agenda-settings] update error", updateErr);
    const f = friendlyDbError(updateErr, "save_setting");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  return NextResponse.json({ settings });
}
