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

/**
 * Clinica/unidade retornada por GET /business/list. O `id` corresponde ao
 * `Clinic_BusinessId` usado na criacao do agendamento.
 */
export interface ClinicorpBusiness {
  id: string;
  name: string;
}

/**
 * Profissional retornado por GET /professional/list_all_professionals. O `id`
 * corresponde ao `Dentist_PersonId` usado (opcionalmente) no agendamento.
 */
export interface ClinicorpProfessional {
  id: string;
  name: string;
}

/**
 * Cadeira/sala retornada por GET /business/list_chairs. O `id` e usado no
 * agendamento quando a clinica agenda por cadeira em vez de profissional. O
 * nome do campo no create e descoberto/validado em conta real.
 */
export interface ClinicorpChair {
  id: string;
  name: string;
}

/**
 * Procedimento retornado por GET /procedures/list. O `id` e mapeado a partir
 * do Servico do CRM para enviar no agendamento (campo `Procedures`).
 */
export interface ClinicorpProcedure {
  id: string;
  name: string;
}

/**
 * Categoria de Agendamento ("Marcador") retornada por
 * GET /appointment/list_categories. Na criacao do agendamento ela e enviada
 * por `CategoryDescription` + `CategoryColor` (a API casa pela descricao+cor
 * de uma categoria ja cadastrada, nao por id).
 */
export interface ClinicorpCategory {
  id: string;
  description: string;
  color: string;
}

/**
 * Body do POST /appointment/create_appointment_by_api.
 *
 * Observacao: a semantica exata de alguns campos (formato de `date`,
 * obrigatoriedade de `Patient_PersonId` vs nome/telefone) tem lacunas na
 * documentacao oficial e sera confirmada pela rota de teste em conta real.
 * Por isso os campos opcionais sao enviados apenas quando presentes.
 */
export interface ClinicorpCreateAppointmentBody {
  subscriber_id: string;
  Clinic_BusinessId: string;
  PatientName: string;
  MobilePhone: string;
  /** Data do agendamento no fuso da clinica (YYYY-MM-DD). */
  date: string;
  /** Horario de inicio no fuso da clinica (HH:mm). */
  fromTime: string;
  /** Horario de fim no fuso da clinica (HH:mm). */
  toTime: string;
  Email?: string;
  Dentist_PersonId?: string;
  Patient_PersonId?: string;
  Notes?: string;
}

/** Item do array retornado por create_appointment_by_api: [{Status, id}]. */
export interface ClinicorpCreateAppointmentResult {
  Status?: string;
  id?: string | number;
  [key: string]: unknown;
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
