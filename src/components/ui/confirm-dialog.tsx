"use client";

import { useEffect, useRef, useState } from "react";
import {
  _registerConfirmListener,
  type ConfirmOptions,
} from "./confirm";
import { useEscapeKey } from "@/hooks/use-escape-key";

interface InternalState {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

/**
 * Host do modal de confirmacao. Renderizado uma unica vez (em AppShell).
 * Recebe chamadas via `confirm(...)` (modulo `./confirm`) e expoe o
 * dialog com foco gerenciado, Esc para cancelar, overlay clicavel.
 */
export function ConfirmDialogHost() {
  const [state, setState] = useState<InternalState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    _registerConfirmListener((opts, resolve) => {
      setState({ opts, resolve });
    });
    return () => _registerConfirmListener(null);
  }, []);

  // Foco no botao primario quando abre — Enter confirma direto.
  useEffect(() => {
    if (state) {
      const id = window.setTimeout(() => confirmBtnRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [state]);

  function close(value: boolean) {
    if (!state) return;
    state.resolve(value);
    setState(null);
  }

  useEscapeKey(state !== null, () => close(false));

  if (!state) return null;

  const {
    title,
    description,
    warningList,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    variant = "default",
  } = state.opts;

  const primaryCls =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-200"
      : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-200";

  const iconBgCls =
    variant === "danger" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => close(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBgCls}`}
          >
            {variant === "danger" ? (
              <svg
                className="h-5 w-5"
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
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold text-gray-900"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-gray-600">{description}</p>
            )}
          </div>
        </div>

        {warningList && warningList.length > 0 && (
          <ul className="mx-5 mt-4 space-y-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            {warningList.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs text-gray-700"
              >
                <span className="mt-0.5 text-gray-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => close(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 ${primaryCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
