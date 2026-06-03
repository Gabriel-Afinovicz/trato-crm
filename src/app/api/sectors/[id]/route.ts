import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import type { Sector } from "@/lib/types/database";

// PATCH (renomear / desativar / mudar cor) e DELETE (hard delete somente
// quando nao houver leads vinculados; caso contrario 409). Permissao
// reforcada pelas policies RLS `sectors_manage`.

interface PatchPayload {
  name?: string;
  color?: string;
  is_active?: boolean;
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
  if (typeof body.is_active === "boolean") {
    update.is_active = body.is_active;
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

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();
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

  // Bloqueia exclusao se houver leads vinculados. Cliente deve usar
  // /reassign primeiro. Conta apenas leads cujo sector_id == id; o filtro
  // `is_active` nao se aplica a leads (eles nao tem flag).
  const { count: leadsCount, error: countErr } = await supabase
    .from("leads")
    .select("id", { head: true, count: "exact" })
    .eq("sector_id", id);
  if (countErr) {
    console.error("[DELETE /api/sectors/:id] count error", countErr);
    const f = friendlyDbError(countErr, "delete_sector");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  if ((leadsCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "SECTOR_HAS_LEADS",
        count: leadsCount,
        message:
          "Este setor tem leads vinculados. Reatribua-os antes de excluir.",
      },
      { status: 409 }
    );
  }

  const { error: deleteErr } = await supabase
    .from("sectors")
    .delete()
    .eq("id", id);
  if (deleteErr) {
    console.error("[DELETE /api/sectors/:id] db error", deleteErr);
    const f = friendlyDbError(deleteErr, "delete_sector");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  return NextResponse.json({ ok: true });
}
