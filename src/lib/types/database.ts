// ── Analytics ─────────────────────────────────────────────────────────────────

// Categorias canônicas de pipeline. Cada `pipeline_stage` da clínica
// aponta para uma destas — a mini-dash do Kanban/Leads agrupa por
// categoria, garantindo que os KPIs façam sentido mesmo quando cada
// clínica nomeia as etapas de forma diferente.
export type StageCategory =
  | "frio"
  | "quente"
  | "agendado"
  | "compareceu"
  | "orcamento"
  | "fechado"
  | "perdido";

export const STAGE_CATEGORIES: StageCategory[] = [
  "frio",
  "quente",
  "agendado",
  "compareceu",
  "orcamento",
  "fechado",
  "perdido",
];

export const STAGE_CATEGORY_LABEL: Record<StageCategory, string> = {
  frio: "Frio",
  quente: "Quente",
  agendado: "Agendado",
  compareceu: "Compareceu",
  orcamento: "Orçamento",
  fechado: "Fechado",
  perdido: "Perdido",
};

// Cohort de leads criados no período agrupada pela categoria do stage
// atual de cada lead. `sem_categoria` cobre stages criados antes da
// migration ou pelo admin sem mapear categoria (banner em Configurações).
export interface MinidashCohort {
  total: number;
  frio: number;
  quente: number;
  agendado: number;
  compareceu: number;
  orcamento: number;
  fechado: number;
  perdido: number;
  sem_categoria: number;
}

// KPIs executivos da aba "Analítico" (mês operacional).
// Fechamentos consideram leads cujo `converted_at` caiu no período, mesmo
// quando o lead foi criado em meses anteriores (follow-up). O denominador
// "% sobre etapa anterior" é eficiência operacional do mês, não pureza
// de coorte — ver tooltip no painel.
export interface AnaliticoKpis {
  total_leads: number;
  total_agendamentos: number;
  total_comparecimentos: number;
  total_fechamentos: number;
  fechamentos_follow_up: number;
  soma_fechamento: number;
  soma_entrada: number;
  ticket_medio: number;
}

// Metas analíticas por clínica. Persistidas em `companies.settings.analytics_goals`.
// Quando ausentes, a aplicação assume o padrão 40/40/30 (ver getClinicGoals).
export interface ClinicAnalyticsGoals {
  appointment_pct: number;
  attendance_pct: number;
  closing_pct: number;
}

export interface StageFunnelRow {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  stage_position: number;
  is_won: boolean;
  is_lost: boolean;
  total_leads: number;
  new_in_period: number;
  avg_days_in_stage: number;
}

// ── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "operator" | "super_admin";

export type LeadStatus =
  | "novo"
  | "agendado"
  | "atendido"
  | "finalizado"
  | "perdido";

export type ActivityType =
  | "note"
  | "call_inbound"
  | "call_outbound"
  | "whatsapp"
  | "email"
  | "appointment"
  | "status_change"
  | "assignment";

export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "boolean"
  | "phone"
  | "email"
  | "url";

// ── Tabelas ──────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // IANA timezone string (ex: "America/Sao_Paulo"). Toda interpretacao
  // de data deve usar este TZ — relatorios, calendarios e badges de
  // "hoje" devem refletir o calendario do escritorio da clinica, nao
  // do navegador do operador (que pode estar viajando).
  timezone: string;
}

export interface User {
  id: string;
  company_id: string;
  auth_id: string | null;
  name: string;
  /**
   * Email "fake" usado pelo Supabase Auth — gerado como
   * `extension@domain.crm` para permitir login por ramal. Nao mostre
   * isso ao usuario; para correspondencia (convites, reset etc) use
   * `invite_email`.
   */
  email: string;
  /**
   * Email real do membro (cadastrado pelo admin no convite). Opcional —
   * membros antigos podem estar sem. Usado para enviar convites e
   * recuperar senha por email.
   */
  invite_email: string | null;
  phone: string | null;
  extension_number: string;
  role: UserRole;
  is_active: boolean;
  is_dentist: boolean;
  /** Override manual de profissional (independe de tags). is_dentist = manual OR tag. */
  is_dentist_manual: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  company_id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  is_active: boolean;
  legacy_status: LeadStatus | null;
  // Categoria canônica usada pela mini-dash. Pode ser null para stages
  // criados antes da migration ou pelo admin que ainda não definiu — a
  // UI em Configurações cobra o mapeamento.
  category: StageCategory | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Room {
  id: string;
  company_id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export interface ProcedureType {
  id: string;
  company_id: string;
  name: string;
  default_duration_minutes: number;
  default_value: number | null;
  is_active: boolean;
  /** ID do procedimento na Clinicorp (importado/mapeado); null se nao vinculado. */
  clinicorp_procedure_id: string | null;
  created_at: string;
}

/**
 * Status da sincronizacao do agendamento com a agenda da Clinicorp:
 *  - "pending": sincronizacao em andamento.
 *  - "synced": agendamento criado na Clinicorp (tambem indicado por
 *    `clinicorp_appointment_id`).
 *  - "failed": a Clinicorp recusou/erro na criacao.
 *  - null: nao aplicavel (sem integracao) ou ainda nao tentado.
 */
export type ClinicorpSyncStatus = "pending" | "synced" | "failed";

export interface Appointment {
  id: string;
  company_id: string;
  lead_id: string;
  dentist_id: string | null;
  room_id: string | null;
  procedure_type_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string | null;
  /** ID do agendamento na agenda da Clinicorp; null se ainda nao sincronizado. */
  clinicorp_appointment_id: string | null;
  /** Status da sincronizacao com a Clinicorp (para feedback visual na agenda). */
  clinicorp_sync_status: ClinicorpSyncStatus | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentDetailed extends Appointment {
  lead_name: string | null;
  lead_phone: string | null;
  dentist_name: string | null;
  room_name: string | null;
  room_color: string | null;
  procedure_name: string | null;
  procedure_duration_minutes: number | null;
}

export interface ClinicHours {
  id: string;
  company_id: string;
  weekday: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
  lunch_start: string | null;
  lunch_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicHoliday {
  id: string;
  company_id: string;
  date: string;
  name: string;
  created_at: string;
}

export interface AgendaBlock {
  id: string;
  company_id: string;
  dentist_id: string | null;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
}

export type AvailabilityReason =
  | "closed"
  | "lunch"
  | "holiday"
  | "block"
  | "appointment";

export interface DentistAvailabilityInterval {
  starts_at: string;
  ends_at: string;
  kind: "appointment" | "block";
  label: string;
}

export interface DentistAvailabilityRow {
  dentist_id: string;
  dentist_name: string;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  busy_minutes: number;
  free_minutes: number;
  busy_intervals: DentistAvailabilityInterval[];
}

export type MessageTemplateKind =
  | "confirmation"
  | "reminder"
  | "post_visit"
  | "birthday"
  | "custom"
  // Snippets sao "mensagens rapidas" usadas no chat de Conversas via
  // popover `/`. Mesma tabela das demais templates, kind dedicada para
  // poder filtrar facilmente no picker do chat.
  | "snippet";

export interface MessageTemplate {
  id: string;
  company_id: string;
  kind: MessageTemplateKind;
  name: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AppointmentConfirmationStatus =
  | "pending"
  | "confirmed"
  | "reschedule_requested"
  | "expired";

export interface AppointmentConfirmation {
  id: string;
  appointment_id: string;
  company_id: string;
  token: string;
  status: AppointmentConfirmationStatus;
  created_at: string;
  responded_at: string | null;
}

export interface Lead {
  id: string;
  company_id: string;
  assigned_to: string | null;
  source_id: string | null;
  // Vinculo do lead a um Setor da clinica (CRC Leads, Follow-up, etc).
  // Opcional para multinicho: contas sem setores cadastrados podem criar
  // leads normalmente. Substitui na UI o antigo "Responsavel" (pessoa);
  // o campo `assigned_to` (pessoa) permanece no banco como dado legado.
  sector_id: string | null;
  name: string;
  identifier: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  stage_id: string;
  notes: string | null;
  lost_reason: string | null;
  converted_at: string | null;
  // Valores monetários do fechamento. Populados pela UI quando o lead
  // efetivamente fecha. A RPC de KPIs usa essas colunas para calcular
  // soma_fechamento, soma_entrada e ticket_medio (média só de
  // closing_value não nulos para não enviesar para baixo quando o
  // dentista esqueceu de preencher).
  closing_value: number | null;
  down_payment: number | null;
  kanban_position: number;
  photo_url: string | null;
  birthdate: string | null;
  gender: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  allergies: string | null;
  clinical_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadSource {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  /**
   * Nome da campanha (BoardName) da Clinicorp para a qual leads desta fonte
   * sao enviados. Null = fonte sem campanha mapeada (lead nao e enviado).
   */
  clinicorp_board_name: string | null;
}

/**
 * Integracao de terceiros configurada por empresa. Generica para suportar
 * varios conectores (clinicorp, rd_station, etc.) sob o mesmo modelo.
 */
export type IntegrationProvider = "clinicorp";

export type IntegrationStatus = "active" | "disabled" | "error";

export interface CompanyIntegration {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  /** Segredos do provedor (ex.: { api_key, subscriber_id }). */
  credentials: Record<string, unknown>;
  /** Preferencias nao-secretas (ex.: defaults, flags). */
  config: Record<string, unknown>;
  status: IntegrationStatus;
  last_check_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type IntegrationLogStatus = "success" | "error";

export interface IntegrationLog {
  id: string;
  company_id: string;
  provider: string;
  lead_id: string | null;
  action: string;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  status: IntegrationLogStatus;
  http_status: number | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface Activity {
  id: string;
  company_id: string;
  lead_id: string;
  user_id: string | null;
  activity_type: ActivityType;
  title: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  id: string;
  company_id: string;
  name: string;
  field_type: CustomFieldType;
  options: unknown | null;
  is_required: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  company_id: string;
  lead_id: string;
  custom_field_id: string;
  value: string | null;
}

export interface Tag {
  id: string;
  company_id: string;
  name: string;
  color: string;
  created_at: string;
  /**
   * Id da Categoria de Agendamento da Clinicorp (marcador) vinculada a esta
   * tag. Quando presente, a tag corresponde a uma categoria importada e e
   * usada para sincronizar a categoria do agendamento na Clinicorp.
   */
  clinicorp_category_id: string | null;
}

export interface LeadTag {
  lead_id: string;
  tag_id: string;
}

export interface UserRoleTag {
  id: string;
  company_id: string;
  name: string;
  color: string;
  marks_as_dentist: boolean;
  is_active: boolean;
  created_at: string;
}

export interface UserRoleTagAssignment {
  user_id: string;
  tag_id: string;
}

// "Setor" e a unidade operacional usada para distribuir leads dentro da
// clinica (ex.: "CRC Leads", "CRC Follow-up"). Multinicho: qualquer
// nomenclatura serve, seed inicial vazio. Substitui na UI do form o
// antigo Responsavel (pessoa) sem apagar `users` nem `assigned_to`.
export interface Sector {
  id: string;
  company_id: string;
  name: string;
  color: string;
  is_active: boolean;
  // Setores fixos do sistema: 'crc_leads' | 'crc_comercial'. Null em setores
  // legados (desativados pela migration fixed_crc_sectors). Setores com
  // system_key nao podem ser criados/excluidos/desativados via API.
  system_key: "crc_leads" | "crc_comercial" | null;
  created_at: string;
  updated_at: string;
}

export interface UserSectorAssignment {
  user_id: string;
  sector_id: string;
  created_at: string;
}

export type WhatsAppInstanceStatus =
  | "disconnected"
  | "connecting"
  | "connected";

export interface WhatsAppInstance {
  id: string;
  company_id: string;
  instance_name: string;
  status: WhatsAppInstanceStatus;
  phone_number: string | null;
  evolution_token: string | null;
  connected_at: string | null;
  // Timestamp do ultimo sync automatico disparado apos login. Cooldown
  // server-side evita rajadas a Evolution quando varios operadores logam
  // ao mesmo tempo ou recarregam o app.
  last_post_login_sync_at: string | null;
  // Timestamp do ultimo sync manual (botao Sincronizar em Settings).
  // Cooldown server-side de 60s sobrevive a F5/sessao nova/multi-aba e
  // protege as chamadas mais sensiveis (whatsappNumbers em batches).
  last_manual_sync_at: string | null;
  // Timestamp do termino do ultimo sync manual. Quando NULL e
  // last_manual_sync_at e recente, indica que ha sync em andamento. O
  // banner "Sincronizando..." na aba Conversas usa isso.
  sync_finished_at: string | null;
  // Heartbeat do webhook da Evolution. Atualizado pelo proprio handler do
  // webhook com throttle server-side de 15s (condicional no WHERE da query).
  // O cliente (`useWhatsAppHealth`) usa para detectar que o webhook esta
  // vivo e suspender o polling de fallback em `conversas-content`. Null
  // significa que nenhum webhook foi recebido ainda — comportamento
  // equivalente ao "nao confio no webhook ainda" do cliente.
  webhook_last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppChat {
  id: string;
  company_id: string;
  instance_id: string;
  remote_jid: string;
  name: string | null;
  lead_id: string | null;
  /**
   * Marca quando o operador desvinculou manualmente o lead desta conversa.
   * O auto-vinculo do webhook ignora conversas com este campo preenchido,
   * respeitando a decisao manual. Null = nunca desvinculado manualmente.
   */
  lead_unlinked_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  /**
   * `true` quando a ultima mensagem do chat foi enviada por mim (operador
   * via CRM ou pelo celular do dono da instancia). `false` se foi recebida
   * do contato. `null` apenas para chats antigos sem backfill.
   *
   * Usado pela UI da lista lateral para decidir se mostra os checks de
   * WhatsApp ao lado da previa (so quando `true`, igual o app oficial).
   */
  last_message_from_me: boolean | null;
  /**
   * Status (`pending`/`sent`/`delivered`/`read`/`failed`) da ultima
   * mensagem do chat. Significativo apenas quando `last_message_from_me`
   * e `true`. Atualizado pelo webhook `messages.update` quando o
   * destinatario confirma recebimento/leitura.
   */
  last_message_status: WhatsAppMessageStatus | null;
  unread_count: number;
  is_archived: boolean;
  profile_picture_url: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsAppMessageDirection = "in" | "out";
export type WhatsAppMessageMediaType =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "sticker"
  | "video"
  | "location"
  | "contact"
  | "unknown";
export type WhatsAppMessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

// Reacao ao estilo WhatsApp: cada reator pode ter no maximo UMA reacao ativa
// por mensagem (ao reagir de novo, substitui a anterior; ao enviar string
// vazia, remove). Guardamos um array porque em chat individual podem coexistir
// reacao do operador e reacao do contato na mesma mensagem.
//
// - `emoji`: emoji escolhido (string vazia significa remocao e nao deve ser
//   persistida — `mergeReactions` filtra).
// - `from_me`: true quando a reacao foi feita pela clinica (via CRM ou
//   celular do operador); false quando foi o contato. Conta como heuristica
//   de cor/posicao na bolha.
// - `reactor_jid`: JID de quem reagiu (quando disponivel pelo Baileys). Em
//   chat individual e quase sempre `remoteJid` do chat (para `from_me=false`)
//   ou o JID da nossa instancia. Em chats `@lid` pode vir o `@lid` ou o
//   `remoteJidAlt` real. Usado para `mergeReactions` decidir override.
// - `ts`: timestamp ISO de quando a reacao foi observada — desempata reacoes
//   atualizadas em rajada (cliente envia, webhook chega depois).
export interface WhatsAppMessageReaction {
  emoji: string;
  from_me: boolean;
  reactor_jid: string | null;
  ts: string;
}

export interface WhatsAppMessage {
  id: string;
  company_id: string;
  chat_id: string;
  evolution_message_id: string | null;
  direction: WhatsAppMessageDirection;
  from_me: boolean;
  body: string | null;
  media_type: WhatsAppMessageMediaType;
  media_url: string | null;
  media_mime_type: string | null;
  status: WhatsAppMessageStatus;
  error_message: string | null;
  sent_at: string | null;
  received_at: string | null;
  sender_user_id: string | null;
  // Reply ao estilo WhatsApp: snapshot do que foi citado. Sem FK para a
  // mensagem original porque ela pode nao existir no banco (mensagem antiga
  // que ainda nao foi sincronizada). quoted_evolution_message_id e a chave
  // soft para tentar localizar a mensagem original quando precisarmos rolar
  // ate ela na UI.
  quoted_evolution_message_id: string | null;
  quoted_body: string | null;
  quoted_from_me: boolean | null;
  // Reacoes acumuladas. Webhook (entrada) e a rota /react (saida) usam
  // `mergeReactions` para manter no maximo 1 emoji por reator. UI agrega
  // por emoji para mostrar badges abaixo da bolha.
  reactions: WhatsAppMessageReaction[];
  // Edicao de mensagem (Leva 3 — maio/2026). Quando a Evolution entrega
  // MESSAGES_EDITED, o webhook atualiza `body` com o novo texto e popula
  // estes campos. `original_body` guarda o texto antes da primeira edicao;
  // `edit_count` conta quantas vezes a mensagem foi editada.
  edited_at: string | null;
  original_body: string | null;
  edit_count: number;
  created_at: string;
}

// ── Views ────────────────────────────────────────────────────────────────────

export interface LeadFunnel {
  company_id: string;
  status: LeadStatus;
  total: number;
  last_7_days: number;
  last_30_days: number;
}

export interface LeadDetailed extends Lead {
  assigned_to_name: string | null;
  assigned_is_dentist: boolean | null;
  source_name: string | null;
  stage_name: string | null;
  stage_color: string | null;
  stage_category: StageCategory | null;
  stage_position: number | null;
  stage_is_won: boolean | null;
  stage_is_lost: boolean | null;
  // Setor (nome/cor resolvidos pela view). Null quando o lead esta sem
  // setor (legado ou conta sem setores cadastrados).
  sector_name: string | null;
  sector_color: string | null;
}

export interface ActivityDetailed extends Activity {
  user_name: string | null;
  lead_name: string | null;
}

// ── Database (Supabase typed client) ─────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Omit<Company, "id" | "created_at" | "updated_at" | "is_active" | "settings"> &
          Partial<Pick<Company, "is_active" | "settings">>;
        Update: Partial<Omit<Company, "id" | "created_at" | "updated_at">>;
      };
      users: {
        Row: User;
        Insert: Omit<User, "id" | "created_at" | "updated_at" | "role" | "is_active"> &
          Partial<Pick<User, "role" | "is_active">>;
        Update: Partial<Omit<User, "id" | "created_at" | "updated_at">>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<
          Lead,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "kanban_position"
          | "closing_value"
          | "down_payment"
          | "sector_id"
        > &
          Partial<
            Pick<
              Lead,
              | "status"
              | "kanban_position"
              | "closing_value"
              | "down_payment"
              | "sector_id"
            >
          >;
        Update: Partial<Omit<Lead, "id" | "created_at" | "updated_at">>;
      };
      pipeline_stages: {
        Row: PipelineStage;
        Insert: Omit<
          PipelineStage,
          | "id"
          | "created_at"
          | "updated_at"
          | "is_active"
          | "is_won"
          | "is_lost"
          | "color"
          | "position"
          | "category"
        > &
          Partial<
            Pick<
              PipelineStage,
              | "id"
              | "is_active"
              | "is_won"
              | "is_lost"
              | "color"
              | "position"
              | "legacy_status"
              | "category"
            >
          >;
        Update: Partial<Omit<PipelineStage, "id" | "created_at" | "updated_at">>;
      };
      rooms: {
        Row: Room;
        Insert: Omit<Room, "id" | "created_at" | "is_active" | "color"> &
          Partial<Pick<Room, "is_active" | "color">>;
        Update: Partial<Omit<Room, "id" | "created_at">>;
      };
      procedure_types: {
        Row: ProcedureType;
        Insert: Omit<
          ProcedureType,
          "id" | "created_at" | "is_active" | "default_duration_minutes" | "default_value"
        > &
          Partial<
            Pick<
              ProcedureType,
              "is_active" | "default_duration_minutes" | "default_value"
            >
          >;
        Update: Partial<Omit<ProcedureType, "id" | "created_at">>;
      };
      appointments: {
        Row: Appointment;
        Insert: Omit<
          Appointment,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "notes"
          | "clinicorp_appointment_id"
          | "clinicorp_sync_status"
        > &
          Partial<
            Pick<
              Appointment,
              | "status"
              | "notes"
              | "clinicorp_appointment_id"
              | "clinicorp_sync_status"
            >
          >;
        Update: Partial<Omit<Appointment, "id" | "created_at" | "updated_at">>;
      };
      clinic_hours: {
        Row: ClinicHours;
        Insert: Omit<ClinicHours, "id" | "created_at" | "updated_at"> &
          Partial<Pick<ClinicHours, "is_open" | "lunch_start" | "lunch_end">>;
        Update: Partial<Omit<ClinicHours, "id" | "created_at" | "updated_at">>;
      };
      clinic_holidays: {
        Row: ClinicHoliday;
        Insert: Omit<ClinicHoliday, "id" | "created_at">;
        Update: Partial<Omit<ClinicHoliday, "id" | "created_at">>;
      };
      agenda_blocks: {
        Row: AgendaBlock;
        Insert: Omit<AgendaBlock, "id" | "created_at">;
        Update: Partial<Omit<AgendaBlock, "id" | "created_at">>;
      };
      message_templates: {
        Row: MessageTemplate;
        Insert: Omit<MessageTemplate, "id" | "created_at" | "updated_at" | "is_active"> &
          Partial<Pick<MessageTemplate, "is_active">>;
        Update: Partial<Omit<MessageTemplate, "id" | "created_at" | "updated_at">>;
      };
      appointment_confirmations: {
        Row: AppointmentConfirmation;
        Insert: Omit<AppointmentConfirmation, "id" | "created_at" | "responded_at" | "status"> &
          Partial<Pick<AppointmentConfirmation, "status" | "responded_at">>;
        Update: Partial<Omit<AppointmentConfirmation, "id" | "created_at">>;
      };
      lead_sources: {
        Row: LeadSource;
        Insert: Omit<LeadSource, "id" | "created_at" | "is_active"> &
          Partial<Pick<LeadSource, "is_active">>;
        Update: Partial<Omit<LeadSource, "id" | "created_at">>;
      };
      activities: {
        Row: Activity;
        Insert: Omit<Activity, "id" | "created_at" | "updated_at" | "metadata"> &
          Partial<Pick<Activity, "metadata">>;
        Update: Partial<Omit<Activity, "id" | "created_at" | "updated_at">>;
      };
      custom_fields: {
        Row: CustomField;
        Insert: Omit<CustomField, "id" | "created_at" | "field_type" | "is_required" | "display_order" | "is_active"> &
          Partial<Pick<CustomField, "field_type" | "is_required" | "display_order" | "is_active">>;
        Update: Partial<Omit<CustomField, "id" | "created_at">>;
      };
      custom_field_values: {
        Row: CustomFieldValue;
        Insert: Omit<CustomFieldValue, "id">;
        Update: Partial<Omit<CustomFieldValue, "id">>;
      };
      tags: {
        Row: Tag;
        Insert: Omit<
          Tag,
          "id" | "created_at" | "color" | "clinicorp_category_id"
        > &
          Partial<Pick<Tag, "color" | "clinicorp_category_id">>;
        Update: Partial<Omit<Tag, "id" | "created_at">>;
      };
      lead_tags: {
        Row: LeadTag;
        Insert: LeadTag;
        Update: Partial<LeadTag>;
      };
      user_role_tags: {
        Row: UserRoleTag;
        Insert: Omit<UserRoleTag, "id" | "created_at" | "is_active" | "color" | "marks_as_dentist"> &
          Partial<Pick<UserRoleTag, "is_active" | "color" | "marks_as_dentist">>;
        Update: Partial<Omit<UserRoleTag, "id" | "created_at">>;
      };
      user_role_tag_assignments: {
        Row: UserRoleTagAssignment;
        Insert: UserRoleTagAssignment;
        Update: Partial<UserRoleTagAssignment>;
      };
      sectors: {
        Row: Sector;
        Insert: Omit<Sector, "id" | "created_at" | "updated_at" | "is_active" | "color" | "system_key"> &
          Partial<Pick<Sector, "is_active" | "color" | "system_key">>;
        Update: Partial<Omit<Sector, "id" | "created_at" | "updated_at">>;
      };
      user_sector_assignments: {
        Row: UserSectorAssignment;
        Insert: Omit<UserSectorAssignment, "created_at"> &
          Partial<Pick<UserSectorAssignment, "created_at">>;
        Update: Partial<UserSectorAssignment>;
      };
      whatsapp_instances: {
        Row: WhatsAppInstance;
        Insert: Omit<
          WhatsAppInstance,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "phone_number"
          | "evolution_token"
          | "connected_at"
          | "last_post_login_sync_at"
          | "last_manual_sync_at"
          | "webhook_last_seen_at"
        > &
          Partial<
            Pick<
              WhatsAppInstance,
              | "status"
              | "phone_number"
              | "evolution_token"
              | "connected_at"
              | "last_post_login_sync_at"
              | "last_manual_sync_at"
              | "webhook_last_seen_at"
            >
          >;
        Update: Partial<Omit<WhatsAppInstance, "id" | "created_at">>;
      };
      whatsapp_chats: {
        Row: WhatsAppChat;
        Insert: Omit<
          WhatsAppChat,
          | "id"
          | "created_at"
          | "updated_at"
          | "unread_count"
          | "is_archived"
          | "name"
          | "last_message_at"
          | "last_message_preview"
          | "lead_id"
          | "lead_unlinked_at"
          | "profile_picture_url"
        > &
          Partial<
            Pick<
              WhatsAppChat,
              | "unread_count"
              | "is_archived"
              | "name"
              | "last_message_at"
              | "last_message_preview"
              | "lead_id"
              | "lead_unlinked_at"
              | "profile_picture_url"
            >
          >;
        Update: Partial<Omit<WhatsAppChat, "id" | "created_at">>;
      };
      whatsapp_messages: {
        Row: WhatsAppMessage;
        Insert: Omit<
          WhatsAppMessage,
          | "id"
          | "created_at"
          | "from_me"
          | "media_type"
          | "status"
          | "evolution_message_id"
          | "body"
          | "media_url"
          | "media_mime_type"
          | "error_message"
          | "sent_at"
          | "received_at"
          | "sender_user_id"
          | "quoted_evolution_message_id"
          | "quoted_body"
          | "quoted_from_me"
          | "edited_at"
          | "original_body"
          | "edit_count"
        > &
          Partial<
            Pick<
              WhatsAppMessage,
              | "from_me"
              | "media_type"
              | "status"
              | "evolution_message_id"
              | "body"
              | "media_url"
              | "media_mime_type"
              | "error_message"
              | "sent_at"
              | "received_at"
              | "sender_user_id"
              | "quoted_evolution_message_id"
              | "quoted_body"
              | "quoted_from_me"
              | "edited_at"
              | "original_body"
              | "edit_count"
            >
          >;
        Update: Partial<Omit<WhatsAppMessage, "id" | "created_at">>;
      };
      user_pipeline_stage_order: {
        Row: {
          user_id: string;
          company_id: string;
          stage_ids: string[];
          updated_at: string;
        };
        Insert: {
          user_id: string;
          company_id: string;
          stage_ids: string[];
          updated_at?: string;
        };
        Update: Partial<{
          user_id: string;
          company_id: string;
          stage_ids: string[];
          updated_at: string;
        }>;
      };
    };
    Views: {
      vw_lead_funnel: {
        Row: LeadFunnel;
      };
      vw_leads_detailed: {
        Row: LeadDetailed;
      };
      vw_activities_detailed: {
        Row: ActivityDetailed;
      };
    };
    Functions: {
      resolve_login: {
        Args: { p_domain: string; p_extension_number: string };
        Returns: { auth_email: string }[];
      };
      create_user: {
        Args: {
          p_company_id: string;
          p_name: string;
          p_email: string;
          p_extension_number: string;
          p_password: string;
          p_role: "admin" | "operator";
        };
        Returns: string;
      };
      change_user_password: {
        Args: { p_user_id: string; p_new_password: string };
        Returns: void;
      };
      deactivate_user: {
        Args: { p_user_id: string };
        Returns: void;
      };
      reactivate_user: {
        Args: { p_user_id: string };
        Returns: void;
      };
      seed_company_defaults: {
        Args: { p_company_id: string };
        Returns: void;
      };
      find_lead_by_phone: {
        Args: { p_company_id: string; p_phone: string };
        Returns: string | null;
      };
      apply_kanban_move: {
        Args: {
          p_lead_id: string;
          p_from_status: LeadStatus;
          p_to_status: LeadStatus;
          p_dest_ordered_ids: string[];
          p_source_ordered_ids: string[];
        };
        Returns: void;
      };
      check_appointment_conflict: {
        Args: {
          p_dentist_id: string | null;
          p_room_id: string | null;
          p_starts_at: string;
          p_ends_at: string;
          p_exclude_id?: string | null;
        };
        Returns: boolean;
      };
      check_appointment_availability: {
        Args: {
          p_company_id: string;
          p_dentist_id: string | null;
          p_room_id: string | null;
          p_starts_at: string;
          p_ends_at: string;
          p_exclude_id?: string | null;
        };
        Returns: AvailabilityReason | null;
      };
      get_dentist_availability: {
        Args: {
          p_company_id: string;
          p_date: string;
        };
        Returns: DentistAvailabilityRow[];
      };
      apply_kanban_move_v2: {
        Args: {
          p_lead_id: string;
          p_from_stage_id: string;
          p_to_stage_id: string;
          p_dest_ordered_ids: string[];
          p_source_ordered_ids: string[];
          p_lost_reason?: string | null;
        };
        Returns: void;
      };
      reorder_pipeline_stages: {
        Args: {
          p_ordered_ids: string[];
        };
        Returns: void;
      };
      confirmation_lookup: {
        Args: { p_domain: string; p_token: string };
        Returns: {
          appointment_id: string;
          status: AppointmentConfirmationStatus;
          starts_at: string;
          ends_at: string;
          patient_name: string;
          dentist_name: string | null;
          clinic_name: string;
        }[];
      };
      confirmation_respond: {
        Args: { p_domain: string; p_token: string; p_action: string };
        Returns: string;
      };
      get_stage_funnel: {
        Args: {
          p_company_id: string;
          p_start: string;
          p_end: string;
        };
        Returns: StageFunnelRow[];
      };
      get_analitico_kpis: {
        Args: {
          p_company_id: string;
          p_start: string;
          p_end: string;
          p_sector_id?: string | null;
        };
        Returns: AnaliticoKpis;
      };
      get_kanban_minidash: {
        Args: {
          p_company_id: string;
          p_start: string;
          p_end: string;
          p_sector_id?: string | null;
        };
        Returns: MinidashCohort;
      };
      create_lead_with_appointment: {
        Args: { p_payload: Record<string, unknown> };
        Returns: {
          lead_id: string;
          appointment_id: string | null;
          stage_id: string | null;
        };
      };
    };
    Enums: {
      user_role: UserRole;
      lead_status: LeadStatus;
      activity_type: ActivityType;
      custom_field_type: CustomFieldType;
    };
    CompositeTypes: Record<string, never>;
  };
}
