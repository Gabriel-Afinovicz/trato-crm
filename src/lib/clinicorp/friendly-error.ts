/**
 * Traduz erros do cliente Clinicorp em mensagens amigaveis em pt-BR.
 *
 * Mesma filosofia do `friendlyEvolutionError`: nao expor stack traces,
 * URLs ou codigos HTTP brutos ao usuario final; sempre sugerir uma proxima
 * acao. O erro tecnico continua sendo logado server-side e em
 * integration_logs.
 */

export type ClinicorpAction =
  | "test_connection"
  | "list_campaigns"
  | "add_leads"
  | "create_patient"
  | "generic";

export interface ClinicorpFriendlyError {
  message: string;
  status: number;
  code:
    | "not_configured"
    | "unauthorized"
    | "not_found"
    | "rejected"
    | "upstream_down"
    | "upstream_slow"
    | "unknown";
  /** Se true, nao adianta repetir a chamada sem corrigir config (4xx). */
  permanent: boolean;
}

interface ErrorLike {
  name?: string;
  message?: string;
  cause?: unknown;
  status?: number;
}

function describe(err: unknown): {
  message: string;
  cause: string;
  status: number;
  name: string;
} {
  const e = err as ErrorLike | null | undefined;
  const message = (e?.message ?? "").toLowerCase();
  const causeMsg =
    typeof e?.cause === "object" && e.cause && "message" in e.cause
      ? String((e.cause as { message?: unknown }).message ?? "").toLowerCase()
      : "";
  const causeCode =
    typeof e?.cause === "object" && e.cause && "code" in e.cause
      ? String((e.cause as { code?: unknown }).code ?? "").toUpperCase()
      : "";
  return {
    message,
    cause: `${causeMsg} ${causeCode}`.trim(),
    status: typeof e?.status === "number" ? e.status : 0,
    name: e?.name ?? "",
  };
}

export function friendlyClinicorpError(
  err: unknown,
  action: ClinicorpAction = "generic"
): ClinicorpFriendlyError {
  if (err && (err as { name?: string }).name === "ClinicorpConfigError") {
    return {
      message:
        "A integração com a Clinicorp ainda não foi configurada. Preencha as credenciais em Configurações > Integrações.",
      status: 503,
      code: "not_configured",
      permanent: true,
    };
  }

  const d = describe(err);
  const blob = `${d.message} ${d.cause} ${d.name}`;

  const isTimeout =
    /ETIMEDOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|AbortError/i.test(blob) ||
    d.name === "AbortError";
  const isNetwork =
    d.message.includes("fetch failed") ||
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|UND_ERR/i.test(blob);

  if (isTimeout) {
    return {
      message:
        "A Clinicorp demorou para responder. Tentaremos novamente automaticamente.",
      status: 504,
      code: "upstream_slow",
      permanent: false,
    };
  }
  if (isNetwork) {
    return {
      message:
        "Não foi possível conectar à Clinicorp neste momento. Tentaremos novamente automaticamente.",
      status: 502,
      code: "upstream_down",
      permanent: false,
    };
  }

  if (d.status === 401 || d.status === 403) {
    return {
      message:
        "As credenciais da Clinicorp parecem inválidas. Confira o usuário, o token e o subscriber ID em Configurações > Integrações.",
      status: 401,
      code: "unauthorized",
      permanent: true,
    };
  }
  if (d.status === 404) {
    return {
      message:
        "A Clinicorp não encontrou o recurso solicitado (verifique se a campanha existe).",
      status: 404,
      code: "not_found",
      permanent: true,
    };
  }
  if (d.status === 429) {
    return {
      message:
        "Muitas requisições para a Clinicorp. Tentaremos novamente em instantes.",
      status: 429,
      code: "upstream_slow",
      permanent: false,
    };
  }
  if (d.status >= 500) {
    return {
      message:
        "A Clinicorp está instável no momento. Tentaremos novamente automaticamente.",
      status: 502,
      code: "upstream_down",
      permanent: false,
    };
  }
  if (d.status >= 400) {
    return {
      message:
        "A Clinicorp recusou os dados enviados. Verifique as informações e tente novamente.",
      status: 422,
      code: "rejected",
      permanent: true,
    };
  }

  return {
    message:
      "Algo deu errado ao falar com a Clinicorp. Tentaremos novamente automaticamente.",
    status: 502,
    code: "unknown",
    permanent: false,
  };
}
