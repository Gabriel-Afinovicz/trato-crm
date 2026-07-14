import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evolution } from "@/lib/evolution/client";
import { friendlyEvolutionError } from "@/lib/evolution/friendly-error";
import {
  phoneToJid,
  jidToPhone,
  onlyDigits,
  siblingJid,
} from "@/lib/evolution/phone";

interface SendPayload {
  domain?: string;
  text?: string;
  chatId?: string;
  phone?: string;
  leadId?: string;
  /**
   * Solicita explicitamente preview de link na Evolution. Quando ausente,
   * habilitamos automaticamente caso o texto contenha uma URL https — assim
   * lembretes/confirmacoes que carregam links viram tocaveis no WhatsApp.
   */
  linkPreview?: boolean;
  /**
   * Quando presente, a mensagem e enviada como reply (citacao estilo WhatsApp)
   * a esta mensagem. Aceita o uuid local de whatsapp_messages.id; o backend
   * resolve o evolution_message_id e o body para passar a Evolution e gravar
   * o snapshot junto com a nova mensagem.
   */
  replyToMessageId?: string;
}

interface InstanceRow {
  id: string;
  company_id: string;
  instance_name: string;
  status: "disconnected" | "connecting" | "connected";
}

interface ChatRow {
  id: string;
  company_id: string;
  instance_id: string;
  remote_jid: string;
  lead_id: string | null;
}

interface LeadRow {
  id: string;
  company_id: string;
  phone: string | null;
  name: string;
}

export async function POST(req: NextRequest) {
  let body: SendPayload;
  try {
    body = (await req.json()) as SendPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Texto da mensagem obrigatorio." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, company_id, role")
    .eq("auth_id", user.id)
    .single();
  const profileRow = profile as
    | { id: string; company_id: string; role: string }
    | null;
  if (!profileRow) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();

  // Resolve o destinatario e a EMPRESA efetiva. A empresa vem do recurso alvo
  // (chat/lead) autorizado via RLS — e nao do profile.company_id. Assim um
  // super_admin operando o dominio de um cliente age na empresa correta, e um
  // operador segue restrito a propria empresa (o client de sessao/RLS so
  // devolve o que ele pode ver). Recurso nulo = inexistente OU sem acesso -> 404.
  let chatId = body.chatId ?? null;
  let chatRow: ChatRow | null = null;
  let targetJid: string | null = null;
  let targetPhone: string | null = null;
  let leadId: string | null = null;
  let companyId: string;

  if (chatId) {
    const { data } = await supabase
      .from("whatsapp_chats")
      .select("id, company_id, instance_id, remote_jid, lead_id")
      .eq("id", chatId)
      .maybeSingle();
    chatRow = data as ChatRow | null;
    if (!chatRow) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }
    companyId = chatRow.company_id;
    targetJid = chatRow.remote_jid;
    targetPhone = jidToPhone(chatRow.remote_jid);
    leadId = chatRow.lead_id;
  } else if (body.leadId) {
    const { data } = await supabase
      .from("leads")
      .select("id, company_id, phone, name")
      .eq("id", body.leadId)
      .maybeSingle();
    const lead = data as LeadRow | null;
    if (!lead) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }
    companyId = lead.company_id;
    leadId = lead.id;
    targetJid = phoneToJid(lead.phone);
    if (!targetJid) {
      return NextResponse.json(
        { error: "Lead sem telefone valido cadastrado.", code: "NO_PHONE" },
        { status: 400 }
      );
    }
    targetPhone = onlyDigits(lead.phone);
  } else if (body.phone) {
    // Telefone avulso: sem chat/lead nao ha recurso para derivar a empresa.
    // Preferimos o dominio informado (resolvido via RLS, que ja autoriza o
    // acesso); sem dominio, caimos na empresa do proprio usuario logado.
    const domain = body.domain?.trim();
    if (domain) {
      const { data: comp } = await supabase
        .from("companies")
        .select("id")
        .eq("domain", domain)
        .maybeSingle();
      const compRow = comp as { id: string } | null;
      if (!compRow) {
        return NextResponse.json(
          { error: "Empresa nao encontrada para este dominio." },
          { status: 404 }
        );
      }
      companyId = compRow.id;
    } else {
      companyId = profileRow.company_id;
    }
    targetJid = phoneToJid(body.phone);
    if (!targetJid) {
      return NextResponse.json(
        { error: "Telefone invalido.", code: "NO_PHONE" },
        { status: 400 }
      );
    }
    targetPhone = onlyDigits(body.phone);
  } else {
    return NextResponse.json(
      { error: "Informe chatId, leadId ou phone." },
      { status: 400 }
    );
  }

  const { data: instance } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, company_id, instance_name, status")
    .eq("company_id", companyId)
    .maybeSingle();
  const instanceRow = instance as InstanceRow | null;
  if (!instanceRow) {
    return NextResponse.json(
      {
        error: "WhatsApp ainda nao conectado para esta organizacao.",
        code: "NOT_CONNECTED",
      },
      { status: 409 }
    );
  }
  if (instanceRow.status !== "connected") {
    return NextResponse.json(
      {
        error: "WhatsApp desconectado. Reconecte em Configuracoes.",
        code: "NOT_CONNECTED",
      },
      { status: 409 }
    );
  }

  if (!chatRow && targetJid) {
    // Casa tambem a variacao do nono digito (BR): o `phoneToJid` do lead gera
    // a forma canonica de 13 digitos, mas o chat real pode ter sido criado
    // pelo webhook/sync na forma "irma" de 12 digitos. Sem isso, criariamos
    // um chat duplicado e enviariamos para um JID que nao bate com o historico.
    const candidateJids = [targetJid, siblingJid(targetJid)].filter(
      (j): j is string => Boolean(j)
    );
    const { data: existingRows } = await supabaseAdmin
      .from("whatsapp_chats")
      .select("id, company_id, instance_id, remote_jid, lead_id, last_message_at")
      .eq("company_id", companyId)
      .in("remote_jid", candidateJids)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    chatRow = ((existingRows as (ChatRow & { last_message_at: string | null })[] | null)?.[0] ??
      null) as ChatRow | null;

    // Envia para o JID que o chat existente ja usa (o que o WhatsApp conhece),
    // e nao para o derivado do lead — assim a mensagem entra na conversa certa.
    if (chatRow) {
      targetJid = chatRow.remote_jid;
    }

    if (!chatRow) {
      const { data: created, error: chatErr } = await supabaseAdmin
        .from("whatsapp_chats")
        .insert({
          company_id: companyId,
          instance_id: instanceRow.id,
          remote_jid: targetJid,
          lead_id: leadId,
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 120),
          last_message_from_me: true,
          last_message_status: "sent",
        })
        .select("id, company_id, instance_id, remote_jid, lead_id")
        .single();
      if (chatErr || !created) {
        console.error("[whatsapp/send] failed to create chat", chatErr);
        return NextResponse.json(
          { error: "Nao foi possivel iniciar a conversa. Tente novamente em alguns instantes." },
          { status: 500 }
        );
      }
      chatRow = created as ChatRow;
    }
    chatId = chatRow.id;
  }

  if (!chatRow || !targetJid) {
    return NextResponse.json(
      { error: "Nao foi possivel identificar o destinatario da mensagem." },
      { status: 500 }
    );
  }

  // Resolve a mensagem citada (reply) ANTES de enviar. Precisamos do
  // evolution_message_id da mensagem original para que o WhatsApp do
  // destinatario consiga renderizar o quote ligado a mensagem real (e nao
  // como uma string solta). Tambem guardamos snapshot para nossa UI.
  let quotedSnapshot: {
    evolutionMessageId: string;
    fromMe: boolean;
    body: string | null;
    mediaType: string;
  } | null = null;
  if (body.replyToMessageId) {
    const { data: original } = await supabaseAdmin
      .from("whatsapp_messages")
      .select(
        "id, company_id, chat_id, evolution_message_id, from_me, body, media_type"
      )
      .eq("id", body.replyToMessageId)
      .maybeSingle();
    const originalRow = original as {
      id: string;
      company_id: string;
      chat_id: string;
      evolution_message_id: string | null;
      from_me: boolean;
      body: string | null;
      media_type: string;
    } | null;
    if (
      originalRow &&
      originalRow.company_id === companyId &&
      originalRow.chat_id === chatRow.id &&
      originalRow.evolution_message_id
    ) {
      quotedSnapshot = {
        evolutionMessageId: originalRow.evolution_message_id,
        fromMe: originalRow.from_me,
        body: originalRow.body,
        mediaType: originalRow.media_type,
      };
    }
    // Se a mensagem citada nao foi encontrada/elegivel, seguimos sem reply
    // em vez de falhar o envio: a mensagem ainda chega, so nao vai com quote.
  }

  // Envia via Evolution PRIMEIRO para obter evolution_message_id, e so depois
  // insere no banco (ja com o id). Isso elimina o race condition em que o
  // webhook chegava antes da update e inseria uma duplicata.
  let evoMessageId: string | null = null;
  // Decide linkPreview: respeita explicito; senao, ativa quando texto contem
  // URL https (lembretes/confirmacoes). Outros fluxos sem link nao pagam custo.
  const wantsLinkPreview =
    typeof body.linkPreview === "boolean"
      ? body.linkPreview
      : /https:\/\/\S+/i.test(text);
  try {
    const sendRes = await evolution.sendText(
      instanceRow.instance_name,
      targetJid,
      text,
      {
        linkPreview: wantsLinkPreview,
        quoted: quotedSnapshot
          ? {
              evolutionMessageId: quotedSnapshot.evolutionMessageId,
              fromMe: quotedSnapshot.fromMe,
              remoteJid: targetJid,
              body: quotedSnapshot.body,
            }
          : undefined,
      }
    );
    evoMessageId = sendRes.key?.id ?? null;
  } catch (err) {
    console.error("[whatsapp/send] upstream error", err);
    const f = friendlyEvolutionError(err, "send");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  const sentAt = new Date().toISOString();

  // Idempotencia: pode ser que o webhook tenha sido mais rapido e ja inseriu
  // a mensagem com este evolution_message_id. Se for o caso, apenas pega o id.
  let messageId: string | null = null;
  if (evoMessageId) {
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("company_id", companyId)
      .eq("evolution_message_id", evoMessageId)
      .maybeSingle();
    messageId = (existing as { id: string } | null)?.id ?? null;
  }

  // Snapshot do quote para UI: corpo curto (preview) e flag se era nossa.
  // Para midias sem caption guardamos um placeholder do tipo, igual o que
  // mostramos na lista lateral, para o quote nunca ficar vazio.
  const quotedBodyForDb = quotedSnapshot
    ? quotedSnapshot.body && quotedSnapshot.body.trim().length > 0
      ? quotedSnapshot.body.slice(0, 240)
      : `[${quotedSnapshot.mediaType}]`
    : null;

  if (!messageId) {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        company_id: companyId,
        chat_id: chatRow.id,
        evolution_message_id: evoMessageId,
        direction: "out",
        from_me: true,
        body: text,
        status: "sent",
        sent_at: sentAt,
        sender_user_id: profileRow.id,
        quoted_evolution_message_id:
          quotedSnapshot?.evolutionMessageId ?? null,
        quoted_body: quotedBodyForDb,
        quoted_from_me: quotedSnapshot?.fromMe ?? null,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.error("[whatsapp/send] failed to persist message", insertErr);
      return NextResponse.json(
        { error: "Mensagem enviada, mas houve um problema ao registra-la. Recarregue a conversa." },
        { status: 500 }
      );
    }
    messageId = (inserted as { id: string }).id;
  } else {
    // Webhook ja inseriu; complementa com sender_user_id que ele nao tem.
    // Tambem completa o quote (o webhook ja extrai do contextInfo, mas pode
    // chegar antes ou nao trazer o snapshot completo dependendo do payload).
    const update: Record<string, unknown> = { sender_user_id: profileRow.id };
    if (quotedSnapshot) {
      update.quoted_evolution_message_id = quotedSnapshot.evolutionMessageId;
      update.quoted_body = quotedBodyForDb;
      update.quoted_from_me = quotedSnapshot.fromMe;
    }
    await supabaseAdmin
      .from("whatsapp_messages")
      .update(update)
      .eq("id", messageId);
  }

  await supabaseAdmin
    .from("whatsapp_chats")
    .update({
      last_message_at: sentAt,
      last_message_preview: text.slice(0, 120),
      last_message_from_me: true,
      last_message_status: "sent",
    })
    .eq("id", chatRow.id);

  return NextResponse.json({
    ok: true,
    chatId: chatRow.id,
    messageId,
    remoteJid: targetJid,
    phone: targetPhone,
  });
}
