"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  STAGE_CATEGORIES,
  type StageCategory,
} from "@/lib/types/database";

/**
 * Hook compartilhado pela aba Kanban (`/dashboard?tab=kanban`) e pela
 * tela Leads (`/leads`). Garante que os filtros sobrevivam à navegação
 * entre as duas telas via URL params — abrir um link compartilhado leva
 * direto para o mesmo recorte.
 *
 * Convenções dos params:
 * - `cats`        : csv de StageCategory ("quente,agendado").
 * - `start`/`end` : ISO 8601, intervalo `[start, end)`.
 * - `q`           : busca por nome/telefone/email.
 * - `assignee`    : id do responsável OU "unassigned".
 * - `specialty`   : id da especialidade OU "none".
 * - `source`      : id da origem.
 * - `tags`        : csv de tag_ids.
 * - `page`        : número de página (1-indexed). Reset automático quando
 *                   qualquer outro filtro muda.
 *
 * Comportamentos importantes:
 * - O hook **não escolhe um default para `cats`**. O caller decide:
 *   - Kanban inicia com TODAS as categorias ativas selecionadas (mantém o
 *     comportamento anterior de mostrar tudo).
 *   - Leads inicia com nenhuma (estado instrutivo).
 * - Sem `start/end` na URL, o caller cai no `defaultMonthRange()`.
 */

export interface LeadFiltersState {
  categories: StageCategory[];
  start: string | null;
  end: string | null;
  q: string;
  assignee: string | null;
  specialty: string | null;
  source: string | null;
  tags: string[];
  page: number;
}

export type LeadFiltersPatch = Partial<{
  categories: StageCategory[];
  start: string | null;
  end: string | null;
  q: string;
  assignee: string | null;
  specialty: string | null;
  source: string | null;
  tags: string[];
  page: number;
  /** Quando true, mantém page; caso contrário, qualquer mudança reseta para 1. */
  keepPage: boolean;
}>;

function parseCategories(raw: string | null): StageCategory[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c): c is StageCategory =>
      (STAGE_CATEGORIES as string[]).includes(c)
    );
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

export function useLeadFilters(): {
  state: LeadFiltersState;
  setFilters: (patch: LeadFiltersPatch) => void;
  setPage: (page: number) => void;
  toggleCategory: (cat: StageCategory) => void;
} {
  const router = useRouter();
  const sp = useSearchParams();

  const state = useMemo<LeadFiltersState>(() => {
    return {
      categories: parseCategories(sp.get("cats")),
      start: sp.get("start"),
      end: sp.get("end"),
      q: sp.get("q") ?? "",
      assignee: sp.get("assignee"),
      specialty: sp.get("specialty"),
      source: sp.get("source"),
      tags: parseTags(sp.get("tags")),
      page: Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1),
    };
  }, [sp]);

  const setFilters = useCallback(
    (patch: LeadFiltersPatch) => {
      const next = new URLSearchParams(sp.toString());

      function setOrDel(key: string, value: string | null | undefined) {
        if (value === undefined) return; // não tocamos no param
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }

      if (patch.categories !== undefined) {
        if (patch.categories.length === 0) next.delete("cats");
        else next.set("cats", patch.categories.join(","));
      }
      setOrDel("start", patch.start);
      setOrDel("end", patch.end);
      setOrDel("q", patch.q ?? undefined);
      setOrDel("assignee", patch.assignee);
      setOrDel("specialty", patch.specialty);
      setOrDel("source", patch.source);
      if (patch.tags !== undefined) {
        if (patch.tags.length === 0) next.delete("tags");
        else next.set("tags", patch.tags.join(","));
      }

      // Reset de página quando qualquer filtro != page mudar.
      const mutatedOther =
        patch.categories !== undefined ||
        patch.start !== undefined ||
        patch.end !== undefined ||
        patch.q !== undefined ||
        patch.assignee !== undefined ||
        patch.specialty !== undefined ||
        patch.source !== undefined ||
        patch.tags !== undefined;
      if (mutatedOther && !patch.keepPage) {
        next.delete("page");
      }
      if (patch.page !== undefined) {
        if (patch.page <= 1) next.delete("page");
        else next.set("page", String(patch.page));
      }

      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, sp]
  );

  const setPage = useCallback(
    (page: number) => {
      setFilters({ page, keepPage: true });
    },
    [setFilters]
  );

  const toggleCategory = useCallback(
    (cat: StageCategory) => {
      const cur = state.categories;
      const next = cur.includes(cat)
        ? cur.filter((c) => c !== cat)
        : [...cur, cat];
      setFilters({ categories: next });
    },
    [state.categories, setFilters]
  );

  return { state, setFilters, setPage, toggleCategory };
}
