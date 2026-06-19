import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { clinicorp } from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";

/**
 * Importa as Categorias de Agendamento ("Marcadores") da Clinicorp como tags
 * do CRM, ja vinculadas (grava `clinicorp_category_id`, name = Description,
 * color = Color). Assim, ao marcar um lead com uma dessas tags, o marcador
 * sincroniza para o agendamento na Clinicorp (CategoryDescription/CategoryColor).
 *
 * Idempotente:
 *  - categorias ja vinculadas (mesmo clinicorp_category_id) sao puladas;
 *  - uma tag existente com o MESMO nome e VINCULADA (atualiza
 *    clinicorp_category_id e alinha a cor a da Clinicorp), evitando duplicar.
 *
 * Admin-only. Body: { companyId }.
 */
interface ImportPayload {
  companyId?: string;
}

const DEFAULT_TAG_COLOR = "#64748b";

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

  let categories;
  try {
    const res = await clinicorp.listCategories({
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    });
    categories = res.categories;
  } catch (err) {
    console.error("[POST /api/integrations/clinicorp/categories/import]", err);
    const f = friendlyClinicorpError(err, "generic");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  if (categories.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      linked: 0,
      skipped: 0,
      total: 0,
      message: "Nenhum marcador (categoria) retornado pela Clinicorp.",
    });
  }

  // Tags existentes da empresa: usadas para pular ja-vinculadas e para
  // vincular por nome (evita criar duplicata de uma tag manual existente).
  const { data: existingRows } = await admin
    .from("tags")
    .select("id, name, clinicorp_category_id")
    .eq("company_id", companyId);
  const existing =
    (existingRows as
      | { id: string; name: string; clinicorp_category_id: string | null }[]
      | null) ?? [];
  const linkedIds = new Set(
    existing
      .map((r) => r.clinicorp_category_id)
      .filter((v): v is string => Boolean(v))
  );
  const byName = new Map(
    existing.map((r) => [r.name.trim().toLowerCase(), r])
  );
  const seenNames = new Set(existing.map((r) => r.name.trim().toLowerCase()));

  const toInsert: {
    company_id: string;
    name: string;
    color: string;
    clinicorp_category_id: string;
  }[] = [];
  const toLink: { id: string; color: string; clinicorp_category_id: string }[] =
    [];

  for (const cat of categories) {
    if (linkedIds.has(cat.id)) continue; // ja vinculada
    const key = cat.description.trim().toLowerCase();
    const match = byName.get(key);
    if (match) {
      if (!match.clinicorp_category_id) {
        toLink.push({
          id: match.id,
          color: cat.color || DEFAULT_TAG_COLOR,
          clinicorp_category_id: cat.id,
        });
      }
      continue;
    }
    if (seenNames.has(key)) continue; // evita duplicar nomes nesta importacao
    seenNames.add(key);
    toInsert.push({
      company_id: companyId,
      name: cat.description,
      color: cat.color || DEFAULT_TAG_COLOR,
      clinicorp_category_id: cat.id,
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { error: insErr } = await admin.from("tags").insert(toInsert);
    if (insErr) {
      console.error(
        "[POST /api/integrations/clinicorp/categories/import] insert",
        insErr
      );
      return NextResponse.json(
        { error: `Erro ao importar: ${insErr.message}` },
        { status: 500 }
      );
    }
    imported = toInsert.length;
  }

  let linked = 0;
  for (const tag of toLink) {
    const { error: updErr } = await admin
      .from("tags")
      .update({
        clinicorp_category_id: tag.clinicorp_category_id,
        color: tag.color,
      })
      .eq("id", tag.id);
    if (!updErr) linked += 1;
  }

  return NextResponse.json({
    ok: true,
    imported,
    linked,
    skipped: categories.length - imported - linked,
    total: categories.length,
  });
}
