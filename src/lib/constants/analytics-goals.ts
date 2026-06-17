import type { ClinicAnalyticsGoals } from "@/lib/types/database";

/**
 * Default das metas analíticas aplicado quando a clínica ainda não definiu
 * valores em `companies.settings.analytics_goals`. Mantém uma única fonte
 * de verdade entre server (dashboard) e client (form de configuração e
 * aviso do painel) para que o aviso "estamos usando padrões" e a ação
 * "Manter assim mesmo" reflitam exatamente o mesmo conjunto.
 *
 * Fica isolado em `constants/` (sem imports de server) para poder ser
 * usado com segurança em Client Components.
 */
export const DEFAULT_CLINIC_GOALS: ClinicAnalyticsGoals = {
  appointment_pct: 40,
  attendance_pct: 40,
  closing_pct: 30,
};
