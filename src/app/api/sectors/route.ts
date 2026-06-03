import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import type { Sector } from "@/lib/types/database";

// CRUD de Setores. Lista para qualquer membro da clinica; create restrita
// a admin via policy RLS `sectors_manage` (definida na migration). Mantemos
// o mesmo padrao de validacao das outras APIs (companyId no query/body,
// checagem cruzada com a sessao). RLS faz a defesa real; estas checagens
// existem so para devolver 4xx amigaveis ao client.

const DEFAULT_COLOR = "#6b7280";

function isValidHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
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
  return NextResponse.json({ items: (data as Sector[]) ?? [] });
}

interface CreatePayload {
  companyId?: string;
  name?: string;
  color?: string;
}

export async function POST(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyId = body.companyId;
  const rawName = body.name?.trim();
  const color = body.color?.trim() || DEFAULT_COLOR;

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }
  if (!rawName) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!isValidHexColor(color)) {
    return NextResponse.json(
      { error: "color must be a valid #RRGGBB hex" },
      { status: 400 }
    );
  }

  const isOwnAdmin = role === "admin" && profile.company_id === companyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sectors")
    .insert({ company_id: companyId, name: rawName, color })
    .select("*")
    .single();

  if (error) {
    // Conflito de nome unico (idx_sectors_company_name_active) tem
    // copia especifica para o usuario entender — restante recai no
    // helper generico de erros amigaveis.
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            "Ja existe um setor ativo com este nome nesta organizacao.",
        },
        { status: 409 }
      );
    }
    console.error("[POST /api/sectors] db error", error);
    const f = friendlyDbError(error, "save_sector");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  return NextResponse.json({ sector: data as Sector });
}
