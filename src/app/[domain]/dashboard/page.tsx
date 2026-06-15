import { redirect } from "next/navigation";
import { getAuthSession, getDomainCompany } from "@/lib/supabase/cached-data";
import {
  defaultMonthRange,
  getAnaliticoKpis,
  getClinicGoals,
  getDashboardData,
  getKanbanData,
  DEFAULT_CLINIC_GOALS,
} from "@/lib/supabase/dashboard-data";
import { getKanbanMinidash } from "@/lib/supabase/leads-data";
import { getSectorVisibility } from "@/lib/supabase/sector-visibility";
import { DashboardContent } from "./dashboard-content";
import type { MinidashCohort } from "@/lib/types/database";

interface DashboardPageProps {
  params: Promise<{ domain: string }>;
}

const EMPTY_KPIS = {
  total_leads: 0,
  total_agendamentos: 0,
  total_comparecimentos: 0,
  total_fechamentos: 0,
  fechamentos_follow_up: 0,
  soma_fechamento: 0,
  soma_entrada: 0,
  ticket_medio: 0,
};

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

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { domain } = await params;
  const [{ user, profile, role }, company] = await Promise.all([
    getAuthSession(),
    getDomainCompany(domain),
  ]);

  if (!user) {
    redirect(`/${domain}`);
  }

  const companyName = company?.name ?? domain;
  // Usa o fuso da organizacao para nao "virar de mes" no UTC antes de
  // meia-noite local. Sem company (super_admin acessando dominio
  // desconhecido) cai no fuso default do helper.
  const monthRange = defaultMonthRange(new Date(), company?.timezone ?? null);

  // Operador restrito por setor ve apenas os leads dos seus setores em
  // todas as visoes (recentes, kanban, analitico e minidash).
  const visibility = await getSectorVisibility(profile, role);

  const [{ recentLeads }, kanban, analiticoKpis, goalsResult, minidash] =
    company
      ? await Promise.all([
          getDashboardData(company.id, visibility.allowedSectorIds),
          getKanbanData(company.id, {
            range: monthRange,
            allowedSectorIds: visibility.allowedSectorIds,
          }),
          getAnaliticoKpis(company.id, monthRange, visibility.singleSectorId),
          getClinicGoals(company.id),
          getKanbanMinidash(
            company.id,
            monthRange,
            visibility.singleSectorId
          ),
        ])
      : [
          { recentLeads: [] },
          {
            leads: [],
            operators: [],
            stages: [],
            lastActivityByLead: {},
          },
          EMPTY_KPIS,
          { goals: { ...DEFAULT_CLINIC_GOALS }, isDefault: true },
          EMPTY_MINIDASH,
        ];

  return (
    <DashboardContent
      domain={domain}
      companyName={companyName}
      initialRecentLeads={recentLeads}
      initialKanbanLeads={kanban.leads}
      initialOperators={kanban.operators}
      initialStages={kanban.stages}
      initialLastActivity={kanban.lastActivityByLead}
      initialKanbanMinidash={minidash}
      initialKanbanRange={{
        start: monthRange.start.toISOString(),
        end: monthRange.end.toISOString(),
      }}
      initialAnaliticoKpis={analiticoKpis}
      initialAnaliticoGoals={goalsResult.goals}
      initialAnaliticoGoalsAreDefault={goalsResult.isDefault}
      initialAnaliticoRange={{
        start: monthRange.start.toISOString(),
        end: monthRange.end.toISOString(),
      }}
    />
  );
}
