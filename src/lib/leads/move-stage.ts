import { createClient } from "@/lib/supabase/client";

interface MoveLeadStageArgs {
  companyId: string;
  leadId: string;
  fromStageId: string;
  toStageId: string;
  lostReason?: string | null;
}

interface MoveLeadStageResult {
  ok: boolean;
  error?: string;
}

/**
 * Move um lead para outra etapa FORA do contexto do Kanban (detalhe do
 * lead, lista de leads). Reproduz exatamente o comportamento do board:
 * reempacota as posicoes (`kanban_position`) das colunas origem e destino e
 * chama a mesma rota `POST /api/leads/[id]/stage` (RPC `apply_kanban_move_v2`),
 * garantindo efeitos colaterais identicos (status legado, integracao
 * Clinicorp em etapas "ganho", etc.).
 *
 * O lead movido entra no topo da coluna destino; a coluna origem e
 * reempacotada sem ele. Como a RPC so atualiza `kanban_position` dos ids
 * informados (escopados por empresa + etapa), nenhum outro lead e afetado.
 */
export async function moveLeadStage({
  companyId,
  leadId,
  fromStageId,
  toStageId,
  lostReason = null,
}: MoveLeadStageArgs): Promise<MoveLeadStageResult> {
  if (fromStageId === toStageId) return { ok: true };

  const supabase = createClient();

  const [destRes, srcRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("stage_id", toStageId)
      .order("kanban_position", { ascending: true }),
    supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("stage_id", fromStageId)
      .order("kanban_position", { ascending: true }),
  ]);

  const destIds = ((destRes.data as { id: string }[] | null) ?? [])
    .map((r) => r.id)
    .filter((id) => id !== leadId);
  const sourceOrderedIds = ((srcRes.data as { id: string }[] | null) ?? [])
    .map((r) => r.id)
    .filter((id) => id !== leadId);
  const destOrderedIds = [leadId, ...destIds];

  try {
    const res = await fetch(`/api/leads/${leadId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromStageId,
        toStageId,
        destOrderedIds,
        sourceOrderedIds,
        lostReason,
      }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      return { ok: false, error: payload.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro de rede",
    };
  }
}
