/**
 * Traduz erros de banco (Supabase/PostgreSQL) ou erros nao tratados das
 * API routes em mensagens **amigaveis e neutras** para o usuario final.
 *
 * Espelha a abordagem de `src/lib/evolution/friendly-error.ts`, porem
 * focado em operacoes CRUD do nosso proprio banco — nao em servicos
 * externos. Principios:
 *
 *  - Nao revelar codigos SQL, nomes de tabela, colunas ou tipos.
 *  - Nao expor `error.message` cru — usuario nao deve ver "ERROR: duplicate
 *    key value violates unique constraint" e similares.
 *  - Sempre falar em termos do dominio (lead, agendamento, organizacao).
 *  - Internamente continuar logando o erro tecnico via `console.error`
 *    para o time de dev poder investigar.
 *
 * Uso tipico nas API routes:
 *
 *   const { error } = await supabase.from("leads").insert(...);
 *   if (error) {
 *     console.error("[POST /api/leads] db error", error);
 *     const f = friendlyDbError(error, "save_lead");
 *     return NextResponse.json({ error: f.message }, { status: f.status });
 *   }
 */

/**
 * Categoria de acao executada quando o erro ocorreu. Define a copia
 * mostrada ao usuario.
 */
export type DbAction =
  | "save_lead"
  | "delete_lead"
  | "save_appointment"
  | "delete_appointment"
  | "save_sector"
  | "delete_sector"
  | "save_user"
  | "delete_user"
  | "save_setting"
  | "list"
  | "generic";

export interface FriendlyDbError {
  message: string;
  status: number;
  /** Codigo curto para o client decidir comportamento. */
  code:
    | "unauthorized"
    | "forbidden"
    | "validation"
    | "duplicate"
    | "fk_violation"
    | "not_found"
    | "unavailable"
    | "unknown";
}

interface SupabaseLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

const COPY: Record<DbAction, Record<FriendlyDbError["code"], string>> = {
  save_lead: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para criar ou editar leads.",
    validation: "Confira os dados informados e tente novamente.",
    duplicate: "Ja existe um lead com esses dados nesta organizacao.",
    fk_violation:
      "Algumas das referencias (etapa, fonte, responsavel) nao existem mais. Recarregue a pagina e tente novamente.",
    not_found: "Lead nao encontrado.",
    unavailable: "Nao foi possivel salvar o lead agora. Tente novamente.",
    unknown:
      "Algo deu errado ao salvar o lead. Tente novamente em alguns instantes.",
  },
  delete_lead: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para excluir este lead.",
    validation: "Confira os dados e tente novamente.",
    duplicate: "Conflito de dados ao excluir.",
    fk_violation:
      "Este lead tem agendamentos ou mensagens vinculadas. Remova-os antes de excluir.",
    not_found: "Lead nao encontrado ou ja excluido.",
    unavailable: "Nao foi possivel excluir o lead agora. Tente novamente.",
    unknown:
      "Algo deu errado ao excluir o lead. Tente novamente em alguns instantes.",
  },
  save_appointment: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para criar ou editar agendamentos.",
    validation:
      "Confira data, horario e dados do agendamento e tente novamente.",
    duplicate: "Ja existe agendamento com esses dados.",
    fk_violation:
      "Algumas referencias (lead, profissional, sala) nao existem mais. Recarregue e tente de novo.",
    not_found: "Agendamento nao encontrado.",
    unavailable:
      "Nao foi possivel salvar o agendamento agora. Tente novamente.",
    unknown:
      "Algo deu errado ao salvar o agendamento. Tente novamente em alguns instantes.",
  },
  delete_appointment: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para excluir este agendamento.",
    validation: "Confira os dados e tente novamente.",
    duplicate: "Conflito de dados ao excluir.",
    fk_violation: "Este agendamento tem dependencias e nao pode ser excluido.",
    not_found: "Agendamento nao encontrado ou ja excluido.",
    unavailable:
      "Nao foi possivel excluir o agendamento agora. Tente novamente.",
    unknown:
      "Algo deu errado ao excluir o agendamento. Tente novamente em alguns instantes.",
  },
  save_sector: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para gerenciar setores.",
    validation: "Confira os dados do setor e tente novamente.",
    duplicate: "Ja existe um setor com esse nome.",
    fk_violation: "Referencia invalida. Recarregue a pagina e tente novamente.",
    not_found: "Setor nao encontrado.",
    unavailable: "Nao foi possivel salvar o setor agora. Tente novamente.",
    unknown:
      "Algo deu errado ao salvar o setor. Tente novamente em alguns instantes.",
  },
  delete_sector: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para excluir setores.",
    validation: "Confira os dados e tente novamente.",
    duplicate: "Conflito de dados.",
    fk_violation:
      "Existem leads ou membros vinculados a este setor. Reatribua-os antes de excluir.",
    not_found: "Setor nao encontrado ou ja excluido.",
    unavailable: "Nao foi possivel excluir o setor agora. Tente novamente.",
    unknown:
      "Algo deu errado ao excluir o setor. Tente novamente em alguns instantes.",
  },
  save_user: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para gerenciar membros.",
    validation: "Confira os dados do membro e tente novamente.",
    duplicate: "Ja existe um membro com esses dados.",
    fk_violation: "Referencia invalida. Recarregue a pagina e tente novamente.",
    not_found: "Membro nao encontrado.",
    unavailable: "Nao foi possivel salvar o membro agora. Tente novamente.",
    unknown:
      "Algo deu errado ao salvar o membro. Tente novamente em alguns instantes.",
  },
  delete_user: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para excluir membros.",
    validation: "Confira os dados e tente novamente.",
    duplicate: "Conflito de dados.",
    fk_violation:
      "Este membro tem leads ou agendamentos vinculados. Reatribua antes de excluir.",
    not_found: "Membro nao encontrado.",
    unavailable: "Nao foi possivel excluir o membro agora. Tente novamente.",
    unknown:
      "Algo deu errado ao excluir o membro. Tente novamente em alguns instantes.",
  },
  save_setting: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para alterar essa configuracao.",
    validation: "Confira os dados informados e tente novamente.",
    duplicate: "Ja existe um item com esses dados.",
    fk_violation: "Referencia invalida. Recarregue a pagina e tente novamente.",
    not_found: "Item nao encontrado.",
    unavailable:
      "Nao foi possivel salvar a configuracao agora. Tente novamente.",
    unknown:
      "Algo deu errado ao salvar. Tente novamente em alguns instantes.",
  },
  list: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para acessar esses dados.",
    validation: "Confira os parametros da consulta.",
    duplicate: "Conflito de dados.",
    fk_violation: "Referencia invalida.",
    not_found: "Nenhum item encontrado.",
    unavailable: "Nao foi possivel carregar os dados agora. Tente novamente.",
    unknown:
      "Algo deu errado ao carregar. Tente novamente em alguns instantes.",
  },
  generic: {
    unauthorized: "Voce nao esta autenticado. Faca login para continuar.",
    forbidden: "Voce nao tem permissao para esta operacao.",
    validation: "Confira os dados informados e tente novamente.",
    duplicate: "Conflito de dados — o item ja existe.",
    fk_violation: "Operacao bloqueada por dependencias.",
    not_found: "Item nao encontrado.",
    unavailable: "Servico indisponivel no momento. Tente novamente.",
    unknown: "Algo deu errado. Tente novamente em alguns instantes.",
  },
};

/**
 * Mapeia um erro do Supabase/PostgREST/Postgres em uma mensagem amigavel.
 *
 * Aceita tambem qualquer Error generico (ex: `throw new Error("Boom")`)
 * — devolve a mensagem `unknown` da `action`.
 */
export function friendlyDbError(
  err: unknown,
  action: DbAction = "generic"
): FriendlyDbError {
  const e = (err ?? {}) as SupabaseLikeError;
  const code = String(e.code ?? "").toUpperCase();
  const status = typeof e.status === "number" ? e.status : 0;

  // RLS / sem permissao
  if (code === "42501" || code === "PGRST301" || status === 401) {
    return {
      message: COPY[action].unauthorized,
      status: 401,
      code: "unauthorized",
    };
  }
  if (status === 403) {
    return {
      message: COPY[action].forbidden,
      status: 403,
      code: "forbidden",
    };
  }

  // Duplicidade (unique violation)
  if (code === "23505") {
    return {
      message: COPY[action].duplicate,
      status: 409,
      code: "duplicate",
    };
  }
  // Foreign key violation (delete bloqueado / referencia ausente)
  if (code === "23503") {
    return {
      message: COPY[action].fk_violation,
      status: 409,
      code: "fk_violation",
    };
  }
  // Not null / check / type
  if (code === "23502" || code === "22P02" || code === "22001") {
    return {
      message: COPY[action].validation,
      status: 400,
      code: "validation",
    };
  }
  // PostgREST: no row affected
  if (code === "PGRST116" || code === "PGRST201" || status === 404) {
    return {
      message: COPY[action].not_found,
      status: 404,
      code: "not_found",
    };
  }
  // Banco fora ou timeout
  if (status >= 500 || code === "57P01" || code === "08006") {
    return {
      message: COPY[action].unavailable,
      status: 503,
      code: "unavailable",
    };
  }

  return {
    message: COPY[action].unknown,
    status: 500,
    code: "unknown",
  };
}
