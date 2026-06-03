import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evolution } from "@/lib/evolution/client";

interface InstanceRow {
  id: string;
  company_id: string;
  instance_name: string;
  status: "disconnected" | "connecting" | "connected";
  phone_number: string | null;
  connected_at: string | null;
  // Exposto ao client para que a UI de cooldown sobreviva a F5 / aba nova.
  last_manual_sync_at: string | null;
  sync_finished_at: string | null;
}

// Considera sync em andamento se foi iniciado ha menos de 10min e ainda
// nao gravou termino. Timeout evita lock perpetuo se o handler do sync
// crashar entre o UPDATE inicial e o finally.
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
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({ error: "domain obrigatorio" }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("domain", domain)
    .single();
  const companyRow = company as { id: string } | null;
  if (!companyRow) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data: row } = await supabase
    .from("whatsapp_instances")
    .select(
      "id, company_id, instance_name, status, phone_number, connected_at, last_manual_sync_at, sync_finished_at"
    )
    .eq("company_id", companyRow.id)
    .maybeSingle();
  const instance = row as InstanceRow | null;

  if (!instance) {
    return NextResponse.json({ instance: null });
  }

  if (evolution.isConfigured() && instance.status !== "disconnected") {
    try {
      const live = await evolution.getConnectionState(instance.instance_name);
      const liveState = live.instance.state;
      const mapped =
        liveState === "open"
          ? "connected"
          : liveState === "connecting"
            ? "connecting"
            : "disconnected";
      if (mapped !== instance.status) {
        const supabaseAdmin = createAdminClient();
        await supabaseAdmin
          .from("whatsapp_instances")
          .update({
            status: mapped,
            connected_at:
              mapped === "connected"
                ? instance.connected_at ?? new Date().toISOString()
                : instance.connected_at,
          })
          .eq("id", instance.id);
        instance.status = mapped;
      }
    } catch {
      // mantem ultimo status conhecido
    }
  }

  let qrBase64: string | null = null;
  let pairingCode: string | null = null;
  if (instance.status === "connecting" && evolution.isConfigured()) {
    try {
      const connectRes = await evolution.connect(instance.instance_name);
      qrBase64 = connectRes.base64 ?? null;
      pairingCode = connectRes.pairingCode ?? connectRes.code ?? null;
    } catch {
      // ignora; o cliente segue tentando
    }
  }

  const syncInProgress = computeSyncInProgress(instance);

  return NextResponse.json({
    instance,
    qrBase64,
    pairingCode,
    syncInProgress,
  });
}
