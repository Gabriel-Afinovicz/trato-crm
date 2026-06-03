import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import {
  defaultMonthRange,
  getAnaliticoKpis,
} from "@/lib/supabase/dashboard-data";

/**
 * KPIs executivos da aba "Analítico".
 *
 * Parâmetros (query string):
 * - `companyId`  (uuid, obrigatório): clínica alvo. Validamos que o usuário
 *   autenticado pertence a ela (ou é super_admin) para impedir que um
 *   operator/admin de uma clínica solicite KPIs de outra — RLS nas tabelas
 *   ajuda, mas a RPC roda como SECURITY DEFINER, então a checagem é aqui.
 * - `start`, `end` (ISO 8601, opcionais): intervalo `[start, end)`. Quando
 *   ausentes, usamos o mês corrente (default da tela).
 */
export async function GET(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }

  if (role !== "super_admin" && profile.company_id !== companyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  let range: { start: Date; end: Date };
  if (startParam && endParam) {
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid start/end date" },
        { status: 400 }
      );
    }
    if (end <= start) {
      return NextResponse.json(
        { error: "end must be after start" },
        { status: 400 }
      );
    }
    range = { start, end };
  } else {
    range = defaultMonthRange();
  }

  const sectorParam = searchParams.get("sector");
  const sectorId =
    sectorParam && sectorParam !== "none" ? sectorParam : null;

  const kpis = await getAnaliticoKpis(companyId, range, sectorId);
  return NextResponse.json({
    kpis,
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
  });
}
