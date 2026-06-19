"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { getWelcomeSteps, type TourRole } from "@/lib/onboarding/tours";
import { useStepController } from "@/lib/onboarding/use-onboarding-tour";

interface WelcomeTourProps {
  role: TourRole;
  domain: string;
  /** Concluiu a apresentacao (marca welcome como visto). */
  onFinish: () => void;
  /** Pulou: nao quer ver nenhuma dica (marca todos os tours). */
  onSkip: () => void;
}

/**
 * Modal central de boas-vindas, exibido na primeira sessao autenticada.
 * Conteudo adaptado ao papel (admin foca em configuracao; operador, em uso).
 */
export function WelcomeTour({ role, onFinish, onSkip }: WelcomeTourProps) {
  const steps = getWelcomeSteps(role);
  const { index, next, back, isFirst, isLast } = useStepController(
    steps.length
  );
  const step = steps[index];
  const cardRef = useRef<HTMLDivElement | null>(null);

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
      // Bloqueia atalhos globais de tecla unica enquanto o modal esta aberto.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.stopPropagation();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isFirst, isLast, next, back, onSkip, onFinish]);

  // Foco inicial no modal para acessibilidade.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Boas-vindas ao Trato CRM"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none"
      >
        {/* Cabecalho com a marca. Fundo branco para combinar com o fundo
            (nao transparente) da logo. */}
        <div className="relative overflow-hidden border-b border-slate-100 bg-white px-6 pb-5 pt-6">
          <Image
            src="/trato-crm-logo.png"
            alt="Trato CRM"
            width={727}
            height={195}
            className="h-8 w-auto"
            priority
          />
          <span className="mt-3 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
            Tour guiado · {role === "operator" ? "Operador" : "Administrador"}
          </span>
        </div>

        <div className="px-6 py-5">
          <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {step.body}
          </p>

          {/* Indicador de progresso. */}
          <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-blue-600" : "w-1.5 bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-medium text-slate-400 transition-colors hover:text-slate-700"
          >
            Pular tudo
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
              {isLast ? "Começar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
