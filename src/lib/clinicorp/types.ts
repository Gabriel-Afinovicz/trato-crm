/**
 * Tipos da API Clinicorp (REST v1).
 *
 * Base URL: https://api.clinicorp.com/rest/v1
 * Autenticacao: HTTP Basic — Authorization: Basic base64(usuario:token).
 * O `subscriber_id` identifica a unidade/assinante e vai no corpo das
 * requisicoes que precisam dele.
 */

/** Credenciais persistidas em company_integrations.credentials (provider=clinicorp). */
export interface ClinicorpCredentials {
  username: string;
  token: string;
  subscriber_id: string;
}

/** Body do POST /crm/add_leads. */
export interface ClinicorpAddLeadBody {
  subscriber_id: string;
  Name: string;
  Email: string;
  Phone: string;
  BoardName: string;
  Notes: string;
}

/** Body do POST /patient/create (campos minimos usados na conversao). */
export interface ClinicorpCreatePatientBody {
  subscriber_id: string;
  Name: string;
  Email?: string;
  Phone?: string;
  Notes?: string;
}

/** Item de campanha retornado por GET /crm/list_active_campaigns. */
export interface ClinicorpCampaign {
  /**
   * Nome da campanha (usado como BoardName). A API pode retornar o nome em
   * chaves diferentes dependendo da versao; normalizamos no client.
   */
  name: string;
  id?: string | null;
}

/** Resposta generica de sucesso/erro da Clinicorp. */
export interface ClinicorpGenericResponse {
  message?: string;
  error?: string;
  success?: boolean;
  [key: string]: unknown;
}
