"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { ProcedureType, Room, User } from "@/lib/types/database";
import { AppointmentModal } from "@/components/agenda/appointment-modal";
import { useCurrentCompany } from "@/hooks/use-current-company";

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
    } catch (err: any) {
      toast.error("Erro inesperado ao excluir o lead", { description: err.message });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
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
      const [r, p, u] = await Promise.all([
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
          .from("users")
          .select("id, name, is_dentist")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .neq("role", "super_admin")
          .order("name"),
      ]);
      if (cancelled) return;
      setAgendaResources({
        rooms: (r.data as unknown as Room[]) ?? [],
        procedures: (p.data as unknown as ProcedureType[]) ?? [],
        dentists:
          (u.data as unknown as Pick<User, "id" | "name" | "is_dentist">[]) ??
          [],
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
