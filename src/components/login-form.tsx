"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ComingSoonOverlay } from "@/components/ui/coming-soon";

interface LoginFormProps {
  domain: string;
}

export function LoginForm({ domain }: LoginFormProps) {
  const router = useRouter();
  const [ramal, setRamal] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotRamal, setForgotRamal] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    const valor = forgotRamal.trim() || ramal.trim();
    if (!valor) {
      toast.error("Informe o ramal para receber o link.");
      return;
    }
    setForgotSending(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, ramal: valor }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        hint?: "sent" | "no_email" | "send_failed" | "unexpected";
      };

      // Sempre devolvemos uma resposta uniforme para nao revelar se
      // o ramal existe — mas conseguimos diferenciar a copy quando
      // o hint indica que nenhum email esta cadastrado.
      if (payload.hint === "no_email") {
        toast.info("Nenhum email vinculado a este ramal.", {
          description:
            "Para recuperar a senha, peca ao administrador da sua organizacao para cadastrar um email ao seu ramal em Configuracoes > Membros.",
          duration: 9000,
        });
      } else {
        toast.success("Email enviado.", {
          description:
            "Se o ramal existir e tiver email cadastrado, voce recebera o link em instantes. Confira tambem a caixa de spam.",
          duration: 7000,
        });
      }
      setForgotOpen(false);
      setForgotRamal("");
    } catch {
      toast.error("Falha ao processar a solicitacao. Tente novamente.");
    } finally {
      setForgotSending(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const { data: resolveData, error: resolveError } = await supabase.rpc(
        "resolve_login",
        {
          p_domain: domain,
          p_extension_number: ramal,
        }
      );

      if (resolveError) {
        throw new Error(`Organização ou ramal não encontrado. (${resolveError.message})`);
      }

      let authEmail: string;

      if (Array.isArray(resolveData) && resolveData.length > 0) {
        authEmail = (resolveData[0] as { auth_email: string }).auth_email;
      } else if (
        resolveData &&
        typeof resolveData === "object" &&
        "auth_email" in resolveData
      ) {
        authEmail = (resolveData as { auth_email: string }).auth_email;
      } else {
        throw new Error("Ramal não encontrado para esta organização.");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: senha,
      });

      if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
          throw new Error("Ramal ou senha incorretos.");
        }
        throw new Error(`Erro no login: ${signInError.message}`);
      }

      // Tela inicial do CRM: a aba executiva "Analítico" do Dashboard.
      router.push(`/${domain}/dashboard?tab=analitico`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="Ramal"
        type="text"
        placeholder="Ex: 1001"
        value={ramal}
        onChange={(e) => setRamal(e.target.value)}
        required
        autoComplete="username"
        autoFocus
      />

      <Input
        label="Senha"
        type="password"
        placeholder="••••••"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        required
        autoComplete="current-password"
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" loading={loading} className="w-full" size="lg">
        Entrar
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            setForgotRamal(ramal);
            setForgotOpen((v) => !v);
          }}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          {forgotOpen ? "Cancelar recuperação" : "Esqueci minha senha"}
        </button>
      </div>

      {forgotOpen && (
        <ComingSoonOverlay
          active
          title="Recuperação de senha em breve"
          description="Em uma próxima atualização você poderá redefinir sua senha por email. Por enquanto, peça ao administrador da sua organização para definir uma nova senha em Configurações > Membros."
        >
          <div
            onSubmit={handleForgotSubmit}
            role="group"
            aria-label="Recuperação de senha"
            className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4"
          >
            <p className="text-xs text-gray-700">
              Informe o ramal cadastrado. Enviaremos um link de recuperacao
              para o email associado a esse ramal. Se o seu ramal ainda nao
              tem email cadastrado, peca ao administrador da organizacao
              para adicionar um em Configuracoes &gt; Membros.
            </p>
            <Input
              type="text"
              placeholder="Seu ramal"
              value={forgotRamal}
              onChange={(e) => setForgotRamal(e.target.value)}
              autoComplete="username"
            />
            <Button
              type="button"
              onClick={handleForgotSubmit}
              loading={forgotSending}
              className="w-full"
            >
              Enviar link de recuperação
            </Button>
          </div>
        </ComingSoonOverlay>
      )}
    </form>
  );
}
