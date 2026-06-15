import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Endpoint leve para o indicador global de sincronizacao no header. Le
// APENAS o estado no banco (last_manual_sync_at / sync_finished_at) — sem
// tocar na Evolution API — porque e chamado em poll por todas as telas
// autenticadas. O /instance/status (que consulta a Evolution) continua
// dedicado ao painel de Configuracoes.

interface InstanceRow {
  status: "disconnected" | "connecting" | "connected";
  last_manual_sync_at: string | null;
  sync_finished_at: string | null;
}

// Mesmo timeout do /instance/status: evita "trava" perpetua se o handler
// do sync crashar entre o UPDATE inicial e o finally.
const SYNC_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000;

function computeSyncInProgress(row: InstanceRow): boolean {
  if (!row.last_manual_sync_at) return false;
  const startedMs = Date.parse(row.last_manual_sync_at);
  if (!Number.isFinite(startedMs)) return false;
  if (Date.now() - startedMs > SYNC_PROGRESS_TIMEOUT_MS) return false;
  if (!row.sync_finished_at) return true;
  const finishedMs = Date.parse(row.sync_finished_at);
  if (!Number.isFinite(finishedMs)) return true;
  return finishedMs < startedMs;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ syncInProgress: false }, { status: 200 });
  }

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({ syncInProgress: false }, { status: 200 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("domain", domain)
    .single();
  const companyRow = company as { id: string } | null;
  if (!companyRow) {
    return NextResponse.json({ syncInProgress: false }, { status: 200 });
  }

  const { data: row } = await supabase
    .from("whatsapp_instances")
    .select("status, last_manual_sync_at, sync_finished_at")
    .eq("company_id", companyRow.id)
    .maybeSingle();
  const instance = row as InstanceRow | null;

  if (!instance) {
    return NextResponse.json({ syncInProgress: false });
  }

  return NextResponse.json({
    syncInProgress: computeSyncInProgress(instance),
    startedAt: instance.last_manual_sync_at,
    finishedAt: instance.sync_finished_at,
  });
}
