"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  WhatsAppConnectLoader,
  whatsappLoginSyncKey,
} from "./whatsapp-connect-loader";

interface WhatsAppLoginSyncGateProps {
  domain: string;
  children: ReactNode;
}

// Subscribe estavel: nao precisamos reagir a mudancas externas do
// sessionStorage — quem o atualiza (o loader) tambem dispara um router.refresh,
// que re-renderiza este gate e faz o getSnapshot reler o valor.
const noopSubscribe = () => () => {};

/**
 * Gate da aba Conversas: na PRIMEIRA visita a /conversas em cada sessao do
 * browser (tipicamente apos um login novo), mostra o card de carregamento e
 * roda um catch-up (post-login-sync) para trazer as ultimas mensagens/contatos
 * antes de liberar a lista.
 *
 * Motivo: enquanto o CRM esta fechado (browser/aba fechados), as mensagens se
 * acumulam. Ao logar de novo e abrir Conversas, queremos atualizar tudo antes
 * de mostrar — para o operador nunca ver "a ultima mensagem" desatualizada.
 *
 * Roda no maximo UMA vez por sessao do browser: a chave
 * `whatsappLoginSyncKey(domain)` e gravada pelo proprio loader ao concluir
 * (tanto aqui quanto no fluxo de conexao/?justConnected), entao navegar para
 * fora e voltar a Conversas na mesma sessao nao reexibe o card — o webhook
 * mantem tudo ao vivo durante a sessao.
 *
 * SSR/hidratacao: useSyncExternalStore retorna `null` no servidor (estado
 * "verificando", renderiza nada) e o valor real do sessionStorage no client.
 * React troca os snapshots sem mismatch de hidratacao e sem flash da lista
 * antiga antes do card.
 */
export function WhatsAppLoginSyncGate({
  domain,
  children,
}: WhatsAppLoginSyncGateProps) {
  const router = useRouter();

  // null = ainda verificando (servidor / primeiro paint); boolean = decidido.
  const alreadySynced = useSyncExternalStore<boolean | null>(
    noopSubscribe,
    () => {
      try {
        return sessionStorage.getItem(whatsappLoginSyncKey(domain)) === "1";
      } catch {
        // sessionStorage bloqueado (modo privado): nao trava o usuario na tela.
        return true;
      }
    },
    () => null
  );

  if (alreadySynced === null) {
    return null;
  }

  if (!alreadySynced) {
    return (
      <WhatsAppConnectLoader
        domain={domain}
        mode="login"
        // O loader grava whatsappLoginSyncKey ao concluir; aqui so reexecutamos
        // o server component para pegar os chats recem-sincronizados. O refresh
        // re-renderiza este gate, o getSnapshot le a chave (agora "1") e a
        // lista e liberada — sem reabrir o card.
        onComplete={() => router.refresh()}
      />
    );
  }

  return <>{children}</>;
}
