/**
 * Helpers de formatacao/comparacao de datas em um IANA timezone
 * (`companies.timezone`). Centralizar aqui evita espalhar
 * `Intl.DateTimeFormat` com `timeZone` por toda a UI.
 *
 * Todos os helpers tratam `tz` opcional: quando nao informado, caem em
 * "America/Sao_Paulo" (default historico do produto).
 */

const DEFAULT_TZ = "America/Sao_Paulo";

function resolveTz(tz?: string | null): string {
  return tz && tz.trim() ? tz : DEFAULT_TZ;
}

/**
 * Formata uma data como `dd/MM/yyyy` no fuso da organizacao.
 *
 *   formatDateInTz("2026-05-20T23:00:00Z", "America/Sao_Paulo")
 *   // => "20/05/2026"
 */
export function formatDateInTz(
  iso: string | Date,
  tz?: string | null
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: resolveTz(tz),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Formata `dd/MM/yyyy HH:mm` no fuso da organizacao.
 *
 *   formatDateTimeInTz("2026-05-20T23:00:00Z", "America/Sao_Paulo")
 *   // => "20/05/2026 20:00"
 */
export function formatDateTimeInTz(
  iso: string | Date,
  tz?: string | null
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: resolveTz(tz),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Apenas `HH:mm` no fuso da organizacao. */
export function formatTimeInTz(
  iso: string | Date,
  tz?: string | null
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: resolveTz(tz),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Devolve as partes (`year`, `month`, `day`, `weekday` 0-6 com 0=domingo)
 * de uma data interpretadas no fuso da organizacao. Usado para
 * comparar "esta data e hoje?" e para calcular ranges de mes/dia
 * sem cair em UTC.
 */
export function getDatePartsInTz(
  date: Date,
  tz?: string | null
): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/**
 * Verifica se duas datas caem no mesmo dia *no fuso da organizacao*.
 * Util para badges como "Hoje" / "Ontem".
 */
export function isSameDayInTz(
  a: Date | string,
  b: Date | string,
  tz?: string | null
): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  const pa = getDatePartsInTz(da, tz);
  const pb = getDatePartsInTz(db, tz);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** True se a data e "hoje" no fuso da organizacao. */
export function isTodayInTz(date: Date | string, tz?: string | null): boolean {
  return isSameDayInTz(date, new Date(), tz);
}

/**
 * Inicio do mes atual no fuso da organizacao, expresso como `Date`
 * cujo instante UTC corresponde ao primeiro instante local do dia 1.
 *
 * Implementacao: usa `getDatePartsInTz` para obter ano/mes "no calendario
 * da clinica" e constroi a data por offset relativo ao TZ via
 * `Intl.DateTimeFormat` + ajuste de offset.
 */
export function startOfMonthInTz(
  reference: Date,
  tz?: string | null
): Date {
  const { year, month } = getDatePartsInTz(reference, tz);
  return zonedDate(year, month, 1, 0, 0, 0, resolveTz(tz));
}

/** Primeiro instante do proximo mes (exclusivo) no fuso da organizacao. */
export function startOfNextMonthInTz(
  reference: Date,
  tz?: string | null
): Date {
  const { year, month } = getDatePartsInTz(reference, tz);
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  return zonedDate(ny, nm, 1, 0, 0, 0, resolveTz(tz));
}

/**
 * Constroi um `Date` (instante absoluto) a partir de componentes de
 * data/hora interpretados em `tz`.
 *
 * Algoritmo: usa um "candidato" UTC e calcula quanto o fuso desloca
 * essa mesma "wall-clock" — depois subtrai o offset para chegar no
 * instante real. Funciona com qualquer IANA TZ, incluindo aqueles
 * com DST (`America/Sao_Paulo` nao tem mais, mas a logica e geral).
 */
function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string
): Date {
  // Constroi um Date com os componentes como se fossem UTC.
  const utcCandidate = Date.UTC(year, month - 1, day, hour, minute, second);
  // Reformata esse instante no fuso de destino e mede a diferenca
  // entre o que o calendario do TZ exibe e o que pretendiamos.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcCandidate));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const reflected = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  // Offset (em ms) entre o que enxergamos vs. o que queriamos.
  const offset = reflected - utcCandidate;
  return new Date(utcCandidate - offset);
}
