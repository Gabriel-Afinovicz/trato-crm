"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanLead } from "@/lib/supabase/dashboard-data";
import type { PipelineStage } from "@/lib/types/database";

interface KanbanCardProps {
  lead: KanbanLead;
  domain: string;
  isOverlay?: boolean;
  lastActivityAt?: string | null;
  onOpenEdit?: (leadId: string) => void;
  /**
   * Lista de etapas para o menu "Mover para…". Quando ausente, o menu
   * fica oculto (compat com o overlay e contextos onde o caller já
   * provê o controle).
   */
  allStages?: PipelineStage[];
  /**
   * Disparado pelo menu. Devolve ao caller só o destino — quem
   * orquestra DnD/persistência decide como aplicar.
   */
  onMoveToStage?: (leadId: string, toStageId: string) => void;
}

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "agora";
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d`;
  return `${Math.floor(diffD / 30)}mês`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function ageFromBirthdate(bd: string | null): number | null {
  if (!bd) return null;
  const birth = new Date(bd);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function KanbanCard({
  lead,
  isOverlay,
  lastActivityAt,
  onOpenEdit,
  allStages,
  onMoveToStage,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: lead.id,
      data: { type: "card", stageId: lead.stage_id },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const movedBeyondThreshold = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    movedBeyondThreshold.current = false;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    if (dx * dx + dy * dy > 36) {
      movedBeyondThreshold.current = true;
    }
  }

  function handleClick() {
    if (movedBeyondThreshold.current || isDragging) return;
    onOpenEdit?.(lead.id);
  }

  const referenceActivity = lastActivityAt ?? lead.updated_at ?? lead.created_at;
  const inactive = daysSince(referenceActivity) >= 30;
  const age = ageFromBirthdate(lead.birthdate);
  const hasAllergy = !!lead.allergies?.trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      className={`group relative cursor-grab touch-none select-none rounded-xl border border-slate-200/85 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.01)] transition-all duration-300 ease-out active:cursor-grabbing active:scale-[0.98]
        ${isDragging ? "opacity-30" : "hover:-translate-y-1 hover:shadow-[0_10px_20px_-10px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.02)] hover:border-slate-300"}
        ${isOverlay ? "rotate-[2deg] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)] ring-2 ring-blue-500/20 border-blue-400/80" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1 truncate text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors duration-300 tracking-tight">
          {lead.name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400/80">
            {formatRelative(lead.updated_at ?? lead.created_at)}
          </span>
          {!isOverlay && allStages && allStages.length > 0 && onMoveToStage && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="Mover para etapa"
                title="Mover para outra etapa"
                className="rounded-md p-1 text-slate-400 opacity-60 transition-all hover:bg-slate-100 hover:text-slate-700 hover:opacity-100 focus:opacity-100 active:scale-[0.9]"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                  />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-25 mt-1.5 w-48 origin-top-right rounded-xl border border-slate-200/80 bg-white/95 backdrop-blur-md py-1.5 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Mover para etapa
                  </div>
                  <div className="max-h-64 overflow-y-auto mt-1">
                    {allStages.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={s.id === lead.stage_id}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          if (s.id !== lead.stage_id) {
                            onMoveToStage(lead.id, s.id);
                          }
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer font-medium"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate flex-1">{s.name}</span>
                        {s.id === lead.stage_id && (
                          <span className="ml-auto text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                            atual
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        {age !== null && <span>{age} anos</span>}
        {(lead.phone || lead.email) && (
          <span className="truncate">
            {age !== null ? "· " : ""}
            {lead.phone ?? lead.email}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {lead.source_name && (
          <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500 border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
            {lead.source_name}
          </span>
        )}
        {hasAllergy && (
          <span
            title={`Alergia: ${lead.allergies}`}
            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-700 border border-rose-100 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 2a1 1 0 0 1 .894.553l7 14A1 1 0 0 1 17 18H3a1 1 0 0 1-.894-1.447l7-14A1 1 0 0 1 10 2Zm0 4a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            alergia
          </span>
        )}
        {inactive && (
          <span
            title={`Sem atividade há ${daysSince(referenceActivity)} dias`}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 border border-amber-100 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> inativo
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5">
        {lead.assigned_to_name ? (
          <span
            title={
              lead.assigned_is_dentist
                ? `Profissional: ${lead.assigned_to_name}`
                : lead.assigned_to_name
            }
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold tracking-wider shadow-sm ring-2 ring-white transition-all duration-300 hover:scale-110
              ${
                lead.assigned_is_dentist
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-blue-50 text-blue-600 border border-blue-200"
              }`}
          >
            {initials(lead.assigned_to_name)}
          </span>
        ) : (
          <span
            title="Sem responsável"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-200 text-[10px] font-semibold text-slate-400 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
          >
            ?
          </span>
        )}
      </div>
    </div>
  );
}
