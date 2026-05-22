"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error boundary específico do quadro Kanban.
 *
 * Captura erros catastróficos de render (incluindo o "Maximum update
 * depth exceeded" que pode ocorrer em casos extremos de drag-and-drop
 * em sequência muito rápida) e exibe um modal amigável pedindo para o
 * usuário recarregar a página. Sem isso, em produção a tela ficaria
 * branca ou mostraria um stack trace técnico.
 *
 * Use envolvendo o `<LeadKanbanBoard />` ou similar:
 *
 *   <KanbanErrorBoundary>
 *     <LeadKanbanBoard ... />
 *   </KanbanErrorBoundary>
 */
export class KanbanErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? "Erro desconhecido",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Em produção isto pode ser enviado para um serviço de
    // observabilidade (Sentry, Datadog) — por ora basta o console.
    console.error("[KanbanErrorBoundary]", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <>
        {/* Mantém o esqueleto do board renderizado em segundo plano
            para o usuário ainda ver o contexto enquanto decide. */}
        <div className="pointer-events-none select-none opacity-40">
          {this.props.children}
        </div>

        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="kanban-error-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <div>
                <h2
                  id="kanban-error-title"
                  className="text-base font-semibold text-gray-900"
                >
                  Algo inesperado aconteceu no quadro
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  O Kanban encontrou um erro temporário. Para garantir que
                  seus dados continuem corretos, recarregue a página —
                  nada foi perdido, todas as alterações já estão salvas
                  no servidor.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Tentar continuar mesmo assim
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.2}
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                Recarregar página
              </button>
            </div>

            {this.state.errorMessage && (
              <details className="mt-4 text-[11px] text-gray-400">
                <summary className="cursor-pointer hover:text-gray-600">
                  Detalhes técnicos
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-gray-500">
                  {this.state.errorMessage}
                </pre>
              </details>
            )}
          </div>
        </div>
      </>
    );
  }
}
