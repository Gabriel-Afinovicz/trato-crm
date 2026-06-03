"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface UserInfoProps {
  domain: string;
  /** Mantido por compatibilidade com `app-shell` — atualmente nao exibido
   *  dentro deste componente porque o nome da clinica ja aparece no
   *  header global a esquerda. */
  companyName?: string;
}

export function UserInfo({ domain }: UserInfoProps) {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    const isSuperAdmin = profile?.role === "super_admin";
    await signOut();
    router.push(isSuperAdmin ? "/wosnicz" : `/${domain}`);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
        <div className="hidden h-3 w-24 animate-pulse rounded bg-gray-200 sm:block" />
      </div>
    );
  }

  if (!profile) return null;

  const roleLabel =
    profile.role === "super_admin"
      ? "Super Admin"
      : profile.role === "admin"
      ? "Administrador"
      : "Operador";

  const isSuperAdmin = profile.role === "super_admin";

  return (
    <div className="flex items-center gap-2">
      {isSuperAdmin && (
        <Link
          href="/wosnicz/dashboard"
          title="Painel Master"
          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
        >
          <svg
            className="h-3 w-3"
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
          Master
        </Link>
      )}

      {/* Identidade compacta: saudacao + avatar + nome inline; cargo so
          em telas maiores como texto secundario para nao competir com o
          conteudo. */}
      <div
        className="flex items-center gap-2"
        title={`${profile.name} · ${roleLabel}`}
      >
        {/* Saudacao curta — aparece a partir de md para nao apertar telas
            pequenas. */}
        <span className="hidden text-xs text-gray-500 md:inline">
          Olá,
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
          {profile.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="hidden flex-col leading-tight sm:flex">
          <span className="text-xs font-medium text-gray-800">
            {profile.name.split(" ")[0]}
          </span>
          <span className="text-[10px] text-gray-500">{roleLabel}</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="h-7 px-2 text-xs"
      >
        Sair
      </Button>
    </div>
  );
}
