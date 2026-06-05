"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useLeadFilters } from "@/hooks/use-lead-filters";
import type { PipelineStage, Sector } from "@/lib/types/database";
import type {
  KanbanLead,
  KanbanOperator,
} from "@/lib/supabase/dashboard-data";
import { KanbanColumn, columnSortableId, type LaneCell } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { LostReasonModal } from "./lost-reason-modal";
import { KanbanLeadEditModal } from "./kanban-lead-edit-modal";
import { AddStageColumn } from "./add-stage-column";
import { EditStageModal } from "./edit-stage-modal";
import { seedPipelineTemplate } from "@/lib/pipeline-templates";
import { PipelineTemplateEmptyState } from "./pipeline-template-empty-state";

type LaneMode = "none" | "dentist";

interface LeadKanbanBoardProps {
  domain: string;
  initialLeads: KanbanLead[];
  operators: KanbanOperator[];
  stages: PipelineStage[];
  lastActivityByLead: Record<string, string>;
  initialRange: { start: string; end: string };
  /**
   * Notifica o pai sempre que o conjunto de leads do board muda
   * (mover entre etapas, reordenar, editar). Usado para manter
   * indicadores externos — como o Funil de Leads — sincronizados
   * com o que o usuário enxerga no kanban.
   */
  onLeadsChange?: (leads: KanbanLead[]) => void;
  /**
   * Notifica o pai sempre que a ordem das colunas (etapas) muda,
   * para que outras visualizações (funil, badges em "Últimos leads")
   * possam refletir a mesma ordenação em tempo real.
   */
  onStagesChange?: (stages: PipelineStage[]) => void;
  /**
   * Acionado depois que um lead muda de etapa (DnD ou menu). O pai
   * controla a mini-dash exibida no header das tabs e usa este hook
   * para refazer o fetch agregado.
   */
  onLeadMoved?: () => void;
}

type BoardState = Record<string, KanbanLead[]>;

const KANBAN_PAGE_SIZE = 200;

/**
 * Para cada stage, carrega a primeira página de leads do período via
 * `/api/leads?stageId=…`. Isso preserva o comportamento de Kanban
 * com todas as colunas visíveis sem trazer todos os leads de uma vez.
 */
async function fetchAllPagesByStage(
  companyId: string,
  range: { start: string; end: string },
  stages: PipelineStage[]
): Promise<BoardState> {
  const results = await Promise.all(
    stages.map(async (stage) => {
      const url = new URL("/api/leads", window.location.origin);
      url.searchParams.set("companyId", companyId);
      url.searchParams.set("start", range.start);
      url.searchParams.set("end", range.end);
      url.searchParams.set("stageId", stage.id);
      url.searchParams.set("orderBy", "kanban_position_asc");
      url.searchParams.set("pageSize", String(KANBAN_PAGE_SIZE));
      const res = await fetch(url.toString());
      if (!res.ok) return { stageId: stage.id, items: [] as KanbanLead[] };
      const data = (await res.json()) as { items: KanbanLead[] };
      return { stageId: stage.id, items: data.items ?? [] };
    })
  );
  const next: BoardState = {};
  for (const r of results) next[r.stageId] = r.items;
  return next;
}

function groupByStage(leads: KanbanLead[], stages: PipelineStage[]): BoardState {
  const base: BoardState = {};
  for (const s of stages) base[s.id] = [];
  for (const lead of leads) {
    if (base[lead.stage_id]) {
      base[lead.stage_id].push(lead);
    }
  }
  for (const stageId of Object.keys(base)) {
    base[stageId].sort(
      (a, b) =>
        a.kanban_position - b.kanban_position ||
        (a.created_at < b.created_at ? 1 : -1)
    );
  }
  return base;
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function parseCellId(
  id: string
): { stageId: string; laneKey: string } | null {
  if (!id.startsWith("cell:")) return null;
  const rest = id.slice(5);
  const idx = rest.indexOf(":");
  if (idx === -1) return null;
  return { stageId: rest.slice(0, idx), laneKey: rest.slice(idx + 1) };
}

export function LeadKanbanBoard({
  domain,
  initialLeads,
  operators,
  stages: initialStages,
  lastActivityByLead,
  initialRange,
  onLeadsChange,
  onStagesChange,
  onLeadMoved,
}: LeadKanbanBoardProps) {
  const { companyId } = useCurrentCompany();
  const filters = useLeadFilters();
  const [stages, setStages] = useState<PipelineStage[]>(initialStages);
  const [board, setBoard] = useState<BoardState>(() =>
    groupByStage(initialLeads, initialStages)
  );
  const [isFetching, setIsFetching] = useState(false);
  const [seedingPipeline, setSeedingPipeline] = useState(false);

  // Refs para a barra de rolagem horizontal espelhada no topo do board.
  // O `columnsRef` é o container real (flex de colunas). `topScrollRef`
  // é uma faixa fina acima que espelha o `scrollLeft` — o usuário enxerga
  // a barra horizontal lá em cima, sem precisar descer toda a tela.
  const boardWrapperRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [columnsInnerWidth, setColumnsInnerWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  // Período efetivo: usa URL params se houver, senão o initial (mês corrente).
  const effectiveRange = useMemo(() => {
    return {
      start: filters.state.start ?? initialRange.start,
      end: filters.state.end ?? initialRange.end,
    };
  }, [filters.state.start, filters.state.end, initialRange]);

  const onLeadsChangeRef = useRef(onLeadsChange);
  useEffect(() => {
    onLeadsChangeRef.current = onLeadsChange;
  }, [onLeadsChange]);

  useEffect(() => {
    const cb = onLeadsChangeRef.current;
    if (!cb) return;
    const flat: KanbanLead[] = [];
    for (const stageId of Object.keys(board)) {
      for (const lead of board[stageId]) flat.push(lead);
    }
    cb(flat);
  }, [board]);

  const onStagesChangeRef = useRef(onStagesChange);
  useEffect(() => {
    onStagesChangeRef.current = onStagesChange;
  }, [onStagesChange]);

  useEffect(() => {
    onStagesChangeRef.current?.(stages);
  }, [stages]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<{
    lead: KanbanLead;
    destOrderedIds: string[];
    sourceOrderedIds: string[];
    fromStageId: string;
    toStageId: string;
    snapshot: BoardState;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const dragSourceStageIdRef = useRef<string | null>(null);

  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  // Filtro de Setor sincronizado com a URL (`?sector=`) e replicado nos
  // contadores do minidash. Usa o hook useLeadFilters para que o estado
  // sobreviva ao reload e ao deep-link.
  const sectorFilter = filters.state.sector ?? "all";
  const setSectorFilter = useCallback(
    (next: string) => {
      filters.setFilters({ sector: next === "all" ? null : next });
    },
    [filters]
  );
  const [sectors, setSectors] = useState<Sector[]>([]);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetch(`/api/sectors?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: Sector[] } | null) => {
        if (!cancelled && data?.items) setSectors(data.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId]);
  const [laneMode, setLaneMode] = useState<LaneMode>("none");
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const stageById = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    for (const s of stages) map.set(s.id, s);
    return map;
  }, [stages]);

  const dentists = useMemo(
    () => operators.filter((o) => o.is_dentist),
    [operators]
  );

  const activeLead = useMemo(() => {
    if (!activeId) return null;
    for (const stageId of Object.keys(board)) {
      const found = board[stageId].find((l) => l.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, board]);

  function passesFilters(l: KanbanLead): boolean {
    const term = search.trim().toLowerCase();
    if (term) {
      const match =
        l.name.toLowerCase().includes(term) ||
        (l.phone ?? "").toLowerCase().includes(term) ||
        (l.email ?? "").toLowerCase().includes(term);
      if (!match) return false;
    }
    if (assigneeFilter === "unassigned" && l.assigned_to) return false;
    if (
      assigneeFilter !== "all" &&
      assigneeFilter !== "unassigned" &&
      l.assigned_to !== assigneeFilter
    )
      return false;
    if (sectorFilter === "none" && l.sector_id) return false;
    if (
      sectorFilter !== "all" &&
      sectorFilter !== "none" &&
      l.sector_id !== sectorFilter
    )
      return false;
    if (showInactiveOnly) {
      const ref = lastActivityByLead[l.id] ?? l.updated_at ?? l.created_at;
      if (daysSince(ref) < 30) return false;
    }
    return true;
  }

  function buildLanes(leads: KanbanLead[]): LaneCell[] {
    if (laneMode === "none") {
      return [
        {
          laneKey: "all",
          laneLabel: null,
          laneColor: null,
          leads,
        },
      ];
    }
    // dentist
    const pool = dentists.length > 0 ? dentists : operators;
    const cells: LaneCell[] = pool.map((u) => ({
      laneKey: u.id,
      laneLabel: u.name,
      laneColor: u.is_dentist ? "#10b981" : "#3b82f6",
      leads: leads.filter((l) => l.assigned_to === u.id),
    }));
    cells.push({
      laneKey: "none",
      laneLabel: "Sem responsável",
      laneColor: "#9ca3af",
      leads: leads.filter((l) => !l.assigned_to),
    });
    return cells;
  }

  // Filtro de categorias: ocultamos stages cuja categoria não está
  // selecionada. Quando o filtro está vazio, mostra TODAS as colunas
  // (comportamento legado preservado para usuários antigos).
  const selectedCategories = filters.state.categories;
  const visibleStages = useMemo(() => {
    if (selectedCategories.length === 0) return stages;
    const set = new Set(selectedCategories);
    return stages.filter((s) => (s.category ? set.has(s.category) : false));
  }, [stages, selectedCategories]);

  const columns = useMemo(() => {
    return visibleStages.map((stage) => {
      const all = board[stage.id] ?? [];
      const filtered = all.filter(passesFilters);
      return {
        stage,
        totalCount: filtered.length,
        cells: buildLanes(filtered),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    board,
    visibleStages,
    search,
    assigneeFilter,
    showInactiveOnly,
    laneMode,
    operators,
    dentists,
    lastActivityByLead,
  ]);

  // Refetch quando o período mudar (ou na primeira mudança via URL).
  // Não refazemos quando categorias mudam — elas só escondem colunas.
  const lastFetchedRange = useRef(initialRange);
  useEffect(() => {
    if (!companyId) return;
    const same =
      lastFetchedRange.current.start === effectiveRange.start &&
      lastFetchedRange.current.end === effectiveRange.end;
    if (same) return;
    lastFetchedRange.current = effectiveRange;

    let cancelled = false;
    setIsFetching(true);
    void fetchAllPagesByStage(companyId, effectiveRange, stages)
      .then((boardData) => {
        if (cancelled) return;
        setBoard(boardData);
      })
      .catch(() => {
        /* silencia — mantém visão atual */
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, effectiveRange, stages]);

  // Mede a largura interna do flex de colunas para dimensionar o "track"
  // espelhado no topo. Re-observa quando o número de colunas muda
  // (filtros de categoria, criação de stage etc.). `hasHorizontalOverflow`
  // controla a visibilidade da barra superior — quando tudo cabe, escondemos.
  useEffect(() => {
    const cols = columnsRef.current;
    if (!cols) return;

    // `raf` é re-utilizado para coalescer múltiplos triggers do
    // ResizeObserver no mesmo frame (especialmente durante drag, em
    // que o layout pode oscilar rapidamente). Isso evita loops de
    // "Maximum update depth exceeded" quando `hasHorizontalOverflow`
    // ficaria alternando entre true/false na mesma renderização.
    let scheduled = 0;
    let lastInner = -1;
    let lastOverflow: boolean | null = null;
    const measure = () => {
      const sw = cols.scrollWidth;
      const cw = cols.clientWidth;
      const overflow = sw > cw + 1;
      if (sw !== lastInner) {
        lastInner = sw;
        setColumnsInnerWidth(sw);
      }
      if (overflow !== lastOverflow) {
        lastOverflow = overflow;
        setHasHorizontalOverflow(overflow);
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        measure();
      });
    };
    schedule();
    // O ResizeObserver do container só dispara quando seu próprio
    // `clientWidth` muda — observar cada coluna filha cobre o caso em
    // que apenas o `scrollWidth` aumenta (criação/remoção de stages).
    // Importante: `board` NÃO é uma dep aqui — mover cards otimisticamente
    // dentro do mesmo conjunto de colunas não muda a largura horizontal.
    const ro = new ResizeObserver(schedule);
    ro.observe(cols);
    for (const child of Array.from(cols.children)) {
      ro.observe(child as Element);
    }
    return () => {
      if (scheduled) cancelAnimationFrame(scheduled);
      ro.disconnect();
    };
  }, [visibleStages.length, companyId, stages.length]);

  // Sincroniza scrollLeft em dois sentidos entre a barra superior e as
  // colunas reais. O `lock` evita loop infinito quando um listener
  // dispara o outro.
  //
  // Importante: `hasHorizontalOverflow` está nas deps porque a barra
  // superior só é renderizada quando há overflow. Sem isso, no primeiro
  // render `topScrollRef.current` é null e os listeners jamais são
  // instalados — o usuário consegue arrastar mas o container não rola.
  useEffect(() => {
    if (!hasHorizontalOverflow) return;
    const cols = columnsRef.current;
    const top = topScrollRef.current;
    if (!cols || !top) return;
    let lock = false;
    const onCols = () => {
      if (lock) return;
      lock = true;
      top.scrollLeft = cols.scrollLeft;
      lock = false;
    };
    const onTop = () => {
      if (lock) return;
      lock = true;
      cols.scrollLeft = top.scrollLeft;
      lock = false;
    };
    cols.addEventListener("scroll", onCols, { passive: true });
    top.addEventListener("scroll", onTop, { passive: true });
    // Garante alinhamento inicial.
    top.scrollLeft = cols.scrollLeft;
    return () => {
      cols.removeEventListener("scroll", onCols);
      top.removeEventListener("scroll", onTop);
    };
  }, [hasHorizontalOverflow]);

  // Wheel containment: dentro de uma coluna o scroll vertical rola só
  // os cards (graças a `overscroll-contain` no body); fora de qualquer
  // coluna (área entre/abaixo) bloqueamos o evento — assim a página
  // inteira não desce ao girar a roda sobre o board.
  useEffect(() => {
    const wrapper = boardWrapperRef.current;
    if (!wrapper) return;
    function onWheel(e: WheelEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-kanban-column-body="true"]')) return;
      e.preventDefault();
    }
    // `passive: false` é obrigatório para que `preventDefault` tenha
    // efeito em eventos de roda — React 17+ marca onWheel como passive.
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, []);

  // Notifica o pai (que mantém a mini-dash) sempre que um lead muda
  // de etapa. A atualização otimista das colunas já foi feita no
  // client; só o agregado precisa ser recontado no servidor.
  const refetchMinidash = useCallback(() => {
    onLeadMoved?.();
  }, [onLeadMoved]);

  function findStageOf(leadId: string): string | null {
    for (const stageId of Object.keys(board)) {
      if (board[stageId].some((l) => l.id === leadId)) return stageId;
    }
    return null;
  }

  function resolveTargetStage(overId: string): {
    stageId: string;
    laneKey: string | null;
  } | null {
    if (overId.startsWith("cell:")) {
      const parsed = parseCellId(overId);
      return parsed ? { stageId: parsed.stageId, laneKey: parsed.laneKey } : null;
    }
    const stageId = findStageOf(overId);
    return stageId ? { stageId, laneKey: null } : null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setError(null);
    if (event.active.data.current?.type === "column") {
      dragSourceStageIdRef.current = null;
      return;
    }
    dragSourceStageIdRef.current = findStageOf(id);
  }

  // `onDragOver` antigamente movia o card entre colunas otimisticamente,
  // mas isso causava cascatas de setState a cada pixel do drag (o dnd-kit
  // dispara este evento ~60x/s), levando ao "Maximum update depth
  // exceeded" quando o usuário arrastava rapidamente sobre várias colunas.
  //
  // Solução: aceitar que o card só "salta" de coluna no momento em que
  // o usuário solta (handleDragEnd). Durante o arrasto, o DragOverlay
  // continua mostrando o card seguindo o cursor e o `useDroppable`
  // destaca visualmente a coluna alvo via `isOver` — sem nenhum
  // setState no componente pai.
  function handleDragOver(_event: DragOverEvent) {
    /* intencionalmente vazio — ver comentário acima */
  }

  async function persistMove(
    leadId: string,
    fromStageId: string,
    toStageId: string,
    destOrderedIds: string[],
    sourceOrderedIds: string[],
    snapshot: BoardState,
    lostReason?: string
  ) {
    // Antes era uma chamada direta a RPC do browser. Agora roteamos por uma
    // API server-side que executa a MESMA RPC e, alem disso, dispara efeitos
    // colaterais de integracao (ex.: criar paciente na Clinicorp quando a
    // etapa de destino e "ganho"). A UX otimista e mantida: a UI ja foi
    // atualizada antes desta chamada e revertemos em caso de erro.
    let moveFailed = false;
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromStageId,
          toStageId,
          destOrderedIds,
          sourceOrderedIds,
          lostReason: lostReason ?? null,
        }),
      });
      if (!res.ok) moveFailed = true;
    } catch {
      moveFailed = true;
    }

    if (moveFailed) {
      setBoard(snapshot);
      const msg = "Falha ao mover o lead. Alterações revertidas.";
      setError(msg);
      toast.error("Nao foi possivel mover o lead", { description: msg });
      return;
    }

    // O move pode ter mudado a categoria do lead — atualiza a minidash.
    void refetchMinidash();
  }

  /**
   * Acionado pelo menu "..." do card. Permite mover para qualquer
   * stage — inclusive os escondidos pelo filtro de categoria.
   */
  const handleMoveToStage = useCallback(
    (leadId: string, toStageId: string) => {
      const fromStageId = (() => {
        for (const sId of Object.keys(board)) {
          if (board[sId].some((l) => l.id === leadId)) return sId;
        }
        return null;
      })();
      if (!fromStageId || fromStageId === toStageId) return;

      const snapshot: BoardState = {};
      for (const sId of Object.keys(board)) snapshot[sId] = [...board[sId]];

      const lead = board[fromStageId].find((l) => l.id === leadId);
      if (!lead) return;
      const targetStage = stageById.get(toStageId);

      const newSource = board[fromStageId]
        .filter((l) => l.id !== leadId)
        .map((l, i) => ({ ...l, kanban_position: i }));
      const moving: KanbanLead = {
        ...lead,
        stage_id: toStageId,
        status: targetStage?.legacy_status ?? lead.status,
        kanban_position: 0,
      };
      const newDest = [
        moving,
        ...(board[toStageId] ?? []).map((l, i) => ({
          ...l,
          kanban_position: i + 1,
        })),
      ];

      setBoard({
        ...board,
        [fromStageId]: newSource,
        [toStageId]: newDest,
      });

      const destOrderedIds = newDest.map((l) => l.id);
      const sourceOrderedIds = newSource.map((l) => l.id);

      if (targetStage?.is_lost) {
        setPendingLost({
          lead: moving,
          destOrderedIds,
          sourceOrderedIds,
          fromStageId,
          toStageId,
          snapshot,
        });
        return;
      }

      void persistMove(
        leadId,
        fromStageId,
        toStageId,
        destOrderedIds,
        sourceOrderedIds,
        snapshot
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, stageById]
  );

  function snapshotBoard(): BoardState {
    const s: BoardState = {};
    for (const stageId of Object.keys(board)) s[stageId] = [...board[stageId]];
    return s;
  }

  async function persistStageOrder(orderedIds: string[]) {
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("reorder_pipeline_stages", {
      p_ordered_ids: orderedIds,
    });
    if (rpcError) {
      throw rpcError;
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    const originStageId = dragSourceStageIdRef.current;
    dragSourceStageIdRef.current = null;
    if (!over) return;

    if (active.data.current?.type === "column") {
      const activeStageId = String(active.data.current?.stageId ?? "");
      const overStageId = String(over.data.current?.stageId ?? "");
      if (!activeStageId || !overStageId || activeStageId === overStageId) {
        return;
      }
      const oldIndex = stages.findIndex((s) => s.id === activeStageId);
      const newIndex = stages.findIndex((s) => s.id === overStageId);
      if (oldIndex === -1 || newIndex === -1) return;
      const snapshot = stages;
      const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({
        ...s,
        position: i,
      }));
      setStages(reordered);
      void persistStageOrder(reordered.map((s) => s.id)).catch((err) => {
        setStages(snapshot);
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: string }).message)
            : "";
        setError(
          msg
            ? `Falha ao reordenar colunas: ${msg}`
            : "Falha ao reordenar colunas. Alterações revertidas."
        );
      });
      return;
    }

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const fromStageId = originStageId ?? findStageOf(activeIdStr);
    const target = resolveTargetStage(overIdStr);
    if (!fromStageId || !target) return;

    const snapshot = snapshotBoard();
    const toStageId = target.stageId;
    const toStage = stageById.get(toStageId);

    if (fromStageId === toStageId) {
      const items = board[fromStageId];
      const oldIndex = items.findIndex((l) => l.id === activeIdStr);
      const newIndex = items.findIndex((l) => l.id === overIdStr);
      if (oldIndex === -1) return;
      const reordered =
        newIndex === -1 || oldIndex === newIndex
          ? items
          : arrayMove(items, oldIndex, newIndex);

      const normalized = reordered.map((l, i) => ({
        ...l,
        kanban_position: i,
      }));
      setBoard({ ...board, [fromStageId]: normalized });

      const destOrderedIds = normalized.map((l) => l.id);
      if (
        oldIndex === newIndex &&
        (laneMode !== "dentist" || target.laneKey === null)
      ) {
        return;
      }

      void persistMove(
        activeIdStr,
        fromStageId,
        toStageId,
        destOrderedIds,
        [],
        snapshot
      );

      if (laneMode === "dentist" && target.laneKey) {
        const newAssignee = target.laneKey === "none" ? null : target.laneKey;
        void createClient()
          .from("leads")
          .update({ assigned_to: newAssignee })
          .eq("id", activeIdStr);
      }
      return;
    }

    // Como o `onDragOver` não mexe mais no board, aqui precisamos
    // efetivamente mover o card da coluna de origem para a de destino,
    // inserindo na posição calculada a partir do `over.id`.
    const sourceArr = board[fromStageId] ?? [];
    const movingIdx = sourceArr.findIndex((l) => l.id === activeIdStr);
    if (movingIdx === -1) return;
    const movingLead: KanbanLead = {
      ...sourceArr[movingIdx],
      stage_id: toStageId,
      status: toStage?.legacy_status ?? sourceArr[movingIdx].status,
    };
    const destArr = board[toStageId] ?? [];
    const overIndex = destArr.findIndex((l) => l.id === overIdStr);
    const insertAt = overIndex === -1 ? destArr.length : overIndex;
    const destColumn = [
      ...destArr.slice(0, insertAt),
      movingLead,
      ...destArr.slice(insertAt),
    ].map((l, i) => ({ ...l, kanban_position: i }));
    const sourceColumn = sourceArr
      .filter((l) => l.id !== activeIdStr)
      .map((l, i) => ({ ...l, kanban_position: i }));

    setBoard({
      ...board,
      [toStageId]: destColumn,
      [fromStageId]: sourceColumn,
    });

    const destOrderedIds = destColumn.map((l) => l.id);
    const sourceOrderedIds = sourceColumn.map((l) => l.id);

    if (laneMode === "dentist" && target.laneKey) {
      const newAssignee = target.laneKey === "none" ? null : target.laneKey;
      void createClient()
        .from("leads")
        .update({ assigned_to: newAssignee })
        .eq("id", activeIdStr);
    }

    if (toStage?.is_lost) {
      setPendingLost({
        lead: movingLead,
        destOrderedIds,
        sourceOrderedIds,
        fromStageId,
        toStageId,
        snapshot,
      });
      return;
    }

    void persistMove(
      activeIdStr,
      fromStageId,
      toStageId,
      destOrderedIds,
      sourceOrderedIds,
      snapshot
    );
  }

  function handleDragCancel() {
    setActiveId(null);
    dragSourceStageIdRef.current = null;
  }

  async function handleLoadPipelineTemplate(templateId: string) {
    if (!companyId) return;
    setSeedingPipeline(true);
    const supabase = createClient();
    const result = await seedPipelineTemplate(supabase, companyId, templateId);
    if (result.error) {
      setError(`Falha ao carregar template de pipeline: ${result.error}`);
      setSeedingPipeline(false);
      return;
    }
    const { data: refreshed } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("company_id", companyId)
      .order("position", { ascending: true });
    if (refreshed) {
      const newStages = refreshed as unknown as PipelineStage[];
      setStages(newStages);
      const emptyBoard: BoardState = {};
      for (const s of newStages) emptyBoard[s.id] = [];
      setBoard(emptyBoard);
    }
    setSeedingPipeline(false);
  }

  const stats = useMemo(() => {
    const total = Object.values(board).reduce((acc, l) => acc + l.length, 0);
    const unassigned = Object.values(board).reduce(
      (acc, list) => acc + list.filter((l) => !l.assigned_to).length,
      0
    );
    const inactiveCount = Object.values(board).reduce(
      (acc, list) =>
        acc +
        list.filter((l) => {
          const ref =
            lastActivityByLead[l.id] ?? l.updated_at ?? l.created_at;
          return daysSince(ref) >= 30;
        }).length,
      0
    );
    return { total, unassigned, inactive: inactiveCount };
  }, [board, lastActivityByLead]);

  return (
    // `flex min-h-0` é o gatilho que permite o board interno crescer
    // dentro do container fixado pela página — sem isso, o flex-1 do
    // <DndContext> não respeita a altura do parent.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Linha de filtros granulares do Kanban — bem compacta. A barra
          principal (mini-dash + período) já está no header das tabs. */}
      <div className="flex flex-wrap items-center gap-2 text-xs py-1.5">
        <div className="relative min-w-[200px] flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone ou e-mail..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 pl-8 text-xs font-medium text-slate-700 placeholder-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition-all duration-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10"
          />
          <svg
            className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </div>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm cursor-pointer transition-all duration-200 hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
        >
          <option value="all">Todos os responsáveis</option>
          <option value="unassigned">Sem responsável</option>
          {operators.map((op) => (
            <option key={op.id} value={op.id}>
              {op.name}
            </option>
          ))}
        </select>

        {sectors.length > 0 && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm cursor-pointer transition-all duration-200 hover:bg-slate-50 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
          >
            <option value="all">Todos setores</option>
            <option value="none">Sem setor</option>
            {sectors.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
          </select>
        )}

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 shadow-inner">
          {(["none", "dentist"] as LaneMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLaneMode(mode)}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-all duration-250 active:scale-[0.96] cursor-pointer ${
                laneMode === mode
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {mode === "none" ? "Sem raias" : "Raias"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowInactiveOnly((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-[0.97] shadow-sm flex items-center gap-1.5 cursor-pointer ${
            showInactiveOnly
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/60 ring-2 ring-amber-500/10"
              : "border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${showInactiveOnly ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
          Inativos · {stats.inactive}
        </button>

        {(search ||
          assigneeFilter !== "all" ||
          sectorFilter !== "all" ||
          showInactiveOnly ||
          laneMode !== "none") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setAssigneeFilter("all");
              setSectorFilter("all");
              setShowInactiveOnly(false);
              setLaneMode("none");
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all duration-200 active:scale-[0.97] shadow-sm cursor-pointer"
          >
            Limpar
          </button>
        )}

        <div className="ml-auto hidden items-center gap-3 text-xs text-slate-500 sm:flex">
          <span className="font-medium">
            Total: <span className="font-bold text-slate-700">{stats.total}</span> leads
          </span>
          {stats.unassigned > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 border border-amber-100 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
              {stats.unassigned} sem responsável
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {stages.length === 0 && !isFetching && (
        <PipelineTemplateEmptyState
          variant="kanban"
          loading={seedingPipeline}
          onLoadTemplate={handleLoadPipelineTemplate}
        />
      )}

      {stages.length > 0 && (
      <DndContext
        id="lead-kanban"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div ref={boardWrapperRef} className="relative flex min-h-0 flex-1 flex-col">
          {/* Barra de rolagem horizontal espelhada acima das colunas.
              Sempre ocupa altura visível quando há overflow (track largo
              e thumb com cor forte para ficar evidente). */}
          {hasHorizontalOverflow && (
            <div className="mb-2.5 flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Rolar colunas para a esquerda"
                onClick={() => {
                  const cols = columnsRef.current;
                  if (cols) cols.scrollBy({ left: -320, behavior: "smooth" });
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 active:scale-[0.93] transition-all duration-200 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <div
                ref={topScrollRef}
                className="h-3.5 flex-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 border border-slate-200/50 p-0.5 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/60 hover:[&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:transition-colors [&::-webkit-scrollbar-track]:bg-transparent"
                aria-hidden
              >
                <div
                  style={{
                    width: columnsInnerWidth ? `${columnsInnerWidth}px` : "100%",
                    height: "1px",
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Rolar colunas para a direita"
                onClick={() => {
                  const cols = columnsRef.current;
                  if (cols) cols.scrollBy({ left: 320, behavior: "smooth" });
                }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 active:scale-[0.93] transition-all duration-200 cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}

          <div
            ref={columnsRef}
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <SortableContext
              items={visibleStages.map((s) => columnSortableId(s.id))}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map((col) => (
                <KanbanColumn
                  key={col.stage.id}
                  stage={col.stage}
                  cells={col.cells}
                  totalCount={col.totalCount}
                  domain={domain}
                  lastActivityByLead={lastActivityByLead}
                  showLaneLabel={laneMode !== "none"}
                  onOpenEdit={setEditingLeadId}
                  onEditStage={setEditingStage}
                  allStages={stages}
                  onMoveToStage={handleMoveToStage}
                />
              ))}
            </SortableContext>
            {companyId && (
              <AddStageColumn
                companyId={companyId}
                nextPosition={
                  stages
                    .filter((s) => !s.is_lost)
                    .reduce((m, s) => Math.max(m, s.position), 0) + 1
                }
                onCreated={(stage) => {
                  setStages((prev) => [...prev, stage]);
                  setBoard((prev) => ({ ...prev, [stage.id]: [] }));
                }}
                onError={(message) =>
                  setError(`Falha ao criar etapa: ${message}`)
                }
              />
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead ? (
            <KanbanCard lead={activeLead} domain={domain} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {editingLeadId && (
        <KanbanLeadEditModal
          domain={domain}
          leadId={editingLeadId}
          onClose={() => setEditingLeadId(null)}
          onSaved={(updated) => {
            setBoard((prev) => {
              const next: BoardState = {};
              for (const stageId of Object.keys(prev)) {
                next[stageId] = prev[stageId].map((l) =>
                  l.id === updated.id ? { ...l, ...updated } : l
                );
              }
              return next;
            });
            setEditingLeadId(null);
            void refetchMinidash();
          }}
        />
      )}

      {editingStage && (
        <EditStageModal
          stage={editingStage}
          leadCount={(board[editingStage.id] ?? []).length}
          onClose={() => setEditingStage(null)}
          onSaved={(updated) => {
            setStages((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
            setEditingStage(null);
          }}
          onDeleted={(stageId) => {
            setStages((prev) => prev.filter((s) => s.id !== stageId));
            setBoard((prev) => {
              const next: BoardState = {};
              for (const k of Object.keys(prev)) {
                if (k !== stageId) next[k] = prev[k];
              }
              return next;
            });
            setEditingStage(null);
          }}
        />
      )}

      {pendingLost && (
        <LostReasonModal
          lead={pendingLost.lead}
          onCancel={() => {
            setBoard(pendingLost.snapshot);
            setPendingLost(null);
          }}
          onConfirm={async (reason) => {
            await persistMove(
              pendingLost.lead.id,
              pendingLost.fromStageId,
              pendingLost.toStageId,
              pendingLost.destOrderedIds,
              pendingLost.sourceOrderedIds,
              pendingLost.snapshot,
              reason
            );
            setPendingLost(null);
            void refetchMinidash();
          }}
        />
      )}
    </div>
  );
}
