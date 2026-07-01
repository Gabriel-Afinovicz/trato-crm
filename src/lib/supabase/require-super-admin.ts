import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verifies that the current session user is a super_admin.
 *
 * The auth check uses the SSR client (cookies). The role lookup uses the
 * admin client (service_role) to bypass RLS — relying on RLS here is
 * fragile because it depends on `get_user_role()` evaluating against
 * `auth.uid()` in the same request context, which can fail during cookie
 * refresh or when the perfil row is filtered out by other policies.
 */
export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id, role, can_manage_organizations")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("UNAUTHORIZED");
  }

  const record = profile as
    | { id: string; role: string; can_manage_organizations: boolean | null }
    | null;

  if (!record) {
    throw new Error("UNAUTHORIZED");
  }

  if (record.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }

  return {
    userId: record.id,
    authId: user.id,
    canManageOrganizations: record.can_manage_organizations === true,
  };
}

/**
 * Igual ao `requireSuperAdmin`, mas exige que o super admin tenha permissao
 * para gerenciar organizacoes (ativar/desativar/excluir). Super admins criados
 * pelo Painel Master nascem sem essa permissao.
 *
 * Lanca `ORG_MANAGE_FORBIDDEN` quando o usuario e super admin mas nao pode
 * gerenciar organizacoes.
 */
export async function requireOrgManagerSuperAdmin() {
  const session = await requireSuperAdmin();
  if (!session.canManageOrganizations) {
    throw new Error("ORG_MANAGE_FORBIDDEN");
  }
  return session;
}
