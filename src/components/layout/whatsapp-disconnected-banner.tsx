"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./session-provider";
import { useWhatsAppConnection } from "@/lib/whatsapp/use-whatsapp-connection";

interface WhatsAppDisconnectedBannerProps {
  domain: string;
}

/**
 * Faixa global (topo do CRM) que aparece quando o WhatsApp foi desconectado
 * PELO CELULAR (aparelho removido dos dispositivos conectados) — diferente de
 * uma desconexao feita pelo proprio CRM, que segue o fluxo normal de
 * Configuracoes sem alarde.
 *
 * - Admin: botao "Reconectar" que exclui a instancia (reaproveita o
 *   /instance/disconnect, que faz reset+delete na Evolution e zera o token) e
 *   leva para Configuracoes ▸ WhatsApp, onde um novo QR e gerado do zero —
 *   evitando o erro de "nome em uso" na recriacao.
 * - Operador: apenas o aviso para contatar um administrador (conectar/
 *   desconectar e restrito a admins).
 *
 * Em tempo real via `useWhatsAppConnection` (assina `whatsapp_instances`).
 */
export function WhatsAppDisconnectedBanner({
  domain,
}: WhatsAppDisconnectedBannerProps) {
  const router = useRouter();
  const { companyId, profile } = useSession();
  const { phoneDisconnected } = useWhatsAppConnection(companyId, domain);
  const [working, setWorking] = useState(false);

  const isAdmin = profile?.role === "admin";

  if (!phoneDisconnected) return null;

  async function handleReconnect() {
    if (working) return;
    setWorking(true);
    try {
      // Exclui a instancia (reset+delete + token=null) para que a reconexao
      // recrie do zero e gere QR novo sem erro de "nome em uso".
      await fetch("/api/whatsapp/instance/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
    } catch {
      // Mesmo que a exclusao falhe, levamos para Configuracoes: o proprio
      // fluxo de conexao tenta forceDelete antes de recriar.
    } finally {
      router.push(`/${domain}/settings?tab=whatsapp`);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 text-amber-800">
        <svg
          className="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.07 12.26A1.5 1.5 0 004.57 18.5h14.86a1.5 1.5 0 001.3-2.3L13.66 3.94a1.5 1.5 0 00-2.6 0z"
          />
        </svg>
        <p className="truncate text-xs font-medium">
          WhatsApp desconectado pelo celular.
          {isAdmin
            ? " Reconecte para voltar a receber e enviar mensagens."
            : " Avise um administrador para reconectar o WhatsApp."}
        </p>
      </div>
      {isAdmin && (
        <button
          type="button"
          onClick={handleReconnect}
          disabled={working}
          className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {working ? "Abrindo..." : "Reconectar WhatsApp"}
        </button>
      )}
    </div>
  );
}
