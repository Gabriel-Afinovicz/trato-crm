"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { confirm } from "@/components/ui/confirm";
import { AvailabilityPanel } from "./availability-panel";
import type {
  AppointmentDetailed,
  AvailabilityReason,
  ClinicHoliday,
  ClinicHours,
  Lead,
  ProcedureType,
  Room,
  User,
} from "@/lib/types/database";
import {
  checkBusinessHours,
  BUSINESS_HOURS_MESSAGES,
} from "@/lib/agenda/business-hours";

const AVAILABILITY_MESSAGES: Record<AvailabilityReason, string> = {
  closed:
    "O profissional n\u00e3o est\u00e1 dispon\u00edvel neste hor\u00e1rio (fora do expediente da organiza\u00e7\u00e3o).",
  lunch:
    "O hor\u00e1rio escolhido cai durante o intervalo de almo\u00e7o da organiza\u00e7\u00e3o.",
  holiday: "Esta data \u00e9 feriado da organiza\u00e7\u00e3o.",
  block:
    "Este intervalo est\u00e1 bloqueado na agenda (profissional, sala ou bloqueio geral).",
  appointment:
    "J\u00e1 existe outro agendamento para este profissional ou sala neste intervalo.",
};

const ROOM_PRESET_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#6366f1",
];

function parseDecimal(input: string) {
  const cleaned = input.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// Configuracoes de agenda da clinica (companies.settings.agenda), servidas por
// GET /api/clinic/agenda-settings. Definidas localmente (e nao importadas da
// rota) para nao puxar codigo server-only para o bundle do client.
interface AgendaSettings {
  default_appointment_minutes: number;
  allow_overlap: boolean;
}

const DEFAULT_AGENDA_SETTINGS: AgendaSettings = {
  default_appointment_minutes: 30,
  allow_overlap: false,
};

interface BasePrefill {
  startsAt?: string;
  endsAt?: string;
  dentistId?: string | null;
  roomId?: string | null;
  procedureId?: string | null;
  leadId?: string;
  notes?: string;
}

type AppointmentModalProps = {
  rooms: Room[];
  procedures: ProcedureType[];
  dentists: Pick<User, "id" | "name" | "is_dentist">[];
  /**
   * Horarios de funcionamento e feriados da clinica. Quando fornecidos, o modal
   * valida o expediente NO CLIENT antes de salvar (impede agendar fora de hora,
   * em feriado ou atravessando a meia-noite). Sem eles, recai sobre a RPC.
   */
  clinicHours?: ClinicHours[];
  holidays?: Pick<ClinicHoliday, "date">[];
  onClose: () => void;
  onSaved?: () => void;
} & (
  | { mode: "create"; prefill?: BasePrefill; appointment?: undefined }
  | { mode: "edit"; appointment: AppointmentDetailed; prefill?: undefined }
);

function toDatetimeLocal(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function diffMinutes(startIso: string, endIso: string) {
  return Math.max(
    5,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  );
}

function addMinutesIso(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

type ClinicorpSyncPayload = {
  companyId: string;
  appointmentId?: string;
  action: "create" | "reschedule" | "cancel";
  clinicorpAppointmentId?: string | null;
};

/**
 * Dispara (fire-and-forget) a sincronizacao do agendamento com a Clinicorp.
 * A sincronizacao roda no servidor; uma falha nunca afeta o agendamento local
 * (fica registrada em integration_logs).
 */
function triggerClinicorpSync(payload: ClinicorpSyncPayload) {
  if (!payload.companyId) return;
  void fetch("/api/appointments/sync-clinicorp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function AppointmentModal(props: AppointmentModalProps) {
  const { rooms, procedures, dentists, clinicHours, holidays, onClose, onSaved } =
    props;
  const { companyId } = useCurrentCompany();
  const isEdit = props.mode === "edit";
  const initial: BasePrefill =
    props.mode === "edit"
      ? {
          startsAt: props.appointment.starts_at,
          endsAt: props.appointment.ends_at,
          dentistId: props.appointment.dentist_id,
          roomId: props.appointment.room_id,
          procedureId: props.appointment.procedure_type_id,
          leadId: props.appointment.lead_id,
          notes: props.appointment.notes ?? "",
        }
      : props.prefill ?? {};

  const [startsAt, setStartsAt] = useState(toDatetimeLocal(initial.startsAt));
  const [duration, setDuration] = useState(
    initial.startsAt && initial.endsAt
      ? diffMinutes(initial.startsAt, initial.endsAt)
      : 30
  );
  const [dentistId, setDentistId] = useState<string>(initial.dentistId ?? "");
  const [roomId, setRoomId] = useState<string>(initial.roomId ?? "");
  const [procedureId, setProcedureId] = useState<string>(initial.procedureId ?? "");
  const [leadId, setLeadId] = useState<string>(initial.leadId ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [leadName, setLeadName] = useState(
    isEdit ? props.appointment.lead_name ?? "" : ""
  );
  const [leadSearch, setLeadSearch] = useState("");
  const [leadOptions, setLeadOptions] = useState<Pick<Lead, "id" | "name">[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agendaSettings, setAgendaSettings] = useState<AgendaSettings>(
    DEFAULT_AGENDA_SETTINGS
  );
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const settingsAppliedRef = useRef(false);
  const lockedLead = isEdit || Boolean(initial.leadId);

  const [proceduresList, setProceduresList] = useState<ProcedureType[]>(procedures);
  const [roomsList, setRoomsList] = useState<Room[]>(rooms);

  useEffect(() => {
    setProceduresList((prev) => {
      const incomingIds = new Set(procedures.map((p) => p.id));
      const localExtras = prev.filter((p) => !incomingIds.has(p.id));
      return [...procedures, ...localExtras].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });
  }, [procedures]);

  useEffect(() => {
    setRoomsList((prev) => {
      const incomingIds = new Set(rooms.map((r) => r.id));
      const localExtras = prev.filter((r) => !incomingIds.has(r.id));
      return [...rooms, ...localExtras].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });
  }, [rooms]);

  const [showProcedureForm, setShowProcedureForm] = useState(false);
  const [newProcedure, setNewProcedure] = useState({
    name: "",
    duration: "30",
    value: "",
  });
  const [creatingProcedure, setCreatingProcedure] = useState(false);

  const [showRoomForm, setShowRoomForm] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: "",
    color: ROOM_PRESET_COLORS[0],
  });
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Carrega as configuracoes de agenda da clinica. Aplica a duracao padrao
  // apenas no create sem fonte explicita de duracao (sem prefill de fim e sem
  // procedimento pre-selecionado) — edicao e prefills mantem a propria duracao.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetch(`/api/clinic/agenda-settings?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { settings: AgendaSettings } | null) => {
        if (cancelled || !p?.settings) return;
        setAgendaSettings(p.settings);
        if (
          !isEdit &&
          !initial.endsAt &&
          !initial.procedureId &&
          !settingsAppliedRef.current
        ) {
          settingsAppliedRef.current = true;
          setDuration(p.settings.default_appointment_minutes);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId, isEdit, initial.endsAt, initial.procedureId]);

  async function handleCreateProcedure() {
    if (!companyId) return;
    const trimmed = newProcedure.name.trim();
    if (!trimmed) {
      setError("Informe o nome do serviço.");
      return;
    }
    const dur = parseInt(newProcedure.duration, 10);
    if (!Number.isFinite(dur) || dur < 5) {
      setError("Duração inválida (mínimo 5 minutos).");
      return;
    }
    setError(null);
    setCreatingProcedure(true);
    const supabase = createClient();
    const value = parseDecimal(newProcedure.value);
    const { data, error: insertErr } = await supabase
      .from("procedure_types")
      .insert({
        company_id: companyId,
        name: trimmed,
        default_duration_minutes: dur,
        default_value: value,
      })
      .select("*")
      .single();
    setCreatingProcedure(false);
    if (insertErr || !data) {
      setError(`Erro ao cadastrar serviço: ${insertErr?.message ?? ""}`);
      return;
    }
    const created = data as unknown as ProcedureType;
    setProceduresList((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setProcedureId(created.id);
    if (!isEdit) setDuration(created.default_duration_minutes);
    setShowProcedureForm(false);
    setNewProcedure({ name: "", duration: "30", value: "" });
  }

  async function handleCreateRoom() {
    if (!companyId) return;
    const trimmed = newRoom.name.trim();
    if (!trimmed) {
      setError("Informe o nome da sala.");
      return;
    }
    setError(null);
    setCreatingRoom(true);
    const supabase = createClient();
    const { data, error: insertErr } = await supabase
      .from("rooms")
      .insert({
        company_id: companyId,
        name: trimmed,
        color: newRoom.color,
      })
      .select("*")
      .single();
    setCreatingRoom(false);
    if (insertErr || !data) {
      setError(`Erro ao cadastrar sala: ${insertErr?.message ?? ""}`);
      return;
    }
    const created = data as unknown as Room;
    setRoomsList((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setRoomId(created.id);
    setShowRoomForm(false);
    setNewRoom({ name: "", color: ROOM_PRESET_COLORS[0] });
  }

  useEffect(() => {
    if (!lockedLead || isEdit || !initial.leadId || !companyId) return;
    if (leadName) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("leads")
        .select("name")
        .eq("id", initial.leadId!)
        .single();
      if (data) setLeadName((data as { name: string }).name);
    })();
  }, [companyId, initial.leadId, isEdit, leadName, lockedLead]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!companyId || lockedLead) return;
    const supabase = createClient();
    const t = setTimeout(async () => {
      const q = supabase
        .from("leads")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name")
        .limit(25);
      if (leadSearch.trim()) q.ilike("name", `%${leadSearch.trim()}%`);
      const { data } = await q;
      setLeadOptions((data as unknown as Pick<Lead, "id" | "name">[]) ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [companyId, leadSearch, lockedLead]);

  function handleProcedureChange(id: string) {
    if (id === "__create__") {
      setShowProcedureForm(true);
      return;
    }
    setProcedureId(id);
    if (!isEdit) {
      const proc = proceduresList.find((p) => p.id === id);
      if (proc) setDuration(proc.default_duration_minutes);
    }
  }

  function handleRoomChange(id: string) {
    if (id === "__create__") {
      setShowRoomForm(true);
      return;
    }
    setRoomId(id);
  }

  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();
    return () => previousActive?.focus?.();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyId) {
      setError("Aguardando empresa...");
      return;
    }
    if (!leadId) {
      setError("Selecione um lead.");
      return;
    }
    if (!startsAt) {
      setError("Informe data e hora.");
      return;
    }

    const startsIso = new Date(startsAt).toISOString();
    const endsIso = addMinutesIso(startsIso, duration);

    // Validacao de expediente NO CLIENT (independente da RPC): barra horario
    // fora do funcionamento, feriado, almoco, intervalo invalido e agendamento
    // que atravessa a meia-noite. So roda a parte de expediente quando o modal
    // recebeu os horarios da clinica; caso contrario apenas intervalo/meia-noite.
    const hoursIssue = checkBusinessHours({
      startsAt: startsIso,
      endsAt: endsIso,
      clinicHours: clinicHours ?? [],
      holidays,
    });
    if (hoursIssue) {
      setError(BUSINESS_HOURS_MESSAGES[hoursIssue]);
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { data: reasonData, error: reasonErr } = await supabase.rpc(
      "check_appointment_availability",
      {
        p_company_id: companyId,
        p_dentist_id: dentistId || null,
        p_room_id: roomId || null,
        p_starts_at: startsIso,
        p_ends_at: endsIso,
        p_exclude_id: isEdit ? props.appointment.id : null,
      }
    );

    if (reasonErr) {
      setError(`Erro ao verificar disponibilidade: ${reasonErr.message}`);
      setSaving(false);
      return;
    }
    if (reasonData) {
      const reason = reasonData as AvailabilityReason;
      // Sobreposicao com outro agendamento pode ser confirmada manualmente
      // quando a clinica habilita `allow_overlap`. Demais motivos (expediente,
      // almoco, feriado, bloqueio) sempre bloqueiam.
      const canOverride =
        reason === "appointment" && agendaSettings.allow_overlap;
      if (!canOverride) {
        setError(AVAILABILITY_MESSAGES[reason] ?? "Hor\u00e1rio indispon\u00edvel.");
        setSaving(false);
        return;
      }
      if (!confirmOverlap) {
        setError(
          "J\u00e1 existe agendamento neste hor\u00e1rio para o mesmo profissional ou sala. Marque \u201cConfirmar mesmo assim\u201d abaixo para prosseguir."
        );
        setSaving(false);
        return;
      }
      // canOverride && confirmOverlap: segue para gravar (sobreposicao aceita).
    }

    if (isEdit) {
      // Remarcacao na Clinicorp so quando muda horario ou profissional
      // (mudancas so de notas/sala/visibilidade nao alteram o slot la).
      const needsReschedule =
        new Date(startsIso).getTime() !==
          new Date(props.appointment.starts_at).getTime() ||
        new Date(endsIso).getTime() !==
          new Date(props.appointment.ends_at).getTime() ||
        (dentistId || null) !== (props.appointment.dentist_id ?? null);
      const { error: updateErr } = await supabase
        .from("appointments")
        .update({
          dentist_id: dentistId || null,
          room_id: roomId || null,
          procedure_type_id: procedureId || null,
          starts_at: startsIso,
          ends_at: endsIso,
          notes: notes.trim() || null,
        })
        .eq("id", props.appointment.id);
      if (updateErr) {
        setError(`Erro ao salvar: ${updateErr.message}`);
        setSaving(false);
        return;
      }
      if (needsReschedule && companyId) {
        triggerClinicorpSync({
          companyId,
          appointmentId: props.appointment.id,
          action: "reschedule",
        });
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("appointments")
        .insert({
          company_id: companyId,
          lead_id: leadId,
          dentist_id: dentistId || null,
          room_id: roomId || null,
          procedure_type_id: procedureId || null,
          starts_at: startsIso,
          ends_at: endsIso,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (insertErr) {
        setError(`Erro ao agendar: ${insertErr.message}`);
        setSaving(false);
        return;
      }
      if (inserted && companyId) {
        triggerClinicorpSync({
          companyId,
          appointmentId: (inserted as { id: string }).id,
          action: "create",
        });
      }
    }

    setSaving(false);
    onSaved?.();
  }

  async function handleDelete() {
    if (!isEdit) return;
    const ok = await confirm({
      title: "Excluir este agendamento?",
      description: "Esta acao nao pode ser desfeita.",
      confirmLabel: "Excluir agendamento",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    const supabase = createClient();
    // Cancela na Clinicorp ANTES de excluir local (passamos o id da Clinicorp,
    // entao nao depende do registro local que sera removido).
    if (props.appointment.clinicorp_appointment_id && companyId) {
      triggerClinicorpSync({
        companyId,
        action: "cancel",
        clinicorpAppointmentId: props.appointment.clinicorp_appointment_id,
      });
    }
    const { error: deleteErr } = await supabase
      .from("appointments")
      .delete()
      .eq("id", props.appointment.id);
    if (deleteErr) {
      setError(`Erro ao excluir: ${deleteErr.message}`);
      setDeleting(false);
      return;
    }
    setDeleting(false);
    onSaved?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 id={titleId} className="text-base font-bold text-slate-800 tracking-tight">
              {isEdit ? "Editar" : "Agendar"}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              O sistema bloqueia conflitos de profissional, sala e bloqueios
              da agenda no mesmo horário.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!lockedLead ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Lead *
              </label>
              <input
                type="text"
                value={leadSearch}
                onChange={(e) => {
                  setLeadSearch(e.target.value);
                  setLeadId("");
                }}
                placeholder="Buscar lead..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
              {leadOptions.length > 0 && !leadId && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md py-1.5">
                  {leadOptions.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLeadId(l.id);
                        setLeadSearch(l.name);
                      }}
                      className="block w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium cursor-pointer"
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
              {leadId && (
                <p className="mt-1 text-xs text-slate-500">
                  Selecionado:{" "}
                  <span className="font-semibold text-slate-800">{leadSearch}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-600">
              Lead:{" "}
              <span className="font-semibold text-slate-900">{leadName}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Data e hora *
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Duração (min)
              </label>
              <input
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) =>
                  setDuration(parseInt(e.target.value, 10) || 30)
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Profissional
              </label>
              <select
                value={dentistId}
                onChange={(e) => setDentistId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer font-medium text-slate-700 shadow-sm"
              >
                <option value="">Sem profissional</option>
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Sala
              </label>
              <select
                value={roomId}
                onChange={(e) => handleRoomChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer font-medium text-slate-700 shadow-sm"
              >
                <option value="">Sem sala</option>
                {roomsList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
                <option value="__create__">+ Cadastrar nova sala</option>
              </select>
            </div>
          </div>

          {showRoomForm && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <p className="mb-2 text-xs font-bold text-blue-900">
                Nova sala
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Nome da sala"
                  value={newRoom.name}
                  onChange={(e) =>
                    setNewRoom((r) => ({ ...r, name: e.target.value }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  {ROOM_PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Cor ${c}`}
                      onClick={() => setNewRoom((r) => ({ ...r, color: c }))}
                      className={`h-5 w-5 rounded-full cursor-pointer transition-transform duration-200 hover:scale-110 ${
                        newRoom.color === c
                          ? "ring-2 ring-offset-2 ring-blue-500"
                          : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoomForm(false);
                    setNewRoom({ name: "", color: ROOM_PRESET_COLORS[0] });
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={creatingRoom || !newRoom.name.trim()}
                  className="rounded-lg bg-blue-600 px-4.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
                >
                  {creatingRoom ? "Salvando..." : "Salvar sala"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Serviço
            </label>
            <select
              value={procedureId}
              onChange={(e) => handleProcedureChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer font-medium text-slate-700 shadow-sm"
            >
              <option value="">Nenhum</option>
              {proceduresList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.default_duration_minutes}min
                </option>
              ))}
              <option value="__create__">+ Cadastrar novo serviço</option>
            </select>
          </div>

          {showProcedureForm && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
              <p className="mb-2 text-xs font-bold text-blue-900">
                Novo serviço
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Nome do serviço"
                  value={newProcedure.name}
                  onChange={(e) =>
                    setNewProcedure((p) => ({ ...p, name: e.target.value }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
                  autoFocus
                />
                <input
                  type="number"
                  min={5}
                  step={5}
                  placeholder="Duração (min)"
                  value={newProcedure.duration}
                  onChange={(e) =>
                    setNewProcedure((p) => ({ ...p, duration: e.target.value }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
                />
                <input
                  type="text"
                  placeholder="Valor (opcional, ex: 250,00)"
                  value={newProcedure.value}
                  onChange={(e) =>
                    setNewProcedure((p) => ({ ...p, value: e.target.value }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700"
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowProcedureForm(false);
                    setNewProcedure({
                      name: "",
                      duration: "30",
                      value: "",
                    });
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateProcedure}
                  disabled={creatingProcedure || !newProcedure.name.trim()}
                  className="rounded-lg bg-blue-600 px-4.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
                >
                  {creatingProcedure ? "Salvando..." : "Salvar serviço"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Observações
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700 shadow-sm"
              placeholder="Anotações sobre o agendamento..."
            />
          </div>

          {agendaSettings.allow_overlap && (
            <label className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
              <input
                type="checkbox"
                checked={confirmOverlap}
                onChange={(e) => setConfirmOverlap(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              Permitir sobreposição com agendamento existente (mesmo
              profissional ou sala).
            </label>
          )}

          {companyId && (
            <details className="group rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50/50 transition-colors select-none">
                <span>
                  Disponibilidade dos profissionais{" "}
                  <span className="text-slate-400 font-medium">
                    · {startsAt ? startsAt.slice(0, 10) : "—"}
                  </span>
                </span>
                <svg
                  className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180"
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
              </summary>
              <div className="border-t border-slate-100 px-3.5 py-3 bg-slate-50/20">
                {startsAt ? (
                  <AvailabilityPanel
                    companyId={companyId}
                    date={startsAt.slice(0, 10)}
                    highlightDentistId={dentistId || undefined}
                  />
                ) : (
                  <p className="text-xs text-slate-500 font-medium">
                    Informe data e hora para visualizar a disponibilidade.
                  </p>
                )}
              </div>
            </details>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg border border-rose-200 px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
                >
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all active:scale-[0.97] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-md transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50"
              >
                {saving
                  ? isEdit
                    ? "Salvando..."
                    : "Agendando..."
                  : isEdit
                    ? "Salvar"
                    : "Agendar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
