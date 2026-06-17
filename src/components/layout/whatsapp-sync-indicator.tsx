"use client";

import { useEffect, useRef, useState } from "react";
import { WA_SYNC_SIGNAL_KEY } from "@/components/whatsapp/whatsapp-connect-loader";

interface WhatsAppSyncIndicatorProps {
  domain: string;
}

// Poll mais frequente enquanto sincroniza (feedback responsivo) e mais
// espacado quando ocioso (so vigia o inicio de um novo sync) — leve para o
// servidor mesmo com varios operadores logados.
const POLL_ACTIVE_MS = 3_000;
const POLL_IDLE_MS = 10_000;
// Cadencia da animacao suave da barra entre os polls.
const TICK_MS = 400;
// Quanto tempo o estado "tudo pronto" fica visivel antes de sumir.
const DONE_VISIBLE_MS = 4_000;
// Se houve sinal de sync nos ultimos N ms, comecamos em modo ativo.
const SIGNAL_FRESH_MS = 120_000;

interface SyncStatusResponse {
  syncInProgress?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
}

/** Le o sinal de sessionStorage gravado pelo WhatsAppConnectLoader. */
function readSyncSignal(): number | null {
  try {
    const raw = sessionStorage.getItem(WA_SYNC_SIGNAL_KEY);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function clearSyncSignal() {
  try {
    sessionStorage.removeItem(WA_SYNC_SIGNAL_KEY);
  } catch { /* SSR / iframe sandbox */ }
}

export function WhatsAppSyncIndicator({ domain }: WhatsAppSyncIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [percent, setPercent] = useState(0);

  // startedAt do servidor (ms) — base da estimativa. Em ref para o tick de
  // animacao ler sem reassinar o efeito.
  const startedAtMsRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const wasSyncingRef = useRef(false);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Verifica se ha sinal fresco do loader (sync prestes a comecar).
    // Se sim, comeca em modo ativo para captar o syncInProgress rapidamente.
    const signalMs = readSyncSignal();
    const hasSignal =
      signalMs !== null && Date.now() - signalMs < SIGNAL_FRESH_MS;

    // Anima a barra: curva que desacelera e nunca passa de 95% ate o sync
    // terminar de verdade. Monotonica (so sobe) durante um mesmo ciclo.
    tickRef.current = setInterval(() => {
      if (cancelled || !syncingRef.current) return;
      const startMs = startedAtMsRef.current;
      if (startMs == null) return;
      const elapsed = (Date.now() - startMs) / 1000;
      const target = Math.min(
        95,
        Math.round(100 * (1 - Math.exp(-elapsed / 35)))
      );
      setPercent((p) => (target > p ? target : p));
    }, TICK_MS);

    function finishCycle() {
      // Transicao sincronizando -> concluido: crava 100, mostra "tudo
      // pronto" e some pouco depois.
      syncingRef.current = false;
      wasSyncingRef.current = false;
      startedAtMsRef.current = null;
      clearSyncSignal();
      setPercent(100);
      setDone(true);
      setVisible(true);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      doneTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        setVisible(false);
        // Reseta apos o fade para o proximo ciclo comecar do zero.
        setTimeout(() => {
          if (cancelled) return;
          setDone(false);
          setPercent(0);
        }, 400);
      }, DONE_VISIBLE_MS);
    }

    // Quantas vezes seguidas o poll retornou syncInProgress=false enquanto
    // temos um sinal ativo. O sync pode demorar a comecar (warmup de 15s),
    // entao continuamos em modo ativo por algumas tentativas antes de desistir.
    let idlePollsWithSignal = 0;
    const MAX_IDLE_POLLS_WITH_SIGNAL = 8; // ~24s com poll de 3s — cobre o warmup

    async function poll() {
      let active = syncingRef.current;
      try {
        const res = await fetch(
          `/api/whatsapp/sync-status?domain=${encodeURIComponent(domain)}`,
          { cache: "no-store" }
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as SyncStatusResponse;
          if (data.syncInProgress) {
            active = true;
            idlePollsWithSignal = 0;
            const startMs = data.startedAt
              ? Date.parse(data.startedAt)
              : Date.now();
            startedAtMsRef.current = Number.isFinite(startMs)
              ? startMs
              : Date.now();
            if (!syncingRef.current) {
              // Inicio de um novo ciclo de sync.
              syncingRef.current = true;
              wasSyncingRef.current = true;
              setDone(false);
              setPercent((p) => (p > 0 && p < 100 ? p : 4));
              setVisible(true);
            }
          } else if (wasSyncingRef.current && syncingRef.current) {
            // Estava sincronizando e agora terminou.
            active = false;
            finishCycle();
          } else if (hasSignal && !wasSyncingRef.current) {
            // Ha sinal mas o sync nao apareceu no banco ainda (warmup).
            // Mantemos poll ativo por um tempo.
            idlePollsWithSignal++;
            if (idlePollsWithSignal < MAX_IDLE_POLLS_WITH_SIGNAL) {
              active = true; // mantem poll rapido
            } else {
              // Desiste: o sync provavelmente ja terminou antes de captarmos
              // ou algo deu errado. Limpa o sinal.
              clearSyncSignal();
            }
          }
        }
      } catch {
        /* silencioso: tenta de novo no proximo ciclo */
      } finally {
        if (!cancelled) {
          pollTimerRef.current = setTimeout(
            poll,
            active ? POLL_ACTIVE_MS : POLL_IDLE_MS
          );
        }
      }
    }

    // Se ha sinal fresco, faz o primeiro poll imediatamente (sem delay).
    // Senao, usa o delay idle normal para nao sobrecarregar no boot.
    if (hasSignal) {
      poll();
    } else {
      pollTimerRef.current = setTimeout(poll, POLL_IDLE_MS);
    }

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [domain]);

  if (!visible) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 transition-all duration-500 ${
        done
          ? "border-emerald-300 bg-emerald-50 shadow-sm shadow-emerald-100"
          : "border-emerald-100 bg-emerald-50/60"
      }`}
      title={
        done
          ? "WhatsApp sincronizado"
          : "Sincronizando conversas do WhatsApp..."
      }
    >
      {done ? (
        <>
          {/* Animacao de "concluido" — icone de check verde com pop-in. */}
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white animate-wa-done-pop">
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m5 13 4 4L19 7"
              />
            </svg>
          </span>
          <span className="hidden text-[11px] font-semibold text-emerald-700 sm:inline">
            WhatsApp pronto!
          </span>
        </>
      ) : (
        <>
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 text-emerald-600"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 2a10 10 0 0 0-8.66 15l-1.3 4.74 4.86-1.28A10 10 0 1 0 12 2Zm5.3 14.13c-.22.62-1.3 1.2-1.79 1.24-.46.04-1.04.2-3.5-.74-2.95-1.16-4.83-4.2-4.98-4.4-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.26-.29.57-.36.76-.36l.55.01c.18.01.42-.07.66.5.24.59.83 2.03.9 2.18.07.15.12.32.02.51-.1.2-.15.32-.29.49-.15.18-.31.39-.44.52-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.07 1.31 2.36 1.46.29.15.46.12.63-.07.18-.2.73-.85.92-1.14.2-.29.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.12.07.69-.15 1.32Z" />
          </svg>
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-emerald-100 sm:w-20">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-emerald-700">
            {percent}%
          </span>
        </>
      )}
    </div>
  );
}
