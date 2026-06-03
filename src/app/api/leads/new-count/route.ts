import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";

/**
 * Quantidade de leads novos criados nas ultimas 24h da company do usuario.
 *
 * Consumido pela `Sidebar` para mostrar o badge no item "Leads",
 * sinalizando ao operador que ha entradas recentes sem precisar abrir
 * a tela. Retorna 0 se o usuario nao estiver autenticado ou sem company.
 */
export async function GET() {
  const { user, profile } = await getAuthSession();
  if (!user || !profile?.company_id) {
    return NextResponse.json({ count: 0 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { head: true, count: "exact" })
    .eq("company_id", profile.company_id)
    .gte("created_at", since);

  if (error) {
    console.error("[GET /api/leads/new-count] db error", error);
    // Fallback silencioso — badge desaparece, fluxo normal continua.
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json({ count: count ?? 0 });
}
