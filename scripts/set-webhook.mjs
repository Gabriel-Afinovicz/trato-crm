import fs from "node:fs";

function readEnv(name) {
  for (const f of [".env.local", ".env", ".env.development.local"]) {
    try {
      const t = fs.readFileSync(f, "utf8");
      const m = t.match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return null;
}

const BASE = readEnv("EVOLUTION_API_URL");
const KEY = readEnv("EVOLUTION_API_KEY");
// Aceita a URL do tunnel por argumento OU do .env.local (depois de atualizar).
const TUNNEL = (process.argv[3] || readEnv("EVOLUTION_WEBHOOK_BASE_URL") || "")
  .replace(/\/$/, "");
const INSTANCE = process.argv[2] || "clinica-teste";

if (!BASE || !KEY || !TUNNEL) {
  console.log("Faltou EVOLUTION_API_URL, EVOLUTION_API_KEY ou a URL do tunnel.");
  console.log("Uso: node scripts/set-webhook.mjs <instancia> [urlDoTunnel]");
  process.exit(1);
}

const webhookUrl = `${TUNNEL}/api/whatsapp/webhook/${encodeURIComponent(INSTANCE)}`;

console.log(`Instancia: ${INSTANCE}`);
console.log(`Novo webhook: ${webhookUrl}`);

const res = await fetch(`${BASE}/webhook/set/${encodeURIComponent(INSTANCE)}`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: [
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "MESSAGES_EDITED",
        "CONNECTION_UPDATE",
        "CHATS_UPSERT",
        "CHATS_UPDATE",
      ],
    },
  }),
});
const text = await res.text();
console.log(`status: ${res.status}`);
console.log(`body: ${text.slice(0, 600)}`);

// Confirma testando o tunnel.
console.log("\nTestando se o tunnel responde...");
try {
  const ping = await fetch(`${TUNNEL}/api/whatsapp/sync-status?domain=${INSTANCE}`, {
    signal: AbortSignal.timeout(8000),
  });
  console.log(`  tunnel status: ${ping.status} (${ping.ok ? "OK" : "verificar"})`);
} catch (e) {
  console.log(`  tunnel ainda offline: ${e.message}`);
}
