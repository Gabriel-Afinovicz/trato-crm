"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MinidashCohort } from "@/lib/types/database";

const EMPTY_MINIDASH: MinidashCohort = {
  total: 0,
  frio: 0,
  quente: 0,
  agendado: 0,
  compareceu: 0,
  orcamento: 0,
  fechado: 0,
  perdido: 0,
  sem_categoria: 0,
};

/**
 * Fetch + cache da mini-dash do Kanban/Leads.
 *
 * Centralizamos aqui para que o cabeçalho do Dashboard (que mostra os
 * pills compactos junto às tabs) e o `LeadKanbanBoard` (que precisa do
 * `refetch` após DnD) compartilhem a mesma fonte sem duplicar requests.
 *
 * `range.start`/`range.end` são strings ISO — o hook decide refetch
 * quando elas mudam, evitando reentrância indesejada por re-renderes.
 */
export function useKanbanMinidash(
  companyId: string | null,
  range: { start: string; end: string },
  initial: MinidashCohort = EMPTY_MINIDASH
) {
  const [cohort, setCohort] = useState<MinidashCohort>(initial);
  const [isFetching, setIsFetching] = useState(false);
  // Mantém a última range buscada para evitar refetch quando o objeto
  // recém-criado tem os mesmos valores que o anterior.
  const lastRangeRef = useRef<string>(`${range.start}|${range.end}`);

  const fetchNow = useCallback(
    async (
      targetRange: { start: string; end: string } = range
    ): Promise<MinidashCohort | null> => {
      if (!companyId) return null;
      setIsFetching(true);
      try {
        const url = new URL("/api/leads/minidash", window.location.origin);
        url.searchParams.set("companyId", companyId);
        url.searchParams.set("start", targetRange.start);
        url.searchParams.set("end", targetRange.end);
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        const data = (await res.json()) as { minidash: MinidashCohort };
        setCohort(data.minidash);
        return data.minidash;
      } catch {
        return null;
      } finally {
        setIsFetching(false);
      }
    },
    [companyId, range]
  );

  useEffect(() => {
    const key = `${range.start}|${range.end}`;
    if (key === lastRangeRef.current && cohort !== EMPTY_MINIDASH) {
      // Mesma janela já carregada — não busca de novo.
      return;
    }
    lastRangeRef.current = key;
    void fetchNow(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, companyId]);

  const refetch = useCallback(() => {
    void fetchNow();
  }, [fetchNow]);

  return { cohort, isFetching, refetch };
}
