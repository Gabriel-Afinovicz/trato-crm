/**
 * Cliente HTTP para a API Clinicorp (REST v1), server-only.
 *
 * Diferente do cliente Evolution (que usa env vars globais), aqui as
 * credenciais sao POR EMPRESA: cada chamada recebe `ClinicorpCredentials`
 * (usuario + token + subscriber_id) resolvidas de
 * `company_integrations.credentials`.
 *
 * Autenticacao: HTTP Basic — Authorization: Basic base64(usuario:token).
 *
 * O `request()` aplica timeout via AbortController e normaliza erros num
 * objeto Error com `.status` e `.payload`, no mesmo espirito do cliente
 * Evolution, para que `friendlyClinicorpError` consiga traduzi-los.
 */

import "server-only";
import type {
  ClinicorpAddLeadBody,
  ClinicorpBusiness,
  ClinicorpCampaign,
  ClinicorpCreateAppointmentBody,
  ClinicorpCreateAppointmentResult,
  ClinicorpCreatePatientBody,
  ClinicorpCredentials,
  ClinicorpGenericResponse,
  ClinicorpProfessional,
} from "./types";

const BASE_URL = "https://api.clinicorp.com/rest/v1";
const DEFAULT_TIMEOUT_MS = 5_000;

export class ClinicorpConfigError extends Error {
  constructor(message = "Integração Clinicorp não configurada") {
    super(message);
    this.name = "ClinicorpConfigError";
  }
}

export interface ClinicorpRequestError extends Error {
  status?: number;
  payload?: unknown;
}

function basicAuthHeader(creds: ClinicorpCredentials): string {
  const raw = `${creds.username}:${creds.token}`;
  // Base64 server-side (Node). btoa nao existe garantidamente em todos os
  // runtimes server, entao usamos Buffer.
  const encoded = Buffer.from(raw, "utf-8").toString("base64");
  return `Basic ${encoded}`;
}

function assertCreds(creds: Partial<ClinicorpCredentials> | null | undefined) {
  if (!creds || !creds.username || !creds.token || !creds.subscriber_id) {
    throw new ClinicorpConfigError(
      "Credenciais Clinicorp incompletas (usuário, token e subscriber_id são obrigatórios)."
    );
  }
}

async function request<T>(
  path: string,
  creds: ClinicorpCredentials,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ data: T; httpStatus: number }> {
  assertCreds(creds);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuthHeader(creds),
        ...((init.headers as Record<string, string>) ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!res.ok) {
      const message =
        (payload as { message?: string; error?: string } | null)?.message ??
        (payload as { error?: string } | null)?.error ??
        `Clinicorp API ${res.status}`;
      const err = new Error(`Clinicorp API: ${message}`) as ClinicorpRequestError;
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return { data: payload as T, httpStatus: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normaliza a resposta de list_active_campaigns para `ClinicorpCampaign[]`,
 * tolerando variacoes de formato (array direto, { campaigns: [] },
 * { data: [] }) e chaves de nome (`BoardName`, `Name`, `name`).
 */
function normalizeCampaigns(raw: unknown): ClinicorpCampaign[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { campaigns?: unknown[] })?.campaigns)
      ? ((raw as { campaigns: unknown[] }).campaigns)
      : Array.isArray((raw as { data?: unknown[] })?.data)
        ? ((raw as { data: unknown[] }).data)
        : [];

  return arr
    .map((item) => {
      if (typeof item === "string") return { name: item };
      const obj = (item ?? {}) as Record<string, unknown>;
      const name =
        (obj.BoardName as string) ??
        (obj.Name as string) ??
        (obj.name as string) ??
        (obj.campaign as string) ??
        "";
      const id =
        (obj.id as string) ??
        (obj.Id as string) ??
        (obj._id as string) ??
        null;
      return { name: String(name), id };
    })
    .filter((c) => c.name.trim().length > 0);
}

/** Extrai um array de respostas que podem vir como [], {data:[]} ou {items:[]}. */
function toArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  for (const key of ["data", "items", "list", "results"]) {
    const v = (raw as Record<string, unknown> | null)?.[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function firstString(
  obj: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** Normaliza GET /business/list -> ClinicorpBusiness[] (id = Clinic_BusinessId). */
function normalizeBusinesses(raw: unknown): ClinicorpBusiness[] {
  return toArray(raw)
    .map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      const id = firstString(obj, [
        "Clinic_BusinessId",
        "BusinessId",
        "Business_Id",
        "id",
        "Id",
      ]);
      const name =
        firstString(obj, ["Name", "BusinessName", "name", "FantasyName"]) ??
        id ??
        "";
      return { id: id ?? "", name: String(name) };
    })
    .filter((b) => b.id.length > 0);
}

/** Normaliza GET /professional/list_all_professionals -> ClinicorpProfessional[]. */
function normalizeProfessionals(raw: unknown): ClinicorpProfessional[] {
  return toArray(raw)
    .map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      const id = firstString(obj, [
        "Dentist_PersonId",
        "PersonId",
        "Person_Id",
        "id",
        "Id",
      ]);
      const name =
        firstString(obj, ["Name", "FullName", "name", "PersonName"]) ??
        id ??
        "";
      return { id: id ?? "", name: String(name) };
    })
    .filter((p) => p.id.length > 0);
}

/**
 * Serializa o corpo convertendo IDs numericos (que a Clinicorp REJEITA quando
 * vem como string — ex.: "Dentist_PersonId nao pode ser string") em numeros
 * JSON CRUS. Faz via placeholders para preservar a precisao exata mesmo em
 * inteiros maiores que 2^53 (os IDs da Clinicorp tem ~16-19 digitos), evitando
 * passar pelo `Number()` do JS.
 */
function jsonWithNumericIds(
  obj: Record<string, unknown>,
  numericKeys: string[]
): string {
  const clone: Record<string, unknown> = { ...obj };
  const placeholders: Array<[string, string]> = [];
  let i = 0;
  for (const key of numericKeys) {
    const v = clone[key];
    if (typeof v === "string" && /^\d+$/.test(v)) {
      const ph = `__NUMID_${i++}__`;
      placeholders.push([ph, v]);
      clone[key] = ph;
    }
  }
  let json = JSON.stringify(clone);
  for (const [ph, digits] of placeholders) {
    json = json.replace(`"${ph}"`, digits);
  }
  return json;
}

/**
 * Extrai o id do agendamento da resposta de create_appointment_by_api,
 * tolerando variacoes de chave entre contas/versoes (id, Id, AppointmentId,
 * ScheduleId, etc.). Retorna null se nenhum id reconhecivel estiver presente.
 */
export function extractClinicorpAppointmentId(
  results: ClinicorpCreateAppointmentResult[]
): string | null {
  const first = results?.[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  for (const k of [
    "id",
    "Id",
    "AppointmentId",
    "Appointment_Id",
    "Appointment_PersonId",
    "ScheduleId",
    "Schedule_Id",
    "appointment_id",
    "_id",
  ]) {
    const v = first[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Extrai o PatientId/Patient_PersonId da resposta de GET /patient/get
 * (objeto unico ou array), tolerando variacoes de chave. Retorna null se nao
 * encontrar um paciente.
 */
export function extractClinicorpPatientId(raw: unknown): string | null {
  const obj = (Array.isArray(raw) ? raw[0] : raw) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!obj) return null;
  for (const k of ["PatientId", "Patient_PersonId", "PersonId", "id", "Id"]) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export const clinicorp = {
  /**
   * Lista campanhas ativas. Usado tanto pelo "Testar conexão" quanto para
   * popular o dropdown de mapeamento de fontes. Funciona como health-check:
   * se as credenciais estiverem erradas, retorna 401/403.
   */
  async listActiveCampaigns(
    creds: ClinicorpCredentials
  ): Promise<{ campaigns: ClinicorpCampaign[]; httpStatus: number }> {
    const { data, httpStatus } = await request<unknown>(
      `/crm/list_active_campaigns?subscriber_id=${encodeURIComponent(creds.subscriber_id)}`,
      creds,
      { method: "GET" }
    );
    return { campaigns: normalizeCampaigns(data), httpStatus };
  },

  /** Adiciona um lead a uma campanha (BoardName). */
  async addLead(
    creds: ClinicorpCredentials,
    body: Omit<ClinicorpAddLeadBody, "subscriber_id">
  ): Promise<{ data: ClinicorpGenericResponse; httpStatus: number }> {
    return request<ClinicorpGenericResponse>("/crm/add_leads", creds, {
      method: "POST",
      body: JSON.stringify({ subscriber_id: creds.subscriber_id, ...body }),
    });
  },

  /** Cria um paciente (usado na conversao de lead ganho). */
  async createPatient(
    creds: ClinicorpCredentials,
    body: Omit<ClinicorpCreatePatientBody, "subscriber_id">
  ): Promise<{ data: ClinicorpGenericResponse; httpStatus: number }> {
    return request<ClinicorpGenericResponse>("/patient/create", creds, {
      method: "POST",
      body: JSON.stringify({ subscriber_id: creds.subscriber_id, ...body }),
    });
  },

  /** Busca paciente (para evitar duplicatas). Best-effort. */
  async getPatient(
    creds: ClinicorpCredentials,
    params: { phone?: string; email?: string; name?: string }
  ): Promise<{ data: ClinicorpGenericResponse; httpStatus: number }> {
    const search = new URLSearchParams({ subscriber_id: creds.subscriber_id });
    if (params.phone) search.set("Phone", params.phone);
    if (params.email) search.set("Email", params.email);
    if (params.name) search.set("Name", params.name);
    return request<ClinicorpGenericResponse>(
      `/patient/get?${search.toString()}`,
      creds,
      { method: "GET" }
    );
  },

  /** Lista clinicas/unidades (para configurar o Clinic_BusinessId). */
  async listBusinesses(
    creds: ClinicorpCredentials
  ): Promise<{ businesses: ClinicorpBusiness[]; httpStatus: number }> {
    const { data, httpStatus } = await request<unknown>(
      `/business/list?subscriber_id=${encodeURIComponent(creds.subscriber_id)}`,
      creds,
      { method: "GET" }
    );
    return { businesses: normalizeBusinesses(data), httpStatus };
  },

  /** Lista profissionais (para mapear dentistas do CRM -> Dentist_PersonId). */
  async listProfessionals(
    creds: ClinicorpCredentials
  ): Promise<{ professionals: ClinicorpProfessional[]; httpStatus: number }> {
    const { data, httpStatus } = await request<unknown>(
      `/professional/list_all_professionals?subscriber_id=${encodeURIComponent(creds.subscriber_id)}`,
      creds,
      { method: "GET" }
    );
    return { professionals: normalizeProfessionals(data), httpStatus };
  },

  /**
   * Cria um agendamento direto na agenda da Clinicorp.
   * Resposta esperada: array `[{ Status: "CREATED", id }]`. Tolerante a objeto
   * unico (normalizado para array de 1 item).
   */
  async createAppointmentByApi(
    creds: ClinicorpCredentials,
    body: Omit<ClinicorpCreateAppointmentBody, "subscriber_id">
  ): Promise<{ data: ClinicorpCreateAppointmentResult[]; httpStatus: number }> {
    const { data, httpStatus } = await request<unknown>(
      "/appointment/create_appointment_by_api",
      creds,
      {
        method: "POST",
        body: jsonWithNumericIds(
          { subscriber_id: creds.subscriber_id, ...body },
          ["Clinic_BusinessId", "Dentist_PersonId", "Patient_PersonId"]
        ),
      }
    );
    const arr = Array.isArray(data) ? data : data ? [data] : [];
    return { data: arr as ClinicorpCreateAppointmentResult[], httpStatus };
  },

  /** Cancela um agendamento na Clinicorp pelo id retornado na criacao. */
  async cancelAppointment(
    creds: ClinicorpCredentials,
    appointmentId: string
  ): Promise<{ data: ClinicorpGenericResponse; httpStatus: number }> {
    return request<ClinicorpGenericResponse>(
      "/appointment/cancel_appointment",
      creds,
      {
        method: "POST",
        body: jsonWithNumericIds(
          { subscriber_id: creds.subscriber_id, id: appointmentId },
          ["id"]
        ),
      }
    );
  },
};
