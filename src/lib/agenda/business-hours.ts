import type { ClinicHours, ClinicHoliday } from "@/lib/types/database";

/**
 * Validacao de horario comercial NO CLIENT (deterministica, independente das
 * RPCs do Postgres). Usada para impedir agendamentos fora do expediente em
 * todos os fluxos da agenda — modal de criar/editar e drag-and-drop — antes de
 * persistir. As RPCs (`check_appointment_availability` / `_conflict`) seguem
 * como backstop no servidor para conflitos de profissional/sala/bloqueio, que
 * dependem do banco.
 *
 * Importante: trabalhamos sempre com o horario LOCAL (mesma convencao da grade
 * e do `clinic_hours.weekday`, que segue `Date.getDay()`: 0=Dom … 6=Sab).
 */
export type BusinessHoursIssue =
  | "invalid_range"
  | "crosses_midnight"
  | "holiday"
  | "closed_day"
  | "before_open"
  | "after_close"
  | "lunch";

export const BUSINESS_HOURS_MESSAGES: Record<BusinessHoursIssue, string> = {
  invalid_range: "O horário de término precisa ser depois do início.",
  crosses_midnight:
    "O agendamento não pode atravessar a meia-noite. Ajuste o horário ou a duração.",
  holiday: "Esta data é feriado da clínica.",
  closed_day: "A clínica não atende neste dia da semana.",
  before_open: "O horário escolhido é antes da abertura da clínica.",
  after_close:
    "O horário escolhido passa do horário de fechamento da clínica.",
  lunch: "O horário escolhido cai no intervalo de almoço da clínica.",
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Chave de data-calendario LOCAL ("YYYY-MM-DD"), igual a usada nos feriados. */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Retorna o primeiro problema de horario encontrado, ou `null` se o intervalo
 * cabe dentro do expediente da clinica naquele dia.
 *
 * - Sempre valida: intervalo invalido (fim <= inicio) e atravessar meia-noite.
 * - Se `clinicHours` estiver vazio, NAO valida expediente (a agenda nem habilita
 *   sem horarios cadastrados) — mas ainda barra intervalo invalido/meia-noite.
 */
export function checkBusinessHours(params: {
  startsAt: string | Date;
  endsAt: string | Date;
  clinicHours: ClinicHours[];
  holidays?: Pick<ClinicHoliday, "date">[];
}): BusinessHoursIssue | null {
  const start =
    params.startsAt instanceof Date ? params.startsAt : new Date(params.startsAt);
  const end =
    params.endsAt instanceof Date ? params.endsAt : new Date(params.endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    // Sem datas validas nao ha o que checar aqui; deixa o resto do fluxo tratar.
    return null;
  }

  if (end.getTime() <= start.getTime()) return "invalid_range";

  // Atravessa a meia-noite: inicio e fim em dias-calendario diferentes.
  if (localDateKey(start) !== localDateKey(end)) return "crosses_midnight";

  if (params.holidays?.some((h) => h.date === localDateKey(start))) {
    return "holiday";
  }

  // Sem expediente cadastrado: nao validamos horario comercial (mas as checagens
  // acima — intervalo/meia-noite — ja rodaram).
  if (params.clinicHours.length === 0) return null;

  const hours = params.clinicHours.find((h) => h.weekday === start.getDay());
  if (!hours || !hours.is_open) return "closed_day";

  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const opens = timeToMinutes(hours.opens_at);
  const closes = timeToMinutes(hours.closes_at);

  if (startMin < opens) return "before_open";
  if (endMin > closes) return "after_close";

  if (hours.lunch_start && hours.lunch_end) {
    const ls = timeToMinutes(hours.lunch_start);
    const le = timeToMinutes(hours.lunch_end);
    // Sobreposicao estrita com o intervalo de almoco.
    if (startMin < le && endMin > ls) return "lunch";
  }

  return null;
}
