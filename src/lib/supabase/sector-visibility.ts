import { cache } from "react";
import { createClient } from "./server";
import type { User as AppUser } from "@/lib/types/database";

/**
 * Visibilidade de leads por setor.
 *
 * Regras:
 * - admin / super_admin: sem restrição (veem todos os setores).
 * - operador COM atribuição em `user_sector_assignments`: vê apenas os
 *   leads dos seus setores. Se as atribuições cobrirem todos os setores
 *   ativos da empresa, equivale a sem restrição.
 * - operador SEM atribuição: sem restrição (retrocompatível — a tela de
 *   membros exibe um aviso para o admin atribuir o setor).
 */
export interface SectorVisibility {
  /** true quando o usuário só pode ver um subconjunto dos setores. */
  restricted: boolean;
  /** Setores permitidos. Null = sem restrição. */
  allowedSectorIds: string[] | null;
  /**
   * Setor único para RPCs que aceitam um `p_sector_id` só (minidash e
   * analítico). Null quando sem restrição.
   */
  singleSectorId: string | null;
}

export const UNRESTRICTED_VISIBILITY: SectorVisibility = {
  restricted: false,
  allowedSectorIds: null,
  singleSectorId: null,
};

/** Uma leitura por requisição RSC (deduplica entre página e API calls). */
export const getSectorVisibility = cache(
  async (
    profile: AppUser | null,
    role: string | null
  ): Promise<SectorVisibility> => {
    if (!profile?.company_id) return UNRESTRICTED_VISIBILITY;
    if (role === "admin" || role === "super_admin") {
      return UNRESTRICTED_VISIBILITY;
    }

    const supabase = await createClient();
    const [assignRes, sectorsRes] = await Promise.all([
      supabase
        .from("user_sector_assignments")
        .select("sector_id")
        .eq("user_id", profile.id),
      supabase
        .from("sectors")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("is_active", true),
    ]);

    const activeIds = new Set(
      ((sectorsRes.data as { id: string }[] | null) ?? []).map((r) => r.id)
    );
    const assigned = [
      ...new Set(
        ((assignRes.data as { sector_id: string }[] | null) ?? []).map(
          (r) => r.sector_id
        )
      ),
    ].filter((id) => activeIds.has(id));

    // Sem atribuição => sem restrição (retrocompatível).
    if (assigned.length === 0) return UNRESTRICTED_VISIBILITY;
    // Atribuído a todos os setores ativos => sem restrição na prática.
    if (assigned.length >= activeIds.size) return UNRESTRICTED_VISIBILITY;

    return {
      restricted: true,
      allowedSectorIds: assigned,
      singleSectorId: assigned.length === 1 ? assigned[0] : null,
    };
  }
);
