import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import {
  clinicorp,
  extractClinicorpAppointmentId,
} from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";
import { resolveClinicorpConfig } from "@/lib/integrations/clinicorp-service";

/**
 * TESTE SEGURO de agendamento na Clinicorp (validacao em conta real).
 *
 * Cria um agendamento claramente identificado como teste, numa data distante,
 * e o CANCELA em seguida — para nao poluir a agenda real do cliente. Devolve
 * as respostas BRUTAS de create/cancel para que o admin (e o dev) confirmem o
 * comportamento da API (campos obrigatorios, formato do `date`, id retornado).
 *
 * So o admin da empresa pode executar. Body: { companyId, date?, fromTime?,
 * toTime? } — os campos de horario sao opcionais (default: +90 dias, 08:00).
 */
const TEST_PHONE = "11999999999";

function futureDateYmd(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`;
}

/** Junta Message (string) e Messages (array) de um erro da Clinicorp. */
function clinicorpErrorText(err: unknown): string {
  const p = (err as { payload?: { Message?: unknown; Messages?: unknown } })
    ?.payload;
  const parts: string[] = [];
  if (typeof p?.Message === "string") parts.push(p.Message);
  if (Array.isArray(p?.Messages)) parts.push(...p.Messages.map((m) => String(m)));
  return parts.join(" ").toLowerCase();
}

interface TestPayload {
  companyId?: string;
  date?: string;
  fromTime?: string;
  toTime?: string;
  /** Profissional a usar; se ausente, pega o primeiro retornado pela Clinicorp. */
  dentistPersonId?: string;
}

export async function POST(req: NextRequest) {
  const { user, profile, role } = await getAuthSession();
  if (!user || !profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: TestPayload = {};
  try {
    body = (await req.json()) as TestPayload;
  } catch {
    // body opcional
  }

  const companyId = body.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const isOwnAdmin = role === "admin" && profile.company_id === companyId;
  const isSuperAdmin = role === "super_admin";
  if (!isOwnAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const config = await resolveClinicorpConfig(companyId);
  if (!config) {
    return NextResponse.json(
      { error: "Integração Clinicorp não configurada ou desativada." },
      { status: 409 }
    );
  }
  if (!config.clinicBusinessId) {
    return NextResponse.json(
      {
        error:
          "Selecione a clínica (Clinic_BusinessId) e salve antes de testar o agendamento.",
      },
      { status: 409 }
    );
  }

  // A Clinicorp exige Profissional OU Cadeira no create. Para o teste, usamos
  // um Dentist_PersonId informado ou o primeiro profissional retornado pela
  // conta. Sem nenhum profissional, nao ha como criar — orientamos o admin.
  let dentistPersonId = body.dentistPersonId?.trim() || null;
  let professionalsCount = 0;
  if (!dentistPersonId) {
    try {
      const { professionals } = await clinicorp.listProfessionals(config.creds);
      professionalsCount = professionals.length;
      dentistPersonId = professionals[0]?.id ?? null;
    } catch {
      // tratado abaixo
    }
  }
  if (!dentistPersonId) {
    return NextResponse.json(
      {
        error:
          "A Clinicorp exige um profissional (ou cadeira) para criar o agendamento, e nenhum profissional foi encontrado na conta. Cadastre um profissional na Clinicorp e tente novamente.",
      },
      { status: 409 }
    );
  }

  // Horarios candidatos: se o admin informou um horario, usamos so ele; senao
  // tentamos varios (data distante) e paramos no primeiro LIVRE. O erro
  // "ocupado" faz tentar o proximo; qualquer outro erro para e e reportado.
  const explicit =
    body.date?.trim() && body.fromTime?.trim()
      ? [
          {
            date: body.date.trim(),
            fromTime: body.fromTime.trim(),
            toTime:
              body.toTime?.trim() || addMinutesToHHMM(body.fromTime.trim(), 30),
          },
        ]
      : null;

  const baseDate = futureDateYmd(90);
  const candidates =
    explicit ??
    ["09:30", "10:30", "11:30", "14:30", "15:30", "16:30", "17:00", "09:00"].map(
      (t) => ({ date: baseDate, fromTime: t, toTime: addMinutesToHHMM(t, 30) })
    );

  // Nome UNICO por execucao: a Clinicorp deduplica por nome de paciente
  // (retorna `PatientNameAlreadyExists` em vez de criar). Um nome unico evita
  // a dedupe e garante uma resposta de criacao limpa (com id, quando houver).
  const testPatientName = `TESTE CRM ${Date.now()} - PODE EXCLUIR`;
  const common = {
    Clinic_BusinessId: config.clinicBusinessId,
    Dentist_PersonId: dentistPersonId,
    PatientName: testPatientName,
    MobilePhone: TEST_PHONE,
    Notes:
      "Agendamento de teste criado pelo CRM para validar a integração. Pode ser cancelado/excluído.",
  };

  let sentBody: Record<string, unknown> | null = null;
  let created: unknown = null;
  let createdId: string | null = null;
  const occupiedSlots: string[] = [];

  for (const slot of candidates) {
    const attempt = {
      ...common,
      date: slot.date,
      fromTime: slot.fromTime,
      toTime: slot.toTime,
    };
    try {
      const { data } = await clinicorp.createAppointmentByApi(
        config.creds,
        attempt
      );
      sentBody = attempt;
      created = data;
      createdId = extractClinicorpAppointmentId(data);
      break;
    } catch (err) {
      if (clinicorpErrorText(err).includes("ocupad")) {
        occupiedSlots.push(`${slot.date} ${slot.fromTime}`);
        continue;
      }
      const f = friendlyClinicorpError(err, "create_appointment");
      return NextResponse.json(
        {
          ok: false,
          stage: "create",
          error: f.message,
          sentBody: attempt,
          raw: (err as { payload?: unknown })?.payload ?? null,
        },
        { status: f.status }
      );
    }
  }

  if (!sentBody) {
    return NextResponse.json(
      {
        ok: false,
        stage: "create",
        error:
          "Todos os horários de teste estavam ocupados na agenda da Clinicorp. Rode novamente ou informe um horário livre manualmente.",
        occupiedSlots,
      },
      { status: 409 }
    );
  }

  // Cancela imediatamente para nao deixar lixo na agenda real.
  let cancelled: unknown = null;
  let cancelError: string | null = null;
  if (createdId) {
    try {
      const { data } = await clinicorp.cancelAppointment(
        config.creds,
        createdId
      );
      cancelled = data;
    } catch (err) {
      cancelError = friendlyClinicorpError(err, "cancel_appointment").message;
    }
  }

  const firstResult = (Array.isArray(created) ? created[0] : null) as Record<
    string,
    unknown
  > | null;
  const patientDup = firstResult?.PatientNameAlreadyExists === true;

  let warning: string | null = null;
  if (patientDup) {
    warning =
      "A Clinicorp identificou um paciente com este nome e não retornou um id. No fluxo real resolveremos o paciente (Patient_PersonId) antes de agendar para evitar isso.";
  } else if (!createdId) {
    warning =
      "A criação foi aceita, mas a API não retornou um id reconhecível — então não foi possível cancelar automaticamente. Confira a resposta bruta abaixo (precisamos do nome do campo de id) e verifique se um agendamento de teste ficou na agenda.";
  } else if (cancelError) {
    warning = `O teste criou o agendamento (id ${createdId}), mas o cancelamento automático falhou: ${cancelError}. Remova-o manualmente na Clinicorp.`;
  }

  return NextResponse.json({
    ok: true,
    professionalsCount,
    occupiedSlots,
    sentBody,
    created,
    createdId,
    cancelled,
    cancelError,
    warning,
  });
}
