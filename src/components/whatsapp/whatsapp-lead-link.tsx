import Link from "next/link";

interface WhatsAppLeadLinkProps {
  domain: string;
  phone: string | null | undefined;
  leadId: string;
  size?: "sm" | "md";
  // Quando o link esta dentro de uma <tr>/<button> clicavel, evita que o
  // click "vaze" e dispare a acao do container (ex: abrir modal de edicao).
  stopRowPropagation?: boolean;
}

/**
 * Atalho para abrir a conversa do WhatsApp com um lead direto da lista,
 * kanban ou detalhe do lead. O destino e `/[domain]/conversas?phone=...
 * &leadId=...`; o RSC `conversas/page.tsx` resolve (ou cria) o chat
 * correspondente e redireciona para `?chat=ID`.
 *
 * Esconde-se sozinho quando o telefone esta vazio/invalido — assim os
 * call-sites podem renderizar sem condicional.
 */
export function WhatsAppLeadLink({
  domain,
  phone,
  leadId,
  size = "sm",
  stopRowPropagation,
}: WhatsAppLeadLinkProps) {
  if (!phone || phone.replace(/\D+/g, "").length < 8) return null;
  const px = size === "md" ? 16 : 14;
  return (
    <Link
      href={`/${domain}/conversas?phone=${encodeURIComponent(phone)}&leadId=${encodeURIComponent(leadId)}`}
      onClick={
        stopRowPropagation ? (e) => e.stopPropagation() : undefined
      }
      title="Abrir conversa no WhatsApp"
      aria-label="Abrir conversa no WhatsApp"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.413c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.609zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.149-.173.198-.297.298-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01a1.097 1.097 0 0 0-.793.371c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z" />
      </svg>
    </Link>
  );
}
