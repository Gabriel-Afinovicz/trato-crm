"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { User as AppUser } from "@/lib/types/database";

export interface SessionContextValue {
  userId: string | null;
  profile: AppUser | null;
  companyId: string | null;
  companyName: string | null;
  /**
   * Fuso horario configurado para a organizacao (ex: "America/Sao_Paulo").
   * Toda formatacao de data/hora visivel para o operador deve passar por
   * aqui para refletir o calendario do escritorio — nao do navegador.
   * Default `"America/Sao_Paulo"` quando o provider nao informa.
   */
  companyTimezone: string;
  domain: string | null;
}

const SessionContext = createContext<SessionContextValue>({
  userId: null,
  profile: null,
  companyId: null,
  companyName: null,
  companyTimezone: "America/Sao_Paulo",
  domain: null,
});

export function SessionProvider({
  value,
  children,
}: {
  value: SessionContextValue;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
