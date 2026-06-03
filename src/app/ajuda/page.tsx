import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Tutorial · Trato CRM",
  description:
    "Guia rápido para começar a usar o Trato CRM nesta versão beta: dashboard, leads, agenda, conversas (WhatsApp), configurações e atalhos.",
};

interface AjudaPageProps {
  searchParams: Promise<{ d?: string }>;
}

// ── Blocos reutilizaveis ─────────────────────────────────────────────────────

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded-md border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gray-700 shadow-sm">
      {children}
    </kbd>
  );
}

function Section({
  id,
  index,
  title,
  subtitle,
  children,
}: {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {index}
        </span>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
        {n}
      </span>
      <div className="text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span aria-hidden className="font-semibold">
        Dica:
      </span>
      <span>{children}</span>
    </div>
  );
}

const TOC = [
  { id: "inicio", label: "Começando" },
  { id: "dashboard", label: "Dashboard" },
  { id: "leads", label: "Leads e funil" },
  { id: "agenda", label: "Agenda" },
  { id: "conversas", label: "Conversas (WhatsApp)" },
  { id: "config", label: "Configurações e equipe" },
  { id: "atalhos", label: "Atalhos de teclado" },
  { id: "suporte", label: "Suporte" },
];

export default async function AjudaPage({ searchParams }: AjudaPageProps) {
  const { d } = await searchParams;
  const backHref = d ? `/${d}/dashboard` : "/";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-gray-200 bg-white">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-blue-500/10 to-transparent" />
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Image
              src="/trato-crm-logo.png"
              alt="Trato CRM"
              width={727}
              height={195}
              className="h-9 w-auto"
              priority
            />
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5 8.25 12l7.5-7.5"
                />
              </svg>
              Voltar ao CRM
            </Link>
          </div>
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Versão beta
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Como usar o Trato CRM
            </h1>
            <p className="mt-2 max-w-2xl text-base text-gray-600">
              Um guia rápido e direto para você dominar o sistema em poucos
              minutos. Tudo o que precisa para captar, organizar e atender seus
              leads em um só lugar.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
        {/* Índice (sticky em telas grandes) */}
        <aside className="hidden lg:block">
          <nav className="sticky top-8 space-y-1">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Conteúdo
            </p>
            {TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-blue-700"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Conteúdo */}
        <main className="space-y-10">
          <Section
            id="inicio"
            index={1}
            title="Começando"
            subtitle="O básico em 30 segundos"
          >
            <p className="text-sm leading-relaxed text-gray-700">
              O Trato CRM organiza toda a jornada do lead: do primeiro
              contato no WhatsApp até o fechamento e o agendamento. O menu
              lateral à esquerda dá acesso às áreas principais.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-sm text-gray-700">
                <strong className="text-gray-900">Dashboard</strong> — visão
                geral, funil de vendas e indicadores.
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-sm text-gray-700">
                <strong className="text-gray-900">Leads</strong> — todos os
                contatos/oportunidades cadastrados.
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-sm text-gray-700">
                <strong className="text-gray-900">Agenda</strong> — consultas e
                horários dos profissionais.
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-sm text-gray-700">
                <strong className="text-gray-900">Conversas</strong> — WhatsApp
                integrado ao CRM.
              </div>
            </div>
            <Tip>
              Você pode recolher o menu lateral no botão de seta para ganhar
              espaço de tela.
            </Tip>
          </Section>

          <Section
            id="dashboard"
            index={2}
            title="Dashboard"
            subtitle="Três formas de enxergar suas vendas"
          >
            <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
              <li>
                <strong className="text-gray-900">Analítico</strong> —
                indicadores do período: total de leads, taxa de conversão,
                ticket médio e gráficos de desempenho.
              </li>
              <li>
                <strong className="text-gray-900">Kanban</strong> — quadro com
                colunas por etapa do funil. Arraste o card do lead de uma coluna
                para outra para mudar a etapa.
              </li>
              <li>
                <strong className="text-gray-900">Funil</strong> — visão em
                funil com a quantidade de leads em cada estágio.
              </li>
            </ul>
            <Tip>
              No Kanban, clique em um card para abrir os detalhes do lead e
              editar rapidamente. Use as teclas <Kbd>1</Kbd> <Kbd>2</Kbd>{" "}
              <Kbd>3</Kbd> para alternar entre Analítico, Kanban e Funil.
            </Tip>
          </Section>

          <Section
            id="leads"
            index={3}
            title="Leads e funil"
            subtitle="Cadastre e acompanhe cada oportunidade"
          >
            <Step n={1}>
              Para criar um lead, clique em <strong>Novo lead</strong> (ou use o
              atalho <Kbd>N</Kbd>). Preencha nome e telefone — os demais campos
              são opcionais.
            </Step>
            <Step n={2}>
              Defina <strong>Fonte</strong> (de onde veio o lead),{" "}
              <strong>Setor</strong>, <strong>Operador responsável</strong> e{" "}
              <strong>Tags</strong> para classificar e filtrar depois.
            </Step>
            <Step n={3}>
              Marque <strong>“Já agendou?”</strong> no cadastro para criar a
              consulta junto e mover o lead direto para a etapa Agendado.
            </Step>
            <Step n={4}>
              No campo Financeiro, informe o valor de fechamento e a entrada —
              eles alimentam o Ticket Médio do Analítico.
            </Step>
            <Tip>
              Se o telefone já existir, o sistema avisa para evitar leads
              duplicados — você pode abrir o lead existente ou criar mesmo
              assim.
            </Tip>
          </Section>

          <Section
            id="agenda"
            index={4}
            title="Agenda"
            subtitle="Consultas dos profissionais em um calendário"
          >
            <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
              <li>
                Visualize por <strong>dia</strong>, <strong>semana</strong> ou{" "}
                <strong>mês</strong> e filtre por profissional ou sala.
              </li>
              <li>
                Clique em um horário livre para criar um agendamento; clique em
                um agendamento existente para editar ou reagendar.
              </li>
              <li>
                Bloqueios e horários de funcionamento são respeitados para
                evitar conflitos.
              </li>
            </ul>
            <Tip>
              Atalhos na Agenda: <Kbd>T</Kbd> vai para hoje, as setas{" "}
              <Kbd>←</Kbd> <Kbd>→</Kbd> navegam, e <Kbd>D</Kbd> <Kbd>W</Kbd>{" "}
              <Kbd>M</Kbd> alternam dia/semana/mês.
            </Tip>
          </Section>

          <Section
            id="conversas"
            index={5}
            title="Conversas (WhatsApp)"
            subtitle="Atenda pelo WhatsApp sem sair do CRM"
          >
            <Step n={1}>
              Em <strong>Configurações &rsaquo; WhatsApp</strong>, conecte o
              número da clínica lendo o QR Code com o celular (o mesmo fluxo do
              WhatsApp Web).
            </Step>
            <Step n={2}>
              Após conectar, o sistema importa seus contatos recentes e um breve
              histórico. Se quiser forçar, use o botão{" "}
              <strong>Sincronizar</strong>.
            </Step>
            <Step n={3}>
              Abra uma conversa para responder. É possível enviar mídia,
              responder mensagens específicas e reagir com emojis.
            </Step>
            <Step n={4}>
              No painel lateral do contato, você pode{" "}
              <strong>vincular a um lead</strong> existente ou{" "}
              <strong>criar um novo lead</strong> já com o telefone preenchido —
              a conversa fica vinculada automaticamente e passa a mostrar as
              informações do lead.
            </Step>
            <Tip>
              Use <Kbd>J</Kbd> e <Kbd>K</Kbd> para navegar entre as conversas da
              lista sem o mouse.
            </Tip>
          </Section>

          <Section
            id="config"
            index={6}
            title="Configurações e equipe"
            subtitle="Personalize o CRM para a sua clínica"
          >
            <ul className="space-y-2 text-sm leading-relaxed text-gray-700">
              <li>
                <strong className="text-gray-900">Membros</strong> — cadastre
                administradores e operadores (login por ramal + senha).
                Administradores podem alterar a senha de qualquer membro e a
                própria.
              </li>
              <li>
                <strong className="text-gray-900">Funções e Setores</strong> —
                organize a equipe e os leads por papel e departamento.
              </li>
              <li>
                <strong className="text-gray-900">Fontes e Campos</strong> —
                defina de onde vêm os leads e crie campos personalizados.
              </li>
              <li>
                <strong className="text-gray-900">Integrações</strong> — conecte
                ferramentas externas (ex.: Clinicorp) para sincronizar dados.
              </li>
            </ul>
            <Tip>
              As Configurações ficam disponíveis apenas para administradores.
            </Tip>
          </Section>

          <Section
            id="atalhos"
            index={7}
            title="Atalhos de teclado"
            subtitle="Trabalhe mais rápido sem o mouse"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <ShortcutRow keys={<Kbd>Ctrl/⌘ + K</Kbd>} desc="Busca rápida" />
              <ShortcutRow
                keys={
                  <>
                    <Kbd>G</Kbd> depois <Kbd>D</Kbd>/<Kbd>L</Kbd>/<Kbd>A</Kbd>/
                    <Kbd>C</Kbd>
                  </>
                }
                desc="Ir para Dashboard / Leads / Agenda / Conversas"
              />
              <ShortcutRow keys={<Kbd>N</Kbd>} desc="Novo lead" />
              <ShortcutRow
                keys={<Kbd>Ctrl/⌘ + Enter</Kbd>}
                desc="Salvar o formulário do lead"
              />
              <ShortcutRow
                keys={
                  <>
                    <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd>
                  </>
                }
                desc="Alternar abas do Dashboard"
              />
              <ShortcutRow
                keys={
                  <>
                    <Kbd>J</Kbd> <Kbd>K</Kbd>
                  </>
                }
                desc="Navegar conversas"
              />
              <ShortcutRow keys={<Kbd>?</Kbd>} desc="Abrir a lista de atalhos" />
              <ShortcutRow keys={<Kbd>Esc</Kbd>} desc="Fechar janelas/painéis" />
            </div>
          </Section>

          <Section
            id="suporte"
            index={8}
            title="Suporte"
            subtitle="Estamos por perto"
          >
            <p className="text-sm leading-relaxed text-gray-700">
              Esta é uma versão <strong>beta</strong> em evolução constante.
              Encontrou algo estranho ou tem uma sugestão? Fale com a equipe
              Trato — seu feedback ajuda a priorizar as próximas melhorias.
            </p>
            <div className="pt-1">
              <Link
                href={backHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Voltar ao CRM
              </Link>
            </div>
          </Section>

          <p className="pt-2 text-center text-xs text-gray-400">
            Trato CRM · versão beta
          </p>
        </main>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: ReactNode; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
      <span className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
        {keys}
      </span>
      <span className="text-right text-sm text-gray-700">{desc}</span>
    </div>
  );
}
