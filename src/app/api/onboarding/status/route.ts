import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Estado dos itens do checklist de primeiros passos da organizacao.
 *
 * Consumido pelo `OnboardingChecklist` no Dashboard para mostrar o que
 * o admin ainda precisa configurar antes de comecar a usar o CRM no dia
 * a dia. Quando todos os itens estao `true`, o card desaparece
 * automaticamente.
 */
export interface OnboardingStatus {
  hasPipeline: boolean;
  hasExtraMember: boolean;
  hasClinicHours: boolean;
  hasWhatsApp: boolean;
  hasFirstLead: boolean;
}

export async function GET() {
  const { user, profile } = await getAuthSession();
  const companyId = profile?.company_id;

  // Sem sessao valida: retorna tudo `false`. O componente decide nao
  // mostrar nada (usuario nao logado nao vai ate o dashboard).
  if (!user || !companyId) {
    return NextResponse.json<OnboardingStatus>({
      hasPipeline: false,
      hasExtraMember: false,
      hasClinicHours: false,
      hasWhatsApp: false,
      hasFirstLead: false,
    });
  }

  const supabase = await createClient();

  // Executa todas as contagens em paralelo — sao queries pequenas
  // (HEAD + count) que terminam rapido. Falha silenciosa de qualquer
  // uma cai como `false` (item aparece como pendente).
  const [
    pipelineRes,
    membersRes,
    hoursRes,
    waRes,
    leadsRes,
  ] = await Promise.all([
    supabase
      .from("pipeline_stages")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .eq("is_active", true),
    supabase
      .from("users")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId),
    supabase
      .from("clinic_hours")
      .select("weekday", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .eq("is_open", true),
    supabase
      .from("whatsapp_instances")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId)
      .eq("status", "connected"),
    supabase
      .from("leads")
      .select("id", { head: true, count: "exact" })
      .eq("company_id", companyId),
  ]);

  return NextResponse.json<OnboardingStatus>({
    hasPipeline: (pipelineRes.count ?? 0) > 0,
    // O usuario logado conta como 1. Consideramos "tem time" quando ha
    // pelo menos 2 membros (admin + ao menos um operador).
    hasExtraMember: (membersRes.count ?? 0) > 1,
    hasClinicHours: (hoursRes.count ?? 0) > 0,
    hasWhatsApp: (waRes.count ?? 0) > 0,
    hasFirstLead: (leadsRes.count ?? 0) > 0,
  });
}
