import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/api/friendly-db-error";

/**
 * Atualizacao em lote de leads — usado pela "barra de acoes" da tela
 * Leads quando o operador seleciona varias linhas via checkbox.
 *
 * Suporta hoje:
 *  - `assigned_to`: reatribuir responsavel (null = sem responsavel).
 *  - `sector_id`: mudar de setor (null = sem setor).
 *
 * RLS continua sendo a fonte de verdade: aplicamos `eq("company_id", ...)`
 * por defesa em profundidade, mas a policy `leads_update` ja filtra por
 * organizacao. Operadores comuns sem permissao recebem 0 linhas
 * atualizadas (o cliente exibe toast informativo).
 */
interface BulkUpdatePayload {
  leadIds: string[];
  assigned_to?: string | null;
  sector_id?: string | null;
}

export async function POST(req: NextRequest) {
  const { user, profile } = await getAuthSession();
  if (!user || !profile?.company_id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const companyId = profile.company_id;

  let body: BulkUpdatePayload;
  try {
    body = (await req.json()) as BulkUpdatePayload;
  } catch {
    return NextResponse.json(
      { error: "Body inválido — esperado JSON." },
      { status: 400 }
    );
  }

  const ids = Array.isArray(body.leadIds) ? body.leadIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "leadIds vazio — nenhum lead selecionado." },
      { status: 400 }
    );
  }

  // Monta apenas os campos efetivamente passados. `undefined` significa
  // "nao mexer"; `null` significa "limpar". Sem mudancas → 400.
  const update: Record<string, string | null> = {};
  if ("assigned_to" in body) update.assigned_to = body.assigned_to ?? null;
  if ("sector_id" in body) update.sector_id = body.sector_id ?? null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Nenhum campo enviado para atualizar." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .in("id", ids)
    .eq("company_id", companyId)
    .select("id");

  if (error) {
    console.error("[POST /api/leads/bulk-update] db error", error);
    const friendly = friendlyDbError(error, "save_lead");
    return NextResponse.json(
      { error: friendly.message, code: friendly.code },
      { status: friendly.status }
    );
  }

  return NextResponse.json({
    updated: data?.length ?? 0,
    requested: ids.length,
  });
}
