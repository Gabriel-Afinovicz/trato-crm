import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { getSectorVisibility } from "@/lib/supabase/sector-visibility";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import type { Sector } from "@/lib/types/database";

// Setores sao FIXOS (CRC Leads e CRC Comercial, criados pela migration
// fixed_crc_sectors e pelo seed de novas empresas). GET lista para qualquer
// membro da clinica. Criacao via API esta bloqueada — os setores fixos so
// podem ser renomeados/recoloridos via PATCH /api/sectors/:id. O banco
// reforca com o trigger trg_protect_system_sectors.

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

  const includeInactive = searchParams.get("includeInactive") === "1";
  const supabase = await createClient();

  let query = supabase
    .from("sectors")
    .select("*")
    .eq("company_id", companyId)
    .order("name");

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/sectors] db error", error);
    const f = friendlyDbError(error, "list");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  // Operador restrito recebe apenas os setores que pode ver; o flag
  // `restricted` permite a UI esconder o filtro "Todos setores".
  const visibility = await getSectorVisibility(profile, role);
  let items = (data as Sector[]) ?? [];
  if (visibility.restricted && visibility.allowedSectorIds) {
    const allowed = new Set(visibility.allowedSectorIds);
    items = items.filter((s) => allowed.has(s.id));
  }
  return NextResponse.json({ items, restricted: visibility.restricted });
}

export async function POST() {
  // Setores sao fixos no sistema (CRC Leads / CRC Comercial). A criacao
  // foi desativada; os dois setores podem apenas ser renomeados.
  return NextResponse.json(
    {
      error:
        "Os setores são fixos (CRC Leads e CRC Comercial) e não podem ser criados. Você pode renomeá-los em Configurações ▸ Setores.",
    },
    { status: 403 }
  );
}
