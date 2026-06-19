/**
 * Runner generico para efeitos colaterais de integracoes externas.
 *
 * Princípios:
 *  - FIRE-AND-FORGET: o chamador (ex.: POST /api/leads) NAO aguarda o
 *    resultado. A criacao do lead no CRM nunca e bloqueada nem revertida
 *    por falha de integracao.
 *  - RETRY com backoff exponencial para falhas transitorias (timeout/5xx).
 *    Erros permanentes (4xx, credenciais invalidas) nao sao re-tentados.
 *  - LOG: toda execucao (sucesso ou falha definitiva) grava uma linha em
 *    `integration_logs` via service_role (ignora RLS).
 *
 * Como o Next.js pode encerrar o processo da request antes do background
 * terminar, usamos `after()` do next/server quando disponivel para manter
 * a promise viva ate o fim do ciclo da request. Em runtimes que nao
 * suportam, caímos no disparo direto (best-effort).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RunnerContext {
  companyId: string;
  provider: string;
  action: string;
  leadId?: string | null;
  /** Snapshot do que foi enviado, para auditoria (sem segredos). */
  request?: Record<string, unknown> | null;
}

export interface ActionResult {
  /** Resposta normalizada do provedor (sem segredos). */
  response?: Record<string, unknown> | null;
  httpStatus?: number | null;
}

export interface RunnerOptions {
  maxAttempts?: number;
  /** Backoff base em ms (multiplica por 2^attempt). */
  baseDelayMs?: number;
  /**
   * Decide se um erro deve interromper as tentativas (permanente) em vez de
   * re-tentar. Recebe o erro lancado por `fn`.
   */
  isPermanent?: (err: unknown) => boolean;
  /** Traduz o erro para uma mensagem amigavel a ser logada. */
  friendlyMessage?: (err: unknown) => string;
  /** Extrai o http status do erro para o log. */
  httpStatusFromError?: (err: unknown) => number | null;
  /**
   * Detalhe estruturado do erro para gravar em `integration_logs.response`
   * (ex.: corpo bruto da recusa do provedor). Best-effort.
   */
  errorResponse?: (err: unknown) => Record<string, unknown> | null;
}

const DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeLog(
  ctx: RunnerContext,
  fields: {
    status: "success" | "error";
    httpStatus?: number | null;
    errorMessage?: string | null;
    response?: Record<string, unknown> | null;
    durationMs: number;
  }
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("integration_logs").insert({
      company_id: ctx.companyId,
      provider: ctx.provider,
      lead_id: ctx.leadId ?? null,
      action: ctx.action,
      request: ctx.request ?? null,
      response: fields.response ?? null,
      status: fields.status,
      http_status: fields.httpStatus ?? null,
      error_message: fields.errorMessage ?? null,
      duration_ms: fields.durationMs,
    });
  } catch (logErr) {
    // Log e best-effort: nunca deixa a falha de logging derrubar o fluxo.
    console.error("[integrations/runner] falha ao gravar integration_logs", logErr);
  }
}

/**
 * Executa `fn` com retry e logging. Retorna uma Promise que resolve quando
 * a operacao (com retries) termina — mas o CHAMADOR normalmente NAO aguarda
 * (fire-and-forget). Quem quiser aguardar (ex.: rota de teste sincrona)
 * pode dar `await`.
 */
export async function runIntegration(
  ctx: RunnerContext,
  fn: () => Promise<ActionResult>,
  options: RunnerOptions = {}
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const baseDelay = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const started = Date.now();

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      await writeLog(ctx, {
        status: "success",
        httpStatus: result.httpStatus ?? null,
        response: result.response ?? null,
        durationMs: Date.now() - started,
      });
      return;
    } catch (err) {
      lastError = err;
      const permanent = options.isPermanent?.(err) ?? false;
      const isLast = attempt === maxAttempts - 1;

      if (permanent || isLast) {
        await writeLog(ctx, {
          status: "error",
          httpStatus: options.httpStatusFromError?.(err) ?? null,
          errorMessage:
            options.friendlyMessage?.(err) ??
            (err instanceof Error ? err.message : String(err)),
          response: options.errorResponse?.(err) ?? null,
          durationMs: Date.now() - started,
        });
        console.error(
          `[integrations/runner] ${ctx.provider}.${ctx.action} falhou (attempt ${attempt + 1}/${maxAttempts}, permanent=${permanent})`,
          err
        );
        return;
      }

      // Backoff exponencial antes da proxima tentativa.
      await sleep(baseDelay * 2 ** attempt);
    }
  }

  // Inalcancavel na pratica, mas garante log se sair do loop.
  console.error("[integrations/runner] saiu do loop sem retorno", lastError);
}

/**
 * Dispara `runIntegration` em background sem bloquear o chamador. Usa
 * `after()` do Next quando disponivel para manter a task viva ate o fim do
 * ciclo da request; caso contrario, dispara direto e apenas registra
 * rejeicoes nao tratadas.
 */
export function runIntegrationInBackground(
  ctx: RunnerContext,
  fn: () => Promise<ActionResult>,
  options: RunnerOptions = {}
): void {
  const task = () =>
    runIntegration(ctx, fn, options).catch((err) => {
      console.error("[integrations/runner] erro nao tratado no background", err);
    });

  // Import dinamico para nao quebrar em runtimes sem `after`.
  import("next/server")
    .then((mod) => {
      const after = (mod as { after?: (cb: () => void) => void }).after;
      if (typeof after === "function") {
        after(() => {
          void task();
        });
      } else {
        void task();
      }
    })
    .catch(() => {
      void task();
    });
}
