"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { resetAllToursLocal } from "@/lib/onboarding/use-onboarding-tour";

interface AjudaClientProps {
  domain?: string;
}

interface DocItem {
  id: string;
  title: string;
  description: string;
  steps?: string[];
  tips?: string[];
  keywords: string[];
}

interface DocCategory {
  id: string;
  title: string;
  icon: ReactNode;
  description: string;
  items: DocItem[];
}

// Componente para Teclas de Atalho estilizadas
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-200">
      {children}
    </kbd>
  );
}

// Componente para alertas/dicas
function Tip({ type = "tip", children }: { type?: "tip" | "warning"; children: ReactNode }) {
  if (type === "warning") {
    return (
      <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
        <svg className="h-5 w-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" />
        </svg>
        <div className="leading-relaxed">
          <strong className="font-semibold block mb-0.5">Importante!</strong>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      <svg className="h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8.25 21h7.5m-7.5-3v-1.5A3.75 3.75 0 0 1 12 12.75a3.75 3.75 0 0 0 3.75-3.75 3.75 3.75 0 0 0-7.5 0" />
      </svg>
      <div className="leading-relaxed">
        <strong className="font-semibold block mb-0.5">Dica Prática:</strong>
        {children}
      </div>
    </div>
  );
}

// Componente para passos enumerados
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-4 p-3 rounded-xl transition-all duration-200 hover:bg-gray-50">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 shadow-sm">
        {n}
      </span>
      <div className="text-sm leading-relaxed text-gray-700 pt-0.5">{children}</div>
    </div>
  );
}

// Componente de realce de pesquisa
function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <>{text}</>;
  
  const escapedHighlight = highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escapedHighlight})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-gray-900 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function AjudaClient({ domain }: AjudaClientProps) {
  const backHref = domain ? `/${domain}/dashboard` : "/";

  // Reinicia o tour guiado: limpa as marcacoes de "ja visto" deste
  // navegador e volta ao CRM, onde o tour dispara novamente.
  function handleRestartTour() {
    resetAllToursLocal();
    if (domain) {
      window.location.href = `/${domain}/dashboard`;
    }
  }

  const [activeTab, setActiveTab] = useState("inicio");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estados dos Mini-Simuladores Interativos
  const [simSyncProgress, setSimSyncProgress] = useState(25);
  const [simSyncActive, setSimSyncActive] = useState(false);
  const [simPressedKey, setSimPressedKey] = useState<string | null>(null);

  // Simulador de Sincronização do WhatsApp
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (simSyncActive) {
      interval = setInterval(() => {
        setSimSyncProgress((prev) => {
          if (prev >= 100) {
            setSimSyncActive(false);
            return 100;
          }
          return prev + 5;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [simSyncActive]);

  const startSimSync = () => {
    setSimSyncProgress(0);
    setSimSyncActive(true);
  };

  // Tecla de atalho "/" para focar busca
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Base de Dados de Documentação Geral
  const categories: DocCategory[] = useMemo(() => [
    {
      id: "inicio",
      title: "Começando",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
      description: "O básico em poucos segundos para começar a operar seu CRM sem complicações.",
      items: [
        {
          id: "fluxo-geral",
          title: "O Fluxo de Trabalho do CRM",
          description: "O Trato CRM foi projetado para centralizar toda a jornada de aquisição e agendamento de leads da organização, minimizando cliques e integrando as etapas comerciais diretamente com os canais de atendimento.",
          steps: [
            "Conexão do WhatsApp: A equipe conecta o número da organização na aba de WhatsApp.",
            "Captura de Oportunidades: As conversas recebidas e novos leads são listados e vinculados instantaneamente.",
            "Gestão do Funil (Kanban): O operador acompanha o progresso do lead movendo o cartão entre as colunas correspondentes (Primeiro Contato, Negociação, Agendado, Fechado).",
            "Agendamento de Compromissos: Com o lead qualificado, o agendamento de compromissos/consultas é feito de maneira fluida e sincronizada na agenda integrada."
          ],
          tips: [
            "Você pode ocultar/recolher o menu lateral esquerdo clicando na setinha no topo dele para maximizar o espaço visual ao gerenciar o Kanban ou responder conversas."
          ],
          keywords: ["começar", "fluxo", "trabalho", "introdução", "básico", "CRM", "visão geral", "menu lateral", "organização"]
        },
        {
          id: "primeiros-passos",
          title: "Guia Rápido de Configuração Inicial",
          description: "Para administradores que acabaram de acessar o CRM, as ações prioritárias recomendadas são:",
          steps: [
            "Cadastrar Profissionais e Operadores: Vá em Configurações > Membros e crie as contas com ramais específicos.",
            "Customizar as Etapas do Funil: Defina as colunas do funil visual em Configurações > Funil de Vendas de acordo com os processos da sua organização.",
            "Criar Fontes e Tags: Configure as fontes de atração (ex: Instagram, Google) e Tags (ex: Urgente, Interessado) para classificar os leads.",
            "Conectar a Instância de WhatsApp: Gere o QR Code na aba WhatsApp para liberar o recebimento de mensagens da organização inteira."
          ],
          keywords: ["configuração", "inicial", "administrador", "primeiro", "passo", "membros", "operador", "profissional", "etapa", "funil"]
        }
      ]
    },
    {
      id: "dashboard",
      title: "Dashboard",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      ),
      description: "Monitore a receita, o faturamento da organização, o volume de leads e converta oportunidades de forma visual.",
      items: [
        {
          id: "analitico",
          title: "Aba Analítico: Faturamento e Desempenho",
          description: "Visualize a saúde financeira e comercial de forma analítica no período desejado (hoje, ontem, 7 dias, mês atual ou período personalizado).",
          steps: [
            "Leads Criados: Total de oportunidades que entraram na organização no período determinado.",
            "Faturamento de Fechamentos: Soma do valor contratado dos leads na etapa 'Ganho'.",
            "Taxa de Conversão: Porcentagem de leads que foram convertidos com sucesso.",
            "Ticket Médio: Média do valor de fechamento contratado por lead.",
            "Painel de Metas: Uma barra gráfica animada que compara a meta mensal de faturamento configurada com a receita de fechamentos atual."
          ],
          tips: [
            "As metas de faturamento e taxas de conversão ajudam a equipe a focar nos resultados diários. Configure as metas em Configurações > Metas de Vendas."
          ],
          keywords: ["dashboard", "analítico", "gráfico", "métrica", "faturamento", "receita", "conversão", "ticket médio", "meta", "período"]
        },
        {
          id: "kanban",
          title: "Aba Kanban: Otimização do Fluxo de Leads",
          description: "Gerencie os leads através de um quadro de cartões interativo. Mudar a etapa de um lead atualiza automaticamente o pipeline e gera notificações relevantes.",
          steps: [
            "Arrastar e Soltar: Arraste o cartão de um lead para a direita ou esquerda para alterar sua etapa no funil.",
            "Menu Rápido de Ações (...): Clique no botão de três pontos no canto do cartão do lead para abrir um menu onde você pode alterar a etapa rapidamente sem usar o mouse, ou abrir a edição completa.",
            "Indicadores Visuais: Os cartões possuem selos coloridos para tags, o nome do operador responsável, a fonte e alertas como compromissos pendentes."
          ],
          tips: [
            "Diferencial: Ao arrastar um lead para a etapa final de ganho ou perda, o CRM abrirá automaticamente um mini formulário para você definir o valor total acordado ou o motivo da perda."
          ],
          keywords: ["kanban", "quadro", "arrastar", "cards", "etapas", "etapa", "leads", "funil", "alteração rápida"]
        },
        {
          id: "funil",
          title: "Aba Funil: Gargalos do Processo",
          description: "Mostra uma visualização geométrica clássica de funil de vendas. Esta aba é excelente para identificar onde os leads em potencial estão desistindo da contratação (ex: se há muitos leads em 'Negociação' mas poucos avançam para 'Agendado').",
          keywords: ["funil", "conversão", "estágios", "gargalo", "visualização", "perda", "queda", "porcentagem"]
        }
      ]
    },
    {
      id: "leads",
      title: "Leads",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.97 5.97 0 00-.75-2.985m-.001-2.997a3 3 0 11-5.998-1.22M16.5 12A3.75 3.75 0 1012 8.25c-1.39 0-2.673.535-3.642 1.411m12 5.338a9.09 9.09 0 01-2.078-4.097M12 8.25a3.75 3.75 0 00-3.642 5.09m6.494-1.24A4.5 4.5 0 0012 12m-6.494.01a4.5 4.5 0 004.5-4.51c0-2.485-2.015-4.51-4.5-4.51S1 5.025 1 7.5c0 2.22 1.607 4.07 3.741 4.498M6 18.72a9.094 9.094 0 01-3.741-.479 3 3 0 014.682-2.72m-.94 3.198.002.031c0 .225.012.447.037.666A11.944 11.944 0 0012 21c2.17 0 4.207-.576 5.963-1.584A6.062 6.062 0 0018 18.722" />
        </svg>
      ),
      description: "Acompanhe fichas completas, dados financeiros de fechamento, histórico de interações e integração de dados.",
      items: [
        {
          id: "cadastro-lead",
          title: "Como Criar e Classificar um Lead",
          description: "Cadastrar novos leads é a base da alimentação do CRM. Faça isso de forma inteligente:",
          steps: [
            "Cadastro Rápido: Clique em 'Novo Lead' no cabeçalho/sidebar ou simplesmente pressione a tecla N de qualquer lugar.",
            "Prevenção de Duplicados: Ao digitar o telefone, o CRM valida automaticamente no banco de dados. Caso o telefone já exista, um aviso será exibido com um link direto para a ficha do lead já existente.",
            "Classificação: Preencha o Setor (ex: Vendas, Suporte), o Responsável da equipe, a Origem/Fonte de captação (ex: Tráfego do Facebook) e as Tags para agilizar buscas futures.",
            "Opção 'Já agendou?': Ao marcar essa caixa na criação, você já define a data, sala e profissional, criando o lead e o compromisso de uma só vez, movendo-o automaticamente para a coluna 'Agendado'."
          ],
          keywords: ["lead", "novo lead", "criar", "cadastrar", "duplicado", "telefone", "cadastro rápido", "já agendou"]
        },
        {
          id: "dados-financeiros",
          title: "Financeiro dos Negócios (Valor de Fechamento)",
          description: "O CRM acompanha os valores acordados para fornecer o faturamento total e ticket médio da organização no dashboard.",
          steps: [
            "Valor de Fechamento: O custo total aprovado do fechamento do lead.",
            "Valor de Entrada: A quantia inicial paga no ato do fechamento. Útil para medir o fluxo de caixa inicial dos novos leads.",
            "Motivo da Perda: Caso a contratação seja recusada, altere a etapa para 'Perdido' e preencha o motivo correspondente para análise de métricas de rejeição."
          ],
          keywords: ["financeiro", "valor", "fechamento", "entrada", "perdido", "ganho", "ticket médio", "negócio", "receita"]
        },
        {
          id: "integracao-clinicorp",
          title: "Integração Avançada: Sistemas e ERPs (ex: Clinicorp)",
          description: "Conecte sua conta de ERP ou sistema externo parceiro (ex: Clinicorp) para evitar digitação duplicada e unificar a ficha do lead com o CRM comercial.",
          steps: [
            "Mapeamento de Fontes e Status: Vincule as fontes cadastradas no CRM com as origens de leads registradas na Clinicorp.",
            "Sincronização de Dados: Quando um lead é criado no CRM, as informações são enviadas de forma segura em background para a Clinicorp.",
            "Membro Responsável: A integração associa o operador que efetuou a negociação no CRM ao cadastro correspondente na Clinicorp."
          ],
          tips: [
            "Acesse Configurações > Integrações para ligar e configurar as credenciais do sistema parceiro (ex: Clinicorp). Apenas administradores têm acesso."
          ],
          keywords: ["integração", "sincronizar", "dados", "erp", "organização", "configurações", "credenciais"]
        }
      ]
    },
    {
      id: "agenda",
      title: "Agenda",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
        </svg>
      ),
      description: "Organize salas físicas, profissionais de atendimento, evite choques de horários e visualize agendamentos.",
      items: [
        {
          id: "navegacao-agenda",
          title: "Visualização e Atalhos na Agenda",
          description: "A Agenda integrada permite navegar pelo cronograma de agendamentos da organização de forma extremamente eficiente:",
          steps: [
            "Modos de Exibição: Alterne entre os modos Dia, Semana ou Mês. Use os atalhos D, W, M no teclado para mudar instantaneamente.",
            "Navegação Temporal: Use as setas ← e → no teclado para retroceder ou avançar nos dias/semanas. Pressione T para pular direto para hoje.",
            "Filtros de Agenda: Utilize o menu superior para filtrar por Profissional de Atendimento ou por Sala Física (Sala/Espaço). Isso é essencial para visualizar apenas as agendas do profissional selecionado.",
            "Novo Agendamento: Pressione a tecla N enquanto visualiza a Agenda para abrir o popup de nova consulta."
          ],
          keywords: ["agenda", "calendário", "hoje", "dia", "semana", "mês", "setas", "navegar", "filtrar", "agendamentos"]
        },
        {
          id: "profissionais-salas",
          title: "Configuração de Salas, Profissionais e Bloqueios",
          description: "Evite conflitos logísticos cadastrando as informações físicas e profissionais corretas.",
          steps: [
            "Mapeamento de Salas: Vá em Configurações > Salas para registrar seus espaços físicos (ex: Sala 1, Sala 2). Isso possibilita organizar os agendamentos por sala e evitar que dois profissionais usem o mesmo local simultaneamente.",
            "Profissionais da Agenda: Cadastre o profissional na aba Configurações > Membros e marque a opção 'É Profissional/Dentista?' (ou flag equivalente). Com isso, ele ficará disponível para ter agendamentos vinculados ao seu nome.",
            "Bloqueios de Agenda: Para reuniões, recessos ou horários de almoço fixos, crie um bloqueio na agenda de um profissional. O sistema emitirá um aviso de choque de horário caso um operador tente agendar um lead nesse período."
          ],
          keywords: ["salas", "profissionais", "profissional", "bloqueio", "reunião", "almoço", "escala", "choque", "conflito"]
        }
      ]
    },
    {
      id: "conversas",
      title: "Conversas (WhatsApp)",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      ),
      description: "Conecte a Evolution API, sincronize contatos em background, grave áudios e envie mídias no WhatsApp integrado.",
      items: [
        {
          id: "conexao-qr",
          title: "Como Conectar a Instância de WhatsApp",
          description: "O Trato CRM conecta-se diretamente com o WhatsApp da organização via tecnologia Evolution API.",
          steps: [
            "Gerar o QR Code: Acesse Configurações > WhatsApp (Instance Manager) e clique em Gerar QR Code.",
            "Escanear com o Celular: No aparelho celular da organização, abra o WhatsApp, acesse Aparelhos Conectados e aponte para a tela para fazer a leitura do código.",
            "Progresso de Sincronização: Uma vez conectado, uma barra de progresso no cabeçalho superior informará o carregamento de contatos e do histórico das conversas recentes.",
            "Background: Você não precisa esperar na tela de carregamento. Pode mudar de aba e trabalhar normalmente no CRM enquanto o sistema atualiza as conversas em segundo plano."
          ],
          tips: [
            "Se você notar que novas conversas não estão aparecendo, você pode abrir as Configurações de WhatsApp e clicar no botão 'Sincronizar' para forçar a importação manual."
          ],
          keywords: ["whatsapp", "qrcode", "conexão", "evolution", "sincronizar", "progresso", "celular", "instância", "sincronização"]
        },
        {
          id: "chat-recursos",
          title: "Recursos do Chat (Mídias, Áudios e Templates)",
          description: "O painel de Conversas é projetado para centralizar as mensagens com a mesma velocidade do WhatsApp Web, adicionando recursos inteligentes comerciais:",
          steps: [
            "Envio de Arquivos e Mídias: Envie fotos, vídeos e documentos PDF/planilhas de até 4MB simplesmente anexando no chat.",
            "Gravação de Mensagens de Voz: Grave áudios no navegador clicando no ícone do microfone, agilizando respostas longas.",
            "Modelos de Mensagem (Templates): Digite a barra / na caixa de digitação para abrir o menu de respostas rápidas pré-configuradas. Escreva o termo de busca para filtrar, selecione a resposta com as setas e pressione Enter para jogá-la no chat.",
            "Vinculação Imediata ao Lead: Do lado direito do chat, o painel do contato mostra se ele já é um Lead cadastrado. Caso não seja, você pode clicar em 'Vincular a Lead' ou 'Criar Novo Lead' com apenas um clique. A conversa fica linkada e exibe o status de funil do cliente na hora."
          ],
          tips: [
            "Atalhos de Chat: Use as teclas J e K no teclado para descer e subir a lista de conversas ativas rapidamente sem tirar as mãos do teclado."
          ],
          keywords: ["chat", "mídia", "áudio", "templates", "respostas rápidas", "barra", "vincular lead", "conversas", "mensagem", "voz", "atalhos J/K"]
        }
      ]
    },
    {
      id: "config",
      title: "Configurações",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.505.71-.93.78l-.893.15a1.125 1.125 0 01-1.11-.94l-.149-.894c-.07-.424-.383-.764-.78-.93-.398-.164-.854-.142-1.205.108l-.738.527a1.125 1.125 0 01-1.448-.12l-.774-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.11v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.504-.71.93-.78l.893-.15a1.125 1.125 0 011.11.94l.149.894c.07.424.383.764.78.93.398.164.854.142 1.205-.108l.738.527a1.125 1.125 0 011.448.12l.774.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.108 1.204.165.397.505.71.93.78l.894.15c.542.09.94.56.94 1.11v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.765.383-.93.78-.165.398-.504.71-.93.78l-.893.15a1.125 1.125 0 01-1.11-.94l-.149-.894c-.07-.424-.383-.764-.78-.93-.398-.164-.854-.142-1.205-.108l-.738.527a1.125 1.125 0 01-1.448-.12l-.774-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204.165-.397.505-.71.93-.78l.894-.15z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      description: "Cadastre membros com ramais exclusivos, personalize etapas do funil de vendas, crie tags e campos adicionais.",
      items: [
        {
          id: "membros-operadores",
          title: "Operadores, Ramais e Permissões",
          description: "No Trato CRM, os profissionais da organização não logam com e-mail, mas sim através de um Ramal Numérico criado pelo Administrador.",
          steps: [
            "Cadastrar Membro: Acesse Configurações > Membros e clique em Criar Membro.",
            "Definição de Ramal e Senha: Atribua um número de ramal (ex: 101) e uma senha de acesso rápida. O membro usará essas credenciais na tela de login.",
            "Níveis de Acesso: Defina se o membro é um Administrador (pode gerenciar configurações, excluir leads e configurar instâncias) ou um Operador (atende e move leads do funil, mas não acessa telas críticas de configuração).",
            "Profissional da Agenda: Se o membro cadastrado realizar atendimento de agendamentos, marque a flag 'É Profissional/Dentista?' para liberá-lo nas seleções da Agenda."
          ],
          keywords: ["membros", "operadores", "ramal", "senha", "permissões", "administrador", "operador", "profissionais", "profissional", "login"]
        },
        {
          id: "etapas-customizadas",
          title: "Customizando as Etapas do Funil e Cores",
          description: "Você pode adaptar o funil comercial exatamente ao formato de captação da organização:",
          steps: [
            "Reordenação por Arraste: Na aba Configurações > Funil de Vendas, arraste as linhas para cima ou para baixo para alterar a ordem visual das colunas no Kanban.",
            "Categorização de Sucesso: Defina quais etapas contam como tratamento Ganho (ex: Tratamento Iniciado) ou tratamento Perdido (ex: Desistiu/Falta de Contato).",
            "Cores e Nomes: Altere a cor do selo de cada etapa para facilitar a identificação visual rápida no Kanban."
          ],
          keywords: ["etapas", "personalização", "cores", "funil de vendas", "ganho", "perdido", "arrastar etapas", "customizar funil"]
        },
        {
          id: "fontes-tags-campos",
          title: "Campos Customizados, Fontes e Tags Globais",
          description: "Gerencie as categorias internas para segmentação e relatórios eficientes:",
          steps: [
            "Fontes de Captação: Cadastre de onde seus leads vêm (ex: Google, TikTok, Indicação) para avaliar o retorno de investimento de marketing.",
            "Tags do CRM: Crie termos rápidos para colar nos leads (ex: 'Urgência', 'Orçamento Alto', 'Aparelho').",
            "Campos Customizados: Adicione perguntas específicas à ficha do lead (ex: 'Possui convênio?', 'Responsável Financeiro'). Você escolhe se o campo é texto simples, número ou caixa de seleção."
          ],
          keywords: ["fontes", "tags", "campos personalizados", "customizados", "origem", "ficha do lead", "segmentação"]
        }
      ]
    },
    {
      id: "atalhos",
      title: "Atalhos & Comandos",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        </svg>
      ),
      description: "Use o poderoso Command Palette (Ctrl+K), sequências globais de teclado e opere o sistema na velocidade da luz.",
      items: [
        {
          id: "paleta-comando",
          title: "Command Palette (Ctrl + K / Cmd + K)",
          description: "O recurso mais avançado de produtividade do Trato CRM. Ao pressionar Ctrl + K (ou Cmd + K no Mac), uma janela flutuante se abrirá em qualquer tela:",
          steps: [
            "Busca Rápida de Leads: Digite o nome de um lead ou parte do número de telefone dele. O CRM faz uma varredura instantânea no banco de dados e exibe o link direto para a ficha.",
            "Abrir WhatsApp Imediatamente: Digite um número de telefone com DDD (ex: 11999998888). O CRM exibirá a ação 'Abrir conversa de WhatsApp'. Ao teclar Enter, você é direcionado para a conversa do número, mesmo que ele ainda não seja um contato salvo.",
            "Navegar Sem Cliques: A paleta oferece opções rápidas de navegação, como 'Ir para a Agenda', 'Ir para Configurações' ou 'Criar novo Lead'."
          ],
          keywords: ["ctrl+k", "cmd+k", "paleta de comandos", "command palette", "atalho de busca", "buscar lead", "abrir whatsapp", "produtividade"]
        },
        {
          id: "teclas-globais",
          title: "Tabela Completa de Atalhos de Teclado",
          description: "Confira todos os atalhos disponíveis no sistema. Eles ficam desativados apenas quando você está digitando em campos de texto (para evitar disparos acidentais):",
          steps: [
            "Navegação Global: G seguido de D (Dashboard, abre o Analítico) / L (Leads) / A (Agenda) / C (Conversas) / S (Configurações).",
            "Ações Rápidas: N (Novo Lead ou Nova Consulta) / Ctrl + Enter (Salvar Ficha do Lead) / Esc (Fechar Modais e Telas Laterais).",
            "Abas de Dashboard: Teclas 1, 2 e 3 alternam respectivamente entre Analítico, Kanban e Funil de Vendas.",
            "Agenda: T (Ir para hoje) / ← e → (Voltar/Avançar período) / D, W, M (Exibição por Dia, Semana e Mês).",
            "Conversas/WhatsApp: J e K (Navegar entre contatos da lista) / Ctrl + F (Focar na busca de mensagens da conversa)."
          ],
          tips: [
            "Pressione a tecla ? a qualquer momento no CRM autenticado para abrir o painel visual flutuante de atalhos.",
            "Os atalhos contextuais — Dashboard (1/2/3), Agenda (T, ← , →, D, W, M, N) e Conversas (J/K, Ctrl+F) — funcionam apenas quando você está na tela correspondente."
          ],
          keywords: ["atalhos", "teclado", "tabela", "teclas", "navegação", "J", "K", "T", "N", "Esc", "atalhos de teclado"]
        }
      ]
    },
    {
      id: "dicas",
      title: "Boas Práticas & Diferenciais",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096m.813 5.096a11.968 11.968 0 01-1.897-1.13C4.94 18.062 3 15.26 3 12c0-5.25 4.25-9.5 9.5-9.5s9.5 4.25 9.5 9.5c0 3.26-1.94 6.062-4.887 7.77a11.968 11.968 0 01-1.897 1.13c-.29.155-.588.3-.896.434M9.5 10.5h.008v.008H9.5V10.5zm0 2.25h.008v.008H9.5V12.75zm3-2.25h.008v.008H12.5V10.5zm0 2.25h.008v.008H12.5V12.75zm3-2.25h.008v.008H15.5V10.5z" />
        </svg>
      ),
      description: "Orientações fundamentais sobre proteção do chip de WhatsApp, controle de fuso horário e sincronização inteligente.",
      items: [
        {
          id: "evitar-bloqueio",
          title: "Como Proteger o Número da Organização contra Banimento",
          description: "O WhatsApp possui sistemas automatizados rigorosos contra spam. Como o Trato CRM atende leads utilizando conexões do seu chip, siga as diretrizes recomendadas:",
          steps: [
            "Evite Mensagens em Massa Não Solicitadas: Não use o sistema para fazer disparos frios em massa para números que nunca conversaram com a organização antes.",
            "Aquecimento de Números Novos: Se você comprou um chip novo para o WhatsApp da organização, comece conversando manualmente com parentes ou colaboradores por alguns dias antes de colocá-lo para rodar no CRM.",
            "Personalize as Respostas Rápidas: Ao usar os Templates (/), tente adicionar detalhes pessoais (nome do lead) nas mensagens para que elas não sejam idênticas, reduzindo as chances de identificação por robôs do WhatsApp.",
            "Número Salvo: Peça aos seus leads para adicionarem o número da organização na agenda deles. Isso diminui a probabilidade do WhatsApp banir seu chip."
          ],
          keywords: ["banimento", "bloqueio", "whatsapp", "chip", "spam", "segurança", "boas práticas", "proteger", "aquecimento"]
        },
        {
          id: "timezone-explicacao",
          title: "Controle Inteligente de Fuso Horário",
          description: "Uma dúvida comum de organizações com filiais ou membros operando em estados diferentes é sobre o horário da Agenda.",
          steps: [
            "Fuso Horário Centralizado: Todos os agendamentos salvos no banco de dados e exibidos na tela respeitam o timezone configurado na tabela de empresas (coluna timezone no Supabase).",
            "Independência do Navegador: Se o operador estiver viajando e acessar o CRM de um fuso horário diferente, ele ainda verá os agendamentos no fuso oficial configurado para a organização, prevenindo remarcações incorretas."
          ],
          keywords: ["timezone", "fuso horário", "agenda", "horas", "horário", "empresa", "configuração", "diferencial"]
        }
      ]
    }
  ], []);

  // Motor de Busca Simples
  const allDocItems = useMemo(() => {
    const list: Array<{
      categoryTitle: string;
      categoryId: string;
      item: DocItem;
    }> = [];
    categories.forEach((cat) => {
      cat.items.forEach((item) => {
        list.push({
          categoryTitle: cat.title,
          categoryId: cat.id,
          item,
        });
      });
    });
    return list;
  }, [categories]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    
    return allDocItems.filter(({ item, categoryTitle }) => {
      return (
        categoryTitle.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
        (item.steps && item.steps.some((st) => st.toLowerCase().includes(q))) ||
        (item.tips && item.tips.some((tp) => tp.toLowerCase().includes(q)))
      );
    });
  }, [searchQuery, allDocItems]);

  // Ação ao clicar em um resultado de busca
  const handleSelectResult = (categoryId: string, itemId: string) => {
    setSearchQuery(""); // Limpa a busca
    setActiveTab(categoryId); // Ativa a aba/categoria correspondente
    
    // Rola suavemente até o item
    setTimeout(() => {
      const element = document.getElementById(itemId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // Adiciona um feedback visual temporário (piscar borda)
        element.classList.add("ring-4", "ring-blue-500", "ring-offset-2");
        setTimeout(() => {
          element.classList.remove("ring-4", "ring-blue-500", "ring-offset-2");
        }, 1500);
      }
    }, 100);
  };

  const activeCategory = categories.find((cat) => cat.id === activeTab);

  // Diferenciais em destaque no topo da pagina (o "porque usar").
  const differentials: { icon: ReactNode; title: string; desc: string }[] = [
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      ),
      title: "WhatsApp integrado",
      desc: "Atenda sem sair do CRM: áudios, mídias, modelos de mensagem (digite /) e sincronização das conversas em segundo plano.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      ),
      title: "Busca universal (Ctrl + K)",
      desc: "Encontre leads, abra uma conversa de WhatsApp pelo telefone e navegue entre telas em um piscar de olhos.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6a2.25 2.25 0 0 1 2.25-2.25h1.5A2.25 2.25 0 0 1 9.75 6v12a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18V6ZM14.25 6A2.25 2.25 0 0 1 16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v6A2.25 2.25 0 0 1 18 14.25h-1.5A2.25 2.25 0 0 1 14.25 12V6Z" />
        </svg>
      ),
      title: "Kanban inteligente",
      desc: "Arraste leads entre etapas. Ao marcar ganho ou perda, o CRM abre o formulário de valor fechado ou motivo da perda na hora.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
        </svg>
      ),
      title: "Prevenção de duplicados",
      desc: "Ao digitar o telefone de um novo lead, o sistema avisa se ele já existe — com link direto para a ficha cadastrada.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
      ),
      title: "Agenda com fuso fixo",
      desc: "Salas, profissionais e bloqueios com detecção automática de conflitos — sempre no fuso horário oficial da organização.",
    },
    {
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      ),
      title: "Integração Clinicorp",
      desc: "Sincronize leads e agendamentos com seu sistema/ERP, sem digitação dupla e mantendo o responsável da negociação.",
    },
  ];

  // Trilhas "comece por aqui" — passos clicaveis levando as telas certas.
  const adminPath: { label: string; href?: string }[] = [
    { label: "Configurar o pipeline (etapas do Kanban)", href: domain ? `/${domain}/settings?tab=pipeline` : undefined },
    { label: "Adicionar membros da equipe", href: domain ? `/${domain}/settings?tab=members` : undefined },
    { label: "Definir os horários da agenda", href: domain ? `/${domain}/settings?tab=hours` : undefined },
    { label: "Conectar o WhatsApp", href: domain ? `/${domain}/settings?tab=whatsapp` : undefined },
    { label: "Criar o primeiro lead", href: domain ? `/${domain}/leads/new` : undefined },
  ];
  const operatorPath: { label: string; href?: string }[] = [
    { label: "Conhecer o Kanban de leads", href: domain ? `/${domain}/dashboard?tab=kanban` : undefined },
    { label: "Cadastrar um lead (tecla N)", href: domain ? `/${domain}/leads/new` : undefined },
    { label: "Atender no WhatsApp", href: domain ? `/${domain}/conversas` : undefined },
    { label: "Dominar os atalhos (Ctrl + K e ?)" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased selection:bg-blue-500 selection:text-white">
      {/* Cabeçalho Premium com Gradiente */}
      <header className="relative overflow-hidden border-b border-slate-200 bg-white shadow-sm">
        {/* Efeito sutil de gradiente de fundo */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-50/50 to-transparent" />
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />
        
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Image
                src="/trato-crm-logo.png"
                alt="Trato CRM"
                width={727}
                height={195}
                className="h-9 w-auto"
                priority
              />
              <div className="h-6 w-px bg-slate-200 hidden sm:block" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900">
                    Central de Ajuda
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                    Versão Beta
                  </span>
                </div>
              </div>
            </div>
            
            <Link
              href={backHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Voltar ao CRM
            </Link>
          </div>

          <div className="mt-4">
            <p className="text-sm text-slate-500 max-w-2xl">
              Aprenda a otimizar, configurar e usar todos os diferenciais da sua organização.
            </p>
          </div>

          {/* Barra de Busca Interativa no Cabeçalho */}
          <div className="mt-6 relative max-w-2xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar configurações, WhatsApp, leads, atalhos, integrações..."
              className="block w-full rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-20 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all text-base"
            />
            <div className="absolute inset-y-0 right-3 flex items-center gap-1">
              <kbd className="pointer-events-none hidden rounded bg-slate-200 px-2 py-1 text-xs font-mono font-medium text-slate-500 sm:inline">
                /
              </kbd>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  aria-label="Limpar busca"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero de diferenciais + trilhas de primeiros passos. Oculto durante
          a busca para nao competir com os resultados. */}
      {!searchQuery && (
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  Tudo o que sua organização precisa, em um só lugar
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Capte leads, atenda pelo WhatsApp, gerencie o funil e a agenda
                  sem trocar de ferramenta. Veja os diferenciais e siga uma
                  trilha rápida para começar.
                </p>
              </div>
              <button
                onClick={handleRestartTour}
                disabled={!domain}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  domain
                    ? "Reinicia o tour guiado passo a passo dentro do CRM"
                    : "Abra a ajuda a partir do CRM para reiniciar o tour"
                }
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Refazer tour guiado
              </button>
            </div>

            {/* Cards de diferenciais. */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {differentials.map((d) => (
                <div
                  key={d.title}
                  className="group rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition-all hover:border-blue-300 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    {d.icon}
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-slate-900">
                    {d.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    {d.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Trilhas por papel. */}
            <div className="mt-8">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Comece por aqui
              </h3>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {[
                  {
                    badge: "Sou Administrador",
                    subtitle: "Deixe o CRM pronto para a equipe usar.",
                    steps: adminPath,
                  },
                  {
                    badge: "Sou Operador",
                    subtitle: "Comece a atender e fechar leads hoje.",
                    steps: operatorPath,
                  },
                ].map((track) => (
                  <div
                    key={track.badge}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {track.badge}
                    </span>
                    <p className="mt-2 text-xs text-slate-500">{track.subtitle}</p>
                    <ol className="mt-3 space-y-1.5">
                      {track.steps.map((st, idx) => {
                        const inner = (
                          <>
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 group-hover/step:bg-blue-100 group-hover/step:text-blue-700">
                              {idx + 1}
                            </span>
                            <span className="pt-0.5">{st.label}</span>
                          </>
                        );
                        return (
                          <li key={st.label}>
                            {st.href ? (
                              <Link
                                href={st.href}
                                className="group/step flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-blue-50/60 hover:text-blue-700"
                              >
                                {inner}
                              </Link>
                            ) : (
                              <div className="flex items-start gap-2.5 px-2 py-1.5 text-sm font-medium text-slate-600">
                                {inner}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Grid Principal */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[260px_1fr] lg:gap-8 lg:px-8">
        
        {/* Menu Lateral (Ocultado se houver busca ativa para evitar conflitos cognitivos) */}
        <aside className="mb-6 lg:mb-0">
          <nav className="sticky top-6 flex flex-row gap-2 overflow-x-auto pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
            <p className="hidden px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:block mb-3">
              Módulos do Sistema
            </p>
            {categories.map((cat) => {
              const isActive = cat.id === activeTab && !searchQuery;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveTab(cat.id);
                    setSearchQuery(""); // Limpa a busca ao trocar de categoria
                  }}
                  className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 lg:w-full ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/10 translate-x-1"
                      : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/50"
                  }`}
                >
                  <span className={isActive ? "text-white" : "text-slate-400"}>
                    {cat.icon}
                  </span>
                  {cat.title}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Área de Conteúdo */}
        <main className="space-y-8">
          
          {/* MODO BUSCA ATIVA */}
          {searchQuery.trim() !== "" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  Resultados para &ldquo;{searchQuery}&rdquo; ({searchResults.length})
                </h2>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Limpar Busca
                </button>
              </div>

              {searchResults.length > 0 ? (
                <div className="grid gap-6">
                  {searchResults.map(({ categoryTitle, categoryId, item }) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectResult(categoryId, item.id)}
                      className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-400 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-700 transition-all">
                          {categoryTitle}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1 group-hover:text-blue-600 transition-all">
                          Ver artigo completo
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                          </svg>
                        </span>
                      </div>
                      
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        <HighlightText text={item.title} highlight={searchQuery} />
                      </h3>
                      
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        <HighlightText text={item.description} highlight={searchQuery} />
                      </p>

                      {item.steps && (
                        <div className="mt-3 pl-3 border-l-2 border-slate-200 group-hover:border-blue-300 transition-colors space-y-1">
                          {item.steps.slice(0, 2).map((st, idx) => (
                            <p key={idx} className="text-xs text-slate-500 truncate">
                              • <HighlightText text={st} highlight={searchQuery} />
                            </p>
                          ))}
                          {item.steps.length > 2 && (
                            <p className="text-[10px] text-slate-400 font-medium">
                              + {item.steps.length - 2} passos adicionais...
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                  <h3 className="mt-4 text-base font-bold text-slate-900">
                    Nenhum guia encontrado
                  </h3>
                  <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                    Não encontramos resultados para &ldquo;{searchQuery}&rdquo;. Tente buscar por palavras-chave mais simples, como &ldquo;WhatsApp&rdquo;, &ldquo;Integrações&rdquo; ou &ldquo;ramal&rdquo;.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {["WhatsApp", "Atalhos", "Profissional", "Metas", "Integrações"].map((term) => (
                      <button
                        key={term}
                        onClick={() => setSearchQuery(term)}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        Buscar &ldquo;{term}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            
            // MODO CATEGORIAS (PADRÃO)
            <div className="space-y-10">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    {activeCategory?.icon}
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {activeCategory?.title}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {activeCategory?.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista de Artigos da Categoria */}
              <div className="space-y-8">
                {activeCategory?.items.map((item) => (
                  <section
                    key={item.id}
                    id={item.id}
                    className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      {item.title}
                    </h3>
                    
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                      {item.description}
                    </p>

                    {item.steps && (
                      <div className="mt-5 space-y-2.5">
                        {item.steps.map((st, idx) => (
                          <Step key={idx} n={idx + 1}>
                            {/* Converter KBD tags simulados em jsx */}
                            {st.split(/(\[.*?\])/g).map((part, pidx) => {
                              if (part.startsWith("[") && part.endsWith("]")) {
                                const inside = part.slice(1, -1);
                                if (inside.includes("+") || inside.length === 1 || inside.match(/^(Ctrl|Cmd|Esc|Enter|Shift|Tab|Setas|Backspace|Del)/i)) {
                                  return <Kbd key={pidx}>{inside}</Kbd>;
                                }
                              }
                              return part;
                            })}
                          </Step>
                        ))}
                      </div>
                    )}

                    {item.tips && (
                      <div className="mt-5 space-y-3">
                        {item.tips.map((tp, idx) => (
                          <Tip key={idx} type={tp.startsWith("Importante") || tp.includes("evitar") ? "warning" : "tip"}>
                            {tp.split(/(\[.*?\])/g).map((part, pidx) => {
                              if (part.startsWith("[") && part.endsWith("]")) {
                                return <Kbd key={pidx}>{part.slice(1, -1)}</Kbd>;
                              }
                              return part;
                            })}
                          </Tip>
                        ))}
                      </div>
                    )}

                    {/* Mini Simuladores Contextuais para WOW! */}
                    {item.id === "conexao-qr" && (
                      <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-3 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Simulador de Sincronização do Head
                        </h4>
                        <p className="text-xs text-emerald-700 mb-3">
                          Veja como a barra de progresso no topo do CRM é exibida quando você conecta seu WhatsApp:
                        </p>
                        
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-inner flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs font-semibold text-slate-500 shrink-0">WhatsApp Organização:</span>
                            <div className="h-2 bg-slate-100 rounded-full flex-1 overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${simSyncProgress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-emerald-600 shrink-0">{simSyncProgress}%</span>
                          </div>
                          
                          <button
                            onClick={startSimSync}
                            disabled={simSyncActive}
                            className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {simSyncActive ? "Conectando..." : "Simular Conexão"}
                          </button>
                        </div>
                      </div>
                    )}

                    {item.id === "teclas-globais" && (
                      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                          Testar Teclado Virtual de Atalhos
                        </h4>
                        <p className="text-xs text-slate-600 mb-4">
                          Pressione as teclas no teclado físico ou clique nos botões abaixo para ver o atalho de navegação no CRM:
                        </p>
                        
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                          {[
                            { key: "G", desc: "Prefixo Go-To" },
                            { key: "D", desc: "Dashboard" },
                            { key: "L", desc: "Leads" },
                            { key: "A", desc: "Agenda" },
                            { key: "C", desc: "Conversas" },
                            { key: "S", desc: "Ajustes" },
                            { key: "N", desc: "Novo Lead" },
                            { key: "?", desc: "Atalhos" },
                          ].map((item) => (
                            <button
                              key={item.key}
                              onMouseDown={() => setSimPressedKey(item.key)}
                              onMouseUp={() => setSimPressedKey(null)}
                              className={`rounded-lg border p-2 flex flex-col items-center shadow-sm transition-all duration-100 ${
                                simPressedKey === item.key
                                  ? "bg-blue-600 border-blue-600 text-white scale-95 shadow-inner"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                              }`}
                            >
                              <kbd className="text-sm font-bold font-mono">{item.key}</kbd>
                              <span className="text-[9px] text-slate-400 mt-1 truncate max-w-full">
                                {item.desc}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}
          
          {/* Caixa de Contato / Suporte */}
          <footer className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
            <h3 className="text-base font-bold text-slate-900">
              Ainda tem dúvidas sobre o funcionamento?
            </h3>
            <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              O CRM está em constante evolução. Fale diretamente com o suporte técnico ou com o administrador para tirar dúvidas, reportar bugs ou enviar ideias de melhorias.
            </p>
            <div className="mt-5">
              <Link
                href={backHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-blue-700 transition-colors"
              >
                Voltar e começar a praticar
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </footer>

          <p className="text-center text-xs text-slate-400">
            Trato CRM &middot; Central de Ajuda &middot; Todos os direitos reservados.
          </p>
        </main>
      </div>
    </div>
  );
}
