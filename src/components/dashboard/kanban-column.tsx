"use client";

import { useState } from "react";
import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  STAGE_CATEGORY_LABEL,
  type PipelineStage,
  type StageCategory,
} from "@/lib/types/database";
import type { KanbanLead } from "@/lib/supabase/dashboard-data";
import { KanbanCard } from "./kanban-card";

/**
 * Mesma paleta usada pela `LeadsMinidash` — manter pareado garante que
 * o usuário associe instantaneamente a coluna ao card da mini-dash.
 */
const CATEGORY_PILL: Record<StageCategory, string> = {
  frio: "bg-sky-50 text-sky-700 border border-sky-200/50",
  quente: "bg-orange-50 text-orange-700 border border-orange-200/50",
  agendado: "bg-blue-50 text-blue-700 border border-blue-200/50",
  compareceu: "bg-violet-50 text-violet-700 border border-violet-200/50",
  orcamento: "bg-amber-50 text-amber-700 border border-amber-200/50",
  fechado: "bg-emerald-50 text-emerald-700 border border-emerald-200/50",
  perdido: "bg-rose-50 text-rose-700 border border-rose-200/50",
};

export function columnSortableId(stageId: string) {
  return `col:${stageId}`;
}

function NewLeadButton({ domain }: { domain: string }) {
  return (
    <Link
      href={`/${domain}/leads/new`}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300/80 bg-white/50 px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600 hover:shadow-md active:scale-[0.98]"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Novo Lead
    </Link>
  );
}

export interface LaneCell {
  laneKey: string;
  laneLabel: string | null;
  laneColor?: string | null;
  leads: KanbanLead[];
}

interface KanbanColumnProps {
  stage: PipelineStage;
  cells: LaneCell[];
  domain: string;
  totalCount: number;
  lastActivityByLead: Record<string, string>;
  showLaneLabel: boolean;
  onOpenEdit?: (leadId: string) => void;
  /** Acionado pelo botão de "três pontinhos" no topo da coluna. */
  onEditStage?: (stage: PipelineStage) => void;
  /** Lista de stages para o menu "Mover para…" no card. */
  allStages?: PipelineStage[];
  onMoveToStage?: (leadId: string, toStageId: string) => void;
}

function CellDroppable({
  id,
  leads,
  domain,
  lastActivityByLead,
  empty,
  onOpenEdit,
  allStages,
  onMoveToStage,
}: {
  id: string;
  leads: KanbanLead[];
  domain: string;
  lastActivityByLead: Record<string, string>;
  empty: boolean;
  onOpenEdit?: (leadId: string) => void;
  allStages?: PipelineStage[];
  onMoveToStage?: (leadId: string, toStageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "cell" } });
  const ids = leads.map((l) => l.id);
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 rounded-xl p-1.5 transition-all duration-300 ${
        isOver
          ? "bg-blue-50/40 ring-2 ring-blue-400/20 shadow-[inset_0_2px_4px_rgba(59,130,246,0.02)]"
          : "bg-transparent"
      }`}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            domain={domain}
            lastActivityAt={lastActivityByLead[lead.id] ?? null}
            onOpenEdit={onOpenEdit}
            allStages={allStages}
            onMoveToStage={onMoveToStage}
          />
        ))}
      </SortableContext>
      {empty && leads.length === 0 && (
        <div className="flex h-20 items-center justify-center rounded-xl border-2 border-dashed border-slate-200/80 bg-slate-50/30 text-[11px] font-semibold text-slate-400/80 transition-all duration-200">
          Solte aqui
        </div>
      )}
    </div>
  );
}

export function KanbanColumn({
  stage,
  cells,
  domain,
  totalCount,
  lastActivityByLead,
  showLaneLabel,
  onOpenEdit,
  onEditStage,
  allStages,
  onMoveToStage,
}: KanbanColumnProps) {
  const [openLanes, setOpenLanes] = useState<Set<string>>(() => new Set());

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: columnSortableId(stage.id),
    data: { type: "column", stageId: stage.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function toggleLane(key: string) {
    setOpenLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderTopColor: stage.color, borderTopWidth: 3 }}
      className={`flex min-w-[280px] max-w-[320px] shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50/45 h-full ${
        isDragging ? "opacity-60 ring-2 ring-blue-400/35 shadow-lg" : ""
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-start justify-between border-b border-slate-200 bg-white/80 px-3.5 py-3 rounded-t-xl select-none active:cursor-grabbing transition-colors duration-200"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <h3 className="truncate text-sm font-semibold text-slate-800">
              {stage.name}
            </h3>
            {stage.is_won && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 border border-emerald-200/50">
                ganho
              </span>
            )}
            {stage.is_lost && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-600 border border-red-200/50">
                perdido
              </span>
            )}
          </div>
          {stage.category ? (
            <span
              className={`mt-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${CATEGORY_PILL[stage.category]}`}
              title="Categoria correspondente na mini-dash acima"
            >
              {STAGE_CATEGORY_LABEL[stage.category]}
            </span>
          ) : (
            <span
              className="mt-1.5 inline-flex items-center rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              title="Sem categoria definida — leads desta etapa caem em 'sem categoria' na mini-dash."
            >
              Sem categoria
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-bold text-slate-600 border border-slate-200/50 shadow-sm">
            {totalCount}
          </span>
          {onEditStage && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEditStage(stage);
              }}
              title="Editar etapa"
              aria-label={`Editar etapa ${stage.name}`}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M10 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        data-kanban-column-body="true"
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2"
      >
        {totalCount === 0 && <NewLeadButton domain={domain} />}
        {cells.map((cell) => {
          const isDrawer = showLaneLabel && cell.laneLabel !== null;
          const isOpen = !isDrawer || openLanes.has(cell.laneKey);
          return (
            <div key={cell.laneKey}>
              {isDrawer && (
                <button
                  type="button"
                  onClick={() => toggleLane(cell.laneKey)}
                  className="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition-colors hover:bg-gray-100"
                >
                  <svg
                    className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 0 1 .02-1.06L10.94 10 7.23 6.29a.75.75 0 0 1 1.04-1.08l4.25 4.25a.75.75 0 0 1 0 1.08l-4.25 4.25a.75.75 0 0 1-1.06-.02Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {cell.laneColor && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cell.laneColor }}
                    />
                  )}
                  <span className="flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    {cell.laneLabel}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {cell.leads.length}
                  </span>
                </button>
              )}
              {isOpen && (
                <CellDroppable
                  id={`cell:${stage.id}:${cell.laneKey}`}
                  leads={cell.leads}
                  domain={domain}
                  lastActivityByLead={lastActivityByLead}
                  empty={showLaneLabel}
                  onOpenEdit={onOpenEdit}
                  allStages={allStages}
                  onMoveToStage={onMoveToStage}
                />
              )}
            </div>
          );
        })}
        {!showLaneLabel && totalCount === 0 && (
          <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 text-xs font-semibold text-slate-400/80">
            Solte um card aqui
          </div>
        )}
        {totalCount > 0 && <NewLeadButton domain={domain} />}
      </div>
    </div>
  );
}
