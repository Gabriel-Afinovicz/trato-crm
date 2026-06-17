"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface WhatsAppPhoneDisconnectedCardProps {
  domain: string;
  isAdmin: boolean;
}

/**
 * Card exibido na aba Conversas quando o WhatsApp caiu PELO CELULAR.
 * Diferente do card padrao "ainda nao conectado": aqui deixamos claro que a
 * sessao foi encerrada no aparelho e oferecemos a reconexao.
 *
 * Admin: botao que exclui a instancia (via /instance/disconnect = reset+delete
 * + token=null) e leva para Configuracoes ▸ WhatsApp para gerar um novo QR sem
 * erro de "nome em uso". Operador: apenas o aviso para contatar um admin.
 */
export function WhatsAppPhoneDisconnectedCard({
  domain,
  isAdmin,
}: WhatsAppPhoneDisconnectedCardProps) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function handleReconnect() {
    if (working) return;
    setWorking(true);
    try {
      await fetch("/api/whatsapp/instance/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
    } catch {
      /* segue para Configuracoes mesmo se a exclusao falhar */
    } finally {
      router.push(`/${domain}/settings?tab=whatsapp`);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-6 w-6 text-amber-600"
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
        </div>
        <h1 className="mt-4 text-base font-semibold text-gray-900">
          WhatsApp desconectado pelo celular
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          A conexao foi encerrada no aparelho (o dispositivo foi removido do
          WhatsApp). Para voltar a receber e enviar mensagens, e preciso
          reconectar lendo o QR Code novamente.
        </p>
        {isAdmin ? (
          <button
            type="button"
            onClick={handleReconnect}
            disabled={working}
            className="mt-5 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {working ? "Abrindo Configuracoes..." : "Reconectar WhatsApp"}
          </button>
        ) : (
          <p className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
            Avise um administrador para reconectar o WhatsApp da clinica.
          </p>
        )}
      </div>
    </div>
  );
}
