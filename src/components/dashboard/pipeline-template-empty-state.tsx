"use client";

import { useState } from "react";
import { PIPELINE_TEMPLATES, type PipelineTemplate } from "@/lib/pipeline-templates";

interface PipelineTemplateEmptyStateProps {
  variant: "kanban" | "funnel";
  loading: boolean;
  onLoadTemplate: (templateId: string) => void | Promise<void>;
}

/**
 * Empty state grande, centralizado, exibido na area principal do Kanban
 * e do Funil quando a organizacao ainda nao possui etapas de pipeline.
 *
 * Mostra os templates disponiveis como cards selecionaveis. Hoje so
 * existe o template "Odontologico" - novos segmentos (barbearia,
 * restaurante, etc.) serao adicionados em PIPELINE_TEMPLATES e aparecem
 * aqui automaticamente, sem mudanca de UI.
 */
export function PipelineTemplateEmptyState({
  variant,
  loading,
  onLoadTemplate,
}: PipelineTemplateEmptyStateProps) {
  const title =
    variant === "kanban"
      ? "Seu Kanban ainda nao tem etapas"
      : "Seu Funil ainda nao tem etapas";

  const [selectedId, setSelectedId] = useState<string>(
    PIPELINE_TEMPLATES[0]?.id ?? ""
  );

  function handleConfirm() {
    if (!selectedId) return;
    void onLoadTemplate(selectedId);
  }

  return (
    <div className="flex min-h-[420px] flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col items-center gap-5 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-8 py-10 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
          <svg
            className="h-7 w-7 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-1.5 max-w-xl text-sm text-gray-600">
            Escolha um template pronto para o seu segmento ou monte do zero em{" "}
            <span className="font-medium text-gray-700">
              Configuracoes &gt; Pipeline
            </span>
            .
          </p>
        </div>

        <TemplateGrid
          selectedId={selectedId}
          onSelect={setSelectedId}
          disabled={loading}
        />

        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || !selectedId}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          {loading ? "Carregando..." : "Usar este template"}
        </button>
      </div>
    </div>
  );
}

/**
 * Grid de cards de templates. Quando existir apenas 1 template, ocupa a
 * linha inteira; com 2+ ajusta automaticamente em colunas.
 */
export function TemplateGrid({
  selectedId,
  onSelect,
  disabled,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const cols = Math.min(PIPELINE_TEMPLATES.length, 3);
  return (
    <div
      className="grid w-full gap-3"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {PIPELINE_TEMPLATES.map((tpl) => (
        <TemplateCard
          key={tpl.id}
          template={tpl}
          selected={tpl.id === selectedId}
          onSelect={() => onSelect(tpl.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
  disabled,
}: {
  template: PipelineTemplate;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const preview = template.stages
    .filter((s) => !s.is_lost)
    .slice(0, 4)
    .map((s) => s.name);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex h-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-blue-500 bg-white shadow-md ring-2 ring-blue-500/20"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-2xl leading-none" aria-hidden>
          {template.icon}
        </span>
        {selected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={3}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5"
              />
            </svg>
            Selecionado
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{template.label}</p>
        <p className="text-[11px] text-gray-500">{template.segment}</p>
      </div>
      <p className="text-xs text-gray-600">{template.description}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {preview.map((name) => (
          <span
            key={name}
            className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
          >
            {name}
          </span>
        ))}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
          +{template.stages.length - preview.length} etapas
        </span>
      </div>
    </button>
  );
}
