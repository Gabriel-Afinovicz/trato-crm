"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type WhatsAppLoaderMode = "connect" | "follow" | "login";

interface WhatsAppConnectLoaderProps {
  domain: string;
  /**
   * Define o que o loader faz:
   *  - "connect": usuario ACABOU de conectar (?justConnected=1). Espera o
   *    warmup (Evolution baixando a lista apos o QR) e dispara o sync de
   *    importacao (/instance/sync, admin).
   *  - "login": primeira visita a Conversas na sessao do browser (apos login).
   *    Sem warmup, dispara um catch-up (/post-login-sync, funciona p/ qualquer
   *    usuario) para trazer as ultimas mensagens/contatos antes de liberar.
   *  - "follow": ja existe um sync em andamento (ex.: voltou para a aba). Apenas
   *    acompanha ate concluir, sem disparar nada nem esperar warmup.
   */
  mode?: WhatsAppLoaderMode;
  /**
   * Quando fornecido, e chamado no lugar da navegacao padrao ao concluir.
   * Usado pelo gate de login para apenas revelar a lista (sem trocar de rota).
   */
  onComplete?: () => void;
}

/** Marca, por sessao do browser, que o catch-up de login ja rodou nesta aba. */
export function whatsappLoginSyncKey(domain: string): string {
  return `wa:convLoginSync:${domain}`;
}

// Espera antes de disparar o sync inicial. Logo apos o QR ser lido a
// Evolution/Baileys ainda esta baixando a lista de conversas do celular;
// chamar o sync no mesmo instante faz o findChats voltar vazio. Mesma
// constante de delay usada historicamente no fluxo de conexao.
const WARMUP_MS = 15_000;
// Teto de seguranca: nunca prende o usuario na tela de carregamento. Se o
// sync demorar demais (conta gigante, rede ruim), liberamos a aba mesmo
// assim com um botao manual e um auto-avanco.
const MAX_WAIT_MS = 4 * 60_000;
// Intervalo do poll de status enquanto acompanha um sync em andamento.
const POLL_MS = 2_500;
// Cadencia da animacao da barra.
const TICK_MS = 350;

// Chave de sessionStorage usada para sinalizar ao WhatsAppSyncIndicator
// (montado no header global) que um sync esta prestes a comecar ou em
// andamento. Permite que o indicador faca poll ativo imediatamente ao
// inves de esperar o ciclo idle de 12s.
export const WA_SYNC_SIGNAL_KEY = "wa:syncSignal";

interface SyncStatus {
  syncInProgress?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepLabel(percent: number): string {
  if (percent >= 100) return "Tudo pronto!";
  if (percent < 30) return "Conectando ao WhatsApp...";
  if (percent < 70) return "Baixando suas conversas...";
  return "Organizando contatos e mensagens...";
}

/** Grava um sinal em sessionStorage para que o WhatsAppSyncIndicator (no
 *  header) entre em modo de poll ativo imediatamente. */
function signalSyncStart() {
  try {
    sessionStorage.setItem(WA_SYNC_SIGNAL_KEY, Date.now().toString());
  } catch { /* SSR / iframe sandbox */ }
}

export function WhatsAppConnectLoader({
  domain,
  mode = "connect",
  onComplete,
}: WhatsAppConnectLoaderProps) {
  const router = useRouter();
  const [percent, setPercent] = useState(4);
  const [tookTooLong, setTookTooLong] = useState(false);

  // Base de tempo da animacao (ms). Para sync ja em andamento, ajustamos
  // para o inicio real (do servidor) — assim a % reflete o tempo decorrido
  // de verdade ao voltar para a aba, em vez de recomecar do zero.
  const animBaseRef = useRef<number>(Date.now());
  const doneRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Rastreia se o sync ja foi disparado neste ciclo (evita disparar duas
  // vezes — uma no fluxo normal e outra no cleanup).
  const syncFiredRef = useRef(false);

  // Avanca a barra para 100% e revela a aba Conversas ja sincronizada.
  // Marca a sessao como sincronizada (para o gate de login nao reexibir o card
  // a cada navegacao nem duplicar com o fluxo de conexao). Em seguida:
  //  - se onComplete foi passado (gate de login): apenas chama-o, mantendo a
  //    rota atual e deixando o gate revelar a lista;
  //  - senao (loader de pagina inteira): router.replace remove o ?justConnected
  //    e router.refresh reexecuta o server component, que agora encontra as
  //    conversas atualizadas.
  function reveal() {
    if (doneRef.current) return;
    doneRef.current = true;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      sessionStorage.setItem(whatsappLoginSyncKey(domain), "1");
    } catch {
      /* SSR / iframe sandbox */
    }
    setPercent(100);
    setTimeout(() => {
      if (onComplete) {
        onComplete();
      } else {
        router.replace(`/${domain}/conversas`);
        router.refresh();
      }
    }, 800);
  }

  useEffect(() => {
    let cancelled = false;
    animBaseRef.current = Date.now();
    syncFiredRef.current = false;

    // Sinaliza imediatamente para o header (WhatsAppSyncIndicator) que um sync
    // de importacao vai comecar. So vale para "connect": o catch-up de login
    // usa /post-login-sync, que nao alimenta o indicador do header.
    if (mode === "connect") {
      signalSyncStart();
    }

    // Animacao estimada: curva que desacelera e nunca passa de 95% ate o
    // sync realmente terminar. Mantida monotonica (so sobe) para nao "voltar".
    tickRef.current = setInterval(() => {
      if (doneRef.current) return;
      const elapsed = (Date.now() - animBaseRef.current) / 1000;
      const target = Math.min(
        95,
        Math.round(100 * (1 - Math.exp(-elapsed / 35)))
      );
      setPercent((p) => (target > p ? target : p));
    }, TICK_MS);

    async function fetchSyncStatus(): Promise<SyncStatus | null> {
      try {
        const res = await fetch(
          `/api/whatsapp/sync-status?domain=${encodeURIComponent(domain)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return null;
        return (await res.json()) as SyncStatus;
      } catch {
        return null;
      }
    }

    // Acompanha um sync em andamento ate ele terminar (ou estourar o teto).
    async function pollUntilFinished(): Promise<void> {
      const startMs = Date.now();
      while (!cancelled && Date.now() - startMs < MAX_WAIT_MS) {
        const st = await fetchSyncStatus();
        if (st && st.syncInProgress === false) return;
        await sleep(POLL_MS);
      }
    }

    /** Dispara o sync (POST) e retorna true se terminou com sucesso. */
    async function fireSync(): Promise<boolean> {
      if (syncFiredRef.current) return false;
      syncFiredRef.current = true;
      signalSyncStart();
      try {
        const res = await fetch("/api/whatsapp/instance/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
          keepalive: true,
        });
        if (res.ok) return true;
        if (res.status === 429) {
          // Outro admin/aba ja estava sincronizando: acompanha pelo status.
          await pollUntilFinished();
          return true;
        }
        return true; // 403/500/etc: nao prende o usuario
      } catch {
        return true; // erro de rede: libera a aba
      }
    }

    /** Catch-up de login: traz ultimas conversas/mensagens via post-login-sync
     *  (funciona para qualquer usuario do tenant, inclusive operadores). E
     *  sincrono no servidor — quando resolve, ja podemos revelar. */
    async function fireLoginCatchup(): Promise<void> {
      try {
        await fetch("/api/whatsapp/post-login-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          keepalive: true,
        });
      } catch {
        /* erro de rede: libera a aba mesmo assim */
      }
    }

    async function run() {
      // Caso 1: ja existe um sync (de importacao) rodando — ex.: um admin
      // disparou o sync ou o operador voltou para a aba. Acompanha sem warmup
      // e ajusta a animacao para o inicio real.
      const initial = await fetchSyncStatus();
      if (cancelled) return;
      if (initial?.syncInProgress) {
        if (initial.startedAt) {
          const ms = Date.parse(initial.startedAt);
          if (Number.isFinite(ms)) animBaseRef.current = ms;
        }
        await pollUntilFinished();
        if (!cancelled) reveal();
        return;
      }

      // Caso 2: conexao nova (warmup + sync de importacao admin).
      if (mode === "connect") {
        await sleep(WARMUP_MS);
        if (cancelled) return;
        const ok = await fireSync();
        if (!cancelled && ok) {
          reveal();
        }
        return;
      }

      // Caso 3: primeira visita a Conversas na sessao (apos login). Sem warmup:
      // a instancia ja esta conectada, so precisamos buscar o que chegou
      // enquanto o CRM estava fechado, antes de liberar a lista.
      if (mode === "login") {
        await fireLoginCatchup();
        if (!cancelled) reveal();
        return;
      }

      // Caso 4 ("follow"): nao ha sync em andamento e nada a disparar -> revela
      // a lista (ja esta atualizada).
      reveal();
    }

    run();

    // Rede de seguranca: se nada concluir dentro do teto, oferece saida
    // manual e auto-revela um pouco depois.
    const guard = setTimeout(() => {
      if (!doneRef.current && !cancelled) {
        setTookTooLong(true);
        setTimeout(() => {
          if (!cancelled) reveal();
        }, 8_000);
      }
    }, MAX_WAIT_MS);

    return () => {
      cancelled = true;
      clearTimeout(guard);
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }

      // CRITICO (so no fluxo de conexao): se o usuario navegou para outra aba
      // DURANTE o warmup e o sync ainda nao foi disparado, disparamos agora com
      // keepalive para que o servidor processe mesmo com a aba fechada. Sem
      // isso, o sync nunca roda e a barrinha do header nunca aparece.
      if (mode === "connect" && !syncFiredRef.current && !doneRef.current) {
        syncFiredRef.current = true;
        signalSyncStart();
        fetch("/api/whatsapp/instance/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
          keepalive: true,
        }).catch(() => { /* fire-and-forget */ });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, mode]);

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7 text-emerald-600"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 2a10 10 0 0 0-8.66 15l-1.3 4.74 4.86-1.28A10 10 0 1 0 12 2Zm5.3 14.13c-.22.62-1.3 1.2-1.79 1.24-.46.04-1.04.2-3.5-.74-2.95-1.16-4.83-4.2-4.98-4.4-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.26-.29.57-.36.76-.36l.55.01c.18.01.42-.07.66.5.24.59.83 2.03.9 2.18.07.15.12.32.02.51-.1.2-.15.32-.29.49-.15.18-.31.39-.44.52-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.07 1.31 2.36 1.46.29.15.46.12.63-.07.18-.2.73-.85.92-1.14.2-.29.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.12.07.69-.15 1.32Z" />
            </svg>
          </div>

          <h1 className="mt-4 text-base font-semibold text-gray-900">
            Sincronizando suas conversas
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Estamos carregando seus contatos e mensagens do WhatsApp. Aguarde
            um instante — as conversas vao aparecer automaticamente quando
            tudo estiver pronto.
          </p>

          <div className="mt-6 w-full">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-emerald-700">
                {stepLabel(percent)}
              </span>
              <span className="text-2xl font-bold tabular-nums text-emerald-600">
                {percent}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <p className="mt-4 text-[11px] text-gray-400">
            Contas com muitos contatos podem levar de alguns segundos a 1-2
            minutos.
          </p>

          {tookTooLong && (
            <button
              type="button"
              onClick={reveal}
              className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Continuar mesmo assim
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
