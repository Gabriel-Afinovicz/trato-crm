import { NextResponse, type NextRequest } from "next/server";
import { resolveCompanyAccess } from "@/lib/api/company-context";
import { getAuthSession } from "@/lib/supabase/cached-data";
import {
  syncAppointmentCreated,
  syncAppointmentRescheduled,
  syncAppointmentCancelled,
} from "@/lib/integrations/clinicorp-service";

/**
 * Dispara o efeito colateral de sincronizar um agendamento com a Clinicorp.
 *
 * Chamado (fire-and-forget) pelo cliente APOS a mutacao local do agendamento:
 *  - action "create":     cria na Clinicorp e guarda clinicorp_appointment_id.
 *  - action "reschedule":  cancela o anterior na Clinicorp e cria um novo.
 *  - action "cancel":      cancela na Clinicorp (recebe o id da Clinicorp, pois
 *                          o registro local pode ja ter sido excluido).
 *
 * A sincronizacao roda em background no servidor; a resposta volta na hora e
 * uma falha aqui NUNCA afeta o agendamento local (so registra em
 * integration_logs).
 */
interface Body {
  companyId?: string;
  appointmentId?: string;
  action?: "create" | "reschedule" | "cancel";
  clinicorpAppointmentId?: string;
}

export async function POST(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const access = resolveCompanyAccess(profile, role, body.companyId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const companyId = access.companyId;

  if (body.action === "cancel") {
    if (!body.clinicorpAppointmentId) {
      // Agendamento nunca foi sincronizado com a Clinicorp; nada a cancelar.
      return NextResponse.json({ ok: true, skipped: true });
    }
    syncAppointmentCancelled(companyId, body.clinicorpAppointmentId);
    return NextResponse.json({ ok: true });
  }

  if (!body.appointmentId) {
    return NextResponse.json(
      { error: "appointmentId required" },
      { status: 400 }
    );
  }

  if (body.action === "reschedule") {
    syncAppointmentRescheduled(companyId, body.appointmentId);
  } else {
    syncAppointmentCreated(companyId, body.appointmentId);
  }
  return NextResponse.json({ ok: true });
}
