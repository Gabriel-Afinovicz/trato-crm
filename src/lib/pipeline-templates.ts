import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageCategory } from "@/lib/types/database";

// ============================================================================
// Sistema de templates de pipeline
//
// Cada organizacao nasce com pipeline vazio. O usuario escolhe um template
// pre-configurado para nao comecar do zero. A lista abaixo e extensivel:
// novos segmentos (barbearia, restaurante, advocacia, etc.) so precisam
// adicionar um item ao array PIPELINE_TEMPLATES.
//
// Como adicionar um novo template:
//   1) Adicione um objeto ao array PIPELINE_TEMPLATES com id estavel.
//   2) Defina as etapas (nome, cor, posicao, categoria, is_won/is_lost).
//   3) Pronto - aparece automaticamente nos pontos de carregamento
//      (Configuracoes > Pipeline, empty state do Kanban, empty state do Funil).
// ============================================================================

export interface PipelineStageTemplate {
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  category: StageCategory | null;
}

export interface PipelineTemplate {
  /** Identificador estavel (kebab-case). Usado no UI/persistencia. */
  id: string;
  /** Nome amigavel mostrado no card de selecao. */
  label: string;
  /** Sub-rotulo curto (segmento alvo). */
  segment: string;
  /** Descricao em 1 frase do que esse template cobre. */
  description: string;
  /** Emoji ou simbolo curto exibido no card. */
  icon: string;
  /** Etapas que serao criadas ao carregar o template. */
  stages: PipelineStageTemplate[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "dental",
    label: "Odontologico",
    segment: "Clinica odontologica",
    description:
      "Captacao → agendamento → avaliacao → orcamento → tratamento → pos-atendimento.",
    icon: "🦷",
    stages: [
      { name: "Lead Captado", color: "#3b82f6", position: 1, is_won: false, is_lost: false, category: "quente" },
      { name: "Contato Realizado", color: "#f59e0b", position: 2, is_won: false, is_lost: false, category: "quente" },
      { name: "Consulta Agendada", color: "#f97316", position: 3, is_won: false, is_lost: false, category: "agendado" },
      { name: "Avaliacao Realizada", color: "#8b5cf6", position: 4, is_won: false, is_lost: false, category: "compareceu" },
      { name: "Orcamento Enviado", color: "#ec4899", position: 5, is_won: false, is_lost: false, category: "orcamento" },
      { name: "Tratamento em Andamento", color: "#22c55e", position: 6, is_won: false, is_lost: false, category: "compareceu" },
      { name: "Tratamento Concluido", color: "#16a34a", position: 7, is_won: true, is_lost: false, category: "fechado" },
      { name: "Pos-atendimento", color: "#64748b", position: 8, is_won: true, is_lost: false, category: "fechado" },
      { name: "Perdido", color: "#ef4444", position: 99, is_won: false, is_lost: true, category: "perdido" },
    ],
  },
  // Futuros templates entram aqui:
  // { id: "barbershop", label: "Barbearia", segment: "Barbearia / Salao", ... },
  // { id: "restaurant", label: "Restaurante", segment: "Restaurante / Delivery", ... },
];

export function getPipelineTemplate(id: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Insere as etapas do template selecionado para a organizacao.
 * Idempotente em nivel de UX: detecta etapas ja existentes pelo nome
 * (case-insensitive) e cria apenas as faltantes. Devolve a contagem de
 * etapas criadas e de etapas que ja existiam.
 */
export async function seedPipelineTemplate(
  supabase: SupabaseClient,
  companyId: string,
  templateId: string
): Promise<{ created: number; skipped: number; error: string | null }> {
  const template = getPipelineTemplate(templateId);
  if (!template) {
    return {
      created: 0,
      skipped: 0,
      error: `Template "${templateId}" nao encontrado.`,
    };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("pipeline_stages")
    .select("name")
    .eq("company_id", companyId);

  if (fetchErr) {
    return { created: 0, skipped: 0, error: fetchErr.message };
  }

  const existingNames = new Set(
    ((existing as { name: string }[] | null) ?? []).map((r) =>
      r.name.toLowerCase()
    )
  );

  const toInsert = template.stages.filter(
    (s) => !existingNames.has(s.name.toLowerCase())
  );

  if (toInsert.length === 0) {
    return {
      created: 0,
      skipped: template.stages.length,
      error: null,
    };
  }

  const { error: insertError } = await supabase.from("pipeline_stages").insert(
    toInsert.map((s) => ({
      company_id: companyId,
      name: s.name,
      color: s.color,
      position: s.position,
      is_won: s.is_won,
      is_lost: s.is_lost,
      category: s.category,
    }))
  );

  if (insertError) {
    return { created: 0, skipped: 0, error: insertError.message };
  }

  return {
    created: toInsert.length,
    skipped: template.stages.length - toInsert.length,
    error: null,
  };
}
