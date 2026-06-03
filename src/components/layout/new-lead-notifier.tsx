"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSession } from "./session-provider";
import { useNewLeadEvents } from "@/lib/leads/use-new-lead-events";

interface NewLeadNotifierProps {
  domain: string;
}

/**
 * Montado uma unica vez no AppShell. Escuta INSERTs na tabela `leads`
 * filtrados pela company atual via Supabase Realtime e:
 *
 *  - Mostra um toast informativo com o nome do lead e botao "Abrir".
 *  - Suprime o toast quando o proprio operador criou o lead (evita
 *    duplicar com o `toast.success` do `lead-form`). A deteccao usa
 *    `created_by`/`assignee_id` — se sao o usuario atual, ignora.
 *  - Dispara `crm:lead-created` para que o badge na sidebar atualize
 *    instantaneamente em qualquer aba aberta.
 */
export function NewLeadNotifier({ domain }: NewLeadNotifierProps) {
  const { companyId, userId } = useSession();
  const router = useRouter();

  useNewLeadEvents(companyId, {
    onNewLead: (lead) => {
      // Atualiza qualquer subscriber do contador (sidebar).
      window.dispatchEvent(new CustomEvent("crm:lead-created"));

      // Se o operador atual ja se atribuiu o lead, provavelmente foi
      // ele quem criou — o `lead-form` ja mostrou toast.success.
      // Nao temos coluna `created_by` no schema atual; usar
      // `assigned_to` como proxy cobre o caso mais comum (admin/operador
      // cadastrando um lead e ja se colocando como responsavel).
      const createdByMe = userId && lead.assigned_to === userId;
      if (createdByMe) return;

      const displayName = lead.name?.trim() || "Lead sem nome";
      toast.info(`Novo lead: ${displayName}`, {
        description: lead.phone ? `Telefone: ${lead.phone}` : undefined,
        action: {
          label: "Abrir",
          onClick: () => router.push(`/${domain}/leads/${lead.id}`),
        },
      });
    },
  });

  return null;
}
