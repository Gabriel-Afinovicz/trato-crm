"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { useCurrentCompany } from "@/hooks/use-current-company";

interface CommandPaletteProps {
  domain: string;
}

interface LeadHit {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * Mini command palette acessivel via Ctrl+K / Cmd+K.
 *
 * Intencionalmente "mini": 3-4 acoes rapidas + busca de leads. Nao
 * pretende competir com um palette completo (sem comandos arbitrarios,
 * sem fuzzy global). O proposito e reduzir cliques nas tarefas mais
 * frequentes do operador:
 *
 *  - Criar lead novo
 *  - Buscar lead por nome / telefone
 *  - Abrir conversa do WhatsApp por telefone digitado
 *  - Ir direto a Agenda / Configuracoes
 *
 * A busca de leads dispara apos 250ms de pausa de digitacao para nao
 * inundar a API a cada tecla.
 */
export function CommandPalette({ domain }: CommandPaletteProps) {
  const router = useRouter();
  const { companyId } = useCurrentCompany();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Atalho global Ctrl+K / Cmd+K para abrir.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc fecha.
  useEscapeKey(open, () => setOpen(false));

  // Foco no input ao abrir.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    setQuery("");
    setHits([]);
  }, [open]);

  // Busca leads com debounce. So procura quando ha 2+ chars e companyId.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!companyId || q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const url = new URL("/api/leads", window.location.origin);
        url.searchParams.set("companyId", companyId);
        url.searchParams.set("q", q);
        url.searchParams.set("pageSize", "6");
        // Busca GLOBAL: a API filtra por `created_at` dentro de um range e,
        // sem `start`/`end`, assume o mes atual — o que escondia leads mais
        // antigos no palette (parecia "busca quebrada"). Forcamos uma janela
        // ampla (epoch -> futuro) para procurar em TODOS os leads. A tela de
        // Leads, que tem seletor de periodo proprio, continua enviando o seu
        // range normalmente.
        url.searchParams.set("start", new Date(0).toISOString());
        url.searchParams.set(
          "end",
          new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString()
        );
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setHits([]);
          return;
        }
        const data = (await res.json()) as {
          items?: Array<{ id: string; name: string; phone: string | null }>;
        };
        if (!cancelled) {
          setHits(
            (data.items ?? []).map((it) => ({
              id: it.id,
              name: it.name,
              phone: it.phone,
            }))
          );
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open, query, companyId]);

  // Detecta se a query parece um telefone (apenas digitos / +/-/espacos).
  const phoneCandidate = useMemo(() => {
    const stripped = query.replace(/[^0-9]/g, "");
    return stripped.length >= 8 ? stripped : null;
  }, [query]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Busca rapida"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
          <svg
            className="h-4 w-4 shrink-0 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar leads, abrir conversa, criar lead…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            type="text"
          />
          <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 md:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {/* Acoes rapidas */}
          <Section title="Acoes">
            <Action
              icon={<PlusIcon />}
              label="Criar novo lead"
              hint="Abre formulario"
              onClick={() => navigate(`/${domain}/leads/new`)}
            />
            {phoneCandidate && (
              <Action
                icon={<ChatIcon />}
                label={`Abrir conversa de ${phoneCandidate}`}
                hint="WhatsApp"
                onClick={() =>
                  navigate(
                    `/${domain}/conversas?phone=${encodeURIComponent(
                      phoneCandidate
                    )}`
                  )
                }
              />
            )}
            <Action
              icon={<CalendarIcon />}
              label="Ir para a Agenda"
              onClick={() => navigate(`/${domain}/agenda`)}
            />
            <Action
              icon={<GearIcon />}
              label="Ir para Configuracoes"
              onClick={() => navigate(`/${domain}/settings`)}
            />
          </Section>

          {/* Resultados de busca de lead */}
          {query.trim().length >= 2 && (
            <Section
              title={
                searching
                  ? "Buscando leads…"
                  : hits.length > 0
                  ? "Leads encontrados"
                  : "Nenhum lead encontrado"
              }
            >
              {hits.map((h) => (
                <Action
                  key={h.id}
                  icon={<PersonIcon />}
                  label={h.name}
                  hint={h.phone ?? ""}
                  onClick={() => navigate(`/${domain}/leads/${h.id}`)}
                />
              ))}
            </Section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-gray-600">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-gray-600">
              K
            </kbd>
            <span>para abrir</span>
          </div>
          <span className="hidden sm:inline">
            Esc para fechar
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}

function Action({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 hover:text-blue-900"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
        {icon}
      </span>
      <span className="flex-1 truncate text-gray-800">{label}</span>
      {hint && (
        <span className="truncate text-xs text-gray-400">{hint}</span>
      )}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
      />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25"
      />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
      />
    </svg>
  );
}
