import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import { syncLeadWon } from "@/lib/integrations/clinicorp-service";

/**
 * Wrapper server-side para mover um lead de etapa no Kanban.
 *
 * Antes, o Kanban chamava a RPC `apply_kanban_move_v2` direto do browser.
 * Centralizamos aqui para podermos disparar efeitos colaterais de
 * integracao (ex.: criar paciente na Clinicorp quando o lead chega numa
 * etapa "ganho") sem acoplar isso ao client. A RPC continua sendo a fonte
 * da verdade transacional (ordenacao + status + converted_at).
 *
 * Body: {
 *   fromStageId, toStageId,
 *   destOrderedIds: string[], sourceOrderedIds: string[],
 *   lostReason?: string | null
 * }
 */
interface MovePayload {
  fromStageId?: string;
  toStageId?: string;
  destOrderedIds?: string[];
  sourceOrderedIds?: string[];
  lostReason?: string | null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const leadId = id?.trim();
  if (!leadId) {
    return NextResponse.json({ error: "lead id obrigatório." }, { status: 400 });
  }

  let body: MovePayload;
  try {
    body = (await req.json()) as MovePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromStageId = body.fromStageId?.trim();
  const toStageId = body.toStageId?.trim();
  if (!fromStageId || !toStageId) {
    return NextResponse.json(
      { error: "fromStageId e toStageId são obrigatórios." },
      { status: 400 }
    );
  }
  const destOrderedIds = Array.isArray(body.destOrderedIds)
    ? body.destOrderedIds.filter((x): x is string => typeof x === "string")
    : [];
  const sourceOrderedIds = Array.isArray(body.sourceOrderedIds)
    ? body.sourceOrderedIds.filter((x): x is string => typeof x === "string")
    : [];

  const supabase = await createClient();

  // Carrega o lead (RLS garante que o caller so ve leads da propria empresa)
  // para descobrir company_id e validar acesso.
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select("id, company_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) {
    console.error("[POST /api/leads/[id]/stage] lead read error", leadErr);
    const f = friendlyDbError(leadErr, "list");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
  if (!leadRow) {
    return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  }
  const companyId = leadRow.company_id as string;

  if (role !== "super_admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Executa a movimentacao transacional via RPC (mesma de antes).
  const { error: rpcErr } = await supabase.rpc("apply_kanban_move_v2", {
    p_lead_id: leadId,
    p_from_stage_id: fromStageId,
    p_to_stage_id: toStageId,
    p_dest_ordered_ids: destOrderedIds,
    p_source_ordered_ids: sourceOrderedIds,
    p_lost_reason: body.lostReason ?? null,
  });

  if (rpcErr) {
    console.error("[POST /api/leads/[id]/stage] rpc error", rpcErr);
    const f = friendlyDbError(rpcErr, "save_setting");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  // Efeito colateral: se a etapa de destino e "ganho", cria o paciente na
  // Clinicorp em background (fire-and-forget; nunca bloqueia a resposta).
  const { data: toStage } = await supabase
    .from("pipeline_stages")
    .select("is_won")
    .eq("id", toStageId)
    .maybeSingle();

  if (toStage?.is_won === true) {
    syncLeadWon(companyId, leadId);
  }

  return NextResponse.json({ ok: true });
}
