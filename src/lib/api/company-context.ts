import type { User as AppUser } from "@/lib/types/database";

export type CompanyAccessResult =
  | { ok: true; companyId: string }
  | { ok: false; status: 401 | 403 | 400; error: string };

/**
 * Resolve a empresa alvo de uma operacao.
 *
 * Super admin opera na empresa informada (dominio visualizado).
 * Demais usuarios so na propria empresa.
 */
export function resolveCompanyAccess(
  profile: AppUser | null,
  role: string | null,
  requestedCompanyId: string | null | undefined
): CompanyAccessResult {
  if (!profile) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }
  if (!requestedCompanyId) {
    return { ok: false, status: 400, error: "companyId required" };
  }
  if (role !== "super_admin" && profile.company_id !== requestedCompanyId) {
    return { ok: false, status: 403, error: "FORBIDDEN" };
  }
  return { ok: true, companyId: requestedCompanyId };
}
