import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";

// Reatribui em lote todos os leads do setor `id` para `targetSectorId`.
// targetSectorId = null move para "Sem setor". Usado pelo modal de
// exclusao em Configuracoes -> Setores quando ha leads vinculados.

interface ReassignPayload {
  targetSectorId?: string | null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: sourceId } = await ctx.params;
  let body: ReassignPayload;
  try {
    body = (await req.json()) as ReassignPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetSectorId = body.targetSectorId ?? null;
  if (targetSectorId === sourceId) {
    return NextResponse.json(
      { error: "targetSectorId must differ from source" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: sourceRow } = await supabase
    .from("sectors")
    .select("company_id")
    .eq("id", sourceId)
    .maybeSingle();
  if (!sourceRow) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const sourceCompanyId = (sourceRow as { company_id: string }).company_id;

  const isOwnAdmin = role === "admin" && profile.company_id === sourceCompanyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (targetSectorId) {
    // Garante que o setor destino pertence a mesma clinica.
    const { data: targetRow } = await supabase
      .from("sectors")
      .select("company_id")
      .eq("id", targetSectorId)
      .maybeSingle();
    if (!targetRow) {
      return NextResponse.json(
        { error: "TARGET_NOT_FOUND" },
        { status: 404 }
      );
    }
    const targetCompanyId = (targetRow as { company_id: string }).company_id;
    if (targetCompanyId !== sourceCompanyId) {
      return NextResponse.json(
        { error: "TARGET_COMPANY_MISMATCH" },
        { status: 400 }
      );
    }
  }

  const { data: moved, error } = await supabase
    .from("leads")
    .update({ sector_id: targetSectorId })
    .eq("sector_id", sourceId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ moved: (moved ?? []).length });
}
