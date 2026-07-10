"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ProcedureType, Room, User, MessageTemplate } from "@/lib/types/database";
import { AppointmentModal } from "@/components/agenda/appointment-modal";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-from-client";

interface LeadHeaderProps {
  leadId: string;
  leadName: string;
  domain: string;
  isAdmin?: boolean;
  // Quando o lead ja tem um agendamento futuro ativo (scheduled/confirmed),
  // o botao "Agendar" e substituido por "Visualizar agendamento" — leva
  // direto pra agenda no dia do evento com o card de acoes ja aberto.
  nextAppointment?: { id: string; startsAt: string } | null;
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
  data: string;
  hora: string;
  dia_semana: string;
  data_calendario: string;
  organizacao: string;
  link: string;
}

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

function randomToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cabeçalho do detalhe do lead. O status agora é gerido exclusivamente
 * pelas etapas dinâmicas do kanban (sem dropdown legado de
 * Novo/Agendado/.../Perdido).
 */
export function LeadHeader({
  leadId,
  leadName,
  domain,
  isAdmin = false,
  nextAppointment = null,
}: LeadHeaderProps) {
  const router = useRouter();
  const { companyId } = useCurrentCompany();
  const [showBook, setShowBook] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingConfirmation, setSendingConfirmation] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", leadId);
      
      if (error) {
        toast.error("Erro ao excluir o lead", { description: error.message });
      } else {
        toast.success("Lead excluído com sucesso");
        router.push(`/${domain}/leads`);
      }
    } catch (err) {
      toast.error("Erro inesperado ao excluir o lead", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleSendConfirmation = async () => {
    if (!nextAppointment || sendingConfirmation) return;
    setSendingConfirmation(true);
    try {
      const supabase = createClient();

      // 1. Fetch appointment details with joins
      const { data: appData, error: appErr } = await supabase
        .from("appointments")
        .select(`
          id,
          company_id,
          lead_id,
          starts_at,
          status,
          leads:lead_id(id, name, phone),
          clinicorp_professionals:dentist_id(name),
          rooms:room_id(name),
          procedure_types:procedure_type_id(name)
        `)
        .eq("id", nextAppointment.id)
        .single();

      if (appErr || !appData) {
        toast.error("Erro ao buscar dados do agendamento", {
          description: appErr?.message || "Agendamento não encontrado.",
        });
        setSendingConfirmation(false);
        return;
      }

      // Format appointment row
      const appointment = appData as unknown as {
        id: string;
        company_id: string;
        lead_id: string;
        starts_at: string;
        status: string;
        leads: { id: string; name: string; phone: string | null } | null;
        clinicorp_professionals: { name: string } | null;
        rooms: { name: string } | null;
        procedure_types: { name: string } | null;
      };

      const leadNameStr = appointment.leads?.name ?? leadName;
      const leadPhoneStr = appointment.leads?.phone ?? "";
      const dentistNameStr = appointment.clinicorp_professionals?.name ?? "o profissional responsável";

      // 2. Fetch templates
      const { data: templatesData } = await supabase
        .from("message_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const templates = (templatesData as unknown as MessageTemplate[]) ?? [];
      const preferredTemplate =
        templates.find((t) => t.kind === "confirmation") ||
        templates.find((t) => t.kind === "reminder") ||
        templates.find((t) => t.kind === "custom");

      // 3. Ensure confirmation link
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
          toast.error("Não foi possível gerar o link de confirmação", {
            description: insertErr.message,
          });
          setSendingConfirmation(false);
          return;
        }
        token = newToken;
      }

      const base = resolveAppBaseUrl();
      const link = `${base}/${domain}/confirmar/${token}`;

      // 4. Format Message Text
      const parts = reminderDateParts(appointment.starts_at);
      const ctx: TemplateContext = {
        lead: leadNameStr,
        profissional: dentistNameStr,
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

      const body = preferredTemplate ? applyTemplate(preferredTemplate.body, ctx) : fallback;

      // 5. Send message
      const phoneClean = leadPhoneStr.replace(/\D+/g, "");
      const result = await sendWhatsAppMessage({
        text: body,
        leadId: appointment.lead_id,
        phone: phoneClean || undefined,
        linkPreview: true,
      });

      if (result.kind === "sent") {
        toast.success("Confirmação de agendamento enviada por WhatsApp!", {
          action: {
            label: "Ver conversa",
            onClick: () => router.push(`/${domain}/conversas?chat=${result.chatId}`),
          },
        });
      } else if (result.kind === "fallback") {
        toast.info(result.message);
      } else {
        toast.error("Erro ao enviar mensagem", { description: result.message });
      }
    } catch (err) {
      toast.error("Erro inesperado ao processar confirmação", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSendingConfirmation(false);
    }
  };

  const [agendaResources, setAgendaResources] = useState<{
    rooms: Room[];
    procedures: ProcedureType[];
    dentists: Pick<User, "id" | "name" | "is_dentist">[];
  }>({ rooms: [], procedures: [], dentists: [] });

  useEffect(() => {
    if (!companyId) return;
    // Quando o lead ja tem agendamento, o botao "Agendar" e substituido
    // por "Visualizar agendamento" (Link) — o modal de criar nunca abre,
    // entao podemos pular o load de salas/servicos/profissionais.
    if (nextAppointment) return;
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [r, p, u, sysUsers] = await Promise.all([
        supabase
          .from("rooms")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("procedure_types")
          .select("*")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("clinicorp_professionals")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("users")
          .select("id, name, is_dentist")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .neq("role", "super_admin")
          .order("name"),
      ]);
      if (cancelled) return;

      const clinicorpProfs = (u.data as { id: string; name: string }[] | null) ?? [];
      const sysDentists = (sysUsers.data as { id: string; name: string; is_dentist: boolean }[] | null) ?? [];
      const combinedDentists = [
        ...sysDentists.map(d => ({ id: d.id, name: d.name, is_dentist: d.is_dentist })),
        ...clinicorpProfs
          .filter(p => !sysDentists.some(d => d.id === p.id))
          .map(p => ({ id: p.id, name: `${p.name} (CliniCorp)`, is_dentist: true }))
      ].sort((a, b) => a.name.localeCompare(b.name));

      setAgendaResources({
        rooms: (r.data as unknown as Room[]) ?? [],
        procedures: (p.data as unknown as ProcedureType[]) ?? [],
        dentists: combinedDentists,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, nextAppointment]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Link
          href={`/${domain}/leads`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{leadName}</h1>
      </div>

      <div className="flex items-center gap-2">
        {nextAppointment ? (
          <>
            <button
              type="button"
              disabled={sendingConfirmation}
              onClick={handleSendConfirmation}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              title="Enviar confirmação de agendamento por WhatsApp"
            >
              {sendingConfirmation ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.413c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.609zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.149-.173.198-.297.298-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01a1.097 1.097 0 0 0-.793.371c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z" />
                </svg>
              )}
              {sendingConfirmation ? "Enviando..." : "Enviar confirmação"}
            </button>
            <Link
              href={`/${domain}/agenda?date=${nextAppointment.startsAt.slice(0, 10)}&appointment=${nextAppointment.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              title="Ver detalhes do agendamento na tela de Agenda"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              Visualizar agendamento
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowBook(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            Agendar
          </button>
        )}
        <Link
          href={`/${domain}/leads/${leadId}/edit`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
          </svg>
          Editar
        </Link>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Excluir
          </button>
        )}
      </div>

      {showBook && (
        <AppointmentModal
          mode="create"
          rooms={agendaResources.rooms}
          procedures={agendaResources.procedures}
          dentists={agendaResources.dentists}
          prefill={{ leadId }}
          onClose={() => setShowBook(false)}
          onSaved={() => {
            setShowBook(false);
            router.refresh();
          }}
        />
      )}

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setShowDeleteModal(false);
            setConfirmDelete(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <h3 className="text-lg font-bold text-gray-900">
                Excluir Lead Permanentemente?
              </h3>
            </div>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Você está prestes a deletar o lead <strong className="text-gray-900">{leadName}</strong>. Esta ação é <strong className="text-red-600 font-semibold">irreversível</strong> e apagará todos os dados associados a ele no banco de dados.
            </p>
            
            {/* Aviso de responsabilidade */}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-850 mb-4 space-y-1">
              <p className="font-bold">Riscos e Responsabilidades:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>O histórico de conversas do WhatsApp associado a este lead continuará no chat, mas perderá o vínculo com as informações de funil.</li>
                <li>Quaisquer agendamentos ativos ou passados deste lead na Agenda serão permanentemente removidos.</li>
                <li>Os dados financeiros deste lead serão excluídos do faturamento do Dashboard Analítico.</li>
              </ul>
            </div>

            <div className="flex items-start gap-2.5 mb-6">
              <input
                id="confirm-delete-checkbox"
                type="checkbox"
                checked={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <label htmlFor="confirm-delete-checkbox" className="text-sm font-medium text-gray-700 select-none">
                Estou ciente dos riscos e confirmo a exclusão permanente deste lead.
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmDelete(false);
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!confirmDelete || deleting}
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Excluindo..." : "Excluir Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
