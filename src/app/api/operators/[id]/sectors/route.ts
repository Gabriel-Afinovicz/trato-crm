import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";

// Substitui o conjunto de setores de um operador. Idempotente: aceita
// `sectorIds: []` para limpar todos. Admin-only (RLS reforca).

interface PutPayload {
  sectorIds?: string[];
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: userId } = await ctx.params;
  let body: PutPayload;
  try {
    body = (await req.json()) as PutPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sectorIds = Array.isArray(body.sectorIds)
    ? body.sectorIds.filter((s): s is string => typeof s === "string")
    : [];

  const supabase = await createClient();

  // Valida que o usuario pertence a clinica do admin (RLS ja restringe,
  // mas devolve 404 amigavel para uuids forjados).
  const { data: targetUser } = await supabase
    .from("users")
    .select("id, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!targetUser) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const targetCompanyId = (targetUser as { company_id: string }).company_id;
  if (role !== "super_admin" && profile.company_id !== targetCompanyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Valida que todos os setores enviados pertencem a mesma clinica.
  if (sectorIds.length > 0) {
    const { data: validSectors } = await supabase
      .from("sectors")
      .select("id")
      .eq("company_id", targetCompanyId)
      .in("id", sectorIds);
    const validIds = new Set(
      ((validSectors as { id: string }[] | null) ?? []).map((s) => s.id)
    );
    if (validIds.size !== sectorIds.length) {
      return NextResponse.json(
        { error: "Algum setor nao pertence a esta organizacao." },
        { status: 400 }
      );
    }
  }

  // Apaga todos os assignments antigos e reinsere o conjunto novo.
  const { error: delErr } = await supabase
    .from("user_sector_assignments")
    .delete()
    .eq("user_id", userId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  if (sectorIds.length === 0) {
    return NextResponse.json({ sectorIds: [] });
  }
  const { error: insErr } = await supabase
    .from("user_sector_assignments")
    .insert(sectorIds.map((s) => ({ user_id: userId, sector_id: s })));
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ sectorIds });
}
