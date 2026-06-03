/**
 * Helpers de atalhos de teclado compartilhados.
 */

/**
 * Diz se o alvo de um evento de teclado e um campo editavel (input,
 * textarea, select, contenteditable). Usado por todos os handlers globais
 * de atalho para NAO disparar enquanto o usuario digita.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Campos custom (ex.: editores) marcados explicitamente.
  if (el.getAttribute?.("role") === "textbox") return true;
  return false;
}

/**
 * True quando o evento tem algum modificador "de comando" (Ctrl/Cmd/Alt).
 * Atalhos de tecla unica (N, T, J, K, dígitos) devem ser ignorados nesses
 * casos para nao colidir com atalhos do navegador/SO.
 */
export function hasCommandModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}
