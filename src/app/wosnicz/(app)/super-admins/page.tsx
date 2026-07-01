import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddSuperAdminForm } from "@/components/wosnicz/add-super-admin-form";

export default async function SuperAdminsPage() {
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("domain", "wosnicz")
    .maybeSingle();

  const companyId = (company as { id: string } | null)?.id ?? null;

  const { data: admins } = companyId
    ? await supabase
        .from("users")
        .select("id, name, extension_number, is_active, can_manage_organizations")
        .eq("company_id", companyId)
        .eq("role", "super_admin")
        .order("created_at", { ascending: true })
    : { data: [] };

  const list = (admins ?? []) as {
    id: string;
    name: string;
    extension_number: string;
    is_active: boolean | null;
    can_manage_organizations: boolean | null;
  }[];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/wosnicz/dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admins</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Gerencie quem tem acesso ao Painel Master.
          </p>
        </div>
      </div>

      <AddSuperAdminForm />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Super admins cadastrados
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Ramal</th>
                <th className="px-4 py-3 font-medium">Permissões</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Nenhum super admin encontrado.
                  </td>
                </tr>
              )}
              {list.map((admin) => (
                <tr
                  key={admin.id}
                  className="border-b border-gray-50 last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {admin.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                      {admin.extension_number}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {admin.can_manage_organizations ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Gestão total
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Somente leitura
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {admin.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Inativo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Super admins com <strong>&quot;Gestão total&quot;</strong> podem
          ativar/desativar e excluir organizações. Os criados por aqui nascem
          como <strong>&quot;Somente leitura&quot;</strong>: acessam e visualizam
          as organizações, mas não executam ações destrutivas.
        </p>
      </section>
    </div>
  );
}
