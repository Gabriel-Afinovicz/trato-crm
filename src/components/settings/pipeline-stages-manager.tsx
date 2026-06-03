"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { PIPELINE_STAGE_COLORS } from "@/lib/pipeline-stage-colors";
import {
  PIPELINE_TEMPLATES,
  seedPipelineTemplate,
} from "@/lib/pipeline-templates";
import { TemplateGrid } from "@/components/dashboard/pipeline-template-empty-state";
import {
  STAGE_CATEGORIES,
  STAGE_CATEGORY_LABEL,
  type PipelineStage,
  type StageCategory,
} from "@/lib/types/database";

const PRESET_COLORS = PIPELINE_STAGE_COLORS;

function StageRow({
  stage,
  onEdit,
  onToggleActive,
  onToggleWon,
  onToggleLost,
  onChangeCategory,
  hasLeads,
  operatingId,
}: {
  stage: PipelineStage;
  onEdit: (stage: PipelineStage) => void;
  onToggleActive: (stage: PipelineStage) => void;
  onToggleWon: (stage: PipelineStage) => void;
  onToggleLost: (stage: PipelineStage) => void;
  onChangeCategory: (stage: PipelineStage, cat: StageCategory | null) => void;
  hasLeads: boolean;
  operatingId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-3 transition-opacity
        ${isDragging ? "opacity-50" : ""}
        ${operatingId === stage.id ? "opacity-50" : ""}
        ${!stage.is_active ? "bg-gray-50/60" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        aria-label="Arrastar"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M7 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 14a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
        </svg>
      </button>
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">
            {stage.name}
          </span>
          {stage.is_won && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              ganho
            </span>
          )}
          {stage.is_lost && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700">
              perdido
            </span>
          )}
          {!stage.is_active && (
            <span className="text-xs text-gray-400">(inativo)</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1 text-gray-600">
          Categoria
          <select
            value={stage.category ?? ""}
            onChange={(e) =>
              onChangeCategory(
                stage,
                (e.target.value || null) as StageCategory | null
              )
            }
            className={`rounded border px-1.5 py-1 text-xs ${
              stage.category
                ? "border-gray-300 text-gray-700"
                : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
            title="Define como o lead será contado na mini-dash do Kanban/Leads."
          >
            <option value="">Sem categoria</option>
            {STAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {STAGE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1 text-gray-600">
          <input
            type="checkbox"
            checked={stage.is_won}
            onChange={() => onToggleWon(stage)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Ganho
        </label>
        <label className="inline-flex items-center gap-1 text-gray-600">
          <input
            type="checkbox"
            checked={stage.is_lost}
            onChange={() => onToggleLost(stage)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Perdido
        </label>
        <button
          onClick={() => onEdit(stage)}
          className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
        >
          Editar
        </button>
        <button
          onClick={() => onToggleActive(stage)}
          disabled={hasLeads && stage.is_active}
          title={
            hasLeads && stage.is_active
              ? "Existem leads neste estágio. Mova-os antes de desativar."
              : undefined
          }
          className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {stage.is_active ? "Desativar" : "Reativar"}
        </button>
      </div>
    </div>
  );
}

export function PipelineStagesManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leadCountByStage, setLeadCountByStage] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operatingId, setOperatingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PRESET_COLORS[0]);
  const [newCategory, setNewCategory] = useState<StageCategory | "">("quente");
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<PipelineStage | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const [seeding, setSeeding] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    PIPELINE_TEMPLATES[0]?.id ?? ""
  );
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  async function handleSeedTemplate(templateId: string) {
    if (!companyId) return;
    setError(null);
    setSeeding(true);
    const supabase = createClient();
    const result = await seedPipelineTemplate(supabase, companyId, templateId);
    setSeeding(false);
    if (result.error) {
      setError(`Erro ao carregar template: ${result.error}`);
      return;
    }
    if (result.created === 0) {
      setError(
        "Todas as etapas desse template ja existem. Nenhuma alteracao realizada."
      );
      return;
    }
    setTemplatePickerOpen(false);
    await fetchAll();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function fetchAll() {
    if (!companyId) return;
    const supabase = createClient();
    const [stagesRes, countsRes] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("company_id", companyId)
        .order("position", { ascending: true }),
      supabase
        .from("leads")
        .select("stage_id")
        .eq("company_id", companyId),
    ]);
    if (stagesRes.data) setStages(stagesRes.data as unknown as PipelineStage[]);
    const counts: Record<string, number> = {};
    for (const row of (countsRes.data as { stage_id: string }[] | null) ?? []) {
      counts[row.stage_id] = (counts[row.stage_id] ?? 0) + 1;
    }
    setLeadCountByStage(counts);
    setLoading(false);
  }

  useEffect(() => {
    if (companyLoading) return;
    if (!companyId) {
      setStages([]);
      setLoading(false);
      return;
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyLoading, companyId]);

  async function handleCreate() {
    if (!newName.trim() || !companyId) return;
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const nextPosition =
      (stages.filter((s) => !s.is_lost).reduce(
        (m, s) => Math.max(m, s.position),
        0
      ) ?? 0) + 1;
    const { error: insertError } = await supabase.from("pipeline_stages").insert({
      company_id: companyId,
      name: newName.trim(),
      color: newColor,
      position: nextPosition,
      category: newCategory || null,
    });
    if (insertError) {
      setError(`Erro ao criar: ${insertError.message}`);
      setSaving(false);
      return;
    }
    setNewName("");
    setNewColor(PRESET_COLORS[0]);
    setNewCategory("quente");
    setSaving(false);
    await fetchAll();
  }

  async function handleChangeCategory(
    stage: PipelineStage,
    category: StageCategory | null
  ) {
    setOperatingId(stage.id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("pipeline_stages")
      .update({ category })
      .eq("id", stage.id);
    setOperatingId(null);
    if (updateError) {
      setError(`Erro: ${updateError.message}`);
      return;
    }
    setStages((prev) =>
      prev.map((s) => (s.id === stage.id ? { ...s, category } : s))
    );
  }

  async function handleUpdate() {
    if (!editing || !editName.trim()) return;
    setOperatingId(editing.id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("pipeline_stages")
      .update({ name: editName.trim(), color: editColor })
      .eq("id", editing.id);
    setOperatingId(null);
    if (updateError) {
      setError(`Erro: ${updateError.message}`);
      return;
    }
    setEditing(null);
    await fetchAll();
  }

  async function handleToggleActive(stage: PipelineStage) {
    const count = leadCountByStage[stage.id] ?? 0;
    if (stage.is_active && count > 0) {
      setError(
        `Não é possível desativar "${stage.name}": existem ${count} lead(s) neste estágio.`
      );
      return;
    }
    setOperatingId(stage.id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("pipeline_stages")
      .update({ is_active: !stage.is_active })
      .eq("id", stage.id);
    setOperatingId(null);
    if (updateError) {
      setError(`Erro: ${updateError.message}`);
      return;
    }
    await fetchAll();
  }

  async function handleToggleWon(stage: PipelineStage) {
    setOperatingId(stage.id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("pipeline_stages")
      .update({ is_won: !stage.is_won, is_lost: false })
      .eq("id", stage.id);
    setOperatingId(null);
    if (updateError) setError(`Erro: ${updateError.message}`);
    await fetchAll();
  }

  async function handleToggleLost(stage: PipelineStage) {
    setOperatingId(stage.id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("pipeline_stages")
      .update({ is_lost: !stage.is_lost, is_won: false })
      .eq("id", stage.id);
    setOperatingId(null);
    if (updateError) setError(`Erro: ${updateError.message}`);
    await fetchAll();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({
      ...s,
      position: i + 1,
    }));
    setStages(next);

    const supabase = createClient();
    await Promise.all(
      next.map((s) =>
        supabase
          .from("pipeline_stages")
          .update({ position: s.position })
          .eq("id", s.id)
      )
    );
  }

  function startEdit(stage: PipelineStage) {
    setEditing(stage);
    setEditName(stage.name);
    setEditColor(stage.color);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  const stagesWithoutCategory = stages.filter((s) => !s.category && s.is_active);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {stagesWithoutCategory.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div>
            <p className="font-medium">
              {stagesWithoutCategory.length} etapa
              {stagesWithoutCategory.length === 1 ? "" : "s"} sem categoria
            </p>
            <p className="mt-0.5 text-xs">
              Leads em etapas sem categoria entram em &quot;sem categoria&quot; na
              mini-dash do Kanban/Leads. Defina a categoria abaixo para que
              eles apareçam nos KPIs corretos.
            </p>
          </div>
        </div>
      )}

      {stages.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-blue-200 bg-blue-50/60 px-6 py-8 text-center">
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
            <h3 className="text-base font-semibold text-gray-900">
              Pipeline ainda sem etapas
            </h3>
            <p className="mt-1 max-w-md text-sm text-gray-600">
              Escolha um template pronto para o seu segmento ou crie etapas do
              zero no formulario abaixo.
            </p>
          </div>
          <TemplateGrid
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            disabled={seeding}
          />
          <button
            type="button"
            onClick={() => void handleSeedTemplate(selectedTemplateId)}
            disabled={seeding || !selectedTemplateId}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
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
            {seeding ? "Carregando..." : "Usar este template"}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Novo estágio
          </h3>
          {stages.length > 0 && (
            <button
              type="button"
              onClick={() => setTemplatePickerOpen((v) => !v)}
              disabled={seeding}
              title="Carrega as etapas faltantes de um template salvo."
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {seeding ? "Carregando..." : "Carregar template"}
              <svg
                className={`h-3 w-3 transition-transform ${
                  templatePickerOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m19.5 8.25-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>
          )}
        </div>
        {templatePickerOpen && stages.length > 0 && (
          <div className="mb-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
            <p className="text-xs text-gray-700">
              Escolha um template. Apenas as etapas que ainda nao existem (por
              nome) serao adicionadas.
            </p>
            <TemplateGrid
              selectedId={selectedTemplateId}
              onSelect={setSelectedTemplateId}
              disabled={seeding}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplatePickerOpen(false)}
                disabled={seeding}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSeedTemplate(selectedTemplateId)}
                disabled={seeding || !selectedTemplateId}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {seeding ? "Carregando..." : "Usar este template"}
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Ex: Consulta de retorno"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full ${
                  newColor === c ? "ring-2 ring-gray-400 ring-offset-1" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <select
            value={newCategory}
            onChange={(e) =>
              setNewCategory(e.target.value as StageCategory | "")
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            title="Categoria usada na mini-dash do Kanban e tela Leads."
          >
            <option value="">Sem categoria</option>
            {STAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {STAGE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-xs text-gray-500">
          Arraste para reordenar os estágios do pipeline.
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stages.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y divide-gray-100">
              {stages.map((stage) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  onEdit={startEdit}
                  onToggleActive={handleToggleActive}
                  onToggleWon={handleToggleWon}
                  onToggleLost={handleToggleLost}
                  onChangeCategory={handleChangeCategory}
                  hasLeads={(leadCountByStage[stage.id] ?? 0) > 0}
                  operatingId={operatingId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              Editar estágio
            </h3>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <div className="flex items-center gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className={`h-6 w-6 rounded-full ${
                      editColor === c ? "ring-2 ring-gray-400 ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdate}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
