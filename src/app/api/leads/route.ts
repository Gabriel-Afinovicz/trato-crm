import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { defaultMonthRange } from "@/lib/supabase/dashboard-data";
import {
  listLeads,
  type LeadListFilters,
} from "@/lib/supabase/leads-data";
import { createClient } from "@/lib/supabase/server";
import { getSectorVisibility } from "@/lib/supabase/sector-visibility";
import { friendlyDbError } from "@/lib/api/friendly-db-error";
import { STAGE_CATEGORIES, type StageCategory } from "@/lib/types/database";
import { syncLeadCreated } from "@/lib/integrations/clinicorp-service";

// Body do POST /api/leads. Quando `appointment` esta presente, a criacao
// vira atomica via RPC `create_lead_with_appointment`. Sem appointment,
// o handler cai no caminho "insert simples" (preservando custom_field_values).
interface CreateLeadPayload {
  companyId?: string;
  lead?: Record<string, unknown> & { name?: string };
  appointment?: Record<string, unknown> | null;
  custom_field_values?: { custom_field_id: string; value: string }[];
}

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

  const sectorParam = searchParams.get("sector");
  let sectorMode: LeadListFilters["sectorMode"] = "any";
  let sectorId: string | undefined;
  if (sectorParam === "none") {
    sectorMode = "none";
  } else if (sectorParam) {
    sectorMode = "specific";
    sectorId = sectorParam;
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

  const visibility = await getSectorVisibility(profile, role);

  const result = await listLeads(
    companyId,
    {
      range,
      categories,
      stageId: stageIdParam,
      q,
      assigneeMode,
      assigneeId,
      sectorMode,
      sectorId,
      allowedSectorIds: visibility.allowedSectorIds,
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

export async function POST(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: CreateLeadPayload;
  try {
    body = (await req.json()) as CreateLeadPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyId = body.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }
  if (role !== "super_admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const lead = body.lead;
  if (!lead || typeof lead.name !== "string" || !lead.name.trim()) {
    return NextResponse.json(
      { error: "lead.name required" },
      { status: 400 }
    );
  }

  // Server-side email validation
  if (lead.email) {
    const emailStr = String(lead.email).trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailStr)) {
      return NextResponse.json(
        { error: "E-mail inválido." },
        { status: 400 }
      );
    }
    lead.email = emailStr;
  }

  // Server-side phone validation and normalization
  if (lead.phone) {
    const phoneStr = String(lead.phone).trim();
    const digits = phoneStr.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return NextResponse.json(
        { error: "O telefone deve ter entre 10 e 15 dígitos." },
        { status: 400 }
      );
    }
    if (digits.length === 10 || digits.length === 11) {
      lead.phone = `+55${digits}`;
    } else {
      lead.phone = `+${digits}`;
    }
  }

  // Encaminha tudo para a RPC transacional. Mesmo no caso "lead sem
  // agendamento" usamos a RPC: ela trata appointment nulo, valida e
  // persiste custom_field_values em batch — evita lead criado sem os
  // valores se algo falhar no client.
  const supabase = await createClient();
  const payload = {
    lead,
    appointment: body.appointment ?? null,
    custom_field_values: Array.isArray(body.custom_field_values)
      ? body.custom_field_values.filter(
          (v) =>
            v &&
            typeof v.custom_field_id === "string" &&
            typeof v.value === "string"
        )
      : [],
  };

  const { data, error } = await supabase.rpc("create_lead_with_appointment", {
    p_payload: payload,
  });

  if (error) {
    const msg = error.message ?? "";
    // O HINT carrega marcadores estaveis ('no_agendado_stage',
    // 'availability_closed', etc.); o MESSAGE pode mudar e e usado
    // apenas como fallback.
    const hint = (error as { hint?: string | null }).hint ?? "";

    // Erros de negocio com mensagem ja amigavel (mantidos como estao —
    // o usuario precisa de instrucoes especificas para resolver).
    if (msg.includes("nenhum pipeline_stage ativo")) {
      return NextResponse.json(
        {
          error:
            "Nenhuma etapa de pipeline configurada. Carregue um template em Configuracoes > Pipeline (ou crie etapas manualmente) antes de criar um lead.",
        },
        { status: 409 }
      );
    }
    if (hint === "no_agendado_stage" || msg.includes("no_agendado_stage")) {
      return NextResponse.json(
        {
          error:
            "Nenhuma etapa do pipeline esta categorizada como 'agendado'. Configure em Pipeline antes de agendar.",
        },
        { status: 409 }
      );
    }
    if (hint.startsWith("availability_") || msg.startsWith("availability_")) {
      const source = hint.startsWith("availability_") ? hint : msg;
      const reason = source.replace("availability_", "");
      return NextResponse.json(
        { error: "AVAILABILITY", reason },
        { status: 409 }
      );
    }

    // Erros genericos de banco/RLS — log interno + mensagem neutra.
    console.error("[POST /api/leads] db/rpc error", error);
    const f = friendlyDbError(error, "save_lead");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  // Efeito colateral de integracao (fire-and-forget): envia o lead recem
  // criado para a Clinicorp se a integracao estiver ativa e a fonte tiver
  // campanha mapeada. NUNCA bloqueia nem reverte a criacao do lead.
  const newLeadId = (data as { lead_id?: string } | null)?.lead_id;
  if (newLeadId) {
    syncLeadCreated(companyId, newLeadId);
  }

  return NextResponse.json(data);
}
