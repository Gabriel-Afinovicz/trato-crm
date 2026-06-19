"use client";

import { useCallback, useState } from "react";
import { ALL_TOUR_IDS, type TourId } from "./tours";

/**
 * Persistencia do tour de onboarding em `localStorage`, com escopo por
 * usuario (a chave inclui o `userId`). Mantem o padrao ja usado no projeto
 * (try/catch silencioso, leitura no client).
 */
const PREFIX = "crm.tour";

function doneKey(tourId: TourId, userId: string): string {
  return `${PREFIX}.${tourId}.done:${userId}`;
}

/** True quando o tour ja foi concluido/pulado por este usuario. */
export function isTourDone(tourId: TourId, userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(doneKey(tourId, userId)) === "1";
  } catch {
    // Storage indisponivel: trata como "concluido" para nao insistir.
    return true;
  }
}

/** Marca um tour como concluido para este usuario. */
export function markTourDone(tourId: TourId, userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(doneKey(tourId, userId), "1");
  } catch {
    /* ignora */
  }
}

/** Marca todos os tours como concluidos (usado no "Pular tudo"). */
export function markAllToursDone(userId: string): void {
  for (const id of ALL_TOUR_IDS) markTourDone(id, userId);
}

/**
 * Limpa todas as chaves de tour deste navegador (qualquer usuario).
 *
 * Usado pelo botao "Refazer tour guiado" na pagina /ajuda, que nao tem
 * acesso ao `userId` (roda fora do SessionProvider).
 */
export function resetAllToursLocal(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}.`)) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignora */
  }
}

/** Navegacao de passos (index + next/back) compartilhada pelos tours. */
export function useStepController(total: number) {
  const [index, setIndex] = useState(0);
  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0))),
    [total]
  );
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const reset = useCallback(() => setIndex(0), []);
  return {
    index,
    setIndex,
    next,
    back,
    reset,
    isFirst: index <= 0,
    isLast: index >= total - 1,
  };
}
