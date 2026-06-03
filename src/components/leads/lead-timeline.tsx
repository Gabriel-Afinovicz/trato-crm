"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useCompanyTimezone } from "@/hooks/use-company-timezone";
import { formatDateTimeInTz } from "@/lib/utils/timezone";
import type {
  ActivityDetailed,
  ActivityType,
  WhatsAppMessage,
} from "@/lib/types/database";

interface LeadTimelineProps {
  leadId: string;
  initialActivities?: ActivityDetailed[];
}

const typeConfig: Record<ActivityType, { label: string; color: string; icon: string }> = {
  note: { label: "Nota", color: "bg-gray-200 text-gray-700", icon: "📝" },
  call_inbound: { label: "Ligação recebida", color: "bg-green-200 text-green-700", icon: "📞" },
  call_outbound: { label: "Ligação realizada", color: "bg-blue-200 text-blue-700", icon: "📱" },
  whatsapp: { label: "WhatsApp", color: "bg-emerald-200 text-emerald-700", icon: "💬" },
  email: { label: "E-mail", color: "bg-yellow-200 text-yellow-700", icon: "✉️" },
  appointment: { label: "Agendamento", color: "bg-purple-200 text-purple-700", icon: "📅" },
  status_change: { label: "Mudança de status", color: "bg-orange-200 text-orange-700", icon: "🔄" },
  assignment: { label: "Atribuição", color: "bg-indigo-200 text-indigo-700", icon: "👤" },
};

// Mistura activities + mensagens WhatsApp em uma unica linha do tempo.
// Mensagens viram entradas discriminadas — nao gravam linhas duplicadas
// na tabela `activities` (a UI sintetiza on-the-fly).
type TimelineEntry =
  | { kind: "activity"; date: string; activity: ActivityDetailed }
  | { kind: "whatsapp"; date: string; message: WhatsAppMessage };

// Quantas mensagens carregar inicialmente. Mantemos baixo para nao
// poluir a timeline — o link "Abrir conversa" leva para o historico
// completo na tela /conversas.
const RECENT_WHATSAPP_LIMIT = 30;

function mediaTypeLabel(mt: WhatsAppMessage["media_type"]): string {
  switch (mt) {
    case "text":
      return "";
    case "image":
      return "[Imagem]";
    case "video":
      return "[Video]";
    case "audio":
      return "[Audio]";
    case "document":
      return "[Documento]";
    case "sticker":
      return "[Sticker]";
    case "location":
      return "[Localizacao]";
    case "contact":
      return "[Contato]";
    default:
      return "[Midia]";
  }
}

function previewMessageBody(m: WhatsAppMessage): string {
  const prefix = mediaTypeLabel(m.media_type);
  const body = (m.body ?? "").trim();
  if (prefix && body) return `${prefix} ${body}`;
  if (prefix) return prefix;
  return body || "(sem conteudo)";
}

export function LeadTimeline({ leadId, initialActivities }: LeadTimelineProps) {
  const { companyId } = useCurrentCompany();
  const companyTz = useCompanyTimezone();
  const params = useParams<{ domain: string }>();
  const domain = params?.domain ?? "";

  const [activities, setActivities] = useState<ActivityDetailed[]>(
    initialActivities ?? []
  );
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsAppMessage[]>(
    []
  );
  const [linkedChatId, setLinkedChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialActivities === undefined);

  const fetchActivities = useCallback(async () => {
    if (!companyId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("vw_activities_detailed")
      .select("*")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setActivities(data as unknown as ActivityDetailed[]);
    }
    setLoading(false);
  }, [companyId, leadId]);

  // Busca o chat WhatsApp vinculado ao lead (se existir) e as ultimas
  // mensagens. Roda em paralelo com `fetchActivities` para nao
  // bloquear a timeline.
  const fetchWhatsApp = useCallback(async () => {
    if (!companyId) return;
    const supabase = createClient();
    const { data: chats } = await supabase
      .from("whatsapp_chats")
      .select("id")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .limit(1);

    const chatId = chats?.[0]?.id ?? null;
    setLinkedChatId(chatId);
    if (!chatId) {
      setWhatsappMessages([]);
      return;
    }

    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("company_id", companyId)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(RECENT_WHATSAPP_LIMIT);

    setWhatsappMessages((messages ?? []) as WhatsAppMessage[]);
  }, [companyId, leadId]);

  useEffect(() => {
    if (initialActivities === undefined) {
      if (companyId) fetchActivities();
    } else {
      setActivities(initialActivities);
      setLoading(false);
    }
    if (companyId) void fetchWhatsApp();
  }, [companyId, initialActivities, fetchActivities, fetchWhatsApp]);

  // Realtime de activities — mantem comportamento existente.
  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`lead-activities:${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activities",
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, leadId, fetchActivities]);

  // Realtime de mensagens WhatsApp: quando o chat vinculado recebe
  // nova mensagem (in ou out), recarrega para atualizar a timeline.
  // Filtra por chat_id para nao re-fetcher em qualquer mensagem da
  // organizacao.
  useEffect(() => {
    if (!companyId || !linkedChatId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`lead-whatsapp:${linkedChatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `chat_id=eq.${linkedChatId}`,
        },
        () => {
          void fetchWhatsApp();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, linkedChatId, fetchWhatsApp]);

  // Mistura as duas fontes em uma unica timeline ordenada desc por data.
  // Para mensagens WhatsApp usamos `sent_at`/`received_at`/`created_at`
  // em ordem de preferencia (mesmo criterio do ordenamento de chats).
  const entries = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [];
    for (const a of activities) {
      items.push({ kind: "activity", date: a.created_at, activity: a });
    }
    for (const m of whatsappMessages) {
      const date = m.sent_at ?? m.received_at ?? m.created_at;
      items.push({ kind: "whatsapp", date, message: m });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [activities, whatsappMessages]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        Nenhuma atividade registrada
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute left-5 top-3 h-[calc(100%-24px)] w-px bg-gray-200" />

      {entries.map((entry) => {
        if (entry.kind === "activity") {
          const a = entry.activity;
          const config = typeConfig[a.activity_type] || typeConfig.note;
          return (
            <div key={`a-${a.id}`} className="relative flex gap-4 py-3">
              <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-gray-200">
                {config.icon}
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
                  >
                    {config.label}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDateTimeInTz(a.created_at, companyTz)}
                  </span>
                </div>
                {a.title && (
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {a.title}
                  </p>
                )}
                {a.description && (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-600">
                    {a.description}
                  </p>
                )}
                {a.user_name && (
                  <p className="mt-1 text-xs text-gray-400">por {a.user_name}</p>
                )}
              </div>
            </div>
          );
        }

        const m = entry.message;
        const incoming = !m.from_me;
        const chipColor = incoming
          ? "bg-emerald-100 text-emerald-700"
          : "bg-blue-100 text-blue-700";
        const chipLabel = incoming ? "WhatsApp recebida" : "WhatsApp enviada";
        return (
          <div key={`w-${m.id}`} className="relative flex gap-4 py-3">
            <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-emerald-200">
              💬
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipColor}`}
                >
                  {chipLabel}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDateTimeInTz(entry.date, companyTz)}
                </span>
                {linkedChatId && (
                  <Link
                    href={`/${domain}/conversas?chat=${linkedChatId}`}
                    className="ml-auto text-[11px] font-medium text-blue-600 hover:underline"
                  >
                    Abrir conversa
                  </Link>
                )}
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-gray-700">
                {previewMessageBody(m)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
