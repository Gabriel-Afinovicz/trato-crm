"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

const TabSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
    ))}
  </div>
);

const TagsManager = dynamic(
  () => import("./tags-manager").then((m) => m.TagsManager),
  { loading: () => <TabSkeleton /> }
);
const SourcesManager = dynamic(
  () => import("./sources-manager").then((m) => m.SourcesManager),
  { loading: () => <TabSkeleton /> }
);
const CustomFieldsManager = dynamic(
  () => import("./custom-fields-manager").then((m) => m.CustomFieldsManager),
  { loading: () => <TabSkeleton /> }
);
const OperatorsManager = dynamic(
  () => import("./operators-manager").then((m) => m.OperatorsManager),
  { loading: () => <TabSkeleton /> }
);
const PipelineStagesManager = dynamic(
  () =>
    import("./pipeline-stages-manager").then((m) => m.PipelineStagesManager),
  { loading: () => <TabSkeleton /> }
);
const RoomsManager = dynamic(
  () => import("./rooms-manager").then((m) => m.RoomsManager),
  { loading: () => <TabSkeleton /> }
);
const ProcedureTypesManager = dynamic(
  () =>
    import("./procedure-types-manager").then((m) => m.ProcedureTypesManager),
  { loading: () => <TabSkeleton /> }
);
const ClinicHoursManager = dynamic(
  () => import("./clinic-hours-manager").then((m) => m.ClinicHoursManager),
  { loading: () => <TabSkeleton /> }
);
const ClinicHolidaysManager = dynamic(
  () =>
    import("./clinic-holidays-manager").then((m) => m.ClinicHolidaysManager),
  { loading: () => <TabSkeleton /> }
);
const AgendaBlocksManager = dynamic(
  () => import("./agenda-blocks-manager").then((m) => m.AgendaBlocksManager),
  { loading: () => <TabSkeleton /> }
);
const MessageTemplatesManager = dynamic(
  () =>
    import("./message-templates-manager").then(
      (m) => m.MessageTemplatesManager
    ),
  { loading: () => <TabSkeleton /> }
);
const UserRoleTagsManager = dynamic(
  () =>
    import("./user-role-tags-manager").then((m) => m.UserRoleTagsManager),
  { loading: () => <TabSkeleton /> }
);
const WhatsAppInstanceManager = dynamic(
  () =>
    import("./whatsapp-instance-manager").then(
      (m) => m.WhatsAppInstanceManager
    ),
  { loading: () => <TabSkeleton /> }
);
const AnalyticsGoalsManager = dynamic(
  () =>
    import("./analytics-goals-manager").then((m) => m.AnalyticsGoalsManager),
  { loading: () => <TabSkeleton /> }
);
const SectorsManager = dynamic(
  () => import("./sectors-manager").then((m) => m.SectorsManager),
  { loading: () => <TabSkeleton /> }
);
const AgendaDefaultsManager = dynamic(
  () =>
    import("./agenda-defaults-manager").then((m) => m.AgendaDefaultsManager),
  { loading: () => <TabSkeleton /> }
);
const ClinicorpIntegrationManager = dynamic(
  () =>
    import("./clinicorp-integration-manager").then(
      (m) => m.ClinicorpIntegrationManager
    ),
  { loading: () => <TabSkeleton /> }
);

type TabId =
  | "pipeline"
  | "tags"
  | "sources"
  | "custom-fields"
  | "analytics-goals"
  | "agenda-defaults"
  | "rooms"
  | "procedures"
  | "hours"
  | "holidays"
  | "blocks"
  | "templates"
  | "operators"
  | "role-tags"
  | "sectors"
  | "whatsapp"
  | "clinicorp";

interface TabDef {
  id: TabId;
  label: string;
  description: string;
  icon: ReactNode;
  /** Quando true, so aparece se canManageOperators=true. */
  adminOnly?: boolean;
}

interface TabGroup {
  id: string;
  label: string;
  tabs: TabDef[];
}

// ----------------------------------------------------------------------------
// Icones (heroicons outline). Mantidos como SVG inline para evitar dependencias.
// ----------------------------------------------------------------------------

const Icon = (path: ReactNode) => (
  <svg
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
    stroke="currentColor"
  >
    {path}
  </svg>
);

const ICONS = {
  pipeline: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 6a2.25 2.25 0 0 1 2.25-2.25h1.5A2.25 2.25 0 0 1 9.75 6v12a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18V6ZM14.25 6A2.25 2.25 0 0 1 16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v6A2.25 2.25 0 0 1 18 14.25h-1.5A2.25 2.25 0 0 1 14.25 12V6Z"
    />
  ),
  tags: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z M6 6h.008v.008H6V6Z"
    />
  ),
  sources: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z"
    />
  ),
  customFields: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
    />
  ),
  goals: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
    />
  ),
  defaults: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  ),
  rooms: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12 11.204 2.94c.44-.44 1.152-.44 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5"
    />
  ),
  procedures: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
    />
  ),
  hours: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  ),
  holidays: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
    />
  ),
  blocks: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
    />
  ),
  messages: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
    />
  ),
  operators: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  ),
  roleTags: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0"
    />
  ),
  sectors: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"
    />
  ),
  whatsapp: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.241.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
    />
  ),
  clinicorp: Icon(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
    />
  ),
};

// ----------------------------------------------------------------------------
// Estrutura de grupos / tabs
// ----------------------------------------------------------------------------

const TAB_GROUPS: TabGroup[] = [
  {
    id: "pipeline",
    label: "Pipeline & Leads",
    tabs: [
      {
        id: "pipeline",
        label: "Pipeline",
        description:
          "Defina e ordene as etapas pelas quais os leads passam, com categorias para mini-dash e funil.",
        icon: ICONS.pipeline,
      },
      {
        id: "tags",
        label: "Tags",
        description:
          "Etiquetas livres para classificar leads (VIP, retorno, urgente, etc.).",
        icon: ICONS.tags,
      },
      {
        id: "sources",
        label: "Fontes",
        description:
          "Origens de captação (Instagram, indicação, site, anúncio, etc.).",
        icon: ICONS.sources,
      },
      {
        id: "custom-fields",
        label: "Campos personalizados",
        description:
          "Crie campos extras para coletar informações específicas do seu negócio.",
        icon: ICONS.customFields,
      },
      {
        id: "analytics-goals",
        label: "Metas analíticas",
        description:
          "Metas mensais que alimentam os KPIs da aba Analítico do Dashboard.",
        icon: ICONS.goals,
      },
    ],
  },
  {
    id: "agenda",
    label: "Agenda",
    tabs: [
      {
        id: "agenda-defaults",
        label: "Padrões",
        description:
          "Duração padrão de atendimento, regras de visibilidade e demais defaults da agenda.",
        icon: ICONS.defaults,
      },
      {
        id: "rooms",
        label: "Salas",
        description:
          "Salas/recursos físicos disponíveis para agendamento (Sala 1, Sala 2, etc.).",
        icon: ICONS.rooms,
      },
      {
        id: "procedures",
        label: "Serviços",
        description:
          "Cadastre os serviços que sua organização oferece, com duração sugerida e valor (ex: consulta, corte, aula, atendimento).",
        icon: ICONS.procedures,
      },
      {
        id: "hours",
        label: "Horários",
        description:
          "Horário de funcionamento da organização por dia da semana.",
        icon: ICONS.hours,
      },
      {
        id: "holidays",
        label: "Feriados",
        description:
          "Datas em que a agenda fica fechada (feriados nacionais ou recessos locais).",
        icon: ICONS.holidays,
      },
      {
        id: "blocks",
        label: "Bloqueios",
        description:
          "Bloqueios pontuais (almoço, reunião, férias) que travam horários na agenda.",
        icon: ICONS.blocks,
      },
    ],
  },
  {
    id: "team",
    label: "Equipe",
    tabs: [
      {
        id: "operators",
        label: "Membros",
        description:
          "Usuários com acesso ao CRM (administradores e operadores).",
        icon: ICONS.operators,
        adminOnly: true,
      },
      {
        id: "role-tags",
        label: "Funções",
        description:
          "Funções/cargos atribuíveis aos membros (Profissional, Secretário(a), etc.).",
        icon: ICONS.roleTags,
        adminOnly: true,
      },
      {
        id: "sectors",
        label: "Setores",
        description:
          "Setores/departamentos para segmentar o atendimento de leads.",
        icon: ICONS.sectors,
        adminOnly: true,
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrações",
    tabs: [
      {
        id: "whatsapp",
        label: "WhatsApp",
        description:
          "Conecte e gerencie a instância de WhatsApp usada pela organização.",
        icon: ICONS.whatsapp,
        adminOnly: true,
      },
      {
        id: "templates",
        label: "Templates de mensagem",
        description:
          "Modelos de mensagem usados em confirmações, lembretes, follow-ups e respostas rápidas no WhatsApp.",
        icon: ICONS.messages,
      },
      {
        id: "clinicorp",
        label: "Clinicorp",
        description:
          "Envie automaticamente os leads do CRM para a sua conta Clinicorp (campanhas e pacientes).",
        icon: ICONS.clinicorp,
        adminOnly: true,
      },
    ],
  },
];

const ALL_TABS: TabDef[] = TAB_GROUPS.flatMap((g) => g.tabs);

interface SettingsContentProps {
  canManageOperators?: boolean;
  initialTab?: string;
}

export function SettingsContent({
  canManageOperators = false,
  initialTab,
}: SettingsContentProps) {
  // Filtra tabs que so admin pode ver. Mantemos a estrutura por grupo
  // para que cada grupo possa colapsar inteiro quando ficar vazio.
  const visibleGroups = useMemo<TabGroup[]>(() => {
    return TAB_GROUPS.map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => !t.adminOnly || canManageOperators),
    })).filter((g) => g.tabs.length > 0);
  }, [canManageOperators]);

  const visibleTabIds = useMemo(
    () => new Set(visibleGroups.flatMap((g) => g.tabs.map((t) => t.id))),
    [visibleGroups]
  );

  const resolvedInitial: TabId =
    initialTab && visibleTabIds.has(initialTab as TabId)
      ? (initialTab as TabId)
      : visibleGroups[0]?.tabs[0]?.id ?? "pipeline";

  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitial);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Sincroniza ?tab= na URL sem disparar RSC re-fetch (history.replaceState).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === activeTab) return;
    url.searchParams.set("tab", activeTab);
    window.history.replaceState(null, "", url.toString());
  }, [activeTab]);

  const activeDef = useMemo(
    () => ALL_TABS.find((t) => t.id === activeTab) ?? ALL_TABS[0],
    [activeTab]
  );

  function changeTab(id: TabId) {
    setActiveTab(id);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-full flex-col bg-gray-50 lg:flex-row">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start overflow-y-auto border-r border-gray-200 bg-white px-3 py-6 lg:block">
        <div className="mb-4 px-2">
          <h1 className="text-base font-semibold text-gray-900">
            Configurações
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Personalize sua organização
          </p>
        </div>
        <SidebarNav
          groups={visibleGroups}
          activeTab={activeTab}
          onSelect={changeTab}
        />
      </aside>

      {/* ---------- Mobile/tablet topbar ---------- */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Configurações</h1>
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-gray-500">{activeDef.icon}</span>
              {activeDef.label}
            </span>
            <svg
              className={`h-3 w-3 transition-transform ${
                mobileNavOpen ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
        </div>
        {mobileNavOpen && (
          <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
            <SidebarNav
              groups={visibleGroups}
              activeTab={activeTab}
              onSelect={changeTab}
            />
          </div>
        )}
      </div>

      {/* ---------- Conteudo ---------- */}
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>
                {visibleGroups.find((g) =>
                  g.tabs.some((t) => t.id === activeTab)
                )?.label ?? ""}
              </span>
              <span>›</span>
              <span className="font-medium text-gray-700">
                {activeDef.label}
              </span>
            </div>
            <div className="mt-1 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                {activeDef.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {activeDef.label}
                </h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  {activeDef.description}
                </p>
              </div>
            </div>
          </div>

          <div>
            {activeTab === "pipeline" && <PipelineStagesManager />}
            {activeTab === "tags" && <TagsManager />}
            {activeTab === "sources" && <SourcesManager />}
            {activeTab === "custom-fields" && <CustomFieldsManager />}
            {activeTab === "analytics-goals" && <AnalyticsGoalsManager />}
            {activeTab === "agenda-defaults" && <AgendaDefaultsManager />}
            {activeTab === "rooms" && <RoomsManager />}
            {activeTab === "procedures" && <ProcedureTypesManager />}
            {activeTab === "hours" && <ClinicHoursManager />}
            {activeTab === "holidays" && <ClinicHolidaysManager />}
            {activeTab === "blocks" && <AgendaBlocksManager />}
            {activeTab === "templates" && <MessageTemplatesManager />}
            {activeTab === "operators" && canManageOperators && (
              <OperatorsManager />
            )}
            {activeTab === "role-tags" && canManageOperators && (
              <UserRoleTagsManager />
            )}
            {activeTab === "sectors" && canManageOperators && (
              <SectorsManager />
            )}
            {activeTab === "whatsapp" && canManageOperators && (
              <WhatsAppInstanceManager />
            )}
            {activeTab === "clinicorp" && canManageOperators && (
              <ClinicorpIntegrationManager />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Componente da navegacao (compartilhado entre desktop e mobile).
// ----------------------------------------------------------------------------

function SidebarNav({
  groups,
  activeTab,
  onSelect,
}: {
  groups: TabGroup[];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-blue-50 font-medium text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span
                    className={`shrink-0 ${
                      active
                        ? "text-blue-600"
                        : "text-gray-400 group-hover:text-gray-500"
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
