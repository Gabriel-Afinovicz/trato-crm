import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { defaultMonthRange } from "@/lib/supabase/dashboard-data";
import {
  listLeads,
  type LeadListFilters,
} from "@/lib/supabase/leads-data";
import { createClient } from "@/lib/supabase/server";
import { STAGE_CATEGORIES, type StageCategory } from "@/lib/types/database";

/**
 * Listagem paginada de leads para Kanban (uma página por coluna) e
 * para a tela Leads (paginação clássica numerada).
 *
 * Estratégia de filtro por categoria:
 * - O cliente envia `categories=quente,agendado` (csv).
 * - O servidor resolve qual `stage_id` pertence a cada categoria
 *   consultando `pipeline_stages` da clínica e injeta `stage_id IN (…)`
 *   na query. Isso evita expor IDs internos no client e mantém o
 *   resultado coerente quando o admin reorganiza stages.
 *
 * Demais filtros são opcionais. Sem `categories` nem `stageId`, devolve
 * todos os leads do período (paginados).
 */
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

  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  let range: { start: Date; end: Date };
  if (startParam && endParam) {
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid start/end date" },
        { status: 400 }
      );
    }
    if (end <= start) {
      return NextResponse.json(
        { error: "end must be after start" },
        { status: 400 }
      );
    }
    range = { start, end };
  } else {
    range = defaultMonthRange();
  }

  const categoriesParam = searchParams.get("categories");
  const categories: StageCategory[] = categoriesParam
    ? categoriesParam
        .split(",")
        .map((c) => c.trim())
        .filter((c): c is StageCategory =>
          (STAGE_CATEGORIES as string[]).includes(c)
        )
    : [];

  const stageIdParam = searchParams.get("stageId") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const assigneeParam = searchParams.get("assignee");
  let assigneeMode: LeadListFilters["assigneeMode"] = "any";
  let assigneeId: string | undefined;
  if (assigneeParam === "unassigned") {
    assigneeMode = "unassigned";
  } else if (assigneeParam) {
    assigneeMode = "specific";
    assigneeId = assigneeParam;
  }

  const specialtyParam = searchParams.get("specialty");
  let specialtyMode: LeadListFilters["specialtyMode"] = "any";
  let specialtyId: string | undefined;
  if (specialtyParam === "none") {
    specialtyMode = "none";
  } else if (specialtyParam) {
    specialtyMode = "specific";
    specialtyId = specialtyParam;
  }

  const sourceId = searchParams.get("sourceId") ?? undefined;
  const tagsParam = searchParams.get("tags");
  const tagIds = tagsParam
    ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const pageSize =
    Number.parseInt(searchParams.get("pageSize") ?? "30", 10) || 30;

  const orderByParam = searchParams.get(
    "orderBy"
  ) as LeadListFilters["orderBy"];

  // Resolve stage_id por categoria (só quando o filtro usa categorias e
  // não veio stageId específico).
  let stageIdsByCategory: Map<StageCategory, string[]> | undefined;
  if (!stageIdParam && categories.length > 0) {
    const supabase = await createClient();
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, category")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .in("category", categories);

    stageIdsByCategory = new Map();
    for (const stage of stages ?? []) {
      const cat = stage.category as StageCategory | null;
      if (!cat) continue;
      const list = stageIdsByCategory.get(cat) ?? [];
      list.push(stage.id as string);
      stageIdsByCategory.set(cat, list);
    }
  }

  const result = await listLeads(
    companyId,
    {
      range,
      categories,
      stageId: stageIdParam,
      q,
      assigneeMode,
      assigneeId,
      specialtyMode,
      specialtyId,
      sourceId,
      tagIds,
      page,
      pageSize,
      orderBy: orderByParam,
    },
    stageIdsByCategory
  );

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
  });
}
