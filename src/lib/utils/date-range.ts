/**
 * Utilitários de range de datas reutilizáveis no servidor e no
 * cliente. O `defaultMonthRange` do `dashboard-data.ts` é server-only
 * (depende do Supabase server client), então aqui temos a versão pura.
 */

/** Mês corrente: do dia 1 ao primeiro dia do próximo mês (exclusivo). */
export function defaultMonthRangeLocal(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}
