"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useEscapeKey } from "@/hooks/use-escape-key";
import { isEditableTarget, hasCommandModifier } from "@/lib/utils/keyboard";

interface KeyboardShortcutsProps {
  domain: string;
  showSettings: boolean;
}

/**
 * Atalhos de teclado GLOBAIS (montado em todas as telas autenticadas via
 * AppShell):
 *
 *  - `G` seguido de `D/L/A/C/S` → navegar (Dashboard, Leads, Agenda,
 *    Conversas, Configuracoes). Padrao "go to" estilo Gmail/Linear, para
 *    nao colidir com atalhos do navegador.
 *  - `N` → novo lead (exceto na Agenda, onde `N` cria agendamento — tratado
 *    localmente pela tela de Agenda).
 *  - `?` → abre/fecha o painel de ajuda com todos os atalhos.
 *
 * Nenhum atalho dispara enquanto o usuario digita em um campo (ver
 * `isEditableTarget`). Atalhos contextuais (Dashboard 1/2/3, Conversas J/K,
 * Agenda T/setas/D-W-M/N, Lead form Ctrl+Enter) vivem nos seus respectivos
 * componentes; este arquivo cuida apenas dos globais + painel de ajuda.
 */
export function KeyboardShortcuts({
  domain,
  showSettings,
}: KeyboardShortcutsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);

  // Estado do prefixo "G" (aguardando a segunda tecla). Reseta apos 1.2s.
  const pendingGoToRef = useRef(false);
  const goToTimerRef = useRef<number | null>(null);

  const clearPendingGoTo = useCallback(() => {
    pendingGoToRef.current = false;
    if (goToTimerRef.current !== null) {
      window.clearTimeout(goToTimerRef.current);
      goToTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // `?` abre/fecha ajuda. Em muitos teclados exige Shift+/, entao
      // detectamos pelo caractere resultante.
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        clearPendingGoTo();
        return;
      }

      // Quando a ajuda esta aberta, deixamos so o Esc (tratado a parte) agir.
      if (helpOpen) return;

      // Sequencia "go to": primeira tecla G arma; segunda tecla decide.
      if (pendingGoToRef.current) {
        const routes: Record<string, string | null> = {
          d: `/${domain}/dashboard?tab=analitico`,
          l: `/${domain}/leads`,
          a: `/${domain}/agenda`,
          c: `/${domain}/conversas`,
          s: showSettings ? `/${domain}/settings` : null,
        };
        if (key in routes) {
          e.preventDefault();
          const dest = routes[key];
          clearPendingGoTo();
          if (dest) router.push(dest);
          return;
        }
        // Qualquer outra tecla cancela a sequencia.
        clearPendingGoTo();
        return;
      }

      if (hasCommandModifier(e)) return;

      if (key === "g") {
        e.preventDefault();
        pendingGoToRef.current = true;
        goToTimerRef.current = window.setTimeout(clearPendingGoTo, 1200);
        return;
      }

      // `N` = novo lead. Na Agenda o `N` e capturado localmente (novo
      // agendamento); evitamos conflito ignorando aqui nessa rota.
      if (key === "n" && !pathname?.startsWith(`/${domain}/agenda`)) {
        e.preventDefault();
        router.push(`/${domain}/leads/new`);
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [domain, showSettings, helpOpen, pathname, router, clearPendingGoTo]);

  useEscapeKey(helpOpen, () => setHelpOpen(false));

  if (!helpOpen) return null;

  return (
    <ShortcutsHelpPanel
      showSettings={showSettings}
      onClose={() => setHelpOpen(false)}
    />
  );
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

function buildGroups(showSettings: boolean): ShortcutGroup[] {
  const navRows: ShortcutRow[] = [
    { keys: ["G", "D"], label: "Ir para o Dashboard" },
    { keys: ["G", "L"], label: "Ir para Leads" },
    { keys: ["G", "A"], label: "Ir para a Agenda" },
    { keys: ["G", "C"], label: "Ir para Conversas" },
  ];
  if (showSettings) {
    navRows.push({ keys: ["G", "S"], label: "Ir para Configurações" });
  }

  return [
    {
      title: "Navegação",
      rows: navRows,
    },
    {
      title: "Ações globais",
      rows: [
        { keys: ["N"], label: "Novo lead" },
        { keys: ["Ctrl", "K"], label: "Busca rápida (leads, conversas, ações)" },
        { keys: ["?"], label: "Abrir/fechar esta ajuda" },
        { keys: ["Esc"], label: "Fechar janelas e diálogos" },
      ],
    },
    {
      title: "Dashboard",
      rows: [
        { keys: ["1"], label: "Aba Analítico" },
        { keys: ["2"], label: "Aba Kanban" },
        { keys: ["3"], label: "Aba Funil" },
      ],
    },
    {
      title: "Cadastro / edição de lead",
      rows: [
        { keys: ["Ctrl", "Enter"], label: "Salvar lead" },
        { keys: ["Esc"], label: "Cancelar" },
      ],
    },
    {
      title: "Conversas",
      rows: [
        { keys: ["J"], label: "Próxima conversa" },
        { keys: ["K"], label: "Conversa anterior" },
        { keys: ["Ctrl", "F"], label: "Buscar dentro da conversa" },
        { keys: ["Enter"], label: "Enviar mensagem" },
        { keys: ["Shift", "Enter"], label: "Quebrar linha na mensagem" },
      ],
    },
    {
      title: "Agenda",
      rows: [
        { keys: ["T"], label: "Ir para hoje" },
        { keys: ["←"], label: "Período anterior" },
        { keys: ["→"], label: "Próximo período" },
        { keys: ["D"], label: "Visão Dia" },
        { keys: ["W"], label: "Visão Semana" },
        { keys: ["M"], label: "Visão Mês" },
        { keys: ["N"], label: "Novo agendamento" },
      ],
    },
  ];
}

function ShortcutsHelpPanel({
  showSettings,
  onClose,
}: {
  showSettings: boolean;
  onClose: () => void;
}) {
  const groups = buildGroups(showSettings);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[8vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos do teclado"
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Atalhos do teclado
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar"
          >
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
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="grid max-h-[70vh] gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {group.title}
              </p>
              <ul className="space-y-1.5">
                {group.rows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-gray-700">{row.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {row.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-[10px] text-gray-400">
                              {row.keys[0] === "G" ? "depois" : "+"}
                            </span>
                          )}
                          <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 bg-gray-50 px-5 py-2 text-[11px] text-gray-500">
          Dica: os atalhos não disparam enquanto você digita em um campo de
          texto.
        </div>
      </div>
    </div>
  );
}
