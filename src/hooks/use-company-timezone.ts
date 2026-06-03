"use client";

import { useSession } from "@/components/layout/session-provider";

/**
 * Acessor canonico do fuso horario da organizacao em components client.
 *
 * Sempre devolve uma string IANA valida (defaulta para "America/Sao_Paulo"
 * quando a sessao ainda nao carregou ou nao tem company). Use este hook
 * em toda formatacao de data/hora visivel para o operador — incluindo
 * tabelas, listas, badges de "hoje" e exports.
 */
export function useCompanyTimezone(): string {
  const session = useSession();
  return session.companyTimezone || "America/Sao_Paulo";
}
