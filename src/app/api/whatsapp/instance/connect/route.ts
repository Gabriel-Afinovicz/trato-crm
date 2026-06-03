import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminForDomain } from "@/lib/supabase/require-admin-for-domain";
import { evolution } from "@/lib/evolution/client";
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
      // Best-effort: garante que nao sobrou nenhuma instancia velha na
      // Evolution com esse mesmo nome. `resetInstance` cobre o caso em
      // que a instancia ainda existe la (orfa de um disconnect anterior
      // que nao completou) e precisaria de logout->wait->delete antes
      // do create — caso contrario `create` retorna 403 Forbidden por
      // nome duplicado.
      if (existingRow) {
        await evolution.resetInstance(instanceName);
      }

      const created = await evolution.createInstance(instanceName);
      const hashApiKey =
        typeof created.hash === "string"
          ? created.hash
          : created.hash?.apikey ?? null;
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

      const initialQr = created.qrcode?.base64 ?? null;
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
    console.error("[whatsapp/connect] upstream error", err);
    const f = friendlyEvolutionError(err, "connect");
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
}
