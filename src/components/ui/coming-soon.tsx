import { type ReactNode } from "react";

/**
 * Wrapper que aplica blur + camada interativa "Em breve" sobre um
 * trecho de UI. Usado para sinalizar funcionalidades que ja estao
 * desenhadas mas ainda nao estao disponiveis em producao.
 *
 * Quando `active=false`, renderiza os children normalmente sem nenhum
 * overlay nem perda de interatividade.
 *
 * - O blur cobre tudo dentro do componente (children continuam no DOM
 *   apenas para "ilustrar" o que estara disponivel — mas eles ficam
 *   `inert` para o teclado/leitores de tela e ignoram cliques porque o
 *   overlay esta acima e com `pointer-events: auto`).
 * - A mensagem (`title` + `description`) fica centralizada em um cartao
 *   leve com leve sombra para destacar.
 *
 * Uso:
 *
 *   <ComingSoonOverlay
 *     active={mode === "invite"}
 *     title="Disponivel em breve"
 *     description="Em uma proxima atualizacao voce podera convidar membros por email."
 *   >
 *     <form>...</form>
 *   </ComingSoonOverlay>
 */
export interface ComingSoonOverlayProps {
  active: boolean;
  title?: string;
  description?: string;
  /**
   * Intensidade do blur visual sobre o conteudo. Defaults a "md".
   */
  blur?: "sm" | "md" | "lg";
  /**
   * Cor de fundo da camada que esmaece os children. Use "light" em
   * cards brancos (padrao) e "dark" em fundos escuros.
   */
  tone?: "light" | "dark";
  /**
   * Quando true, esconde a borda/sombra do badge central — usar em
   * areas pequenas onde so a etiqueta basta.
   */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}

const BLUR_CLASS: Record<NonNullable<ComingSoonOverlayProps["blur"]>, string> =
  {
    sm: "blur-[2px]",
    md: "blur-[3px]",
    lg: "blur-[6px]",
  };

export function ComingSoonOverlay({
  active,
  title = "Disponível em breve",
  description = "Esta funcionalidade chegará em uma próxima atualização.",
  blur = "md",
  tone = "light",
  compact = false,
  children,
  className,
}: ComingSoonOverlayProps) {
  if (!active) {
    return (
      <div className={className}>
        {children}
      </div>
    );
  }

  const veilBg =
    tone === "dark"
      ? "bg-gray-900/40 backdrop-saturate-50"
      : "bg-white/55 backdrop-saturate-50";

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Conteudo "desenhado" so para ilustrar: blur + sem
          interatividade. `aria-hidden` + `inert` evita que o teclado
          tabule por dentro do form bloqueado. */}
      <div
        aria-hidden="true"
        // @ts-expect-error `inert` ainda nao esta nos types do React 19 estavel
        inert=""
        className={`pointer-events-none select-none ${BLUR_CLASS[blur]}`}
      >
        {children}
      </div>

      {/* Veu suave por cima para reduzir contraste e deixar o badge legivel. */}
      <div
        className={`absolute inset-0 rounded-[inherit] ${veilBg}`}
        aria-hidden="true"
      />

      {/* Badge central com a mensagem. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div
          role="status"
          aria-live="polite"
          className={
            compact
              ? "rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-700 shadow ring-1 ring-gray-200"
              : "max-w-sm rounded-xl bg-white/95 px-5 py-4 text-center shadow-lg ring-1 ring-gray-200"
          }
        >
          {compact ? (
            <span>{title}</span>
          ) : (
            <>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                Em breve
              </div>
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              {description && (
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  {description}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
