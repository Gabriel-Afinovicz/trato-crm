/**
 * Definicoes do tour de onboarding (boas-vindas + coach marks por tela).
 *
 * - O tour de "welcome" e um modal central, adaptado por papel.
 * - Os tours contextuais (dashboard/leads/agenda/conversas) destacam
 *   elementos reais marcados com `data-tour="<id>"` no DOM.
 *
 * Persistencia e disparo ficam em `use-onboarding-tour.ts` e `tour-host.tsx`.
 */

export type TourId =
  | "welcome"
  | "dashboard"
  | "leads"
  | "agenda"
  | "conversas";

/** Papel simplificado para fins de conteudo do tour. */
export type TourRole = "admin" | "operator";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  /**
   * Seletor CSS do alvo (ex.: `[data-tour="leads-new"]`). Quando ausente,
   * o passo e exibido centralizado (sem spotlight).
   */
  target?: string;
  title: string;
  body: string;
  /** Posicao preferida do card em relacao ao alvo. Default "bottom". */
  placement?: TourPlacement;
}

/** Todos os tours — usado para reset ("refazer tour"). */
export const ALL_TOUR_IDS: TourId[] = [
  "welcome",
  "dashboard",
  "leads",
  "agenda",
  "conversas",
];

/** Converte o papel do perfil no papel de conteudo do tour. */
export function toTourRole(role: string | null | undefined): TourRole {
  return role === "operator" ? "operator" : "admin";
}

const WELCOME_ADMIN: TourStep[] = [
  {
    title: "Bem-vindo ao Trato CRM!",
    body: "Centralize captacao de leads, atendimento no WhatsApp, funil de vendas e agenda — tudo em um so lugar. Vamos dar um tour rapido (leva uns 30 segundos).",
    placement: "center",
  },
  {
    title: "Configure sua operacao",
    body: "No Dashboard ha o card 'Primeiros passos': cadastre o pipeline, adicione membros, defina os horarios da agenda e conecte o WhatsApp. E o caminho mais rapido para deixar o CRM pronto.",
    placement: "center",
  },
  {
    title: "Capte e gerencie leads",
    body: "Cadastre leads em segundos (tecla N), evite duplicados automaticamente e acompanhe cada oportunidade no Kanban arrastando os cards entre as etapas.",
    placement: "center",
  },
  {
    title: "Atenda pelo WhatsApp",
    body: "Conecte o numero da organizacao e responda conversas direto do CRM: audios, midias, modelos de mensagem (digite /) e vinculo automatico com o lead.",
    placement: "center",
  },
  {
    title: "Trabalhe rapido",
    body: "Pressione Ctrl+K para a busca universal (leads, telefones, navegacao) e ? para ver todos os atalhos de teclado. Bom trabalho!",
    placement: "center",
  },
];

const WELCOME_OPERATOR: TourStep[] = [
  {
    title: "Bem-vindo ao Trato CRM!",
    body: "Aqui voce atende leads e conversas em um so lugar. Vamos dar um tour rapido (leva uns 30 segundos).",
    placement: "center",
  },
  {
    title: "Seus leads no Kanban",
    body: "Acompanhe as oportunidades no Kanban: arraste os cards entre as etapas. Para cadastrar um lead, pressione a tecla N de qualquer tela.",
    placement: "center",
  },
  {
    title: "Converse pelo WhatsApp",
    body: "Responda no WhatsApp integrado: navegue entre conversas com J e K, use modelos de mensagem digitando / e vincule o contato a um lead com um clique.",
    placement: "center",
  },
  {
    title: "Trabalhe rapido",
    body: "Pressione Ctrl+K para a busca universal e ? para ver todos os atalhos de teclado. Bom trabalho!",
    placement: "center",
  },
];

const DASHBOARD_STEPS: TourStep[] = [
  {
    title: "Seu painel de controle",
    body: "O Dashboard reune os numeros da operacao e o funil de vendas. Veja os principais destaques.",
    placement: "center",
  },
  {
    target: '[data-tour="sidebar-nav"]',
    title: "Menu de navegacao",
    body: "Use o menu lateral para alternar entre Dashboard, Leads, Agenda e Conversas. Voce pode recolher o menu na setinha do topo.",
    placement: "right",
  },
  {
    target: '[data-tour="dashboard-tabs"]',
    title: "Analitico, Kanban e Funil",
    body: "Alterne entre a visao Analitica (KPIs e metas), o Kanban (arraste os cards) e o Funil (gargalos). Atalhos: teclas 1, 2 e 3.",
    placement: "bottom",
  },
  {
    target: '[data-tour="onboarding-checklist"]',
    title: "Primeiros passos",
    body: "Este card mostra o que ainda falta configurar. Ele some sozinho quando tudo estiver pronto.",
    placement: "bottom",
  },
];

const LEADS_STEPS: TourStep[] = [
  {
    title: "Central de leads",
    body: "Aqui ficam todos os leads da organizacao, com filtros por categoria, responsavel e periodo.",
    placement: "center",
  },
  {
    target: '[data-tour="leads-new"]',
    title: "Criar um lead",
    body: "Clique em 'Novo Lead' (ou tecla N). Ao digitar o telefone, o CRM avisa se ja existe cadastro, evitando duplicados. Use 'Ja agendou?' para criar lead e agendamento de uma vez.",
    placement: "bottom",
  },
  {
    target: '[data-tour="leads-categories"]',
    title: "Filtre por categoria",
    body: "Os atalhos de categoria (Frio, Quente, Agendado, Fechado) filtram a lista rapidamente para voce focar no que importa.",
    placement: "bottom",
  },
];

const AGENDA_STEPS: TourStep[] = [
  {
    title: "Sua agenda",
    body: "Organize compromissos por profissional e sala, com deteccao automatica de conflitos. Se a agenda estiver bloqueada, configure os horarios em Configuracoes.",
    placement: "center",
  },
  {
    target: '[data-tour="agenda-views"]',
    title: "Dia, Semana e Mes",
    body: "Alterne a visualizacao (atalhos D, W e M). Use ‹ › ou as setas para navegar e 'Hoje' (tecla T) para voltar ao dia atual.",
    placement: "bottom",
  },
  {
    target: '[data-tour="agenda-grouping"]',
    title: "Agrupe a visao",
    body: "Veja a agenda no modo Geral, por Profissional ou por Sala — ideal para enxergar a agenda de cada um sem ruido.",
    placement: "bottom",
  },
  {
    target: '[data-tour="agenda-new"]',
    title: "Novo agendamento",
    body: "Clique em '+ Agendar' (ou tecla N) — ou clique direto num horario livre na grade.",
    placement: "bottom",
  },
];

const CONVERSAS_STEPS: TourStep[] = [
  {
    title: "WhatsApp integrado",
    body: "Atenda as conversas da organizacao sem sair do CRM. Conecte o numero em Configuracoes para ativar a aba.",
    placement: "center",
  },
  {
    target: '[data-tour="conversas-list"]',
    title: "Suas conversas",
    body: "A lista de conversas fica aqui. Navegue rapidamente com as teclas J e K e busque por nome ou telefone.",
    placement: "right",
  },
  {
    target: '[data-tour="conversas-input"]',
    title: "Responda com agilidade",
    body: "Digite / para usar modelos de mensagem, grave audios e envie midias. Enter envia, Shift+Enter quebra linha.",
    placement: "top",
  },
];

/** Passos do modal de boas-vindas conforme o papel. */
export function getWelcomeSteps(role: TourRole): TourStep[] {
  return role === "operator" ? WELCOME_OPERATOR : WELCOME_ADMIN;
}

/** Passos de um tour contextual (mesmos para todos os papeis). */
export function getTourSteps(id: Exclude<TourId, "welcome">): TourStep[] {
  switch (id) {
    case "dashboard":
      return DASHBOARD_STEPS;
    case "leads":
      return LEADS_STEPS;
    case "agenda":
      return AGENDA_STEPS;
    case "conversas":
      return CONVERSAS_STEPS;
  }
}
