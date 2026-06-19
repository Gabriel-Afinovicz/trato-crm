"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OnboardingStatus } from "@/app/api/onboarding/status/route";

interface OnboardingChecklistProps {
  domain: string;
}

interface ChecklistItem {
  key: keyof OnboardingStatus;
  label: string;
  description: string;
  href: string;
}

// Storage key para o "esconder permanentemente" (operador que prefere
// nao ver mesmo com itens pendentes). Por organizacao para nao misturar
// estados quando o mesmo navegador acessa varias clinicas.
const DISMISS_STORAGE_KEY = "crm.onboarding.dismissed";

function getChecklistItems(domain: string): ChecklistItem[] {
  return [
    {
      key: "hasPipeline",
      label: "Cadastrar etapas do pipeline",
      description:
        "Defina as colunas do Kanban (Novo, Quente, Agendado, Fechado…). Voce pode carregar um template pronto.",
      href: `/${domain}/dashboard?tab=funil`,
    },
    {
      key: "hasExtraMember",
      label: "Adicionar membros",
      description:
        "Convide outros operadores ou admins. Cada membro entra com ramal + senha definidos por voce.",
      href: `/${domain}/settings?tab=members`,
    },
    {
      key: "hasClinicHours",
      label: "Configurar horarios da agenda",
      description:
        "Habilite os dias da semana e defina abertura/fechamento. Sem isso a agenda fica desabilitada.",
      href: `/${domain}/settings?tab=hours`,
    },
    {
      key: "hasWhatsApp",
      label: "Conectar WhatsApp",
      description:
        "Escaneie o QR Code para sincronizar conversas e responder leads direto pelo CRM.",
      href: `/${domain}/settings?tab=whatsapp`,
    },
    {
      key: "hasFirstLead",
      label: "Criar primeiro lead",
      description:
        "Cadastre seu primeiro contato manualmente para experimentar o fluxo. Depois voce pode importar em lote.",
      href: `/${domain}/leads/new`,
    },
  ];
}

/**
 * Card de primeiros passos exibido no topo do Dashboard quando a
 * organizacao ainda nao concluiu a configuracao inicial.
 *
 * Comportamento:
 *  - Esconde-se automaticamente quando todos os itens estao completos.
 *  - O operador pode "dispensar" manualmente — armazenado em
 *    localStorage para nao reaparecer na proxima sessao.
 *  - Refetch quando a janela ganha foco (cobre o caso "voltei de uma
 *    aba de configuracao") sem precisar recarregar a pagina.
 */
export function OnboardingChecklist({ domain }: OnboardingChecklistProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Le o dismissed do storage no mount — sem SSR para evitar mismatch.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DISMISS_STORAGE_KEY);
      if (stored === "1") setDismissed(true);
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/onboarding/status", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as OnboardingStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* silencioso */
      }
    }
    void load();
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!status || dismissed) return null;

  const items = getChecklistItems(domain);
  const completed = items.filter((it) => status[it.key]).length;
  const total = items.length;

  // Tudo pronto → nao mostra mais o card.
  if (completed === total) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      /* ignora */
    }
  }

  const percent = Math.round((completed / total) * 100);

  return (
    <div
      data-tour="onboarding-checklist"
      className="mb-4 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              Primeiros passos
            </h2>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              {completed}/{total}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-600">
            Complete estes itens para tirar o maximo proveito do CRM. O card
            some sozinho ao terminar.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          title="Esconder este card"
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          Esconder
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="mt-3 px-5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="mt-3 grid gap-2 px-3 pb-4 pt-1 sm:grid-cols-2">
        {items.map((it) => {
          const done = status[it.key];
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  done
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : "border-2 border-gray-300 text-transparent"
                  }`}
                  aria-hidden="true"
                >
                  {done ? (
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    "•"
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      done ? "text-emerald-700" : "text-gray-900"
                    }`}
                  >
                    {it.label}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${
                      done ? "text-emerald-700/70" : "text-gray-500"
                    }`}
                  >
                    {it.description}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
