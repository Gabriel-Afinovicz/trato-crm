import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";
import {
  evolution,
  type CreateInstanceResponse,
} from "@/lib/evolution/client";
import { friendlyEvolutionError } from "@/lib/evolution/friendly-error";

interface ConnectPayload {
  domain?: string;
}

interface InstanceRow {
  id: string;
  instance_name: string;
  status: "disconnected" | "connecting" | "connected";
  evolution_token: string | null;
}

export async function POST(req: NextRequest) {
  if (!evolution.isConfigured()) {
    const f = friendlyEvolutionError({ name: "EvolutionConfigError" }, "connect");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }

  let body: ConnectPayload;
  try {
    body = (await req.json()) as ConnectPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json(
      { error: "Dominio obrigatorio." },
      { status: 400 }
    );
  }

  let ctx;
  try {
    ctx = await requireAdminForDomain(domain);
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status =
      code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 401;
    return NextResponse.json({ error: code }, { status });
  }

  const supabaseAdmin = createAdminClient();
  const instanceName = domain;

  const { data: existing } = await supabaseAdmin
    .from("whatsapp_instances")
    .select("id, instance_name, status, evolution_token")
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  const existingRow = (existing as InstanceRow | null) ?? null;

  let instanceId = existingRow?.id ?? null;
  let evolutionToken = existingRow?.evolution_token ?? null;

  // "Fresh connect" quando:
  //  - nao existe row no banco (primeira vez), OU
  //  - existe row mas `evolution_token` esta NULL — sinal de que o
  //    /disconnect anterior apagou a instancia na Evolution e
  //    precisamos recriar do zero (caso contrario a Evolution reabriria
  //    a sessao do cache Baileys SEM gerar QR).
  const needsFreshInstance = !existingRow || !evolutionToken;

  try {
    if (needsFreshInstance) {
      // Garante que nao sobrou nenhuma instancia orfa na Evolution com esse
      // mesmo nome ANTES de criar — caso contrario o `create` retorna
      // 403 Forbidden ("name already in use"). Isso acontece quando um
      // disconnect anterior nao conseguiu apagar a instancia no servidor
      // Evolution (o delete da v2.3.x falha se a sessao nao chegou a `close`).
      // `forceDeleteInstance` repete logout+delete ate o fetchInstances
      // confirmar a remocao.
      await evolution.forceDeleteInstance(instanceName);

      let created: CreateInstanceResponse | null = null;
      try {
        created = await evolution.createInstance(instanceName);
      } catch (createErr) {
        // Ultima rede de seguranca: se ainda assim a Evolution recusar por
        // nome em uso, forca outra remocao e tenta recriar uma vez.
        const status = (createErr as { status?: number }).status;
        if (status === 403) {
          await evolution.forceDeleteInstance(instanceName);
          try {
            created = await evolution.createInstance(instanceName);
          } catch (retryErr) {
            // A instancia orfa nao pode ser removida (sessao presa em
            // estado que o delete da Evolution recusa). Em vez de falhar a
            // conexao, reaproveitamos a instancia existente: o `connect()`
            // mais abaixo usa a apikey global e ainda consegue emitir o QR.
            const retryStatus = (retryErr as { status?: number }).status;
            if (retryStatus !== 403) throw retryErr;
            console.warn(
              "[whatsapp/connect] instancia em uso e nao removivel; reaproveitando existente",
              { instanceName }
            );
            created = null;
          }
        } else {
          throw createErr;
        }
      }

      // `created` NULL = caimos no fallback de "instancia em uso": nao ha
      // token novo (a apikey global cobre connect/status), so garantimos a
      // row em `connecting` e seguimos para o connect() que busca o QR.
      const hashApiKey = created
        ? typeof created.hash === "string"
          ? created.hash
          : created.hash?.apikey ?? null
        : evolutionToken;
      evolutionToken = hashApiKey;

      if (existingRow) {
        // Mantem a row (constraint 1:1 por company_id), so atualiza.
        const { error: updateErr } = await supabaseAdmin
          .from("whatsapp_instances")
          .update({
            status: "connecting",
            evolution_token: evolutionToken,
            phone_number: null,
            connected_at: null,
          })
          .eq("id", existingRow.id);
        if (updateErr) {
          return NextResponse.json(
            { error: `Erro ao atualizar instance: ${updateErr.message}` },
            { status: 500 }
          );
        }
        instanceId = existingRow.id;
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from("whatsapp_instances")
          .insert({
            company_id: ctx.companyId,
            instance_name: instanceName,
            status: "connecting",
            evolution_token: evolutionToken,
          })
          .select("id")
          .single();
        if (insertErr || !inserted) {
          return NextResponse.json(
            { error: `Erro ao registrar instance: ${insertErr?.message}` },
            { status: 500 }
          );
        }
        instanceId = (inserted as { id: string }).id;
      }

      const initialQr = created?.qrcode?.base64 ?? null;
      if (initialQr) {
        return NextResponse.json({
          instanceId,
          status: "connecting",
          qrBase64: initialQr,
          pairingCode: null,
        });
      }
    }

    // Re-registra o webhook caso a URL tenha mudado
    const webhookUrl = process.env.EVOLUTION_WEBHOOK_BASE_URL
      ? `${process.env.EVOLUTION_WEBHOOK_BASE_URL.replace(/\/$/, "")}/api/whatsapp/webhook/${encodeURIComponent(instanceName)}`
      : null;
    if (webhookUrl) {
      await evolution.setWebhook(instanceName, webhookUrl);
    }

    const connectRes = await evolution.connect(instanceName);
    await supabaseAdmin
      .from("whatsapp_instances")
      .update({ status: "connecting" })
      .eq("company_id", ctx.companyId);

    return NextResponse.json({
      instanceId,
      status: "connecting",
      qrBase64: connectRes.base64 ?? null,
      pairingCode: connectRes.pairingCode ?? connectRes.code ?? null,
    });
  } catch (err) {
    // Log tecnico detalhado (status HTTP + motivo real da Evolution) para
    // diagnostico interno. Ao usuario devolvemos apenas a copia amigavel.
    const upstreamStatus = (err as { status?: number }).status;
    console.error("[whatsapp/connect] upstream error", {
      instanceName,
      status: upstreamStatus,
      reason: err instanceof Error ? err.message : String(err),
    });
    const f = friendlyEvolutionError(err, "connect");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
}
