"use client";

import { useEffect } from "react";

/**
 * Global error boundary — captura erros que escapam ate o RootLayout
 * (ex: erro de carregamento de fonte, exceção em layout root). Por
 * definicao do Next.js precisa renderizar o proprio `<html>` e `<body>`,
 * sem depender de estilos globais ja que o root pode ter falhado.
 *
 * Mantemos estilo inline minimo para garantir que aparecera mesmo se o
 * CSS global nao tiver carregado.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error] uncaught error:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f9fafb",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#111827",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: "#fff",
            border: "1px solid #fee2e2",
            borderRadius: 16,
            padding: 24,
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 9999,
              background: "#fef2f2",
              color: "#dc2626",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "16px 0 4px", fontSize: 20, fontWeight: 600 }}>
            Algo deu errado
          </h1>
          <p style={{ margin: 0, color: "#4b5563", fontSize: 14 }}>
            Encontramos um problema inesperado ao carregar a aplicacao.
            Tente novamente — se persistir, recarregue a pagina.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                display: "inline-block",
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                background: "#f3f4f6",
                color: "#9ca3af",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              Codigo: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: 0,
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() =>
                typeof window !== "undefined" && window.location.reload()
              }
              style={{
                background: "#fff",
                color: "#374151",
                border: "1px solid #e5e7eb",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Recarregar pagina
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
