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
  clinicorpErrorInfo,
  clinicorpErrorText,
  extractClinicorpAppointmentId,
  extractClinicorpPatientId,
  isMissingResourceError,
  CHAIR_FIELD_CANDIDATES,
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

export type SchedulingMode = "professional" | "chair";

export interface ResolvedClinicorpConfig {
  creds: ClinicorpCredentials;
  integrationId: string;
  /** Clinic_BusinessId escolhido para agendamentos (config.clinic_business_id). */
  clinicBusinessId: string | null;
  /** Como agendar: por profissional (padrao) ou por cadeira/sala. */
  schedulingMode: SchedulingMode;
  /** Mapa dentista do CRM (userId) -> Dentist_PersonId da Clinicorp. */
  dentistMap: Record<string, string>;
  /** Profissional padrao usado quando o agendamento nao tem dentista mapeado. */
  defaultDentistPersonId: string | null;
  /** Mapa sala do CRM (roomId) -> id da cadeira na Clinicorp. */
  roomChairMap: Record<string, string>;
  /** Cadeira padrao usada quando a sala do agendamento nao esta mapeada. */
  defaultChairId: string | null;
  /** Mapa servico do CRM (procedure_type_id) -> id do procedimento na Clinicorp. */
  procedureMap: Record<string, string>;
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

  const schedulingMode: SchedulingMode =
    cfg.scheduling_mode === "chair" ? "chair" : "professional";
  const roomChairMapRaw =
    cfg.room_chair_map && typeof cfg.room_chair_map === "object"
      ? (cfg.room_chair_map as Record<string, unknown>)
      : {};
  const roomChairMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(roomChairMapRaw)) {
    if (typeof v === "string" && v.trim()) roomChairMap[k] = v;
  }
  const defaultChairId =
    typeof cfg.default_chair_id === "string" && cfg.default_chair_id.trim()
      ? cfg.default_chair_id
      : null;
  const procedureMapRaw =
    cfg.procedure_map && typeof cfg.procedure_map === "object"
      ? (cfg.procedure_map as Record<string, unknown>)
      : {};
  const procedureMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(procedureMapRaw)) {
    if (typeof v === "string" && v.trim()) procedureMap[k] = v;
  }

  return {
    creds: {
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    },
    integrationId: data.id as string,
    clinicBusinessId,
    schedulingMode,
    dentistMap,
    defaultDentistPersonId,
    roomChairMap,
    defaultChairId,
    procedureMap,
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
    // Guarda o motivo BRUTO da recusa (Message/Messages da Clinicorp) no log,
    // para diagnosticar 400s sem depender de "recusou os dados" generico.
    errorResponse: (err: unknown) => {
      if (err instanceof SkipIntegration) return null;
      return clinicorpErrorInfo(err);
    },
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
  room_id: string | null;
  clinicorp_appointment_id: string | null;
  notes: string | null;
  procedure_type_id: string | null;
  procedure_name: string | null;
  procedure_clinicorp_id: string | null;
  /** Marcador do lead -> categoria de agendamento Clinicorp (descricao+cor). */
  category_description: string | null;
  category_color: string | null;
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
      "id, starts_at, ends_at, dentist_id, room_id, clinicorp_appointment_id, notes, procedure_type_id, leads(name, phone, lead_tags(tags(name, color, clinicorp_category_id))), procedure_types:procedure_type_id(name, clinicorp_procedure_id)"
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
    | { name?: string; phone?: string | null; lead_tags?: unknown }
    | null;
  const procRaw = (data as { procedure_types?: unknown }).procedure_types;
  const proc = (Array.isArray(procRaw) ? procRaw[0] : procRaw) as
    | { name?: string; clinicorp_procedure_id?: string | null }
    | null;

  // Marcador -> categoria Clinicorp: usa a primeira tag do lead que foi
  // importada de uma categoria (tem clinicorp_category_id). A API de criacao
  // casa a categoria por descricao+cor, entao enviamos nome+cor da tag.
  let categoryDescription: string | null = null;
  let categoryColor: string | null = null;
  const leadTagsRaw = (lead as { lead_tags?: unknown } | null)?.lead_tags;
  const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : [];
  for (const lt of leadTags) {
    const tagRaw = (lt as { tags?: unknown })?.tags;
    const tag = (Array.isArray(tagRaw) ? tagRaw[0] : tagRaw) as
      | {
          name?: string;
          color?: string | null;
          clinicorp_category_id?: string | null;
        }
      | null;
    if (tag?.clinicorp_category_id && tag.name && tag.color) {
      categoryDescription = tag.name;
      categoryColor = tag.color;
      break;
    }
  }

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
      room_id: (data.room_id as string | null) ?? null,
      clinicorp_appointment_id:
        (data.clinicorp_appointment_id as string | null) ?? null,
      notes: (data.notes as string | null) ?? null,
      procedure_type_id: (data.procedure_type_id as string | null) ?? null,
      procedure_name: proc?.name ?? null,
      procedure_clinicorp_id: proc?.clinicorp_procedure_id ?? null,
      category_description: categoryDescription,
      category_color: categoryColor,
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
    .update({
      clinicorp_appointment_id: clinicorpId,
      clinicorp_sync_status: clinicorpId ? "synced" : null,
    })
    .eq("id", appointmentId);
}

/** Atualiza apenas o status de sincronizacao (feedback visual na agenda). */
async function setAppointmentSyncStatus(
  appointmentId: string,
  status: "pending" | "synced" | "failed"
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("appointments")
    .update({ clinicorp_sync_status: status })
    .eq("id", appointmentId);
}

/**
 * Resolve as "tentativas de recurso" (campos Profissional OU Cadeira a enviar):
 *  - profissional: 1 tentativa com Dentist_PersonId (mapeado ou padrao).
 *  - cadeira: varias tentativas, uma por nome candidato de campo de cadeira
 *    (o nome correto e descoberto na 1a vez que a Clinicorp aceitar).
 * Lanca SkipIntegration quando nao ha recurso configurado.
 */
function resolveResourcePatches(
  config: ResolvedClinicorpConfig,
  appt: AppointmentForSync
): Record<string, string>[] {
  if (config.schedulingMode === "chair") {
    const chairId =
      (appt.room_id ? config.roomChairMap[appt.room_id] : null) ??
      config.defaultChairId;
    if (!chairId) {
      throw new SkipIntegration(
        "Agendamento por cadeira sem cadeira mapeada e sem cadeira padrão configurada em Configurações > Clinicorp."
      );
    }
    return CHAIR_FIELD_CANDIDATES.map((field) => ({ [field]: chairId }));
  }

  const dentistPersonId =
    (appt.dentist_id ? config.dentistMap[appt.dentist_id] : null) ??
    config.defaultDentistPersonId;
  if (!dentistPersonId) {
    throw new SkipIntegration(
      "Agendamento sem profissional mapeado e sem profissional padrão configurado em Configurações > Clinicorp."
    );
  }
  return [{ Dentist_PersonId: dentistPersonId }];
}

interface CreateOnClinicorpResult {
  id: string;
  /** true quando o agendamento foi criado SEM os extras (procedimento/categoria). */
  extrasDropped: boolean;
  /** Motivo bruto da recusa dos extras (quando descartados). */
  extrasError: string | null;
}

/**
 * Cria o agendamento na Clinicorp resolvendo recurso (profissional ou cadeira)
 * e paciente (por telefone/nome, para evitar a dedupe por nome).
 *
 * Extras resilientes: se a Clinicorp recusar a criacao (4xx) com os extras
 * (procedimento e/ou categoria) no payload, recriamos SEM eles. O agendamento
 * aparecer na agenda (na coluna do profissional) e prioridade; o motivo da
 * recusa fica registrado em integration_logs.
 *
 * Lanca SkipIntegration quando falta configuracao.
 */
async function createOnClinicorp(
  config: ResolvedClinicorpConfig,
  appt: AppointmentForSync,
  timezone: string
): Promise<CreateOnClinicorpResult> {
  if (!config.clinicBusinessId) {
    throw new SkipIntegration("Clínica (Clinic_BusinessId) não configurada.");
  }

  const resourcePatches = resolveResourcePatches(config, appt);

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

  const baseFields: Record<string, string> = {
    Clinic_BusinessId: config.clinicBusinessId,
    PatientName: appt.lead_name,
    MobilePhone: phoneDigits,
    date: times.date,
    fromTime: times.fromTime,
    toTime: times.toTime,
    // Observacao real do agendamento do CRM; cai no texto padrao se vazia.
    Notes:
      appt.notes && appt.notes.trim()
        ? appt.notes.trim()
        : "Agendado pelo CRM.",
  };
  if (patientPersonId) baseFields.Patient_PersonId = patientPersonId;

  // Procedimento (Servico) do CRM -> Clinicorp: enviado SOMENTE quando houver
  // um procedimento da Clinicorp mapeado para o servico do CRM (pelo ID).
  // Vinculo do procedimento: preferimos o id gravado no proprio Servico
  // (importado da Clinicorp); senao caimos no mapa manual da config.
  // Procedimento: a Clinicorp espera `Procedures` (STRING) com o NOME do
  // procedimento — ela cria o SelectedProceduresList casando pela descricao.
  // Enviar o id (ou um array) NAO anexa nada. Confirmado em conta real. Como
  // o Servico do CRM e importado da Clinicorp, o nome casa direto.
  // Marcador: categoria de agendamento via CategoryDescription + CategoryColor
  // (casa por uma categoria ja cadastrada na Clinicorp).
  const extra: Record<string, unknown> = {};
  const procedureName = appt.procedure_name?.trim() || null;
  if (procedureName) extra.Procedures = procedureName;
  if (appt.category_description && appt.category_color) {
    extra.CategoryDescription = appt.category_description;
    extra.CategoryColor = appt.category_color;
  }

  // Uma tentativa completa de criacao com o conjunto de campos `extra`
  // informado (com OU sem procedimento). Cobre o modo cadeira (varre os
  // nomes de campo candidatos) e a dedupe de paciente por nome.
  async function attempt(extra: Record<string, unknown>): Promise<string> {
    let lastError: unknown = null;
    for (const patch of resourcePatches) {
      try {
        let { data } = await clinicorp.createAppointmentByApi(config.creds, {
          ...baseFields,
          ...patch,
          ...extra,
        });
        let id = extractClinicorpAppointmentId(data);

        // Dedupe por nome: resolve o PatientId por nome e tenta de novo.
        // (Seguro porque PatientNameAlreadyExists garante que NADA foi criado.)
        const dup =
          (data?.[0] as Record<string, unknown> | undefined)
            ?.PatientNameAlreadyExists === true;
        if (!id && dup && !patientPersonId) {
          let resolved: string | null = null;
          try {
            const { data: pd } = await clinicorp.getPatient(config.creds, {
              name: appt.lead_name,
            });
            resolved = extractClinicorpPatientId(pd);
          } catch {
            // best-effort
          }
          if (resolved) {
            const retry = await clinicorp.createAppointmentByApi(config.creds, {
              ...baseFields,
              Patient_PersonId: resolved,
              ...patch,
              ...extra,
            });
            data = retry.data;
            id = extractClinicorpAppointmentId(data);
          }
        }

        if (id) return id;
        throw new Error(
          "A Clinicorp aceitou a requisição mas não retornou o id do agendamento."
        );
      } catch (err) {
        // Modo cadeira: nome de campo nao reconhecido -> proximo candidato.
        if (config.schedulingMode === "chair" && isMissingResourceError(err)) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw (
      lastError ??
      new Error("Não foi possível criar o agendamento na Clinicorp.")
    );
  }

  const hasExtra = Object.keys(extra).length > 0;

  try {
    const id = await attempt(extra);
    return { id, extrasDropped: false, extrasError: null };
  } catch (err) {
    // Extras (procedimento/categoria) + recusa 4xx => recria SEM eles para o
    // agendamento ao menos aparecer na agenda, registrando o motivo.
    const status = (err as { status?: number })?.status ?? 0;
    if (hasExtra && status >= 400 && status < 500) {
      const extrasError =
        clinicorpErrorText(err) ||
        (err instanceof Error ? err.message : String(err));
      console.warn(
        "[clinicorp-service] extras (procedimento/categoria) recusados; recriando sem eles",
        { status, extrasError }
      );
      const id = await attempt({});
      return { id, extrasDropped: true, extrasError };
    }
    throw err;
  }
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
      // "pending" para o card da agenda mostrar "Sincronizando…".
      await setAppointmentSyncStatus(appointmentId, "pending");
      try {
        const { id, extrasDropped, extrasError } = await createOnClinicorp(
          config,
          loaded.appt,
          loaded.timezone
        );
        await saveClinicorpAppointmentId(appointmentId, id);
        return {
          response: {
            clinicorp_appointment_id: id,
            extras_dropped: extrasDropped,
            extras_error: extrasError,
          },
        };
      } catch (err) {
        // "failed" para o card mostrar o estado de falha; relanca para o
        // runner registrar o motivo em integration_logs.
        await setAppointmentSyncStatus(appointmentId, "failed");
        throw err;
      }
    },
    // Sem retry no create: a chamada e lenta e, apos um timeout, re-tentar
    // duplica o agendamento (a Clinicorp cria mesmo quando o cliente aborta).
    { ...runnerOptions("create_appointment"), maxAttempts: 1 }
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
      await setAppointmentSyncStatus(appointmentId, "pending");
      try {
        const { id, extrasDropped, extrasError } = await createOnClinicorp(
          config,
          loaded.appt,
          loaded.timezone
        );
        await saveClinicorpAppointmentId(appointmentId, id);
        return {
          response: {
            rescheduled_to: id,
            extras_dropped: extrasDropped,
            extras_error: extrasError,
          },
        };
      } catch (err) {
        await setAppointmentSyncStatus(appointmentId, "failed");
        throw err;
      }
    },
    // Sem retry no create: a chamada e lenta e, apos um timeout, re-tentar
    // duplica o agendamento (a Clinicorp cria mesmo quando o cliente aborta).
    { ...runnerOptions("create_appointment"), maxAttempts: 1 }
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
