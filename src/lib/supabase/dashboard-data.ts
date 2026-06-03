import { cache } from "react";
import { createClient } from "./server";
import {
  startOfMonthInTz,
  startOfNextMonthInTz,
} from "@/lib/utils/timezone";
import type {
  ActivityDetailed,
  AnaliticoKpis,
  ClinicAnalyticsGoals,
  CustomField,
  CustomFieldValue,
  Lead,
  LeadDetailed,
  PipelineStage,
  Tag,
  User,
} from "@/lib/types/database";

/**
 * Default das metas analíticas aplicado quando a clínica ainda não definiu
 * valores em `companies.settings.analytics_goals`. Mantém uma única fonte
 * de verdade entre server (dashboard) e client (form de configuração) para
 * que o aviso "estamos usando padrões" reflita o mesmo conjunto.
 */
export const DEFAULT_CLINIC_GOALS: ClinicAnalyticsGoals = {
  appointment_pct: 40,
  attendance_pct: 40,
  closing_pct: 30,
};

export const getDashboardData = cache(async (companyId: string) => {
  const supabase = await createClient();

  const { data: recentLeads } = await supabase
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    recentLeads: (recentLeads as unknown as Lead[]) ?? [],
  };
});

/**
 * Intervalo `[start, end)` cobrindo o mês corrente — do dia 1 às 00:00
 * até o dia 1 do mês seguinte às 00:00.
 *
 * Quando `tz` é informado, o calculo respeita o fuso da organizacao
 * (companies.timezone) — assim o mes do relatorio nao "vira" no UTC
 * do servidor antes da meia-noite local. Sem `tz`, usa o fuso local
 * do processo Node (compatibilidade com chamadas antigas).
 */
export function defaultMonthRange(
  now: Date = new Date(),
  tz?: string | null
): { start: Date; end: Date } {
  if (tz) {
    return {
      start: startOfMonthInTz(now, tz),
      end: startOfNextMonthInTz(now, tz),
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

const EMPTY_KPIS: AnaliticoKpis = {
  total_leads: 0,
  total_agendamentos: 0,
  total_comparecimentos: 0,
  total_fechamentos: 0,
  fechamentos_follow_up: 0,
  soma_fechamento: 0,
  soma_entrada: 0,
  ticket_medio: 0,
};

/**
 * Carrega os KPIs executivos da aba "Analítico". A RPC roda no banco
 * com `SECURITY DEFINER` e respeita RLS via `company_id`. Devolve um
 * objeto-zero quando a clínica não tem nenhum dado no período, evitando
 * branches nulos no cliente.
 */
export async function getAnaliticoKpis(
  companyId: string,
  range: { start: Date; end: Date },
  sectorId?: string | null
): Promise<AnaliticoKpis> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_analitico_kpis", {
    p_company_id: companyId,
    p_start: range.start.toISOString(),
    p_end: range.end.toISOString(),
    p_sector_id: sectorId ?? null,
  });
  return (data as unknown as AnaliticoKpis) ?? EMPTY_KPIS;
}

/**
 * Lê as metas analíticas da clínica em `companies.settings.analytics_goals`.
 * Retorna `{ goals, isDefault }` para que o painel mostre o aviso de
 * "padrões em uso" quando o admin nunca configurou nada.
 */
export async function getClinicGoals(
  companyId: string
): Promise<{ goals: ClinicAnalyticsGoals; isDefault: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .maybeSingle();

  const settings =
    (data?.settings as Record<string, unknown> | null | undefined) ?? null;
  const raw = settings?.analytics_goals as
    | Partial<ClinicAnalyticsGoals>
    | undefined;

  if (
    raw &&
    typeof raw.appointment_pct === "number" &&
    typeof raw.attendance_pct === "number" &&
    typeof raw.closing_pct === "number"
  ) {
    return {
      goals: {
        appointment_pct: raw.appointment_pct,
        attendance_pct: raw.attendance_pct,
        closing_pct: raw.closing_pct,
      },
      isDefault: false,
    };
  }

  return { goals: { ...DEFAULT_CLINIC_GOALS }, isDefault: true };
}

export const getLeadActivities = cache(
  async (companyId: string, leadId: string): Promise<ActivityDetailed[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vw_activities_detailed")
      .select("*")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    return (data as unknown as ActivityDetailed[]) ?? [];
  }
);

export type KanbanLead = Pick<
  LeadDetailed,
  | "id"
  | "name"
  | "status"
  | "stage_id"
  | "sector_id"
  | "sector_name"
  | "sector_color"
  | "phone"
  | "email"
  | "assigned_to"
  | "assigned_to_name"
  | "assigned_is_dentist"
  | "source_name"
  | "kanban_position"
  | "photo_url"
  | "birthdate"
  | "allergies"
  | "created_at"
  | "updated_at"
>;

export type KanbanOperator = Pick<User, "id" | "name" | "is_dentist">;

export interface GetKanbanDataOptions {
  /**
   * Filtra leads pelo `created_at` (cohort do período). Quando ausente,
   * traz todos os leads — comportamento legado preservado para callers
   * que ainda não controlam período (ex: callers internos antigos).
   */
  range?: { start: Date; end: Date };
}

export const getKanbanData = async (
  companyId: string,
  options: GetKanbanDataOptions = {}
) => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let leadsQuery = supabase
    .from("vw_leads_detailed")
    .select(
      "id,name,status,stage_id,sector_id,sector_name,sector_color,phone,email,assigned_to,assigned_to_name,assigned_is_dentist,source_name,kanban_position,photo_url,birthdate,allergies,created_at,updated_at"
    )
    .eq("company_id", companyId)
    .order("kanban_position", { ascending: true })
    .order("created_at", { ascending: false });

  if (options.range) {
    leadsQuery = leadsQuery
      .gte("created_at", options.range.start.toISOString())
      .lt("created_at", options.range.end.toISOString());
  }

  const [
    leadsRes,
    operatorsRes,
    stagesRes,
    lastActivityRes,
    userStageOrderRes,
  ] = await Promise.all([
    leadsQuery,
    supabase
      .from("users")
      .select("id, name, is_dentist")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .neq("role", "super_admin")
      .order("name"),
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("activities")
      .select("lead_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    user
      ? supabase
          .from("user_pipeline_stage_order")
          .select("stage_ids")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lastActivityMap = new Map<string, string>();
  const rows =
    (lastActivityRes.data as { lead_id: string; created_at: string }[] | null) ??
    [];
  for (const row of rows) {
    if (!lastActivityMap.has(row.lead_id)) {
      lastActivityMap.set(row.lead_id, row.created_at);
    }
  }

  const rawStages = (stagesRes.data as unknown as PipelineStage[]) ?? [];
  const userOrder =
    (userStageOrderRes.data as { stage_ids: string[] } | null)?.stage_ids ?? null;

  let stages: PipelineStage[];
  if (userOrder && userOrder.length > 0) {
    const byId = new Map(rawStages.map((s) => [s.id, s] as const));
    const ordered: PipelineStage[] = [];
    const seen = new Set<string>();
    for (const id of userOrder) {
      const stage = byId.get(id);
      if (stage) {
        ordered.push(stage);
        seen.add(id);
      }
    }
    for (const s of rawStages) {
      if (!seen.has(s.id)) ordered.push(s);
    }
    stages = ordered;
  } else {
    stages = rawStages;
  }

  return {
    leads: (leadsRes.data as unknown as KanbanLead[]) ?? [],
    operators: (operatorsRes.data as unknown as KanbanOperator[]) ?? [],
    stages,
    lastActivityByLead: Object.fromEntries(lastActivityMap) as Record<
      string,
      string
    >,
  };
};

export const getLeadSidebarData = cache(
  async (companyId: string, leadId: string) => {
    const supabase = await createClient();

    const [allTagsRes, leadTagsRes, customFieldsRes, customValuesRes] =
      await Promise.all([
        supabase
          .from("tags")
          .select("*")
          .eq("company_id", companyId)
          .order("name"),
        supabase.from("lead_tags").select("tag_id").eq("lead_id", leadId),
        supabase
          .from("custom_fields")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("custom_field_values")
          .select("*")
          .eq("company_id", companyId)
          .eq("lead_id", leadId),
      ]);

    const allTags = (allTagsRes.data as unknown as Tag[]) ?? [];
    const leadTagIds = new Set(
      ((leadTagsRes.data as { tag_id: string }[] | null) ?? []).map(
        (t) => t.tag_id
      )
    );
    const assignedTags = allTags.filter((t) => leadTagIds.has(t.id));

    return {
      allTags,
      assignedTags,
      customFields: (customFieldsRes.data as unknown as CustomField[]) ?? [],
      customFieldValues:
        (customValuesRes.data as unknown as CustomFieldValue[]) ?? [],
    };
  }
);
