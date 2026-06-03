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
  initial: MinidashCohort = EMPTY_MINIDASH,
  sectorId?: string | null
) {
  const [cohort, setCohort] = useState<MinidashCohort>(initial);
  const [isFetching, setIsFetching] = useState(false);
  // Mantém a última range buscada para evitar refetch quando o objeto
  // recém-criado tem os mesmos valores que o anterior.
  const lastKeyRef = useRef<string>(
    `${range.start}|${range.end}|${sectorId ?? ""}`
  );

  const fetchNow = useCallback(
    async (
      targetRange: { start: string; end: string } = range,
      targetSectorId: string | null | undefined = sectorId
    ): Promise<MinidashCohort | null> => {
      if (!companyId) return null;
      setIsFetching(true);
      try {
        const url = new URL("/api/leads/minidash", window.location.origin);
        url.searchParams.set("companyId", companyId);
        url.searchParams.set("start", targetRange.start);
        url.searchParams.set("end", targetRange.end);
        if (targetSectorId) url.searchParams.set("sector", targetSectorId);
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
    [companyId, range, sectorId]
  );

  useEffect(() => {
    const key = `${range.start}|${range.end}|${sectorId ?? ""}`;
    if (key === lastKeyRef.current && cohort !== EMPTY_MINIDASH) {
      // Mesma janela/filtro ja carregada — nao busca de novo.
      return;
    }
    lastKeyRef.current = key;
    void fetchNow(range, sectorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, companyId, sectorId]);

  const refetch = useCallback(() => {
    void fetchNow();
  }, [fetchNow]);

  return { cohort, isFetching, refetch };
}
