"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { TourStep } from "@/lib/onboarding/tours";
import { useStepController } from "@/lib/onboarding/use-onboarding-tour";

interface TourOverlayProps {
  steps: TourStep[];
  /** Tour chegou ao fim (marca como concluido). */
  onFinish: () => void;
  /** Usuario pulou o tour (marca como concluido tambem). */
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 340;
const SPOTLIGHT_PAD = 8;

/**
 * Coach marks com spotlight: escurece a tela, recorta o elemento-alvo e
 * posiciona um card de explicacao ao lado. Passos sem `target` aparecem
 * centralizados. Passos cujo alvo nao existe no DOM sao descartados no
 * inicio (evita oscilacao ao navegar Voltar/Proximo).
 */
export function TourOverlay({ steps: allSteps, onFinish, onSkip }: TourOverlayProps) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);

  // Resolve os passos visiveis apos um curto atraso (deixa a tela montar).
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const available = allSteps.filter(
        (s) => !s.target || document.querySelector(s.target)
      );
      if (available.length === 0) {
        onFinish();
        return;
      }
      setSteps(available);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!steps) return null;
  return <TourRunner steps={steps} onFinish={onFinish} onSkip={onSkip} />;
}

function TourRunner({
  steps,
  onFinish,
  onSkip,
}: {
  steps: TourStep[];
  onFinish: () => void;
  onSkip: () => void;
}) {
  const { index, next, back, isFirst, isLast } = useStepController(steps.length);
  const step = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(
    null
  );

  // Localiza o alvo e reposiciona em scroll/resize.
  useLayoutEffect(() => {
    let raf = 0;
    function update() {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    update();
    function onScrollResize() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [step.target]);

  // Traz o alvo para a area visivel.
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector(step.target) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, [step.target]);

  // Calcula a posicao do card conforme o alvo (ou centraliza / bottom-sheet).
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 640;
    const cardH = cardRef.current?.offsetHeight ?? 190;
    const cardW = Math.min(CARD_WIDTH, vw - 24);
    const gap = 12;

    let top: number;
    let left: number;

    if (!rect) {
      // Sem alvo: card centralizado na tela.
      top = Math.max((vh - cardH) / 2, 12);
      left = (vw - cardW) / 2;
    } else if (isMobile) {
      // Bottom-sheet ancorado na base (nao cobre totalmente o alvo).
      top = vh - cardH - 16;
      left = (vw - cardW) / 2;
    } else {
      const placement = step.placement ?? "bottom";
      switch (placement) {
        case "top":
          top = rect.top - cardH - gap;
          left = rect.left + rect.width / 2 - cardW / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2 - cardH / 2;
          left = rect.left - cardW - gap;
          break;
        case "right":
          top = rect.top + rect.height / 2 - cardH / 2;
          left = rect.left + rect.width + gap;
          break;
        case "center":
          top = (vh - cardH) / 2;
          left = (vw - cardW) / 2;
          break;
        case "bottom":
        default:
          top = rect.top + rect.height + gap;
          left = rect.left + rect.width / 2 - cardW / 2;
          break;
      }
      top = Math.min(Math.max(top, 12), vh - cardH - 12);
      left = Math.min(Math.max(left, 12), vw - cardW - 12);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- posiciona o card a partir de medidas do DOM (sistema externo)
    setCardPos({ top, left });
  }, [rect, index, step.placement]);

  // Teclado: Esc pula; setas/Enter navegam. Em fase de captura para rodar
  // antes dos atalhos globais; bloqueia atalhos de tecla unica (N, G, ?…)
  // enquanto o tour esta aberto, deixando passar combinacoes com Ctrl/Cmd.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onSkip();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (isLast) onFinish();
        else next();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (!isFirst) back();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isFirst, isLast, next, back, onSkip, onFinish]);

  // Move o foco para o card (acessibilidade + leitura por screen reader).
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  const cardWidth =
    typeof window !== "undefined"
      ? Math.min(CARD_WIDTH, window.innerWidth - 24)
      : CARD_WIDTH;

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Tour guiado"
    >
      {/* Bloqueia interacao com a aplicacao durante o tour. */}
      <div className="absolute inset-0" />

      {/* Spotlight (recorte) ou backdrop escuro quando o passo e central. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-blue-400/80 transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/55" />
      )}

      {/* Card do passo. */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute z-[82] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none"
        style={{
          top: cardPos?.top ?? -9999,
          left: cardPos?.left ?? -9999,
          width: cardWidth,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
            Passo {index + 1} de {steps.length}
          </span>
          <div className="flex items-center gap-1" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-blue-600" : "w-1.5 bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        <h3 className="mt-2.5 text-base font-bold text-slate-900">
          {step.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-700"
          >
            Pular tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onFinish() : next())}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {isLast ? "Concluir" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
