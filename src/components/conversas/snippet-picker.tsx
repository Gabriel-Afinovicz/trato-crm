"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEscapeKey } from "@/hooks/use-escape-key";
import type { MessageTemplate } from "@/lib/types/database";

export interface SnippetContext {
  /** Nome do contato/lead da conversa atual (vai em `{{lead}}`). */
  leadName: string;
  /** Nome do operador logado (vai em `{{operador}}`). */
  operatorName: string;
  /** Nome da organizacao (vai em `{{organizacao}}`). */
  companyName: string;
}

interface SnippetPickerProps {
  /** Controla a visibilidade — sempre montado para preservar o foco. */
  open: boolean;
  onClose: () => void;
  /** Chamado com o body ja substituido. O caller decide o que fazer
   *  (sobrescrever o draft, anexar, etc). */
  onPick: (body: string) => void;
  /** Filtro inicial (texto digitado apos `/` no draft). */
  initialQuery?: string;
  /** Domain da organizacao — usado no link "Gerenciar snippets". */
  domain: string;
  /** company_id para buscar os snippets via RLS. */
  companyId: string;
  /** Contexto para substituir variaveis. */
  ctx: SnippetContext;
}

/**
 * Substitui as variaveis `{{lead}}`, `{{operador}}` e `{{organizacao}}`
 * no corpo do snippet. Mantemos o conjunto bem pequeno para o picker
 * de chat — placeholders de agendamento ficam restritos aos templates
 * de Agenda/Confirmacao.
 */
export function applySnippetContext(body: string, ctx: SnippetContext) {
  return body
    .replaceAll("{{lead}}", ctx.leadName || "")
    .replaceAll("{{paciente}}", ctx.leadName || "")
    .replaceAll("{{operador}}", ctx.operatorName || "")
    .replaceAll("{{organizacao}}", ctx.companyName || "")
    .replaceAll("{{clinica}}", ctx.companyName || "");
}

export function SnippetPicker({
  open,
  onClose,
  onPick,
  initialQuery = "",
  domain,
  companyId,
  ctx,
}: SnippetPickerProps) {
  const [snippets, setSnippets] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(initialQuery);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Carrega snippets uma vez quando o picker abre pela primeira vez.
  // Se o usuario criar/editar snippets, basta reabrir para atualizar
  // (carga e barata e a tabela e pequena).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("message_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("kind", "snippet")
        .eq("is_active", true)
        .order("name");
      if (cancelled) return;
      setSnippets((data ?? []) as MessageTemplate[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEscapeKey(open, onClose);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snippets;
    return snippets.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q)
      );
    });
  }, [snippets, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  function pick(item: MessageTemplate) {
    onPick(applySnippetContext(item.body, ctx));
    onClose();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[highlight];
      if (item) pick(item);
    }
  }

  if (!open) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
      role="dialog"
      aria-label="Mensagens rapidas"
    >
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <svg
          className="h-4 w-4 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 13.5 9 18l11.25-11.25"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Buscar mensagem rapida..."
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        <span className="shrink-0 text-[11px] text-gray-400">
          {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Carregando...
          </div>
        ) : snippets.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-500">
            <p>Voce ainda nao cadastrou mensagens rapidas.</p>
            <Link
              href={`/${domain}/settings?tab=templates`}
              className="mt-1 inline-block text-blue-600 hover:underline"
            >
              Criar primeira mensagem rapida
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Nenhum resultado para "{query}".
          </div>
        ) : (
          <ul>
            {filtered.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition-colors ${
                    idx === highlight ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="text-sm font-medium text-gray-900">
                    {item.name}
                  </span>
                  <span className="line-clamp-2 text-xs text-gray-500">
                    {applySnippetContext(item.body, ctx)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
        <span>
          <kbd className="rounded border border-gray-200 bg-white px-1">↑↓</kbd>{" "}
          navegar{" · "}
          <kbd className="rounded border border-gray-200 bg-white px-1">Enter</kbd>{" "}
          inserir{" · "}
          <kbd className="rounded border border-gray-200 bg-white px-1">Esc</kbd>{" "}
          fechar
        </span>
        <Link
          href={`/${domain}/settings?tab=templates`}
          className="text-blue-600 hover:underline"
        >
          Gerenciar
        </Link>
      </div>
    </div>
  );
}
