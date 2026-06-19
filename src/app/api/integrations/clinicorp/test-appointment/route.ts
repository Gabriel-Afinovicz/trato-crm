import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession } from "@/lib/supabase/cached-data";
import {
  clinicorp,
  extractClinicorpAppointmentId,
  clinicorpErrorText,
  isMissingResourceError,
  CHAIR_FIELD_CANDIDATES,
} from "@/lib/clinicorp/client";
import { friendlyClinicorpError } from "@/lib/clinicorp/friendly-error";
import { resolveClinicorpConfig } from "@/lib/integrations/clinicorp-service";

/**
 * TESTE SEGURO de agendamento na Clinicorp (validacao em conta real).
 *
 * Cria um agendamento de teste (nome unico, data distante) e o CANCELA em
 * seguida — para nao poluir a agenda real. Suporta dois modos:
 *  - "professional": usa um Dentist_PersonId (informado ou o primeiro da conta).
 *  - "chair": usa uma cadeira (informada ou a primeira) e DESCOBRE o nome do
 *    campo correto de cadeira testando os candidatos ate um ser aceito.
 *
 * Devolve as respostas BRUTAS para confirmar o comportamento da API. So admin.
 * Body: { companyId, mode?, dentistPersonId?, chairId?, date?, fromTime?, toTime? }
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

interface TestPayload {
  companyId?: string;
  mode?: "professional" | "chair";
  dentistPersonId?: string;
  chairId?: string;
  date?: string;
  fromTime?: string;
  toTime?: string;
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

  const mode = body.mode === "chair" ? "chair" : "professional";

  // Resolve o recurso (profissional ou cadeira) e monta as tentativas. Para
  // cadeira, cada candidato de nome de campo vira uma tentativa (descoberta).
  const resourceAttempts: { label: string; patch: Record<string, string> }[] =
    [];
  let professionalsCount = 0;
  let chairsCount = 0;

  if (mode === "chair") {
    let chairId = body.chairId?.trim() || null;
    if (!chairId) {
      try {
        const { chairs } = await clinicorp.listChairs(config.creds);
        chairsCount = chairs.length;
        chairId = chairs[0]?.id ?? null;
      } catch {
        // tratado abaixo
      }
    }
    if (!chairId) {
      return NextResponse.json(
        {
          error:
            "Nenhuma cadeira encontrada na Clinicorp para testar. Cadastre uma cadeira/sala na Clinicorp e tente novamente.",
        },
        { status: 409 }
      );
    }
    for (const field of CHAIR_FIELD_CANDIDATES) {
      resourceAttempts.push({ label: field, patch: { [field]: chairId } });
    }
  } else {
    let dentistPersonId = body.dentistPersonId?.trim() || null;
    if (!dentistPersonId) {
      try {
        const { professionals } = await clinicorp.listProfessionals(
          config.creds
        );
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
            "A Clinicorp exige um profissional (ou cadeira) para criar o agendamento, e nenhum profissional foi encontrado na conta.",
        },
        { status: 409 }
      );
    }
    resourceAttempts.push({
      label: "Dentist_PersonId",
      patch: { Dentist_PersonId: dentistPersonId },
    });
  }

  // Horarios candidatos: se o admin informou um horario, usamos so ele; senao
  // tentamos varios (data distante) e paramos no primeiro LIVRE.
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
  const slots =
    explicit ??
    ["09:30", "10:30", "11:30", "14:30", "15:30", "16:30", "17:00", "09:00"].map(
      (t) => ({ date: baseDate, fromTime: t, toTime: addMinutesToHHMM(t, 30) })
    );

  // Nome UNICO por execucao: a Clinicorp deduplica por nome de paciente.
  const testPatientName = `TESTE CRM ${Date.now()} - PODE EXCLUIR`;
  const common = {
    Clinic_BusinessId: config.clinicBusinessId,
    PatientName: testPatientName,
    MobilePhone: TEST_PHONE,
    Notes:
      "Agendamento de teste criado pelo CRM para validar a integração. Pode ser cancelado/excluído.",
  };

  let sentBody: Record<string, unknown> | null = null;
  let created: unknown = null;
  let createdId: string | null = null;
  let usedResourceField: string | null = null;
  const occupiedSlots: string[] = [];

  outer: for (const resource of resourceAttempts) {
    for (const slot of slots) {
      const attempt = {
        ...common,
        ...resource.patch,
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
        usedResourceField = resource.label;
        break outer;
      } catch (err) {
        // Campo de cadeira nao reconhecido: tenta o proximo candidato.
        if (mode === "chair" && isMissingResourceError(err)) {
          break;
        }
        if (clinicorpErrorText(err).includes("ocupad")) {
          occupiedSlots.push(`${slot.date} ${slot.fromTime}`);
          continue;
        }
        const f = friendlyClinicorpError(err, "create_appointment");
        return NextResponse.json(
          {
            ok: false,
            stage: "create",
            mode,
            error: f.message,
            sentBody: attempt,
            raw: (err as { payload?: unknown })?.payload ?? null,
          },
          { status: f.status }
        );
      }
    }
  }

  if (!sentBody) {
    return NextResponse.json(
      {
        ok: false,
        stage: "create",
        mode,
        error:
          mode === "chair"
            ? "Não foi possível criar por cadeira: nenhum nome de campo de cadeira foi aceito (ou todos os horários estavam ocupados). Confira as cadeiras cadastradas."
            : "Todos os horários de teste estavam ocupados. Rode novamente ou informe um horário livre manualmente.",
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
      "A Clinicorp identificou um paciente com este nome e não retornou um id. No fluxo real resolvemos o paciente (Patient_PersonId) antes de agendar.";
  } else if (!createdId) {
    warning =
      "A criação foi aceita, mas a API não retornou um id reconhecível — não foi possível cancelar automaticamente. Verifique se ficou um agendamento de teste na agenda.";
  } else if (cancelError) {
    warning = `O teste criou o agendamento (id ${createdId}), mas o cancelamento automático falhou: ${cancelError}. Remova-o manualmente na Clinicorp.`;
  }

  return NextResponse.json({
    ok: true,
    mode,
    professionalsCount,
    chairsCount,
    usedResourceField,
    occupiedSlots,
    sentBody,
    created,
    createdId,
    cancelled,
    cancelError,
    warning,
  });
}
