"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_MAX_GAP_MS,
  clearSessionHeartbeat,
  markSessionAlive,
  readLastSeen,
} from "@/lib/auth/session-heartbeat";

interface SessionTimeoutGuardProps {
  /** Slug do tenant atual — destino do redirect para a tela de login. */
  domain: string;
}

/**
 * Encerra a sessao quando a aba/navegador foi fechado e reaberto.
 *
 * Montado dentro do `AppShell` (somente em telas autenticadas). Na montagem
 * — que so acontece em carregamento completo da pagina — compara o "ultimo
 * sinal de vida" com o horario atual. Se passou tempo demais, faz signOut e
 * redireciona para o login. Caso contrario, mantem o heartbeat vivo enquanto
 * a aba estiver aberta. Navegacoes SPA nao remontam o componente, entao o
 * heartbeat persiste sem revalidar a cada clique.
 */
export function SessionTimeoutGuard({ domain }: SessionTimeoutGuardProps) {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const lastSeen = readLastSeen();
    const now = Date.now();

    // Havia um sinal de vida antigo => a aba/navegador ficou fechado tempo
    // demais (inclusive sessao restaurada pelo navegador). Exige novo login.
    if (lastSeen !== null && now - lastSeen > SESSION_MAX_GAP_MS) {
      setExpired(true);
      void (async () => {
        try {
          await createClient().auth.signOut({ scope: "local" });
        } catch {
          /* segue para o login mesmo se o signOut falhar */
        }
        clearSessionHeartbeat();
        // Hard redirect: garante que o middleware reavalie com cookies limpos.
        window.location.replace(`/${domain}`);
      })();
      return;
    }

    // Sessao valida nesta aba: passa a registrar sinais de vida.
    markSessionAlive();
    const interval = window.setInterval(
      markSessionAlive,
      SESSION_HEARTBEAT_INTERVAL_MS
    );

    // Grava o instante exato em que a aba e escondida/fechada, para que a
    // proxima abertura calcule corretamente o tempo que ficou fora.
    function onHideOrLeave() {
      markSessionAlive();
    }
    document.addEventListener("visibilitychange", onHideOrLeave);
    window.addEventListener("pagehide", onHideOrLeave);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onHideOrLeave);
      window.removeEventListener("pagehide", onHideOrLeave);
    };
    // Executa uma vez por carregamento completo (mount). Navegacoes SPA
    // mantem o AppShell montado, preservando o heartbeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!expired) return null;

  // Cobre o conteudo protegido durante o redirect para evitar "piscar".
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-white">
      <p className="text-sm text-slate-500">
        Sessão encerrada. Redirecionando para o login…
      </p>
    </div>
  );
}
