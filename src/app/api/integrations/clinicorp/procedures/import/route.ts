import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { clinicorp } from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";

/**
 * Importa os procedimentos da Clinicorp como Servicos (procedure_types) do CRM,
 * ja vinculados (grava `clinicorp_procedure_id`). Assim o operador seleciona o
 * servico direto no agendamento e a sincronizacao acontece sozinha, sem criar
 * manualmente nem mapear um a um.
 *
 * Idempotente: procedimentos ja importados (mesmo clinicorp_procedure_id) sao
 * pulados. Admin-only. Body: { companyId }.
 */
interface ImportPayload {
  companyId?: string;
}

export async function POST(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: ImportPayload;
  try {
    body = (await req.json()) as ImportPayload;
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

  const admin = createAdminClient();

  const { data: integ } = await admin
    .from("company_integrations")
    .select("credentials, status")
    .eq("company_id", companyId)
    .eq("provider", "clinicorp")
    .maybeSingle();
  const creds = (integ?.credentials ?? {}) as Partial<ClinicorpCredentials>;
  if (!creds.username || !creds.token || !creds.subscriber_id) {
    return NextResponse.json(
      { error: "Integração Clinicorp não configurada." },
      { status: 409 }
    );
  }

  let procedures;
  try {
    const res = await clinicorp.listProcedures({
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    });
    procedures = res.procedures;
  } catch (err) {
    console.error("[POST /api/integrations/clinicorp/procedures/import]", err);
    const f = friendlyClinicorpError(err, "generic");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  if (procedures.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      skipped: 0,
      total: 0,
      message: "Nenhum procedimento retornado pela Clinicorp.",
    });
  }

  // Ja importados (pelo clinicorp_procedure_id) para nao duplicar.
  const { data: existingRows } = await admin
    .from("procedure_types")
    .select("clinicorp_procedure_id")
    .eq("company_id", companyId)
    .not("clinicorp_procedure_id", "is", null);
  const existing = new Set(
    ((existingRows as { clinicorp_procedure_id: string | null }[] | null) ?? [])
      .map((r) => r.clinicorp_procedure_id)
      .filter((v): v is string => Boolean(v))
  );

  const toInsert = procedures
    .filter((p) => p.id && !existing.has(p.id))
    .map((p) => ({
      company_id: companyId,
      name: p.name || p.id,
      default_duration_minutes: 30,
      is_active: true,
      clinicorp_procedure_id: p.id,
    }));

  let imported = 0;
  if (toInsert.length > 0) {
    const { error: insErr } = await admin
      .from("procedure_types")
      .insert(toInsert);
    if (insErr) {
      console.error(
        "[POST /api/integrations/clinicorp/procedures/import] insert",
        insErr
      );
      return NextResponse.json(
        { error: `Erro ao importar: ${insErr.message}` },
        { status: 500 }
      );
    }
    imported = toInsert.length;
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped: procedures.length - imported,
    total: procedures.length,
  });
}
