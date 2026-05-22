"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { UserInfo } from "@/components/dashboard/user-info";
import { useSession } from "./session-provider";

interface AppShellProps {
  domain: string;
  showSettings: boolean;
  children: React.ReactNode;
}

export function AppShell({ domain, showSettings, children }: AppShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === `/${domain}`;
  const isPublicPage = pathname?.startsWith(`/${domain}/confirmar/`);
  const { companyName } = useSession();

  if (isLoginPage || isPublicPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar domain={domain} showSettings={showSettings} />
      {/* `flex-col` divide a área principal em duas faixas: a barra
          global do topo (nome da clínica + usuário) e o conteúdo da rota
          logo abaixo. O wrapper interno tem `overflow-y-auto` — assim,
          páginas longas (Settings, Leads, Conversas) rolam normalmente,
          e o Dashboard mantém-se sem scroll global porque seu próprio
          root é `h-full overflow-hidden`. */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-1.5 lg:px-6">
            <span className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
              {companyName ?? ""}
            </span>
            <UserInfo
              domain={domain}
              companyName={companyName ?? ""}
            />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
