/**
 * API imperativa para abrir um modal de confirmacao destrutiva.
 *
 * Diferentemente do `window.confirm`, suporta:
 *  - titulo + descricao + lista do que sera afetado
 *  - variantes visuais (danger/default)
 *  - labels customizadas dos botoes
 *  - fechamento por Esc/overlay como cancelamento
 *
 * Uso:
 *   import { confirm } from "@/components/ui/confirm";
 *   const ok = await confirm({
 *     title: "Excluir setor 'Comercial'?",
 *     description: "Esta acao nao pode ser desfeita.",
 *     warningList: ["3 leads ficarao sem setor", "2 membros perderao vinculo"],
 *     confirmLabel: "Excluir",
 *     variant: "danger",
 *   });
 *   if (!ok) return;
 *
 * O `ConfirmDialogHost` precisa estar montado em algum ancestral comum
 * (atualmente no AppShell). Caso nao esteja, cai no `window.confirm`
 * nativo para nao quebrar o fluxo.
 */

export type ConfirmVariant = "danger" | "default";

export interface ConfirmOptions {
  /** Titulo principal (sempre mostrado, ex: "Excluir setor?"). */
  title: string;
  /** Descricao secundaria (subtitulo curto). */
  description?: string;
  /**
   * Lista de itens que serao afetados pela acao — ex: "3 leads serao
   * desvinculados", "todos os agendamentos serao removidos".
   */
  warningList?: string[];
  /** Texto do botao primario. Default: "Confirmar". */
  confirmLabel?: string;
  /** Texto do botao secundario. Default: "Cancelar". */
  cancelLabel?: string;
  /** Visual do botao primario. `danger` aplica vermelho. */
  variant?: ConfirmVariant;
}

type Listener = (opts: ConfirmOptions, resolve: (v: boolean) => void) => void;

let listener: Listener | null = null;

/** Registrado pelo `ConfirmDialogHost`. Nao chame manualmente. */
export function _registerConfirmListener(fn: Listener | null): void {
  listener = fn;
}

/** Abre o modal e resolve `true` se o usuario confirmar, `false` caso contrario. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (listener) {
      listener(opts, resolve);
    } else {
      // Fallback defensivo — Host ainda nao montou ou removido.
      if (typeof window === "undefined") {
        resolve(false);
        return;
      }
      const text = opts.description
        ? `${opts.title}\n\n${opts.description}`
        : opts.title;
      resolve(window.confirm(text));
    }
  });
}
