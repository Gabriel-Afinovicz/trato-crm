import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { clinicorp } from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";

/**
 * Importa os profissionais da Clinicorp (GET /professional/list_all_professionals)
 * para a tabela `clinicorp_professionals` do CRM. Assim os selects de agenda
 * apresentam os profissionais importados direto — sem mapear com usuarios do
 * sistema, do mesmo jeito que procedimentos e marcadores.
 *
 * Idempotente por (company_id, clinicorp_person_id): profissionais ja
 * importados sao atualizados (nome/reativados). Admin-only. Body: { companyId }.
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

  let professionals;
  try {
    const res = await clinicorp.listProfessionals({
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    });
    professionals = res.professionals;
  } catch (err) {
    console.error(
      "[POST /api/integrations/clinicorp/professionals/import]",
      err
    );
    const f = friendlyClinicorpError(err, "list_professionals");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  // Dedupe por id (a API pode repetir) e descarta entradas sem id.
  const byPersonId = new Map<string, string>();
  for (const p of professionals) {
    if (p.id && !byPersonId.has(p.id)) {
      byPersonId.set(p.id, p.name || p.id);
    }
  }

  if (byPersonId.size === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      skipped: 0,
      total: 0,
      message: "Nenhum profissional retornado pela Clinicorp.",
    });
  }

  // Ja importados (pelo clinicorp_person_id) para contar novos vs. existentes.
  const { data: existingRows } = await admin
    .from("clinicorp_professionals")
    .select("clinicorp_person_id")
    .eq("company_id", companyId);
  const existing = new Set(
    ((existingRows as { clinicorp_person_id: string }[] | null) ?? []).map(
      (r) => r.clinicorp_person_id
    )
  );

  const rows = Array.from(byPersonId.entries()).map(([personId, name]) => ({
    company_id: companyId,
    clinicorp_person_id: personId,
    name,
    is_active: true,
  }));

  const { error: upsertErr } = await admin
    .from("clinicorp_professionals")
    .upsert(rows, { onConflict: "company_id,clinicorp_person_id" });
  if (upsertErr) {
    console.error(
      "[POST /api/integrations/clinicorp/professionals/import] upsert",
      upsertErr
    );
    return NextResponse.json(
      { error: `Erro ao importar: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  const imported = rows.filter(
    (r) => !existing.has(r.clinicorp_person_id)
  ).length;

  return NextResponse.json({
    ok: true,
    imported,
    skipped: rows.length - imported,
    total: rows.length,
  });
}
