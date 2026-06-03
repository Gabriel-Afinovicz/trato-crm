"use client";

import { useEffect, useRef } from "react";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Lead } from "@/lib/types/database";

export interface NewLeadEventHandlers {
  /**
   * Disparado quando um lead novo e inserido em leads cuja company_id
   * bate com o `companyId` passado. NAO e disparado para updates.
   */
  onNewLead?: (lead: Lead) => void;
}

/**
 * Hub Realtime de novos leads para uma `company_id`.
 *
 * Espelha o padrao de `useWhatsAppEvents`: um canal Supabase Realtime
 * por mount com nome unico (evita duplicacao em StrictMode/HMR).
 * Defesa em profundidade: confere `company_id` no client mesmo com
 * RLS no banco.
 *
 * A tabela `leads` precisa estar na publicacao `supabase_realtime`
 * (migration `add_leads_to_realtime_publication`).
 */
export function useNewLeadEvents(
  companyId: string | null,
  handlers: NewLeadEventHandlers
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    const channelName = `leads-events-${companyId}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "leads",
        },
        (payload: RealtimePostgresChangesPayload<Lead>) => {
          const next = payload.new as Lead | undefined;
          if (!next || next.company_id !== companyId) return;
          handlersRef.current.onNewLead?.(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);
}
