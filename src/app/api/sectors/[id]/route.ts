import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import type { Sector } from "@/lib/types/database";

// Setores sao fixos (CRC Leads / CRC Comercial). PATCH permite apenas
// renomear e mudar a cor; desativacao e exclusao estao bloqueadas (o
// trigger trg_protect_system_sectors reforca no banco). Permissao
// reforcada pelas policies RLS `sectors_manage`.

interface PatchPayload {
  name?: string;
  color?: string;
}

function isValidHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: PatchPayload;
  try {
    body = (await req.json()) as PatchPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    update.name = trimmed;
  }
  if (typeof body.color === "string") {
    if (!isValidHexColor(body.color)) {
      return NextResponse.json(
        { error: "color must be a valid #RRGGBB hex" },
        { status: 400 }
      );
    }
    update.color = body.color;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const supabase = await createClient();
  // Le antes para validar a company. RLS ja restringe, mas devolve 404
  // amigavel caso o id nao pertenca ao usuario.
  const { data: sectorRow } = await supabase
    .from("sectors")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();
  if (!sectorRow) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const sectorCompanyId = (sectorRow as { company_id: string }).company_id;
  const isOwnAdmin = role === "admin" && profile.company_id === sectorCompanyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("sectors")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Ja existe um setor ativo com este nome nesta organizacao.",
        },
        { status: 409 }
      );
    }
    console.error("[PATCH /api/sectors/:id] db error", error);
    const f = friendlyDbError(error, "save_sector");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  return NextResponse.json({ sector: data as Sector });
}

export async function DELETE() {
  // Setores sao fixos no sistema; exclusao desativada (o trigger
  // trg_protect_system_sectors tambem bloqueia no banco).
  return NextResponse.json(
    {
      error:
        "Os setores são fixos (CRC Leads e CRC Comercial) e não podem ser excluídos.",
    },
    { status: 403 }
  );
}
