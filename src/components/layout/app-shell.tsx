"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { UserInfo } from "@/components/dashboard/user-info";
import { useSession } from "./session-provider";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { NewLeadNotifier } from "./new-lead-notifier";
import { WhatsAppSyncIndicator } from "./whatsapp-sync-indicator";
import { WhatsAppDisconnectedBanner } from "./whatsapp-disconnected-banner";
import { TourHost } from "@/components/onboarding/tour-host";
import { SessionTimeoutGuard } from "./session-timeout-guard";

interface AppShellProps {
  domain: string;
  showSettings: boolean;
  children: React.ReactNode;
}

export function AppShell({ domain, showSettings, children }: AppShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === `/${domain}`;
  const isPublicPage =
    pathname?.startsWith(`/${domain}/confirmar/`) ||
    pathname?.startsWith(`/${domain}/redefinir-senha`);
  const { companyName } = useSession();

  // Drawer mobile da sidebar. Fecha por callback explicito quando o
  // usuario clica em um item ou no overlay — evita useEffect com setState
  // sincrono (que o react-hooks/set-state-in-effect reclama corretamente).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (isLoginPage || isPublicPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        domain={domain}
        showSettings={showSettings}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      {/* `flex-col` divide a área principal em duas faixas: a barra
          global do topo (nome da clínica + usuário) e o conteúdo da rota
          logo abaixo. O wrapper interno tem `overflow-y-auto` — assim,
          páginas longas (Settings, Leads, Conversas) rolam normalmente,
          e o Dashboard mantém-se sem scroll global porque seu próprio
          root é `h-full overflow-hidden`. */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-1.5 lg:px-6">
            <div className="flex min-w-0 items-center gap-2">
              {/* Hamburger so aparece em telas <md, onde a sidebar
                  vira drawer. */}
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label="Abrir menu"
                aria-expanded={mobileNavOpen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 md:hidden"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                  />
                </svg>
              </button>
              <span className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
                {companyName ?? ""}
              </span>
              {/* Indicador global de sincronizacao do WhatsApp: fica ao lado
                  do nome da clinica para o operador acompanhar o progresso
                  mesmo navegando para outras telas do CRM. */}
              <WhatsAppSyncIndicator domain={domain} />
            </div>
            <UserInfo
              domain={domain}
              companyName={companyName ?? ""}
            />
          </div>
        </header>
        {/* Faixa global: WhatsApp caiu pelo celular (visivel em qualquer tela). */}
        <WhatsAppDisconnectedBanner domain={domain} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
      {/* Command palette global (Ctrl+K) — fica montado em todas as
          telas autenticadas. */}
      <CommandPalette domain={domain} />
      {/* Atalhos de teclado globais (G-nav, N, ?) + painel de ajuda. */}
      <KeyboardShortcuts domain={domain} showSettings={showSettings} />
      {/* Host do modal de confirmacao destrutiva (replace de window.confirm). */}
      <ConfirmDialogHost />
      {/* Subscriber Realtime de novos leads (toast + badge global). */}
      <NewLeadNotifier domain={domain} />
      {/* Tour guiado de onboarding (welcome + coach marks na 1a visita). */}
      <TourHost domain={domain} />
      {/* Exige novo login quando a aba/navegador foi fechado e reaberto. */}
      <SessionTimeoutGuard domain={domain} />
    </div>
  );
}
