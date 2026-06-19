/**
 * "Heartbeat" de sessao por aba.
 *
 * Os cookies de auth do Supabase ja sao gravados como *session cookies*
 * (sem `maxAge`/`expires`, ver `cookie-options.ts`), o que deveria encerrar
 * a sessao ao fechar o navegador. Porem navegadores com "continuar de onde
 * parei" / restauracao de sessao reabrem esses cookies, mantendo o login.
 *
 * Para exigir login a cada reabertura real, gravamos periodicamente um
 * timestamp ("ultimo sinal de vida") enquanto a aba esta aberta. Ao carregar
 * a pagina, se o intervalo desde o ultimo sinal exceder `SESSION_MAX_GAP_MS`,
 * tratamos como "aba/navegador foi fechado" e forcamos novo login. Como o
 * timestamp so e atualizado por JS em execucao, uma sessao restaurada pelo
 * navegador tera um valor antigo — exatamente o caso que queremos pegar.
 */
const HEARTBEAT_KEY = "crm.session.lastSeen";

/**
 * Janela maxima (ms) entre o ultimo sinal de vida e a reabertura da pagina.
 * Acima disso, exige login. Folgado o bastante para tolerar recarregamentos
 * lentos (o instante exato e gravado em `pagehide`/`visibilitychange`), mas
 * curto para capturar fechamentos reais de aba/navegador.
 */
export const SESSION_MAX_GAP_MS = 60_000;

/** Frequencia de atualizacao do heartbeat enquanto a aba esta aberta. */
export const SESSION_HEARTBEAT_INTERVAL_MS = 15_000;

/** Registra "agora" como ultimo sinal de vida da sessao. */
export function markSessionAlive(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));
  } catch {
    /* localStorage indisponivel — ignora */
  }
}

/** Le o ultimo sinal de vida (ms epoch) ou null se nao houver/for invalido. */
export function readLastSeen(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HEARTBEAT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Remove o heartbeat (usado ao encerrar a sessao). */
export function clearSessionHeartbeat(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HEARTBEAT_KEY);
  } catch {
    /* ignora */
  }
}
