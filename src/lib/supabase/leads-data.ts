import { createClient } from "./server";
import type {
  LeadDetailed,
  MinidashCohort,
  StageCategory,
} from "@/lib/types/database";

const EMPTY_MINIDASH: MinidashCohort = {
  total: 0,
  frio: 0,
  quente: 0,
  agendado: 0,
  compareceu: 0,
  orcamento: 0,
  fechado: 0,
  perdido: 0,
  sem_categoria: 0,
};

/**
 * Cohort de leads criados no intervalo `[start, end)`, agrupada pelo
 * `category` do stage atual de cada lead. É chamada pela aba Kanban
 * e pela tela Leads para alimentar a mini-dash do topo — uma única
 * query agregada, sem carregar leads.
 */
export async function getKanbanMinidash(
  companyId: string,
  range: { start: Date; end: Date },
  sectorId?: string | null
): Promise<MinidashCohort> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_kanban_minidash", {
    p_company_id: companyId,
    p_start: range.start.toISOString(),
    p_end: range.end.toISOString(),
    p_sector_id: sectorId ?? null,
  });
  return (data as unknown as MinidashCohort) ?? EMPTY_MINIDASH;
}

export interface LeadListFilters {
  range: { start: Date; end: Date };
  /** Vazio = nenhum filtro (todas as categorias incluídas). */
  categories: StageCategory[];
  /** Override: filtra por stage específico (usado pelo Kanban por coluna). */
  stageId?: string;
  /** Busca textual em nome/telefone/email. */
  q?: string;
  assigneeId?: string;
  /** "unassigned" trata leads sem responsável. */
  assigneeMode?: "any" | "unassigned" | "specific";
  /** Filtra por setor especifico. "none" = leads sem setor. "any" = todos. */
  sectorMode?: "any" | "none" | "specific";
  sectorId?: string;
  /**
   * Restrição de visibilidade do usuário (operador com setor atribuído).
   * Null/undefined = sem restrição. Aplicada em conjunto com o filtro de
   * setor escolhido na UI — a interseção vazia devolve zero leads.
   */
  allowedSectorIds?: string[] | null;
  sourceId?: string;
  tagIds?: string[];
  page: number;
  pageSize: number;
  /** Padrão: created_at DESC. Kanban ordena por kanban_position ASC. */
  orderBy?: "created_at_desc" | "created_at_asc" | "kanban_position_asc";
}

export interface LeadListResult {
  items: LeadDetailed[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Listagem paginada server-side de leads, com filtros multi.
 *
 * Performance:
 * - Usa `vw_leads_detailed` para já trazer nomes resolvidos sem joins
 *   extras no client.
 * - `count: "exact"` aceitável para a v1 (3-5k leads + índices novos);
 *   trocar para `"estimated"` se sentir o impacto.
 * - Filtro de categorias é traduzido em `stage_id IN (...)` resolvendo
 *   stages localmente para evitar subqueries — passamos o array
 *   compilado pelo chamador.
 */
export async function listLeads(
  companyId: string,
  filters: LeadListFilters,
  stageIdsByCategory?: Map<StageCategory, string[]>
): Promise<LeadListResult> {
  const supabase = await createClient();

  const page = Math.max(1, filters.page);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("vw_leads_detailed")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .gte("created_at", filters.range.start.toISOString())
    .lt("created_at", filters.range.end.toISOString());

  // Filtro por stage específico tem prioridade sobre categorias.
  if (filters.stageId) {
    query = query.eq("stage_id", filters.stageId);
  } else if (filters.categories.length > 0 && stageIdsByCategory) {
    const ids: string[] = [];
    for (const cat of filters.categories) {
      const stageIds = stageIdsByCategory.get(cat) ?? [];
      ids.push(...stageIds);
    }
    if (ids.length === 0) {
      // Categoria filtrada não tem nenhum stage mapeado — devolve vazio.
      return { items: [], total: 0, page, pageSize };
    }
    query = query.in("stage_id", ids);
  }

  if (filters.q?.trim()) {
    const term = filters.q.trim();
    // `or` com ilike em três colunas. Escape de % e _ não é estritamente
    // necessário aqui porque o termo veio de busca livre e o Supabase
    // não interpreta como SQL.
    const pattern = `%${term}%`;
    query = query.or(
      `name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  if (filters.assigneeMode === "unassigned") {
    query = query.is("assigned_to", null);
  } else if (filters.assigneeMode === "specific" && filters.assigneeId) {
    query = query.eq("assigned_to", filters.assigneeId);
  }

  if (filters.sectorMode === "none") {
    query = query.is("sector_id", null);
  } else if (filters.sectorMode === "specific" && filters.sectorId) {
    query = query.eq("sector_id", filters.sectorId);
  }

  // Visibilidade por setor (operador restrito): sempre aplicada por cima
  // dos filtros da UI. Lead sem setor fica invisível para restritos.
  if (filters.allowedSectorIds && filters.allowedSectorIds.length > 0) {
    query = query.in("sector_id", filters.allowedSectorIds);
  }

  if (filters.sourceId) {
    query = query.eq("source_id", filters.sourceId);
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    // Subselect — pega lead_ids que têm TODAS as tags pedidas (interseção).
    // Para a v1, intersecionamos via cliente: pega ids por tag e cruza.
    const idSets: Set<string>[] = [];
    for (const tagId of filters.tagIds) {
      const { data: rows } = await supabase
        .from("lead_tags")
        .select("lead_id")
        .eq("tag_id", tagId);
      idSets.push(
        new Set(
          ((rows as { lead_id: string }[] | null) ?? []).map((r) => r.lead_id)
        )
      );
    }
    if (idSets.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const intersection = [...idSets[0]].filter((id) =>
      idSets.slice(1).every((s) => s.has(id))
    );
    if (intersection.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    query = query.in("id", intersection);
  }

  switch (filters.orderBy ?? "created_at_desc") {
    case "created_at_asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "kanban_position_asc":
      query = query
        .order("kanban_position", { ascending: true })
        .order("created_at", { ascending: false });
      break;
    case "created_at_desc":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data, count } = await query.range(from, to);

  return {
    items: (data as unknown as LeadDetailed[]) ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}
