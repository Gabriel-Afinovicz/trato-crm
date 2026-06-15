import { cache } from "react";
import { AuthApiError, type User } from "@supabase/supabase-js";
import { createClient } from "./server";
import type { User as AppUser } from "@/lib/types/database";

function isExpectedAuthError(err: unknown): boolean {
  if (err instanceof AuthApiError) {
    if (err.code === "refresh_token_not_found") return true;
    if (err.status >= 400 && err.status < 500) return true;
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: string }).code === "refresh_token_not_found"
  ) {
    return true;
  }
  // AuthSessionMissingError: requisicao sem sessao de login (deslogado,
  // primeira carga ou token expirado). E uma condicao esperada — silencia
  // o log e deixa o fluxo seguir como "nao autenticado". Essa classe nao
  // estende AuthApiError e vem com code undefined, entao detectamos pela
  // flag __isAuthError + name.
  if (
    err &&
    typeof err === "object" &&
    "__isAuthError" in err &&
    (err as { __isAuthError?: boolean }).__isAuthError === true
  ) {
    const name = (err as { name?: string }).name;
    if (name === "AuthSessionMissingError") return true;
  }
  return false;
}

export type AuthSession = {
  user: User | null;
  profile: AppUser | null;
  role: string | null;
  /** Domínio da empresa do usuário (null para super_admin ou sem vínculo). */
  userDomain: string | null;
};

/** Uma sessão por requisição RSC (deduplica layout + páginas na mesma navegação). */
export const getAuthSession = cache(async (): Promise<AuthSession> => {
  const supabase = await createClient();

  let user: User | null = null;
  try {
    const result = await supabase.auth.getUser();
    if (result.error) {
      if (!isExpectedAuthError(result.error)) {
        console.error("[auth] getAuthSession.getUser:", result.error);
      }
    } else {
      user = result.data.user;
    }
  } catch (err) {
    if (!isExpectedAuthError(err)) {
      console.error("[auth] getAuthSession.getUser threw:", err);
    }
  }

  if (!user) {
    return { user: null, profile: null, role: null, userDomain: null };
  }

  const { data } = await supabase
    .from("users")
    .select("*, companies(domain)")
    .eq("auth_id", user.id)
    .single();

  const row = data as
    | (AppUser & { companies: { domain: string | null } | null })
    | null;

  if (!row) {
    return { user, profile: null, role: null, userDomain: null };
  }

  const { companies, ...profile } = row;
  return {
    user,
    profile: profile as AppUser,
    role: profile.role ?? null,
    userDomain: companies?.domain ?? null,
  };
});

export type DomainCompany = {
  id: string;
  name: string;
  /** IANA timezone string. Default "America/Sao_Paulo" para registros antigos. */
  timezone: string;
};

/** Empresa do slug da URL — uma leitura por requisição RSC. */
export const getDomainCompany = cache(
  async (domain: string): Promise<DomainCompany | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, timezone")
      .eq("domain", domain)
      .single();

    if (error || !data) return null;
    const row = data as { id: string; name: string; timezone: string | null };
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone || "America/Sao_Paulo",
    };
  }
);
