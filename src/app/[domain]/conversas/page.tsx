import { redirect } from "next/navigation";
import { getAuthSession, getDomainCompany } from "@/lib/supabase/cached-data";
import { createClient } from "@/lib/supabase/server";
import type { WhatsAppChat, WhatsAppInstance } from "@/lib/types/database";
import { jidToPhone, phoneToJid, siblingJid } from "@/lib/evolution/phone";
import { ConversasContent } from "./conversas-content";
import { WhatsAppConnectLoader } from "@/components/whatsapp/whatsapp-connect-loader";
import { WhatsAppLoginSyncGate } from "@/components/whatsapp/whatsapp-login-sync-gate";
import { WhatsAppPhoneDisconnectedCard } from "@/components/whatsapp/whatsapp-phone-disconnected-card";
import Link from "next/link";

interface ConversasPageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{
    chat?: string;
    phone?: string;
    leadId?: string;
    justConnected?: string;
  }>;
}

// Detecta sync em andamento (mesma logica do /api/whatsapp/instance/status).
// Em modulo (fora do render do server component) para nao acionar a regra de
// pureza do react-hooks ao usar Date.now().
const SYNC_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000;
function isSyncInProgress(inst: WhatsAppInstance | null): boolean {
  if (!inst?.last_manual_sync_at) return false;
  const startedMs = Date.parse(inst.last_manual_sync_at);
  if (!Number.isFinite(startedMs)) return false;
  if (Date.now() - startedMs > SYNC_PROGRESS_TIMEOUT_MS) return false;
  if (!inst.sync_finished_at) return true;
  const finishedMs = Date.parse(inst.sync_finished_at);
  if (!Number.isFinite(finishedMs)) return true;
  return finishedMs < startedMs;
}

export default async function ConversasPage({
  params,
  searchParams,
}: ConversasPageProps) {
  const { domain } = await params;
  const { chat, phone, leadId, justConnected } = await searchParams;

  const [{ user, role }, company] = await Promise.all([
    getAuthSession(),
    getDomainCompany(domain),
  ]);

  if (!user) redirect(`/${domain}`);
  if (!company) redirect(`/${domain}/dashboard`);

  const supabase = await createClient();

  const { data: instanceRow } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("company_id", company.id)
    .maybeSingle();
  const instance = instanceRow as WhatsAppInstance | null;

  const initialSyncInProgress = isSyncInProgress(instance);

  // Distingue a queda PELO CELULAR da desconexao feita pelo CRM: o
  // /instance/disconnect zera o `evolution_token`; o webhook de queda externa
  // (celular) o mantem. Logo, status disconnected + token presente = celular.
  const phoneDisconnected =
    !!instance &&
    instance.status === "disconnected" &&
    Boolean(instance.evolution_token);

  if (phoneDisconnected) {
    return (
      <WhatsAppPhoneDisconnectedCard domain={domain} isAdmin={role === "admin"} />
    );
  }

  if (!instance || instance.status !== "connected") {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-base font-semibold text-gray-900">
            WhatsApp ainda nao conectado
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Para usar a aba Conversas, conecte o numero WhatsApp da organizacao em
            Configuracoes.
          </p>
          <Link
            href={`/${domain}/settings?tab=whatsapp`}
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Ir para Configuracoes
          </Link>
        </div>
      </div>
    );
  }

  // Tela de carregamento (card em tela cheia com porcentagem). Aparece:
  //  - logo apos conectar (?justConnected=1), OU
  //  - sempre que houver uma sincronizacao em andamento (ex.: o operador
  //    saiu da aba e voltou enquanto o sync ainda roda).
  // Em ambos os casos escondemos a lista inteira ate o sync terminar — assim
  // o usuario nunca ve contatos/mensagens desatualizados nem aquele banner
  // "Sincronizando" por cima da lista. mode="connect" (conexao nova) instrui o
  // loader a esperar o warmup e disparar o sync inicial; mode="follow"
  // (sync ja rodando) ele apenas acompanha ate concluir. Ao terminar, o loader
  // limpa a URL e recarrega a lista ja atualizada.
  if (justConnected === "1" || initialSyncInProgress) {
    return (
      <WhatsAppConnectLoader
        domain={domain}
        mode={justConnected === "1" ? "connect" : "follow"}
      />
    );
  }

  // Deep-link vindo dos leads/kanban: ?phone=...&leadId=...
  // Resolve (ou cria) o chat correspondente e redireciona para ?chat=ID.
  // O `instance` ja foi validado como conectado acima — nao criamos chat
  // orfao quando o WhatsApp esta off.
  if ((phone || leadId) && !chat) {
    let targetPhone: string | null = phone ?? null;
    let targetLeadId: string | null = leadId ?? null;
    let leadName: string | null = null;

    if (targetLeadId) {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("id, phone, name")
        .eq("id", targetLeadId)
        .eq("company_id", company.id)
        .maybeSingle();
      const typedLead = leadRow as
        | { id: string; phone: string | null; name: string }
        | null;
      if (typedLead) {
        leadName = typedLead.name;
        if (!targetPhone) targetPhone = typedLead.phone;
      } else {
        // Lead nao pertence a essa company (ou nao existe) — ignora o vinculo.
        targetLeadId = null;
      }
    }

    const targetJid = phoneToJid(targetPhone);
    if (!targetJid) {
      return (
        <div className="flex h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-base font-semibold text-gray-900">
              Telefone invalido
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Nao foi possivel abrir uma conversa: o telefone do lead esta
              vazio ou em formato invalido. Edite o lead e adicione um
              telefone valido para iniciar a conversa.
            </p>
            <Link
              href={`/${domain}/conversas`}
              className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Voltar para Conversas
            </Link>
          </div>
        </div>
      );
    }

    // Procura chat existente pelo remote_jid. Para celulares BR o WhatsApp
    // pode ter gravado a conversa com ou sem o nono digito (o `phoneToJid`
    // do lead sempre gera a forma canonica de 13 digitos, mas o webhook/sync
    // pode ter criado o chat na forma "irma" de 12 digitos). Casamos as duas
    // formas para nao abrir/criar um chat duplicado orfao — mesma logica que
    // o webhook ja usa via `siblingJid`.
    const candidateJids = [targetJid, siblingJid(targetJid)].filter(
      (j): j is string => Boolean(j)
    );
    const { data: existingRows } = await supabase
      .from("whatsapp_chats")
      .select("id, lead_id, last_message_at")
      .eq("company_id", company.id)
      .in("remote_jid", candidateJids)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const existingChat = (existingRows as
      | { id: string; lead_id: string | null; last_message_at: string | null }[]
      | null)?.[0] ?? null;

    if (existingChat) {
      // Se chat ja existia mas nao tinha vinculo com lead, aproveita para
      // associar agora — assim historico passado fica "casado" com o lead.
      if (!existingChat.lead_id && targetLeadId) {
        await supabase
          .from("whatsapp_chats")
          .update({ lead_id: targetLeadId })
          .eq("id", existingChat.id);
      }
      redirect(`/${domain}/conversas?chat=${existingChat.id}`);
    }

    // Nao existe -> cria com nome do lead (fallback: numero formatado)
    const fallbackName = jidToPhone(targetJid) || targetJid;
    const { data: created } = await supabase
      .from("whatsapp_chats")
      .insert({
        company_id: company.id,
        instance_id: instance.id,
        remote_jid: targetJid,
        lead_id: targetLeadId,
        name: leadName ?? fallbackName,
      })
      .select("id")
      .single();
    const createdChat = created as { id: string } | null;
    if (createdChat) {
      redirect(`/${domain}/conversas?chat=${createdChat.id}`);
    }
  }

  const PAGE_SIZE = 30;

  // Busca uma extra para detectar se ha mais paginas sem fazer count.
  // Sem filtro de janela: lista todos os chats ordenados por
  // last_message_at desc; paginacao por blocos de PAGE_SIZE controlada
  // no cliente via loadMore.
  const { data: chatsData } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .eq("company_id", company.id)
    .eq("is_archived", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE + 1);

  const allChats = (chatsData as WhatsAppChat[] | null) ?? [];
  const hasMore = allChats.length > PAGE_SIZE;
  const chats = hasMore ? allChats.slice(0, PAGE_SIZE) : allChats;

  // Gate de login: na primeira visita a Conversas nesta sessao do browser,
  // mostra o card de carregamento e roda um catch-up antes de liberar a lista
  // — para que mensagens/contatos acumulados enquanto o CRM estava fechado
  // sejam atualizados antes do usuario interagir.
  return (
    <WhatsAppLoginSyncGate domain={domain}>
      <ConversasContent
        domain={domain}
        companyId={company.id}
        instance={instance}
        initialChats={chats}
        initialChatId={chat ?? null}
        initialHasMore={hasMore}
        pageSize={PAGE_SIZE}
        initialSyncInProgress={initialSyncInProgress}
      />
    </WhatsAppLoginSyncGate>
  );
}
