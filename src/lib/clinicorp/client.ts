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
  ClinicorpCampaign,
  ClinicorpCreatePatientBody,
  ClinicorpCredentials,
  ClinicorpGenericResponse,
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
    params: { phone?: string; email?: string }
  ): Promise<{ data: ClinicorpGenericResponse; httpStatus: number }> {
    const search = new URLSearchParams({ subscriber_id: creds.subscriber_id });
    if (params.phone) search.set("Phone", params.phone);
    if (params.email) search.set("Email", params.email);
    return request<ClinicorpGenericResponse>(
      `/patient/get?${search.toString()}`,
      creds,
      { method: "GET" }
    );
  },
};
