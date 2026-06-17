"use client";

import { useEffect, useRef, useState } from "react";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { WhatsAppInstance } from "@/lib/types/database";

export interface WhatsAppConnectionState {
  /** Carregando o estado inicial (antes do primeiro fetch resolver). */
  loading: boolean;
  status: "disconnected" | "connecting" | "connected" | null;
  /** true quando o WhatsApp caiu pelo CELULAR (aparelho removido). */
  phoneDisconnected: boolean;
}

/**
 * Acompanha o estado de conexao do WhatsApp da empresa em tempo real.
 *
 * - Faz um fetch inicial leve em `/api/whatsapp/connection-status` (somente
 *   banco; nao toca na Evolution) — que tambem deriva, no servidor, se a queda
 *   foi pelo celular (sem expor o `evolution_token` ao client).
 * - Assina UPDATE em `whatsapp_instances` via Supabase Realtime. Como o motivo
 *   (`phoneDisconnected`) e calculado no servidor, refazemos o fetch leve
 *   apenas quando o `status` realmente muda — heartbeats do webhook (que so
 *   mexem em `webhook_last_seen_at`) nao disparam refetch.
 *
 * Defensivo: nunca lanca. Em qualquer falha, devolve o ultimo estado conhecido.
 */
export function useWhatsAppConnection(
  companyId: string | null,
  domain: string | null
): WhatsAppConnectionState {
  const [state, setState] = useState<WhatsAppConnectionState>(() => ({
    // Sem company/domain nao ha o que buscar — ja nasce "resolvido".
    loading: Boolean(companyId && domain),
    status: null,
    phoneDisconnected: false,
  }));
  // Espelha o status atual para o handler de realtime decidir se refaz o fetch
  // sem precisar entrar nas dependencias do efeito (evita re-subscrever).
  const statusRef = useRef<WhatsAppConnectionState["status"]>(null);

  useEffect(() => {
    // Sem company/domain nao assina nada; o estado inicial (lazy) ja reflete
    // "resolvido/sem instancia".
    if (!companyId || !domain) return;

    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/connection-status?domain=${encodeURIComponent(domain)}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          status: WhatsAppConnectionState["status"];
          phoneDisconnected: boolean;
        };
        if (cancelled) return;
        statusRef.current = data.status;
        setState({
          loading: false,
          status: data.status,
          phoneDisconnected: data.phoneDisconnected,
        });
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    // Fetch inicial (IIFE async — o setState fica apos o await, fora do corpo
    // sincrono do efeito).
    void (async () => {
      await load();
    })();

    const channelName = `wa-conn-${companyId}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
          schema: "public",
          table: "whatsapp_instances",
        },
        (payload: RealtimePostgresChangesPayload<WhatsAppInstance>) => {
          if (cancelled) return;
          const next = payload.new as WhatsAppInstance;
          if (!next || next.company_id !== companyId) return;
          // So refaz o fetch (leve) quando o status muda de fato. O motivo
          // (phoneDisconnected) e derivado no servidor a partir do token.
          if (next.status !== statusRef.current) {
            void load();
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyId, domain]);

  return state;
}
