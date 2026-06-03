/**
 * Traduz erros do cliente Evolution (HTTP/rede/timeout) em mensagens
 * **amigaveis e neutras** para o usuario final.
 *
 * Princípios:
 *  - Nao revelar nomes de bibliotecas/servicos externos ("Evolution",
 *    "Baileys", "EasyPanel"), URLs, stack traces ou codigos HTTP brutos.
 *  - Sempre falar em termos do dominio que o operador entende: "WhatsApp",
 *    "envio de mensagem", "conexao".
 *  - Sempre sugerir uma proxima acao razoavel ("tente novamente em
 *    instantes" / "contate o suporte").
 *  - O servidor continua logando o erro tecnico via `console.error` para
 *    o time poder diagnosticar — so a string ENVIADA ao client e neutra.
 *
 * Uso tipico nas API routes:
 *
 *   try { await evolution.connect(...) }
 *   catch (err) {
 *     const f = friendlyEvolutionError(err, "connect");
 *     console.error("[whatsapp/connect] upstream error", err);
 *     return NextResponse.json({ error: f.message }, { status: f.status });
 *   }
 */

/**
 * Categoria de acao que estava sendo executada quando o erro ocorreu.
 * Define a copia da mensagem retornada ao usuario.
 */
export type EvolutionAction =
  | "connect"
  | "disconnect"
  | "sync"
  | "send"
  | "send_media"
  | "edit"
  | "react"
  | "load_history"
  | "media_download"
  | "generic";

export interface FriendlyError {
  message: string;
  status: number;
  // Codigo curto para o client decidir comportamento (ex: nao tentar
  // novamente quando service_unavailable). Nao e enviado ao usuario final.
  code:
    | "service_unavailable"
    | "upstream_down"
    | "upstream_slow"
    | "not_configured"
    | "rejected"
    | "unknown";
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

const COPY: Record<EvolutionAction, Record<FriendlyError["code"], string>> = {
  connect: {
    service_unavailable:
      "O WhatsApp ainda nao esta disponivel nesta organizacao. Contate o suporte para habilita-lo.",
    upstream_down:
      "Nao conseguimos iniciar a conexao com o WhatsApp neste momento. Aguarde alguns instantes e tente novamente.",
    upstream_slow:
      "A conexao com o WhatsApp esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured:
      "O WhatsApp ainda nao esta disponivel nesta organizacao. Contate o suporte para habilita-lo.",
    rejected:
      "Nao foi possivel iniciar a conexao com o WhatsApp. Se o problema persistir, contate o suporte.",
    unknown:
      "Nao conseguimos iniciar a conexao com o WhatsApp agora. Tente novamente em alguns instantes.",
  },
  disconnect: {
    service_unavailable:
      "Nao foi possivel desconectar agora. Aguarde alguns instantes e tente novamente.",
    upstream_down:
      "Nao foi possivel desconectar o WhatsApp neste momento. Tente novamente em alguns instantes.",
    upstream_slow:
      "A desconexao esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured:
      "Recurso indisponivel no momento.",
    rejected:
      "Nao foi possivel desconectar o WhatsApp. Se o problema persistir, contate o suporte.",
    unknown:
      "Nao foi possivel desconectar o WhatsApp agora. Tente novamente em alguns instantes.",
  },
  sync: {
    service_unavailable:
      "Recurso indisponivel no momento.",
    upstream_down:
      "Nao foi possivel sincronizar as conversas agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "A sincronizacao esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured:
      "Recurso indisponivel no momento.",
    rejected:
      "Nao foi possivel sincronizar as conversas. Se o problema persistir, contate o suporte.",
    unknown:
      "Nao foi possivel sincronizar as conversas agora. Tente novamente em alguns instantes.",
  },
  send: {
    service_unavailable: "Envio indisponivel no momento.",
    upstream_down:
      "Nao foi possivel enviar a mensagem agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "O envio esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured: "Envio indisponivel no momento.",
    rejected:
      "Nao conseguimos entregar a mensagem. Verifique o numero do contato e tente novamente.",
    unknown:
      "Nao foi possivel enviar a mensagem agora. Tente novamente em alguns instantes.",
  },
  send_media: {
    service_unavailable: "Envio de arquivos indisponivel no momento.",
    upstream_down:
      "Nao foi possivel enviar o arquivo agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "O envio do arquivo esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured: "Envio de arquivos indisponivel no momento.",
    rejected:
      "Nao conseguimos enviar o arquivo. Verifique o tamanho/formato e tente novamente.",
    unknown:
      "Nao foi possivel enviar o arquivo agora. Tente novamente em alguns instantes.",
  },
  edit: {
    service_unavailable: "Edicao indisponivel no momento.",
    upstream_down:
      "Nao foi possivel editar a mensagem agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "A edicao esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured: "Edicao indisponivel no momento.",
    rejected:
      "Nao foi possivel editar essa mensagem. O WhatsApp so permite editar mensagens recentes.",
    unknown:
      "Nao foi possivel editar a mensagem agora. Tente novamente em alguns instantes.",
  },
  react: {
    service_unavailable: "Reacoes indisponiveis no momento.",
    upstream_down:
      "Nao foi possivel registrar a reacao agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "A reacao esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured: "Reacoes indisponiveis no momento.",
    rejected:
      "Nao foi possivel registrar a reacao. Tente novamente em alguns instantes.",
    unknown:
      "Nao foi possivel registrar a reacao agora. Tente novamente em alguns instantes.",
  },
  load_history: {
    service_unavailable: "Historico indisponivel no momento.",
    upstream_down:
      "Nao foi possivel carregar o historico agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "O carregamento do historico esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured: "Historico indisponivel no momento.",
    rejected:
      "Nao foi possivel carregar o historico desta conversa.",
    unknown:
      "Nao foi possivel carregar o historico agora. Tente novamente em alguns instantes.",
  },
  media_download: {
    service_unavailable: "Arquivo indisponivel no momento.",
    upstream_down:
      "Nao foi possivel carregar o arquivo agora. Tente novamente em alguns instantes.",
    upstream_slow:
      "O carregamento do arquivo esta demorando mais que o normal. Tente novamente em alguns instantes.",
    not_configured: "Arquivo indisponivel no momento.",
    rejected: "Arquivo indisponivel ou removido pelo remetente.",
    unknown:
      "Nao foi possivel carregar o arquivo agora. Tente novamente em alguns instantes.",
  },
  generic: {
    service_unavailable: "Servico indisponivel no momento.",
    upstream_down:
      "O servico do WhatsApp esta indisponivel no momento. Tente novamente em alguns instantes.",
    upstream_slow:
      "O servico do WhatsApp esta lento no momento. Tente novamente em alguns instantes.",
    not_configured: "Recurso indisponivel no momento.",
    rejected:
      "Nao foi possivel completar a operacao. Se o problema persistir, contate o suporte.",
    unknown:
      "Algo deu errado. Tente novamente em alguns instantes.",
  },
};

/**
 * Mapeia um erro arbitrario lancado pelo cliente Evolution em uma
 * mensagem amigavel + status HTTP adequado.
 */
export function friendlyEvolutionError(
  err: unknown,
  action: EvolutionAction = "generic"
): FriendlyError {
  // Erro de configuracao (env nao preenchido) — sinaliza problema interno
  // ao operador como "recurso indisponivel" sem detalhar a causa.
  if (err && (err as { name?: string }).name === "EvolutionConfigError") {
    return {
      message: COPY[action].not_configured,
      status: 503,
      code: "not_configured",
    };
  }

  const d = describe(err);
  const blob = `${d.message} ${d.cause} ${d.name}`;

  // Falhas de rede tipicas do fetch do Node (undici): "fetch failed" no
  // outer error + codigo real no `cause`.
  const isFetchFailed = d.message.includes("fetch failed");
  const isConnRefused = /ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT/i.test(blob);
  const isDnsFail = /ENOTFOUND|EAI_AGAIN/i.test(blob);
  const isReset = /ECONNRESET|UND_ERR_SOCKET/i.test(blob);
  const isTimeout =
    /ETIMEDOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|AbortError/i.test(blob) ||
    d.name === "AbortError";

  if (isTimeout || isReset) {
    return {
      message: COPY[action].upstream_slow,
      status: 504,
      code: "upstream_slow",
    };
  }
  if (isFetchFailed || isConnRefused || isDnsFail) {
    return {
      message: COPY[action].upstream_down,
      status: 502,
      code: "upstream_down",
    };
  }

  // Erros HTTP devolvidos pelo upstream (4xx/5xx)
  if (d.status >= 500) {
    return {
      message: COPY[action].upstream_down,
      status: 502,
      code: "upstream_down",
    };
  }
  if (d.status === 429) {
    return {
      message: COPY[action].upstream_slow,
      status: 429,
      code: "upstream_slow",
    };
  }
  if (d.status >= 400) {
    return {
      message: COPY[action].rejected,
      status: 422,
      code: "rejected",
    };
  }

  return {
    message: COPY[action].unknown,
    status: 502,
    code: "unknown",
  };
}
