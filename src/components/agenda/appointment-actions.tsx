"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import {
  getClinicorpSyncState,
  CLINICORP_SYNC_LABEL,
  CLINICORP_SYNC_PILL,
  CLINICORP_SYNC_DOT,
} from "@/lib/clinicorp/sync-badge";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-from-client";
import type {
  AppointmentDetailed,
  AppointmentStatus,
  MessageTemplate,
} from "@/lib/types/database";

interface AppointmentActionsProps {
  domain: string;
  appointment: AppointmentDetailed;
  templates: MessageTemplate[];
  clinicorpEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (a: AppointmentDetailed) => void;
  onScheduleReturn: (a: AppointmentDetailed) => void;
}

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: "scheduled", label: "Agendado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "completed", label: "Concluído" },
  { value: "no_show", label: "Faltou" },
  { value: "cancelled", label: "Cancelado" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ReminderDateParts {
  diaSemana: string;
  dataCalendario: string;
  hora: string;
  combinado: string;
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function reminderDateParts(iso: string): ReminderDateParts {
  const d = new Date(iso);
  const diaSemana = capitalizeFirst(
    d.toLocaleDateString("pt-BR", { weekday: "long" })
  );
  const dataCalendario = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const hora = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const combinado = `${diaSemana}, ${dataCalendario} as ${hora}`;
  return { diaSemana, dataCalendario, hora, combinado };
}

interface TemplateContext {
  lead: string;
  profissional: string;
  /** Data + hora combinados (compatibilidade com templates antigos). */
  data: string;
  hora: string;
  dia_semana: string;
  data_calendario: string;
  organizacao: string;
  link: string;
}

// Substitui placeholders no corpo do template. Os termos genericos
// ({{lead}}, {{profissional}}, {{organizacao}}) sao os "oficiais"; os
// antigos ({{paciente}}, {{dentista}}, {{clinica}}) continuam aceitos
// para nao quebrar templates ja salvos em produccao.
function applyTemplate(body: string, ctx: TemplateContext) {
  return body
    .replaceAll("{{lead}}", ctx.lead)
    .replaceAll("{{paciente}}", ctx.lead)
    .replaceAll("{{profissional}}", ctx.profissional)
    .replaceAll("{{dentista}}", ctx.profissional)
    .replaceAll("{{data}}", ctx.data)
    .replaceAll("{{hora}}", ctx.hora)
    .replaceAll("{{dia_semana}}", ctx.dia_semana)
    .replaceAll("{{data_calendario}}", ctx.data_calendario)
    .replaceAll("{{organizacao}}", ctx.organizacao)
    .replaceAll("{{clinica}}", ctx.organizacao)
    .replaceAll("{{link}}", ctx.link);
}

/**
 * Determina a base URL para os links de confirmacao. Em producao, a env
 * NEXT_PUBLIC_PUBLIC_APP_URL aponta para o dominio publico (HTTPS); em dev
 * caimos no origin do navegador, que pode ser http://localhost — neste caso
 * a URL nao vira tocavel no WhatsApp do lead.
 */
function resolveAppBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_PUBLIC_APP_URL?.trim();
  if (env) {
    return env.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

function isLocalOrInsecureBase(base: string): boolean {
  if (!base) return true;
  try {
    const u = new URL(base);
    if (u.protocol !== "https:") return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return true;
  }
}

function randomToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function AppointmentActions({
  domain,
  appointment,
  templates,
  clinicorpEnabled,
  onClose,
  onChanged,
  onEdit,
  onScheduleReturn,
}: AppointmentActionsProps) {
  const { companyId } = useCurrentCompany();
  const syncState = getClinicorpSyncState(appointment, clinicorpEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ message: string; chatId?: string } | null>(
    null
  );
  const [confirmationLink, setConfirmationLink] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [linkBaseIsLocal, setLinkBaseIsLocal] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valor derivado do window (client-only), resolvido apos montar
    setLinkBaseIsLocal(isLocalOrInsecureBase(resolveAppBaseUrl()));
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();
    return () => previous?.focus?.();
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

  async function changeStatus(status: AppointmentStatus) {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointment.id);
    setBusy(false);
    if (e) {
      setError(`Erro ao alterar status: ${e.message}`);
      return;
    }
    // Cancelar no CRM tambem cancela na Clinicorp (fire-and-forget).
    if (status === "cancelled" && appointment.clinicorp_appointment_id && companyId) {
      void fetch("/api/appointments/sync-clinicorp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          action: "cancel",
          clinicorpAppointmentId: appointment.clinicorp_appointment_id,
        }),
      }).catch(() => {});
    }
    onChanged();
  }

  async function ensureConfirmationLink(): Promise<string | null> {
    setError(null);
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("appointment_confirmations")
      .select("token")
      .eq("appointment_id", appointment.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token: string | null = (existing as { token: string } | null)?.token ?? null;
    if (!token) {
      const newToken = randomToken();
      const { error: insertErr } = await supabase
        .from("appointment_confirmations")
        .insert({
          appointment_id: appointment.id,
          company_id: appointment.company_id,
          token: newToken,
        });
      if (insertErr) {
        setError(`Não foi possível gerar link: ${insertErr.message}`);
        return null;
      }
      token = newToken;
    }
    const base = resolveAppBaseUrl();
    const link = `${base}/${domain}/confirmar/${token}`;
    setConfirmationLink(link);
    return link;
  }

  async function sendReminder(template?: MessageTemplate) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const link = await ensureConfirmationLink();
    if (!link) {
      setBusy(false);
      return;
    }

    const parts = reminderDateParts(appointment.starts_at);
    const ctx: TemplateContext = {
      lead: appointment.lead_name ?? "lead",
      profissional: appointment.dentist_name ?? "o profissional responsável",
      data: parts.combinado,
      hora: parts.hora,
      dia_semana: parts.diaSemana,
      data_calendario: parts.dataCalendario,
      organizacao: domain,
      link,
    };
    const fallback = [
      `Olá, ${ctx.lead}! Tudo bem?`,
      "",
      "Passando para confirmar seu atendimento:",
      `📅 *Data:* ${ctx.dia_semana}, ${ctx.data_calendario}`,
      `🕒 *Horário:* ${ctx.hora}`,
      `👤 *Profissional:* ${ctx.profissional}`,
      "",
      "Para confirmar ou reagendar, acesse o link abaixo:",
      ctx.link,
    ].join("\n");
    const body = template ? applyTemplate(template.body, ctx) : fallback;

    const phone = (appointment.lead_phone ?? "").replace(/\D+/g, "");
    const result = await sendWhatsAppMessage({
      text: body,
      leadId: appointment.lead_id,
      phone: phone || undefined,
      linkPreview: true,
    });
    setBusy(false);

    if (result.kind === "sent") {
      setInfo({
        message: "Mensagem enviada pelo WhatsApp da organizacao.",
        chatId: result.chatId,
      });
      return;
    }
    if (result.kind === "fallback") {
      setInfo({ message: result.message });
      return;
    }
    if (!phone) {
      navigator.clipboard?.writeText(body).catch(() => undefined);
    }
    setError(result.message);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Ações para ${appointment.lead_name ?? "consulta"}`}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              {appointment.lead_name ?? "Lead"}
            </h3>
            <p className="mt-0.5 text-xs text-gray-600">
              {formatDate(appointment.starts_at)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
              {appointment.dentist_name && (
                <span>{appointment.dentist_name}</span>
              )}
              {appointment.room_name && <span>· {appointment.room_name}</span>}
              {appointment.procedure_name && (
                <span>· {appointment.procedure_name}</span>
              )}
            </div>
            {((appointment.lead_tags && appointment.lead_tags.length > 0) ||
              (appointment.appointment_tags && appointment.appointment_tags.length > 0)) && (
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
                {appointment.lead_tags && appointment.lead_tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead:</span>
                    {appointment.lead_tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${tag.color}15`,
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
                {appointment.appointment_tags && appointment.appointment_tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agendamento:</span>
                    {appointment.appointment_tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${tag.color}15`,
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {syncState && (
              <div className="mt-2">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${CLINICORP_SYNC_PILL[syncState]}`}
                  title={
                    syncState === "syncing"
                      ? "O agendamento está sendo enviado para a agenda da Clinicorp."
                      : syncState === "synced"
                        ? "Este agendamento já está na agenda da Clinicorp."
                        : "Não foi possível enviar para a Clinicorp. Veja o motivo abaixo."
                  }
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${CLINICORP_SYNC_DOT[syncState]}`}
                  />
                  {CLINICORP_SYNC_LABEL[syncState]}
                </div>
                {syncState === "failed" && appointment.clinicorp_sync_error && (
                  <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] leading-snug text-red-700">
                    <span className="font-semibold">Motivo:</span>{" "}
                    {appointment.clinicorp_sync_error}
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
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

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <span>{info.message}</span>
            {info.chatId && (
              <Link
                href={`/${domain}/conversas?chat=${info.chatId}`}
                className="rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Ver conversa
              </Link>
            )}
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((opt) => {
              const active = appointment.status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={busy || active}
                  onClick={() => changeStatus(opt.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Lembrete (WhatsApp)
          </p>
          {linkBaseIsLocal && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              O link do lembrete usa <code>localhost</code> e provavelmente não
              ficará tocável no celular do lead. Defina{" "}
              <code>NEXT_PUBLIC_PUBLIC_APP_URL</code> com a URL pública (HTTPS)
              da organização para que o link vire clicável no WhatsApp.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => sendReminder()}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Enviar lembrete padrão
            </button>
            {templates
              .filter((t) =>
                ["confirmation", "reminder", "custom"].includes(t.kind)
              )
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => sendReminder(t)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {t.name}
                </button>
              ))}
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const link = await ensureConfirmationLink();
                if (link) {
                  await navigator.clipboard?.writeText(link);
                }
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Copiar link
            </button>
          </div>
          {confirmationLink && (
            <p className="mt-2 break-all rounded-lg bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600">
              {confirmationLink}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onEdit(appointment)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Editar / mover
          </button>
          <button
            type="button"
            onClick={() => onScheduleReturn(appointment)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Agendar retorno
          </button>
          <Link
            href={`/${domain}/leads/${appointment.lead_id}`}
            className="rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Ver lead
          </Link>
        </div>
      </div>
    </div>
  );
}
