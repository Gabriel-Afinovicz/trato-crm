"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * Error boundary do segmento `[domain]`. Captura qualquer erro nao tratado
 * dentro do app autenticado (Dashboard, Leads, Agenda, Conversas, Settings)
 * e mostra UI amigavel com retry em vez do erro tecnico do Next.
 *
 * Next.js 16 substituiu `reset` por `unstable_retry()` — ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 */
export default function DomainError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useParams<{ domain?: string }>();
  const domain = params?.domain;

  useEffect(() => {
    // Log interno para debug — o usuario nao ve o stack/digest.
    console.error("[domain/error] uncaught render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          Algo deu errado
        </h2>
        <p className="mt-1.5 text-sm text-gray-600">
          Encontramos um problema ao carregar esta tela. Tente novamente em
          alguns instantes — se o problema persistir, recarregue a pagina ou
          volte para o painel inicial.
        </p>

        {error.digest && (
          <p className="mt-3 inline-block rounded bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-400">
            Codigo: {error.digest}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Tentar novamente
          </button>
          {domain && (
            <Link
              href={`/${domain}/dashboard`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Voltar ao painel
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
