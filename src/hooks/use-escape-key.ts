"use client";

import { useEffect } from "react";

/**
 * Padroniza o comportamento "Esc fecha modal" em toda a aplicacao.
 *
 * Liga um listener `keydown` global enquanto `enabled` for `true` e
 * chama `onEscape` quando o usuario aperta Esc. Remove o listener
 * ao desmontar ou quando `enabled` vira `false` para evitar capturar
 * Esc em contextos onde o modal nao esta visivel.
 *
 * Uso tipico em um componente de modal:
 *
 *   useEscapeKey(isOpen, onClose);
 *
 * Para modais que tem operacoes destrutivas em andamento (ex: salvando),
 * passe `enabled` como `isOpen && !busy` para evitar fechamento acidental.
 */
export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onEscape();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onEscape]);
}
