"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { moveLeadStage } from "@/lib/leads/move-stage";
import { LostReasonModal } from "@/components/dashboard/lost-reason-modal";
import type { KanbanLead } from "@/lib/supabase/dashboard-data";
import type { PipelineStage } from "@/lib/types/database";

interface LeadStageControlProps {
  leadId: string;
  leadName: string;
  currentStageId: string;
  currentStageName?: string | null;
  currentStageColor?: string | null;
}

const FALLBACK_COLOR = "#9ca3af";

/**
 * Seletor de etapa do lead para a tela de detalhe. Substitui a exibicao
 * somente-leitura da "Etapa" por um dropdown que move o lead reusando a
 * mesma rota/RPC do Kanban (`moveLeadStage`). Etapas marcadas como
 * perdidas abrem o modal de motivo, exatamente como no board.
 */
export function LeadStageControl({
  leadId,
  leadName,
  currentStageId,
  currentStageName,
  currentStageColor,
}: LeadStageControlProps) {
  const router = useRouter();
  const { companyId } = useCurrentCompany();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingLostStageId, setPendingLostStageId] = useState<string | null>(
    null
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    void supabase
      .from("pipeline_stages")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .then(({ data }) =>
        setStages((data as unknown as PipelineStage[]) ?? [])
      );
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentStage = stages.find((s) => s.id === currentStageId);
  const displayName = currentStage?.name ?? currentStageName ?? "—";
  const displayColor = currentStage?.color ?? currentStageColor ?? FALLBACK_COLOR;

  async function applyMove(toStageId: string, lostReason?: string | null) {
    if (!companyId || toStageId === currentStageId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await moveLeadStage({
      companyId,
      leadId,
      fromStageId: currentStageId,
      toStageId,
      lostReason: lostReason ?? null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error("Não foi possível mudar a etapa", {
        description: result.error,
      });
      return;
    }
    toast.success("Etapa atualizada");
    setOpen(false);
    setPendingLostStageId(null);
    router.refresh();
  }

  function handleSelect(stage: PipelineStage) {
    if (stage.id === currentStageId) {
      setOpen(false);
      return;
    }
    if (stage.is_lost) {
      setOpen(false);
      setPendingLostStageId(stage.id);
      return;
    }
    void applyMove(stage.id);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Etapa
      </span>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          disabled={saving || stages.length === 0}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          style={{ borderColor: displayColor }}
          title="Clique para mudar a etapa"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: displayColor }}
            aria-hidden
          />
          {displayName}
          <svg
            className="h-3 w-3 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>
        {open && stages.length > 0 && (
          <div className="absolute left-0 z-30 mt-1.5 w-56 origin-top-left rounded-xl border border-slate-200/80 bg-white py-1.5 shadow-lg ring-1 ring-black/5">
            <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Mover para etapa
            </div>
            <div className="mt-1 max-h-64 overflow-y-auto">
              {stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={s.id === currentStageId}
                  onClick={() => handleSelect(s)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.id === currentStageId && (
                    <span className="ml-auto rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                      atual
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {pendingLostStageId && (
        <LostReasonModal
          lead={{ name: leadName } as unknown as KanbanLead}
          onConfirm={(reason) => applyMove(pendingLostStageId, reason)}
          onCancel={() => setPendingLostStageId(null)}
        />
      )}
    </div>
  );
}
