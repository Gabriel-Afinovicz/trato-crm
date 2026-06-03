import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession, getDomainCompany } from "@/lib/supabase/cached-data";
import { LeadForm } from "@/components/leads/lead-form";
import type { Lead } from "@/lib/types/database";
import Link from "next/link";

interface EditLeadPageProps {
  params: Promise<{ domain: string; id: string }>;
}

export default async function EditLeadPage({ params }: EditLeadPageProps) {
  const { domain, id } = await params;
  const [{ user }, company] = await Promise.all([
    getAuthSession(),
    getDomainCompany(domain),
  ]);

  if (!user) {
    redirect(`/${domain}`);
  }

  const companyId = company?.id;

  if (!companyId) {
    redirect(`/${domain}`);
  }

  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error || !lead) {
    notFound();
  }

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href={`/${domain}/leads/${id}`}
            aria-label="Voltar para o lead"
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
            <h1 className="text-2xl font-bold text-gray-900">Editar Lead</h1>
            <p className="mt-1 text-sm text-gray-500">
              Atualize as informações do lead.
            </p>
          </div>
        </div>

        <LeadForm
          domain={domain}
          lead={lead as unknown as Lead}
          layout="two-column"
        />
      </div>
    </div>
  );
}
