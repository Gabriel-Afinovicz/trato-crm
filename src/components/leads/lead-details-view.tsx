"use client";

import { WhatsAppLeadLink } from "@/components/whatsapp/whatsapp-lead-link";
import { formatPhoneDisplay } from "@/lib/evolution/phone";
import type {
  CustomField,
  CustomFieldValue,
  LeadDetailed,
} from "@/lib/types/database";

interface LeadDetailsViewProps {
  domain: string;
  detailed: LeadDetailed;
  customFields: CustomField[];
  customValues: CustomFieldValue[];
  /**
   * Quando false, oculta o link "abrir no WhatsApp" ao lado do telefone.
   * Util no painel de Conversas, onde a conversa ja esta aberta ali do lado.
   */
  showWhatsAppLink?: boolean;
}

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {value ? (
        <span className="text-sm text-gray-800">{value}</span>
      ) : (
        <span className="text-sm italic text-gray-400">Não preenchido</span>
      )}
    </div>
  );
}

/**
 * Bloco de visualizacao das informacoes de um lead. Espelha as secoes do
 * formulario de cadastro (lead-form.tsx). Usado tanto no card do Kanban
 * (kanban-lead-edit-modal) quanto no painel lateral do contato em Conversas,
 * para que ambos mostrem exatamente as mesmas informacoes.
 */
export function LeadDetailsView({
  domain,
  detailed,
  customFields,
  customValues,
  showWhatsAppLink = true,
}: LeadDetailsViewProps) {
  const valuesMap: Record<string, string> = {};
  customValues.forEach((v) => {
    if (v.value) valuesMap[v.custom_field_id] = v.value;
  });

  return (
    <div className="space-y-5">
      {/* Informacoes gerais */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Informações gerais
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Telefone
            </span>
            {detailed.phone ? (
              <span className="inline-flex items-center gap-2 text-sm text-gray-800">
                {formatPhoneDisplay(detailed.phone)}
                {showWhatsAppLink && (
                  <WhatsAppLeadLink
                    domain={domain}
                    phone={detailed.phone}
                    leadId={detailed.id}
                  />
                )}
              </span>
            ) : (
              <span className="text-sm italic text-gray-400">
                Não preenchido
              </span>
            )}
          </div>
          <InfoRow label="Fonte" value={detailed.source_name} />
          <InfoRow
            label="Operador responsável"
            value={detailed.assigned_to_name}
          />
          {detailed.sector_name ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Setor
              </span>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: detailed.sector_color ?? "#9ca3af",
                  }}
                />
                {detailed.sector_name}
              </span>
            </div>
          ) : (
            <InfoRow label="Setor" value={null} />
          )}
        </div>
      </div>

      {/* Financeiro — so aparece quando ha valores. */}
      {(detailed.closing_value != null || detailed.down_payment != null) && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Financeiro
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow
              label="Valor de fechamento"
              value={
                detailed.closing_value != null
                  ? new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(detailed.closing_value)
                  : null
              }
            />
            <InfoRow
              label="Valor de entrada"
              value={
                detailed.down_payment != null
                  ? new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(detailed.down_payment)
                  : null
              }
            />
          </div>
        </div>
      )}

      {/* Campos adicionais */}
      {customFields.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Campos adicionais
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {customFields.map((field) => (
              <InfoRow
                key={field.id}
                label={field.name}
                value={valuesMap[field.id] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {/* Observacoes gerais */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
        <InfoRow label="Observações gerais" value={detailed.notes} />
      </div>

      {/* Rodape com data de criacao */}
      <p className="text-center text-xs text-gray-400">
        Lead criado em{" "}
        {new Date(detailed.created_at).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
