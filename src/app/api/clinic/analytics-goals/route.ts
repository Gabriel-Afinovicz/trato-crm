import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { getClinicGoals } from "@/lib/supabase/dashboard-data";
import type { ClinicAnalyticsGoals } from "@/lib/types/database";

/**
 * Lê e grava as metas analíticas da clínica
 * (`companies.settings.analytics_goals`).
 *
 * - GET: qualquer membro da clínica pode ler (o painel Analítico precisa
 *   delas para pintar o semáforo). Quando não há metas configuradas, devolve
 *   o default `40/40/30` e `isDefault: true` para o front mostrar o aviso.
 * - PUT: apenas `admin` da própria clínica ou `super_admin`. Persiste via
 *   `jsonb_set` para não sobrescrever outros campos eventualmente
 *   guardados em `settings`.
 */
function parseCompanyId(req: NextRequest): string | null {
  const { searchParams } = new URL(req.url);
  return searchParams.get("companyId");
}

export async function GET(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const companyId = parseCompanyId(req);
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }

  if (role !== "super_admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const result = await getClinicGoals(companyId);
  return NextResponse.json(result);
}

function clampPct(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 100) return null;
  return Math.round(v);
}

interface PutPayload {
  companyId?: string;
  appointment_pct?: number;
  attendance_pct?: number;
  closing_pct?: number;
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

  // Operadores não editam metas — só admin da própria clínica e super_admin.
  const isOwnAdmin = role === "admin" && profile.company_id === companyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const appointment_pct = clampPct(body.appointment_pct);
  const attendance_pct = clampPct(body.attendance_pct);
  const closing_pct = clampPct(body.closing_pct);

  if (
    appointment_pct === null ||
    attendance_pct === null ||
    closing_pct === null
  ) {
    return NextResponse.json(
      { error: "Metas devem ser números entre 0 e 100." },
      { status: 400 }
    );
  }

  const goals: ClinicAnalyticsGoals = {
    appointment_pct,
    attendance_pct,
    closing_pct,
  };

  const supabase = await createClient();

  // Lê settings atual para não perder outros campos eventualmente lá.
  const { data: companyRow, error: readErr } = await supabase
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json(
      { error: `Erro lendo configurações: ${readErr.message}` },
      { status: 500 }
    );
  }

  const currentSettings =
    (companyRow?.settings as Record<string, unknown> | null | undefined) ?? {};

  const { error: updateErr } = await supabase
    .from("companies")
    .update({
      settings: { ...currentSettings, analytics_goals: goals },
    })
    .eq("id", companyId);

  if (updateErr) {
    return NextResponse.json(
      { error: `Erro salvando metas: ${updateErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ goals, isDefault: false });
}
