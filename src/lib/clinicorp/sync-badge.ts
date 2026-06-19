import type { Appointment } from "@/lib/types/database";

/** Estado de sincronizacao do agendamento com a Clinicorp (feedback visual). */
export type ClinicorpSyncState = "syncing" | "synced" | "failed";

/**
 * Janela apos a criacao em que tratamos como "sincronizando" mesmo sem o
 * status `pending` ainda gravado — cobre a corrida entre criar o agendamento
 * e o servico de integracao marcar o status.
 */
const RECENT_SYNC_WINDOW_MS = 90_000;

type SyncAppt = Pick<
  Appointment,
  "clinicorp_appointment_id" | "clinicorp_sync_status" | "created_at" | "status"
>;

/**
 * Resolve o estado de sincronizacao para exibir o selo no card/popup.
 * Retorna null quando NAO deve mostrar selo: integracao inativa, agendamento
 * cancelado, ou agendamento antigo que nunca sincronizou (evita "amarelo
 * eterno" em registros pre-integracao).
 */
export function getClinicorpSyncState(
  appt: SyncAppt,
  clinicorpEnabled: boolean
): ClinicorpSyncState | null {
  if (!clinicorpEnabled) return null;
  if (appt.status === "cancelled") return null;
  if (
    appt.clinicorp_appointment_id ||
    appt.clinicorp_sync_status === "synced"
  ) {
    return "synced";
  }
  if (appt.clinicorp_sync_status === "failed") return "failed";
  if (appt.clinicorp_sync_status === "pending") return "syncing";
  const created = appt.created_at ? Date.parse(appt.created_at) : NaN;
  if (Number.isFinite(created) && Date.now() - created < RECENT_SYNC_WINDOW_MS) {
    return "syncing";
  }
  return null;
}

export const CLINICORP_SYNC_LABEL: Record<ClinicorpSyncState, string> = {
  syncing: "Sincronizando na Clinicorp…",
  synced: "Ativo na Clinicorp",
  failed: "Falha ao sincronizar",
};

/** Classe da bolinha de status (dot) por estado. */
export const CLINICORP_SYNC_DOT: Record<ClinicorpSyncState, string> = {
  syncing: "bg-amber-500 animate-pulse",
  synced: "bg-emerald-500",
  failed: "bg-red-500",
};

/** Classe do "pill" (selo com texto) por estado. */
export const CLINICORP_SYNC_PILL: Record<ClinicorpSyncState, string> = {
  syncing: "border-amber-200 bg-amber-50 text-amber-700",
  synced: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};
