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
      className={`group relative cursor-grab touch-none select-none rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow active:cursor-grabbing
        ${isDragging ? "opacity-40" : "hover:shadow-md"}
        ${isOverlay ? "rotate-1 shadow-lg ring-2 ring-blue-400/40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1 truncate text-sm font-medium text-gray-900">
          {lead.name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
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
                aria-label="Mais ações"
                className="rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100 focus:opacity-100"
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
                    d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                  />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-48 origin-top-right rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Mover para etapa
                  </div>
                  <div className="max-h-64 overflow-y-auto">
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
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate">{s.name}</span>
                        {s.id === lead.stage_id && (
                          <span className="ml-auto text-[10px] text-gray-400">
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

      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
        {age !== null && <span>{age} anos</span>}
        {(lead.phone || lead.email) && (
          <span className="truncate">
            {age !== null ? "· " : ""}
            {lead.phone ?? lead.email}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.specialty_name && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: lead.specialty_color ?? "#6366f1" }}
          >
            {lead.specialty_name}
          </span>
        )}
        {lead.source_name && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {lead.source_name}
          </span>
        )}
        {hasAllergy && (
          <span
            title={`Alergia: ${lead.allergies}`}
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700"
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
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> inativo
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-end">
        {lead.assigned_to_name ? (
          <span
            title={
              lead.assigned_is_dentist
                ? `Dentista: ${lead.assigned_to_name}`
                : lead.assigned_to_name
            }
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold
              ${
                lead.assigned_is_dentist
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-blue-100 text-blue-700"
              }`}
          >
            {initials(lead.assigned_to_name)}
          </span>
        ) : (
          <span
            title="Sem responsável"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400"
          >
            ?
          </span>
        )}
      </div>
    </div>
  );
}
