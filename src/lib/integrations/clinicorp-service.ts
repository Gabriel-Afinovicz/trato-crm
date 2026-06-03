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
import { clinicorp } from "@/lib/clinicorp/client";
import type { ClinicorpCredentials } from "@/lib/clinicorp/types";
import {
  friendlyClinicorpError,
  type ClinicorpAction,
} from "@/lib/clinicorp/friendly-error";
import {
  runIntegrationInBackground,
  type ActionResult,
} from "./runner";

const PROVIDER = "clinicorp";

interface ResolvedConfig {
  creds: ClinicorpCredentials;
  integrationId: string;
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
async function resolveConfig(
  companyId: string
): Promise<ResolvedConfig | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_integrations")
    .select("id, credentials, status")
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

  return {
    creds: {
      username: creds.username,
      token: creds.token,
      subscriber_id: creds.subscriber_id,
    },
    integrationId: data.id as string,
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
      const config = await resolveConfig(companyId);
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
      const config = await resolveConfig(companyId);
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
