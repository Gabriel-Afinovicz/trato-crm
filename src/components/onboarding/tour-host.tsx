"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/layout/session-provider";
import { TourOverlay } from "@/components/onboarding/tour-overlay";
import { WelcomeTour } from "@/components/onboarding/welcome-tour";
import { getTourSteps, toTourRole, type TourId } from "@/lib/onboarding/tours";
import {
  isTourDone,
  markAllToursDone,
  markTourDone,
} from "@/lib/onboarding/use-onboarding-tour";

interface TourHostProps {
  domain: string;
}

/** Mapeia a rota atual para o tour contextual correspondente. */
function tourIdForPath(
  pathname: string | null,
  domain: string
): Exclude<TourId, "welcome"> | null {
  if (!pathname) return null;
  const base = `/${domain}`;
  if (pathname.startsWith(`${base}/dashboard`)) return "dashboard";
  if (pathname === `${base}/leads`) return "leads";
  if (pathname.startsWith(`${base}/agenda`)) return "agenda";
  if (pathname.startsWith(`${base}/conversas`)) return "conversas";
  return null;
}

/**
 * Orquestrador do tour de onboarding, montado no AppShell.
 *
 * - Dispara o "welcome" uma vez (primeira sessao autenticada).
 * - Depois, ao visitar cada tela principal pela primeira vez, dispara o
 *   coach mark daquela tela. Tudo persistido em localStorage por usuario.
 */
export function TourHost({ domain }: TourHostProps) {
  const pathname = usePathname();
  const { userId, profile } = useSession();
  const role = toTourRole(profile?.role ?? null);

  const [active, setActive] = useState<TourId | null>(null);

  // Decide qual tour exibir a partir do progresso salvo em localStorage
  // (sistema externo). Efeitos so rodam no client, entao o acesso e seguro
  // e nao causa mismatch de hidratacao (server e client iniciam com null).
  useEffect(() => {
    if (!userId || active) return;
    let nextActive: TourId | null = null;
    if (!isTourDone("welcome", userId)) {
      nextActive = "welcome";
    } else {
      const ctx = tourIdForPath(pathname, domain);
      if (ctx && !isTourDone(ctx, userId)) nextActive = ctx;
    }
    if (nextActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o tour ativo a partir do localStorage
      setActive(nextActive);
    }
  }, [userId, active, pathname, domain]);

  if (!userId || !active) return null;

  function finish() {
    if (userId && active) markTourDone(active, userId);
    setActive(null);
  }

  if (active === "welcome") {
    return (
      <WelcomeTour
        role={role}
        domain={domain}
        onFinish={finish}
        onSkip={() => {
          if (userId) markAllToursDone(userId);
          setActive(null);
        }}
      />
    );
  }

  return (
    <TourOverlay
      key={active}
      steps={getTourSteps(active)}
      onFinish={finish}
      onSkip={finish}
    />
  );
}
