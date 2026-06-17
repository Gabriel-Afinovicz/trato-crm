/**
 * Orquestrador da integracao Clinicorp.
 *
 * Conecta os dados do CRM (lead + fonte + config da empresa) ao cliente
 * HTTP da Clinicorp. Roda SEMPRE server-side e usa o admin client
 * (service_role) porque executa em background, fora do contexto de sessao
 * RLS do usuario.
 *
 * Pontos de entrada:
 *  - `syncLeadCreated`: dispara POST /crm/add_leads quando um lead e criado.
 *  - `syncLeadWon`:    dispara POST /patient/create quando o lead vira ganho.
 *
 * Ambos sao chamados via `runIntegrationInBackground` (fire-and-forget).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clinicorp,
  extractClinicorpAppointmentId,
  extractClinicorpPatientId,
} from "@/lib/clinicorp/client";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";
import {
  buildClinicorpAppointmentTimes,
  DEFAULT_CLINIC_TIMEZONE,
} from "@/lib/clinicorp/datetime";
import {
  friendlyClinicorpError,
  type ClinicorpAction,
} from "@/lib/clinicorp/friendly-error";
import {
  runIntegrationInBackground,
  type ActionResult,
} from "./runner";

const PROVIDER = "clinicorp";

export interface ResolvedClinicorpConfig {
  creds: ClinicorpCredentials;
  integrationId: string;
  /** Clinic_BusinessId escolhido para agendamentos (config.clinic_business_id). */
  clinicBusinessId: string | null;
  /** Mapa dentista do CRM (userId) -> Dentist_PersonId da Clinicorp. */
  dentistMap: Record<string, string>;
  /** Profissional padrao usado quando o agendamento nao tem dentista mapeado. */
  defaultDentistPersonId: string | null;
}

interface LeadForSync {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source_id: string | null;
  source_name: string | null;
  board_name: string | null;
}

/** Erro sinalizando que nao ha o que enviar (config ausente, fonte sem board). */
class SkipIntegration extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipIntegration";
  }
}

/**
 * Carrega a integracao ativa da empresa. Retorna null quando nao existe ou
 * esta desabilitada — nesse caso simplesmente nao fazemos nada.
 */
export async function resolveClinicorpConfig(
  companyId: string
): Promise<ResolvedClinicorpConfig | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_integrations")
    .select("id, credentials, config, status")
    .eq("company_id", companyId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) {
    console.error("[clinicorp-service] erro ao ler company_integrations", error);
    return null;
  }
  if (!data || data.status === "disabled") return null;

  const creds = (data.credentials ?? {}) as Partial<ClinicorpCredentials>;
  if (!creds.username || !creds.token || !creds.subscriber_id) {
    return null;
  }

  const cfg = (data.config ?? {}) as Record<string, unknown>;
  const clinicBusinessId =
    typeof cfg.clinic_business_id === "string" && cfg.clinic_business_id.trim()
      ? cfg.clinic_business_id
      : null;
  const dentistMapRaw =
    cfg.dentist_map && typeof cfg.dentist_map === "object"
      ? (cfg.dentist_map as Record<string, unknown>)
      : {};
  const dentistMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(dentistMapRaw)) {
    if (typeof v === "string" && v.trim()) dentistMap[k] = v;
  }
  const defaultDentistPersonId =
    typeof cfg.default_dentist_person_id === "string" &&
    cfg.default_dentist_person_id.trim()
      ? cfg.default_dentist_person_id
      : null;

  return {
    creds: {
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    },
    integrationId: data.id as string,
    clinicBusinessId,
    dentistMap,
    defaultDentistPersonId,
  };
}

async function loadLead(
  companyId: string,
  leadId: string
): Promise<LeadForSync | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .select(
      "id, name, email, phone, notes, source_id, lead_sources(name, clinicorp_board_name)"
    )
    .eq("id", leadId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[clinicorp-service] erro ao carregar lead", error);
    return null;
  }

  // O join de lead_sources pode vir como objeto ou array conforme o client.
  const sourceRaw = (data as { lead_sources?: unknown }).lead_sources;
  const source = Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw;
  const sourceObj = (source ?? null) as
    | { name?: string; clinicorp_board_name?: string | null }
    | null;

  return {
    id: data.id as string,
    name: (data.name as string) ?? "",
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    source_id: (data.source_id as string | null) ?? null,
    source_name: sourceObj?.name ?? null,
    board_name: sourceObj?.clinicorp_board_name ?? null,
  };
}

/** Marca a integracao como erro (credenciais invalidas, etc.). */
async function markIntegrationError(
  integrationId: string,
  message: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("company_integrations")
      .update({ status: "error", last_error: message, last_check_at: new Date().toISOString() })
      .eq("id", integrationId);
  } catch (err) {
    console.error("[clinicorp-service] falha ao marcar erro na integracao", err);
  }
}

function buildNotes(lead: LeadForSync): string {
  const base = (lead.notes ?? "").trim();
  const context = `Origem: CRM · Fonte: ${lead.source_name ?? "não informada"}`;
  return base ? `${base}\n\n${context}` : context;
}

/**
 * Opcoes comuns de retry/erro repassadas ao runner para todas as acoes
 * Clinicorp. O efeito colateral de marcar a integracao como "error" quando
 * as credenciais sao invalidas e feito dentro do `fn` de cada acao (que tem
 * acesso ao integrationId resolvido).
 */
function runnerOptions(action: ClinicorpAction): import("./runner").RunnerOptions {
  return {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    isPermanent: (err: unknown) => {
      if (err instanceof SkipIntegration) return true;
      return friendlyClinicorpError(err, action).permanent;
    },
    friendlyMessage: (err: unknown) => {
      if (err instanceof SkipIntegration) return err.message;
      return friendlyClinicorpError(err, action).message;
    },
    httpStatusFromError: (err: unknown) =>
      (err as { status?: number })?.status ?? null,
  };
}

/**
 * Envia o lead recem-criado para a campanha Clinicorp mapeada pela fonte.
 * Fire-and-forget: nunca lanca para o chamador.
 */
export function syncLeadCreated(companyId: string, leadId: string): void {
  runIntegrationInBackground(
    {
      companyId,
      provider: PROVIDER,
      action: "add_leads",
      leadId,
    },
    async (): Promise<ActionResult> => {
      const config = await resolveClinicorpConfig(companyId);
      if (!config) throw new SkipIntegration("Integração Clinicorp inativa ou não configurada.");

      const lead = await loadLead(companyId, leadId);
      if (!lead) throw new SkipIntegration("Lead não encontrado para sincronização.");

      if (!lead.board_name) {
        throw new SkipIntegration(
          `Fonte "${lead.source_name ?? "sem fonte"}" não tem campanha Clinicorp mapeada. Lead não enviado.`
        );
      }

      try {
        const { data, httpStatus } = await clinicorp.addLead(config.creds, {
          Name: lead.name,
          Email: lead.email ?? "",
          Phone: lead.phone ?? "",
          BoardName: lead.board_name,
          Notes: buildNotes(lead),
        });
        return {
          response: data as Record<string, unknown>,
          httpStatus,
        };
      } catch (err) {
        if (friendlyClinicorpError(err, "add_leads").code === "unauthorized") {
          await markIntegrationError(
            config.integrationId,
            friendlyClinicorpError(err, "add_leads").message
          );
        }
        throw err;
      }
    },
    runnerOptions("add_leads")
  );
}

/**
 * Cria o paciente na Clinicorp quando o lead chega numa etapa is_won.
 * Fire-and-forget.
 */
export function syncLeadWon(companyId: string, leadId: string): void {
  runIntegrationInBackground(
    {
      companyId,
      provider: PROVIDER,
      action: "create_patient",
      leadId,
    },
    async (): Promise<ActionResult> => {
      const config = await resolveClinicorpConfig(companyId);
      if (!config) throw new SkipIntegration("Integração Clinicorp inativa ou não configurada.");

      const lead = await loadLead(companyId, leadId);
      if (!lead) throw new SkipIntegration("Lead não encontrado para conversão.");

      try {
        const { data, httpStatus } = await clinicorp.createPatient(config.creds, {
          Name: lead.name,
          Email: lead.email ?? undefined,
          Phone: lead.phone ?? undefined,
          Notes: buildNotes(lead),
        });
        return {
          response: data as Record<string, unknown>,
          httpStatus,
        };
      } catch (err) {
        if (friendlyClinicorpError(err, "create_patient").code === "unauthorized") {
          await markIntegrationError(
            config.integrationId,
            friendlyClinicorpError(err, "create_patient").message
          );
        }
        throw err;
      }
    },
    runnerOptions("create_patient")
  );
}

// ---------------------------------------------------------------------------
// Agendamento CRM -> agenda Clinicorp (Parte C)
// ---------------------------------------------------------------------------

interface AppointmentForSync {
  id: string;
  starts_at: string;
  ends_at: string;
  dentist_id: string | null;
  clinicorp_appointment_id: string | null;
  lead_name: string;
  lead_phone: string | null;
}

async function loadAppointmentForSync(
  companyId: string,
  appointmentId: string
): Promise<{ appt: AppointmentForSync; timezone: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .select(
      "id, starts_at, ends_at, dentist_id, clinicorp_appointment_id, leads(name, phone)"
    )
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[clinicorp-service] erro ao carregar agendamento", error);
    return null;
  }

  const leadRaw = (data as { leads?: unknown }).leads;
  const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as
    | { name?: string; phone?: string | null }
    | null;

  const { data: companyRow } = await admin
    .from("companies")
    .select("timezone")
    .eq("id", companyId)
    .maybeSingle();
  const timezone =
    (companyRow?.timezone as string | null | undefined) || DEFAULT_CLINIC_TIMEZONE;

  return {
    appt: {
      id: data.id as string,
      starts_at: data.starts_at as string,
      ends_at: data.ends_at as string,
      dentist_id: (data.dentist_id as string | null) ?? null,
      clinicorp_appointment_id:
        (data.clinicorp_appointment_id as string | null) ?? null,
      lead_name: lead?.name ?? "Paciente",
      lead_phone: lead?.phone ?? null,
    },
    timezone,
  };
}

async function saveClinicorpAppointmentId(
  appointmentId: string,
  clinicorpId: string | null
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("appointments")
    .update({ clinicorp_appointment_id: clinicorpId })
    .eq("id", appointmentId);
}

/**
 * Cria o agendamento na Clinicorp resolvendo profissional (mapeado ou padrao)
 * e paciente (por telefone/nome, para evitar a dedupe por nome). Retorna o id
 * do agendamento criado. Lanca SkipIntegration quando falta configuracao.
 */
async function createOnClinicorp(
  config: ResolvedClinicorpConfig,
  appt: AppointmentForSync,
  timezone: string
): Promise<string> {
  if (!config.clinicBusinessId) {
    throw new SkipIntegration("Clínica (Clinic_BusinessId) não configurada.");
  }
  const dentistPersonId =
    (appt.dentist_id ? config.dentistMap[appt.dentist_id] : null) ??
    config.defaultDentistPersonId;
  if (!dentistPersonId) {
    throw new SkipIntegration(
      "Agendamento sem profissional mapeado e sem profissional padrão configurado em Configurações > Clinicorp."
    );
  }

  const times = buildClinicorpAppointmentTimes(
    appt.starts_at,
    appt.ends_at,
    timezone
  );
  const phoneDigits = (appt.lead_phone ?? "").replace(/\D/g, "");

  // Resolve o paciente por telefone para enviar Patient_PersonId e evitar a
  // dedupe por nome (que impede a criacao quando o nome ja existe).
  let patientPersonId: string | null = null;
  if (phoneDigits) {
    try {
      const { data } = await clinicorp.getPatient(config.creds, {
        phone: phoneDigits,
      });
      patientPersonId = extractClinicorpPatientId(data);
    } catch {
      // best-effort
    }
  }

  const base = {
    Clinic_BusinessId: config.clinicBusinessId,
    Dentist_PersonId: dentistPersonId,
    PatientName: appt.lead_name,
    MobilePhone: phoneDigits,
    date: times.date,
    fromTime: times.fromTime,
    toTime: times.toTime,
    Notes: "Agendado pelo CRM.",
  };

  const firstBody = patientPersonId
    ? { ...base, Patient_PersonId: patientPersonId }
    : base;
  let { data } = await clinicorp.createAppointmentByApi(config.creds, firstBody);
  let id = extractClinicorpAppointmentId(data);

  // Dedupe por nome: resolve o PatientId por nome e tenta de novo com
  // Patient_PersonId (autoritativo).
  const dup =
    (data?.[0] as Record<string, unknown> | undefined)
      ?.PatientNameAlreadyExists === true;
  if (!id && dup && !patientPersonId) {
    try {
      const { data: pd } = await clinicorp.getPatient(config.creds, {
        name: appt.lead_name,
      });
      patientPersonId = extractClinicorpPatientId(pd);
    } catch {
      // best-effort
    }
    if (patientPersonId) {
      const retry = await clinicorp.createAppointmentByApi(config.creds, {
        ...base,
        Patient_PersonId: patientPersonId,
      });
      data = retry.data;
      id = extractClinicorpAppointmentId(data);
    }
  }

  if (!id) {
    throw new Error(
      "A Clinicorp aceitou a requisição mas não retornou o id do agendamento (possível paciente duplicado sem PatientId resolvido)."
    );
  }
  return id;
}

/** Cria o agendamento na Clinicorp e guarda o id local. Fire-and-forget. */
export function syncAppointmentCreated(
  companyId: string,
  appointmentId: string
): void {
  runIntegrationInBackground(
    { companyId, provider: PROVIDER, action: "create_appointment" },
    async (): Promise<ActionResult> => {
      const config = await resolveClinicorpConfig(companyId);
      if (!config) throw new SkipIntegration("Integração Clinicorp inativa.");
      if (!config.clinicBusinessId) {
        throw new SkipIntegration("Agenda Clinicorp não configurada (clínica).");
      }
      const loaded = await loadAppointmentForSync(companyId, appointmentId);
      if (!loaded) throw new SkipIntegration("Agendamento não encontrado.");
      if (loaded.appt.clinicorp_appointment_id) {
        return { response: { skipped: "already_synced" } };
      }
      const id = await createOnClinicorp(config, loaded.appt, loaded.timezone);
      await saveClinicorpAppointmentId(appointmentId, id);
      return { response: { clinicorp_appointment_id: id } };
    },
    runnerOptions("create_appointment")
  );
}

/** Remarcacao = cancelar o agendamento antigo na Clinicorp e criar um novo. */
export function syncAppointmentRescheduled(
  companyId: string,
  appointmentId: string
): void {
  runIntegrationInBackground(
    { companyId, provider: PROVIDER, action: "create_appointment" },
    async (): Promise<ActionResult> => {
      const config = await resolveClinicorpConfig(companyId);
      if (!config) throw new SkipIntegration("Integração Clinicorp inativa.");
      if (!config.clinicBusinessId) {
        throw new SkipIntegration("Agenda Clinicorp não configurada (clínica).");
      }
      const loaded = await loadAppointmentForSync(companyId, appointmentId);
      if (!loaded) throw new SkipIntegration("Agendamento não encontrado.");

      if (loaded.appt.clinicorp_appointment_id) {
        try {
          await clinicorp.cancelAppointment(
            config.creds,
            loaded.appt.clinicorp_appointment_id
          );
        } catch (err) {
          console.error(
            "[clinicorp-service] falha ao cancelar agendamento antigo na remarcação",
            err
          );
        }
      }
      const id = await createOnClinicorp(config, loaded.appt, loaded.timezone);
      await saveClinicorpAppointmentId(appointmentId, id);
      return { response: { rescheduled_to: id } };
    },
    runnerOptions("create_appointment")
  );
}

/**
 * Cancela na Clinicorp. Recebe o id da Clinicorp diretamente (o registro local
 * pode ja ter sido excluido). Fire-and-forget.
 */
export function syncAppointmentCancelled(
  companyId: string,
  clinicorpAppointmentId: string
): void {
  runIntegrationInBackground(
    { companyId, provider: PROVIDER, action: "cancel_appointment" },
    async (): Promise<ActionResult> => {
      const config = await resolveClinicorpConfig(companyId);
      if (!config) throw new SkipIntegration("Integração Clinicorp inativa.");
      const { data, httpStatus } = await clinicorp.cancelAppointment(
        config.creds,
        clinicorpAppointmentId
      );
      return { response: data as Record<string, unknown>, httpStatus };
    },
    runnerOptions("cancel_appointment")
  );
}
