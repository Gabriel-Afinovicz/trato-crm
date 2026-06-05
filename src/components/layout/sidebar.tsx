"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface SidebarProps {
  domain: string;
  showSettings: boolean;
  /**
   * Controle do drawer em mobile. Quando true, a sidebar aparece como
   * overlay; em desktop a prop e ignorada e a sidebar fica sempre visivel.
   */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface SubNavItem {
  /** Valor passado em `?tab=` para a rota pai. */
  tab: string;
  label: string;
  icon: React.ReactNode;
}

interface NavItem {
  label: string;
  /** Rota base (sem `?tab=`); o `[domain]` é prepended em runtime. */
  href: string;
  icon: React.ReactNode;
  /** Quando definido, o item vira um expansível com sub-rotas. */
  children?: SubNavItem[];
}

const ICON_DASHBOARD = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
  </svg>
);

const ICON_KANBAN = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6a2.25 2.25 0 0 1 2.25-2.25h1.5A2.25 2.25 0 0 1 9.75 6v12a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18V6ZM14.25 6A2.25 2.25 0 0 1 16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v6A2.25 2.25 0 0 1 18 14.25h-1.5A2.25 2.25 0 0 1 14.25 12V6Z" />
  </svg>
);
const ICON_FUNIL = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5L14.25 12v6.75L9.75 21v-9L3.75 5.25Z" />
  </svg>
);
const ICON_ANALITICO = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const baseNavItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: ICON_DASHBOARD,
    // Ordem fixada: Analítico, Kanban, Funil (do mais executivo ao mais operacional).
    children: [
      { tab: "analitico", label: "Analítico", icon: ICON_ANALITICO },
      { tab: "kanban", label: "Kanban", icon: ICON_KANBAN },
      { tab: "funil", label: "Funil", icon: ICON_FUNIL },
    ],
  },
  {
    label: "Leads",
    href: "/leads",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    label: "Agenda",
    href: "/agenda",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
  {
    label: "Conversas",
    href: "/conversas",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
  },
];

const settingsNavItem: NavItem = {
  label: "Configurações",
  href: "/settings",
  icon: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
};

const COLLAPSE_STORAGE_KEY = "crm.sidebar.collapsed";

export function Sidebar({
  domain,
  showSettings,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navItems = showSettings
    ? [...baseNavItems, settingsNavItem]
    : baseNavItems;

  // Quantidade de leads criados nas ultimas 24h — alimenta o badge no
  // item "Leads". Atualizado em multiplas situacoes:
  //  - mount inicial;
  //  - polling de 60s (cobre o caso de outro operador criar um lead);
  //  - mudanca de rota (navegar entre telas mantem o badge fresco);
  //  - volta de foco da aba do navegador;
  //  - evento custom `crm:lead-created` disparado pelo lead-form ao salvar.
  // Sem o ultimo, o usuario que acabou de cadastrar um lead esperava ate
  // 60s para ver o badge surgir — fluxo confuso.
  const [newLeadsCount, setNewLeadsCount] = useState<number>(0);
  const refetchNewLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads/new-count", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      if (typeof data.count === "number") setNewLeadsCount(data.count);
    } catch {
      /* silencioso — badge apenas desaparece */
    }
  }, []);

  useEffect(() => {
    void refetchNewLeads();
    const id = window.setInterval(refetchNewLeads, 60_000);
    function onFocus() {
      void refetchNewLeads();
    }
    function onLeadCreated() {
      void refetchNewLeads();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("crm:lead-created", onLeadCreated);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("crm:lead-created", onLeadCreated);
    };
  }, [refetchNewLeads]);

  // Refetch tambem ao trocar de rota — garante badge fresco quando o
  // usuario volta de /leads (visualizando os recentes) para outra tela.
  useEffect(() => {
    void refetchNewLeads();
  }, [pathname, refetchNewLeads]);

  // O Dashboard troca de aba via `history.replaceState` (sem fetch RSC)
  // para evitar piscadas. Como `useSearchParams` só reage a navegações
  // do router, a sidebar precisa escutar um evento custom para refletir
  // o sub-item ativo. Sincroniza com o `?tab=` da URL como ponto inicial.
  const [currentTab, setCurrentTab] = useState<string | null>(
    searchParams.get("tab")
  );
  useEffect(() => {
    setCurrentTab(searchParams.get("tab"));
  }, [searchParams]);
  useEffect(() => {
    function onTabChange(e: Event) {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === "string") setCurrentTab(ce.detail);
    }
    window.addEventListener("crm:dashboard-tab", onTabChange);
    return () => window.removeEventListener("crm:dashboard-tab", onTabChange);
  }, []);

  // Estado de colapso persistido em localStorage para sobreviver a
  // recargas. Iniciamos com `false` no SSR e ajustamos no efeito para
  // evitar mismatch de hidratação.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignora */
    }
  }, []);
  const setCollapsedPersisted = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* ignora */
    }
  };

  // Estado de expansão do Dashboard. Expandido por padrão quando o
  // usuário está em alguma rota de dashboard; senão, fechado.
  const dashboardHref = `/${domain}/dashboard`;
  const isOnDashboard = pathname?.startsWith(dashboardHref);
  const [dashOpen, setDashOpen] = useState<boolean>(!!isOnDashboard);
  useEffect(() => {
    if (isOnDashboard) setDashOpen(true);
  }, [isOnDashboard]);

  return (
    <>
      {/* Overlay clicavel para fechar o drawer em mobile. Renderizado
          apenas quando mobileOpen=true. No desktop nunca aparece (md:hidden). */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={[
          // Desktop: sidebar estatica, controlada por `collapsed`.
          // Mobile (<md): vira drawer fixed que desliza pela esquerda.
          "flex h-full flex-col border-r border-slate-200/85 bg-slate-50/95 backdrop-blur-md",
          "transition-[width,transform] duration-200",
          collapsed ? "md:w-14" : "md:w-60",
          // No mobile o drawer tem largura fixa amigavel ao polegar
          // e usa transform para abrir/fechar.
          "fixed inset-y-0 left-0 z-40 w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:relative md:translate-x-0",
        ].join(" ")}
      >
      {/* Botão de minimizar/expandir — flutua na borda direita, na
          altura do header. Aparece sempre, com a seta apontando para
          o lado oposto ao estado atual. Escondido em mobile (drawer). */}
      <button
        type="button"
        onClick={() => setCollapsedPersisted(!collapsed)}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        className="absolute -right-3 top-4 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md hover:bg-slate-50 hover:text-slate-700 md:inline-flex transition-all duration-200"
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>
 
      <div className="flex h-16 items-center gap-3 border-b border-slate-200/60 bg-white px-4">
        {collapsed ? (
          // Recolhida: mostra so a marca (funil) recortando a logo a esquerda.
          <div className="h-8 w-8 shrink-0 overflow-hidden">
            <Image
              src="/trato-crm-logo.png"
              alt="Trato CRM"
              width={727}
              height={195}
              className="h-8 w-auto max-w-none"
              priority
            />
          </div>
        ) : (
          <Image
            src="/trato-crm-logo.png"
            alt="Trato CRM"
            width={727}
            height={195}
            className="h-8 w-auto"
            priority
          />
        )}
      </div>
 
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          const fullHref = `/${domain}${item.href}`;
          const isItemActive =
            pathname === fullHref ||
            (item.href !== "/dashboard" && pathname.startsWith(fullHref));
          const isDashboard = item.href === "/dashboard";
          const isActiveOnDashboard = !!isDashboard && !!isOnDashboard;
 
          // Item com sub-rotas (Dashboard). Em modo colapsado, mostra
          // só o ícone — clicar leva para a aba padrão.
          if (item.children && !collapsed) {
            return (
              <div key={item.href} className="space-y-1">
                <div
                  className={`flex items-center gap-1 transition-all duration-200 rounded-lg ${
                    isActiveOnDashboard
                      ? "bg-gradient-to-r from-blue-500/8 to-indigo-500/4 text-blue-600 shadow-sm font-semibold"
                      : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900 hover:translate-x-0.5"
                  }`}
                >
                  <Link
                    href={`${fullHref}?tab=${item.children[0].tab}`}
                    onClick={onMobileClose}
                    className="flex flex-1 items-center gap-3 px-3 py-2 text-sm font-medium transition-colors"
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDashOpen((v) => !v)}
                    aria-label={
                      dashOpen
                        ? `Recolher submenu ${item.label}`
                        : `Expandir submenu ${item.label}`
                    }
                    className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
                  >
                    <svg
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${
                        dashOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
                {dashOpen && (
                  <div className="ml-3 space-y-0.5 border-l border-slate-200/60 pl-2">
                    {item.children.map((sub) => {
                      const isSubActive =
                        isOnDashboard && currentTab === sub.tab;
                      return (
                        <Link
                          key={sub.tab}
                          href={`${fullHref}?tab=${sub.tab}`}
                          onClick={onMobileClose}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
                            isSubActive
                              ? "bg-gradient-to-r from-blue-500/8 to-indigo-500/4 text-blue-600 shadow-sm font-semibold"
                              : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900 hover:translate-x-0.5"
                          }`}
                        >
                          {sub.icon}
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
 
          // Item com sub-rotas, em modo colapsado: só ícone, vai pra
          // primeira aba ao clicar.
          if (item.children && collapsed) {
            return (
              <Link
                key={item.href}
                href={`${fullHref}?tab=${item.children[0].tab}`}
                title={item.label}
                onClick={onMobileClose}
                className={`flex items-center justify-center rounded-lg p-2 transition-all duration-200 ${
                  isActiveOnDashboard
                    ? "bg-blue-50 text-blue-600 shadow-sm scale-105"
                    : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900"
                }`}
              >
                {item.icon}
              </Link>
            );
          }
 
          // Item simples. Mostra badge de novos leads (ultimas 24h)
          // quando aplicavel — so no item Leads e somente se count > 0.
          const showLeadsBadge =
            item.href === "/leads" && newLeadsCount > 0;
          const badgeLabel =
            newLeadsCount > 99 ? "99+" : String(newLeadsCount);
 
          return (
            <Link
              key={item.href}
              href={fullHref}
              title={collapsed ? item.label : undefined}
              onClick={onMobileClose}
              className={`flex items-center gap-3 transition-all duration-200 ${
                collapsed ? "justify-center p-2 rounded-lg" : "px-3 py-2 rounded-lg"
              } text-sm font-medium ${
                isItemActive
                  ? collapsed
                    ? "bg-blue-50 text-blue-600 shadow-sm scale-105"
                    : "bg-gradient-to-r from-blue-500/8 to-indigo-500/4 text-blue-600 shadow-sm font-semibold"
                  : `text-slate-600 hover:bg-slate-200/40 hover:text-slate-900 ${
                      !collapsed ? "hover:translate-x-0.5" : ""
                    }`
              }`}
            >
              <span className="relative inline-flex">
                {item.icon}
                {showLeadsBadge && collapsed && (
                  // Modo colapsado: numero pequeno sobre o icone, na cor
                  // herdada do link (text-blue-600 quando ativo, text-slate-600
                  // quando inativo). Sem fundo nem borda — so o numero.
                  <span
                    aria-label={`${newLeadsCount} leads novos nas ultimas 24h`}
                    className="absolute -right-2 -top-1.5 text-[10px] font-semibold leading-none text-red-500"
                  >
                    {badgeLabel}
                  </span>
                )}
              </span>
              {!collapsed && (
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span>{item.label}</span>
                  {showLeadsBadge && (
                    // Modo expandido: apenas o numero, sem pill, herdando
                    // a cor do texto do item (azul quando ativo, cinza
                    // quando inativo).
                    <span
                      aria-label={`${newLeadsCount} leads novos nas ultimas 24h`}
                      title="Leads criados nas ultimas 24h"
                      className="text-xs font-semibold tabular-nums text-red-500"
                    >
                      {badgeLabel}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
 
      <div className="border-t border-slate-200/60 p-2">
        <a
          href={`/ajuda?d=${encodeURIComponent(domain)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Ajuda e tutorial"
          className={`flex items-center gap-3 rounded-lg text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-200/40 hover:text-blue-600 ${
            collapsed ? "justify-center p-2" : "px-3 py-2 hover:translate-x-0.5"
          }`}
        >
          <svg
            className="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
          {!collapsed && (
            <span className="flex flex-1 flex-col">
              <span>Ajuda e tutorial</span>
              <span className="text-[11px] font-normal text-slate-400">
                Como usar o CRM (beta)
              </span>
            </span>
          )}
        </a>
        {!collapsed && (
          <p className="mt-2 truncate px-3 text-xs text-slate-400 font-semibold">{domain}</p>
        )}
      </div>
      </aside>
    </>
  );
}
