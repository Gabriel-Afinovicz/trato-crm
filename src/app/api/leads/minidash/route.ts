import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import { defaultMonthRange } from "@/lib/supabase/dashboard-data";
import { getKanbanMinidash } from "@/lib/supabase/leads-data";

/**
 * Mini-dash de leads (cohort agrupada por categoria).
 *
 * Reusa a mesma semântica do Analítico:
 * - Conta apenas leads `created_at ∈ [start, end)`.
 * - Agrupa pelo `stage_category` atual do lead — então se o lead
 *   andou no pipeline durante o período, ele cai na categoria final.
 * - Default de período: mês corrente (mesmo do Analítico).
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

  const minidash = await getKanbanMinidash(companyId, range);
  return NextResponse.json({
    minidash,
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
  });
}
