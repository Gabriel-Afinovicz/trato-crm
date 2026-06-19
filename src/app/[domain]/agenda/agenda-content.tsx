"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  AgendaBlock,
  AppointmentDetailed,
  ClinicHoliday,
  ClinicHours,
  MessageTemplate,
  ProcedureType,
  Room,
  User,
} from "@/lib/types/database";
import { AppointmentModal } from "@/components/agenda/appointment-modal";
import { AppointmentActions } from "@/components/agenda/appointment-actions";
import { getClinicorpSyncState } from "@/lib/clinicorp/sync-badge";
import { useCurrentCompany } from "@/hooks/use-current-company";
import {
  AgendaGrid,
  type AgendaDropTarget,
  type PendingSlot,
  type ResourceAxis,
} from "@/components/agenda/agenda-grid";
import { AgendaMonth } from "@/components/agenda/agenda-month";
import { AgendaEmptyState } from "@/components/agenda/agenda-empty-state";
import { isEditableTarget, hasCommandModifier } from "@/lib/utils/keyboard";
import {
  checkBusinessHours,
  BUSINESS_HOURS_MESSAGES,
} from "@/lib/agenda/business-hours";

type ViewMode = "day" | "week" | "month";

interface AgendaContentProps {
  domain: string;
  viewMode: ViewMode;
  resourceAxis: ResourceAxis;
  selectedDate: string;
  rangeStart: string;
  rangeEnd: string;
  appointments: AppointmentDetailed[];
  monthCounts: { starts_at: string; status: string }[];
  blocks: AgendaBlock[];
  holidays: ClinicHoliday[];
  rooms: Room[];
  procedures: ProcedureType[];
  dentists: Pick<User, "id" | "name" | "is_dentist">[];
  clinicHours: ClinicHours[];
  templates: MessageTemplate[];
  clinicorpEnabled: boolean;
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}
function fmtTitle(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
function fmtMonthTitle(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDateInput(s: string): Date {
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}
function toLocalIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function AgendaContent({
  domain,
  viewMode,
  resourceAxis,
  selectedDate,
  rangeStart,
  rangeEnd,
  appointments,
  monthCounts,
  blocks,
  holidays,
  rooms,
  procedures,
  dentists,
  clinicHours,
  templates,
  clinicorpEnabled,
}: AgendaContentProps) {
  const router = useRouter();
  const params = useSearchParams();
  const { companyId } = useCurrentCompany();

  // Enquanto houver agendamento "sincronizando" com a Clinicorp, atualiza a
  // agenda periodicamente para o selo amarelo virar verde (ou vermelho)
  // sozinho, sem o usuario precisar recarregar. Para apos ~3 min.
  const syncPollStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!clinicorpEnabled) return;
    const anySyncing = appointments.some(
      (a) => getClinicorpSyncState(a, true) === "syncing"
    );
    if (!anySyncing) {
      syncPollStartRef.current = null;
      return;
    }
    if (syncPollStartRef.current === null) {
      syncPollStartRef.current = Date.now();
    }
    const id = window.setInterval(() => {
      if (
        syncPollStartRef.current &&
        Date.now() - syncPollStartRef.current > 180_000
      ) {
        window.clearInterval(id);
        return;
      }
      router.refresh();
    }, 6000);
    return () => window.clearInterval(id);
  }, [appointments, clinicorpEnabled, router]);

  type Prefill = {
    startsAt?: string;
    endsAt?: string;
    dentistId?: string | null;
    roomId?: string | null;
    procedureId?: string | null;
    leadId?: string;
    notes?: string;
  };

  const [creatingPrefill, setCreatingPrefill] = useState<Prefill | null>(null);
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null);
  const [editing, setEditing] = useState<AppointmentDetailed | null>(null);
  const [acting, setActing] = useState<AppointmentDetailed | null>(null);
  const [noShowLeadIds, setNoShowLeadIds] = useState<Set<string>>(new Set());
  const [moveError, setMoveError] = useState<string | null>(null);

  // `selectedDate`/`rangeStart`/`rangeEnd` chegam como data-pura "YYYY-MM-DD"
  // (ver `toYmd` na page). Parseamos com `parseDateInput` para reconstruir a
  // meia-noite LOCAL do dia-calendario — evita o off-by-one de fuso que fazia
  // o "Hoje" exibir o dia anterior em UTC-3.
  const dateObj = useMemo(() => parseDateInput(selectedDate), [selectedDate]);
  const startObj = useMemo(() => parseDateInput(rangeStart), [rangeStart]);
  const endObj = useMemo(() => parseDateInput(rangeEnd), [rangeEnd]);

  const days = useMemo(() => {
    const list: Date[] = [];
    if (viewMode === "day") {
      list.push(startObj);
      return list;
    }
    if (viewMode === "week") {
      for (let i = 0; i < 7; i++) list.push(addDays(startObj, i));
      return list;
    }
    return list;
  }, [viewMode, startObj]);

  const hoursByWeekday = useMemo(() => {
    const m = new Map<number, ClinicHours>();
    for (const h of clinicHours) m.set(h.weekday, h);
    return m;
  }, [clinicHours]);

  const gridDays = useMemo(
    () =>
      days.map((d) => ({
        date: d,
        hours: hoursByWeekday.get(d.getDay()),
      })),
    [days, hoursByWeekday]
  );

  // A agenda exibe o dia completo (00:00–24:00), estilo Google Agenda: a
  // grade rola internamente para alcançar madrugada e fim de noite, em vez
  // de ficar travada no horário comercial.
  const hourBoundsStart = 0;
  const hourBoundsEnd = 24;

  const holidayByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.date, h.name);
    return m;
  }, [holidays]);

  function isHolidayFor(day: Date): string | null {
    const key = toDateInput(day);
    return holidayByDate.get(key) ?? null;
  }

  // Deep-link `?appointment=<id>`: vindo do header do lead (botao
  // "Visualizar agendamento"), localiza o appointment dentro do range
  // ja carregado e abre o card de acoes. Apos abrir, limpa o param da
  // URL via history.replaceState — assim fechar/reabrir nao reabre o
  // modal e o usuario fica com a URL limpa.
  useEffect(() => {
    const wanted = params.get("appointment");
    if (!wanted) return;
    const target = appointments.find((a) => a.id === wanted);
    if (!target) return;
    setActing(target);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("appointment");
      window.history.replaceState({}, "", url.toString());
    }
  }, [params, appointments]);

  useEffect(() => {
    if (appointments.length === 0) return;
    let cancelled = false;
    const supabase = createClient();
    const leadIds = Array.from(new Set(appointments.map((a) => a.lead_id)));
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("lead_id")
        .in("lead_id", leadIds)
        .eq("status", "no_show")
        .lt("starts_at", new Date().toISOString());
      if (cancelled) return;
      const set = new Set<string>();
      for (const r of (data as { lead_id: string }[] | null) ?? []) {
        set.add(r.lead_id);
      }
      setNoShowLeadIds(set);
    })();
    return () => {
      cancelled = true;
    };
  }, [appointments]);

  function navigate(nextDate: Date, nextView: ViewMode, nextResource?: ResourceAxis) {
    const p = new URLSearchParams(params.toString());
    p.set("date", toDateInput(nextDate));
    p.set("view", nextView);
    if (nextResource !== undefined) {
      if (nextResource === "none") p.delete("resource");
      else p.set("resource", nextResource);
    }
    router.push(`/${domain}/agenda?${p.toString()}`);
  }

  function moveBy(unit: number) {
    if (viewMode === "month") {
      const next = new Date(dateObj);
      next.setMonth(next.getMonth() + unit);
      navigate(next, viewMode);
      return;
    }
    const days = viewMode === "day" ? unit : unit * 7;
    navigate(addDays(dateObj, days), viewMode);
  }

  function openCreateAt(startsAt?: Date, resourceId?: string) {
    const prefill: Prefill = {
      startsAt: startsAt ? toLocalIso(startsAt) : undefined,
    };
    if (resourceId) {
      if (resourceAxis === "dentist") prefill.dentistId = resourceId;
      else if (resourceAxis === "room") prefill.roomId = resourceId;
    }
    setCreatingPrefill(prefill);
    if (startsAt) {
      const day = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, "0")}-${String(startsAt.getDate()).padStart(2, "0")}`;
      setPendingSlot({
        startsAt: startsAt.toISOString(),
        durationMin: 30,
        day,
        resourceId,
      });
    } else {
      setPendingSlot(null);
    }
  }

  // Atalhos da Agenda: T (hoje), ←/→ (periodo anterior/proximo),
  // D/W/M (visao Dia/Semana/Mes), N (novo agendamento). So fora de campos
  // de texto e sem modificadores de comando.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target) || hasCommandModifier(e)) return;
      switch (e.key) {
        case "t":
        case "T":
          e.preventDefault();
          navigate(new Date(), viewMode);
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveBy(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          moveBy(1);
          break;
        case "d":
        case "D":
          e.preventDefault();
          navigate(dateObj, "day");
          break;
        case "w":
        case "W":
          e.preventDefault();
          navigate(dateObj, "week");
          break;
        case "m":
        case "M":
          e.preventDefault();
          navigate(dateObj, "month");
          break;
        case "n":
        case "N":
          e.preventDefault();
          openCreateAt();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, dateObj]);

  async function handleMove(target: AgendaDropTarget) {
    setMoveError(null);
    const appointment = appointments.find((a) => a.id === target.appointmentId);
    if (!appointment) return;
    const oldStart = new Date(appointment.starts_at);
    const oldEnd = new Date(appointment.ends_at);
    const durationMs = oldEnd.getTime() - oldStart.getTime();

    const newStart = new Date(target.startsAt);
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Valida o expediente NO CLIENT antes de mover (o drag-and-drop nao passava
    // pela checagem de horario comercial — so de conflito). Impede arrastar um
    // card para fora do funcionamento, feriado, almoco ou atravessando a
    // meia-noite. Em falha, mantem o card no lugar (sem update) e avisa.
    const hoursIssue = checkBusinessHours({
      startsAt: newStart,
      endsAt: newEnd,
      clinicHours,
      holidays,
    });
    if (hoursIssue) {
      setMoveError(BUSINESS_HOURS_MESSAGES[hoursIssue]);
      return;
    }

    if (newStart.getTime() === oldStart.getTime()) {
      const sameResource =
        resourceAxis === "dentist"
          ? appointment.dentist_id === (target.resourceId ?? null)
          : resourceAxis === "room"
            ? appointment.room_id === (target.resourceId ?? null)
            : true;
      if (sameResource) return;
    }

    const supabase = createClient();
    const newDentistId =
      resourceAxis === "dentist"
        ? target.resourceId ?? null
        : appointment.dentist_id;
    const newRoomId =
      resourceAxis === "room"
        ? target.resourceId ?? null
        : appointment.room_id;

    const { data: conflict, error: conflictErr } = await supabase.rpc(
      "check_appointment_conflict",
      {
        p_dentist_id: newDentistId,
        p_room_id: newRoomId,
        p_starts_at: newStart.toISOString(),
        p_ends_at: newEnd.toISOString(),
        p_exclude_id: appointment.id,
      }
    );
    if (conflictErr) {
      setMoveError(`Erro ao validar: ${conflictErr.message}`);
      router.refresh();
      return;
    }
    if (conflict === true) {
      setMoveError(
        "Conflito: profissional, sala ou bloqueio já ocupam o novo horário."
      );
      return;
    }

    const { error: updateErr } = await supabase
      .from("appointments")
      .update({
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
        dentist_id: newDentistId,
        room_id: newRoomId,
      })
      .eq("id", appointment.id);

    if (updateErr) {
      setMoveError(`Erro ao reagendar: ${updateErr.message}`);
      router.refresh();
      return;
    }
    // Reflete a remarcacao na Clinicorp (fire-and-forget; cancela o antigo e
    // cria o novo). Falha aqui nunca afeta o reagendamento local.
    if (companyId) {
      void fetch("/api/appointments/sync-clinicorp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          appointmentId: appointment.id,
          action: "reschedule",
        }),
      }).catch(() => {});
    }
    router.refresh();
  }

  function openReturn(a: AppointmentDetailed) {
    const next = new Date(a.ends_at);
    next.setDate(next.getDate() + 30);
    next.setHours(new Date(a.starts_at).getHours(), 0, 0, 0);
    setActing(null);
    setCreatingPrefill({
      startsAt: toLocalIso(next),
      dentistId: a.dentist_id,
      roomId: a.room_id,
      procedureId: a.procedure_type_id,
      leadId: a.lead_id,
      notes: "Retorno",
    });
  }

  const resourceList = useMemo(
    () =>
      resourceAxis === "dentist"
        ? dentists.map((d) => ({ id: d.id, name: d.name }))
        : resourceAxis === "room"
          ? rooms.map((r) => ({ id: r.id, name: r.name }))
          : [],
    [resourceAxis, dentists, rooms]
  );

  const visibleAppointments = useMemo(() => {
    if (resourceAxis === "none" || resourceList.length === 0) return appointments;
    const ids = new Set(resourceList.map((r) => r.id));
    return appointments.filter((a) => {
      const id = resourceAxis === "dentist" ? a.dentist_id : a.room_id;
      return id && ids.has(id);
    });
  }, [appointments, resourceAxis, resourceList]);

  const monthAnchor = useMemo(() => {
    const a = new Date(dateObj);
    a.setDate(1);
    return a;
  }, [dateObj]);

  // Agenda nao habilitada: nenhuma faixa de horario cadastrada para a
  // organizacao. Bloqueia a UI de grid/agendamento e exibe um empty
  // state direcionando para Configuracoes > Horarios (mesmo padrao
  // visual do empty state do Kanban/Funil para coerencia).
  const agendaEnabled = clinicHours.length > 0;

  return (
    // Preso à altura do `<main>` do AppShell: o root usa `h-full` +
    // `overflow-hidden` para a página não gerar scroll global. O cabeçalho
    // fica fixo (`shrink-0`) e só a grade de horários rola internamente.
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-slate-200/80 bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3 lg:px-8">
          <div className="mr-1">
            <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
              Agenda
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {agendaEnabled
                ? viewMode === "day"
                  ? fmtTitle(dateObj)
                  : viewMode === "week"
                    ? `Semana de ${fmtDay(startObj)} a ${fmtDay(addDays(endObj, -1))}`
                    : fmtMonthTitle(monthAnchor)
                : "Configure os horários de funcionamento para começar."}
            </p>
          </div>

          {agendaEnabled && (
            <>
              <div
                role="tablist"
                data-tour="agenda-views"
                aria-label="Modo de visualização"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 shadow-inner"
              >
                {(["day", "week", "month"] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={viewMode === v}
                    onClick={() => navigate(dateObj, v)}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.96] cursor-pointer ${
                      viewMode === v
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => moveBy(-1)}
                  aria-label="Anterior"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-all active:scale-[0.95] cursor-pointer"
                >
                  ‹
                </button>
                <button
                  onClick={() => navigate(new Date(), viewMode)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all active:scale-[0.96] cursor-pointer"
                >
                  Hoje
                </button>
                <button
                  onClick={() => moveBy(1)}
                  aria-label="Próximo"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition-all active:scale-[0.95] cursor-pointer"
                >
                  ›
                </button>
              </div>

              <input
                type="date"
                value={toDateInput(dateObj)}
                onChange={(e) => navigate(parseDateInput(e.target.value), viewMode)}
                title="Selecione uma data (navegue por mês no calendário)"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
              />

              {viewMode !== "month" && (
                <div
                  role="group"
                  data-tour="agenda-grouping"
                  aria-label="Agrupar agenda por"
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 shadow-inner"
                >
                  {(
                    [
                      ["none", "Geral"],
                      ["dentist", "Profissional"],
                      ["room", "Sala"],
                    ] as [ResourceAxis, string][]
                  ).map(([axis, label]) => (
                    <button
                      key={axis}
                      type="button"
                      aria-pressed={resourceAxis === axis}
                      onClick={() => navigate(dateObj, viewMode, axis)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.96] cursor-pointer ${
                        resourceAxis === axis
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => openCreateAt()}
                data-tour="agenda-new"
                className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-blue-700 active:scale-[0.97] transition-all cursor-pointer"
              >
                + Agendar
              </button>
            </>
          )}
        </div>
      </header>

      {!agendaEnabled ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <AgendaEmptyState domain={domain} />
        </main>
      ) : (
      <main
        className={`p-4 lg:p-6 ${
          viewMode === "month"
            ? "min-h-0 flex-1 overflow-y-auto"
            : "flex min-h-0 flex-1 flex-col overflow-hidden"
        }`}
      >
        {viewMode === "month" ? (
          <AgendaMonth
            monthAnchor={monthAnchor}
            rangeStart={startObj}
            counts={monthCounts}
            holidays={holidays}
            onPickDay={(d) => navigate(d, "day")}
          />
        ) : (
          <>
            {/* Banner inline quando o dia atual nao tem nenhum agendamento
                — evita que o grid em branco passe a sensacao de "tela quebrada".
                So aparece em viewMode=day para nao poluir week. */}
            {viewMode === "day" &&
              visibleAppointments.length === 0 &&
              !isHolidayFor(dateObj) && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
                  <div className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75M12 7.5h.007v.008H12V7.5Zm0 4.5a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z"
                      />
                    </svg>
                    <div>
                      <p className="font-medium text-blue-900">
                        Nenhum agendamento para hoje
                      </p>
                      <p className="mt-0.5 text-xs text-blue-800/80">
                        Aproveite o tempo livre para qualificar leads frios,
                        responder mensagens pendentes ou agendar retornos.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openCreateAt()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      + Novo agendamento
                    </button>
                  </div>
                </div>
              )}
            <AgendaGrid
              days={gridDays}
              appointments={visibleAppointments}
              clinicorpEnabled={clinicorpEnabled}
              blocks={blocks}
              hourBoundsStart={hourBoundsStart}
              hourBoundsEnd={hourBoundsEnd}
              resourceAxis={resourceAxis}
              resources={resourceList}
              noShowLeadIds={noShowLeadIds}
              isHoliday={isHolidayFor}
              onCreateAt={openCreateAt}
              onSelect={(a) => setActing(a)}
              onMove={handleMove}
              pendingSlot={pendingSlot}
            />
          </>
        )}

        {moveError && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow">
            <div className="flex items-center gap-3">
              <span>{moveError}</span>
              <button
                type="button"
                onClick={() => setMoveError(null)}
                className="text-rose-700/80 hover:text-rose-900"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </main>
      )}

      {creatingPrefill && (
        <AppointmentModal
          mode="create"
          rooms={rooms}
          procedures={procedures}
          dentists={dentists}
          clinicHours={clinicHours}
          holidays={holidays}
          prefill={creatingPrefill}
          onClose={() => {
            setCreatingPrefill(null);
            setPendingSlot(null);
          }}
          onSaved={() => {
            setCreatingPrefill(null);
            setPendingSlot(null);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <AppointmentModal
          mode="edit"
          rooms={rooms}
          procedures={procedures}
          dentists={dentists}
          clinicHours={clinicHours}
          holidays={holidays}
          appointment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {acting && (
        <AppointmentActions
          domain={domain}
          appointment={acting}
          templates={templates}
          clinicorpEnabled={clinicorpEnabled}
          onClose={() => setActing(null)}
          onChanged={() => {
            setActing(null);
            router.refresh();
          }}
          onEdit={(a) => {
            setActing(null);
            setEditing(a);
          }}
          onScheduleReturn={openReturn}
        />
      )}
    </div>
  );
}
