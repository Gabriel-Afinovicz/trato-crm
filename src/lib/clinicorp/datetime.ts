/**
 * Conversao de data/hora para a API Clinicorp.
 *
 * Os agendamentos do CRM guardam `starts_at`/`ends_at` como `timestamptz`
 * (instantes em UTC). A Clinicorp espera a data e os horarios no fuso da
 * CLINICA (`companies.timezone`, IANA, ex.: "America/Sao_Paulo"). Usamos
 * `Intl.DateTimeFormat` com `timeZone` para extrair a data-calendario e o
 * horario locais de forma robusta (respeita offset/horario de verao), sem
 * depender do fuso do servidor.
 */

export const DEFAULT_CLINIC_TIMEZONE = "America/Sao_Paulo";

/** Extrai { date: "YYYY-MM-DD", time: "HH:mm" } de um instante, no fuso dado. */
export function toClinicLocalParts(
  iso: string,
  timeZone: string
): { date: string; time: string } {
  const d = new Date(iso);
  const tz = timeZone || DEFAULT_CLINIC_TIMEZONE;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const date = `${pick("year")}-${pick("month")}-${pick("day")}`;
  // h23 ja entrega 00..23; guarda extra contra "24" em runtimes divergentes.
  let hour = pick("hour");
  if (hour === "24") hour = "00";
  const time = `${hour}:${pick("minute")}`;
  return { date, time };
}

/**
 * Converte o intervalo (UTC) de um agendamento nos campos esperados pela
 * Clinicorp: `date` (dia local), `fromTime` e `toTime` (HH:mm locais).
 */
export function buildClinicorpAppointmentTimes(
  startsIso: string,
  endsIso: string,
  timeZone: string
): { date: string; fromTime: string; toTime: string } {
  const start = toClinicLocalParts(startsIso, timeZone);
  const end = toClinicLocalParts(endsIso, timeZone);
  return { date: start.date, fromTime: start.time, toTime: end.time };
}
