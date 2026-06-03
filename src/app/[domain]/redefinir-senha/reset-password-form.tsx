"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ResetPasswordFormProps {
  domain: string;
}

const MIN_PASSWORD_LEN = 6;

/**
 * Formulario de "definir nova senha". E renderizado na pagina
 * `/<domain>/redefinir-senha`, que e o `redirectTo` do email enviado
 * pelo `/api/auth/forgot-password`.
 *
 * Fluxo:
 *  1. O Supabase coloca o token na URL como `?code=...` (PKCE) ou
 *     no hash `#access_token=...&type=recovery` (link legado).
 *  2. Trocamos o codigo por uma sessao via `exchangeCodeForSession`
 *     ou aceitamos a sessao ja setada pelo SDK quando vem no hash.
 *  3. Apos confirmar a sessao, mostramos os campos de nova senha.
 *  4. `updateUser({ password })` aplica a nova senha; redirecionamos
 *     para a tela de login.
 */
export function ResetPasswordForm({ domain }: ResetPasswordFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<"validating" | "ready" | "error">(
    "validating"
  );
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Troca o codigo da URL por uma sessao recovery. Sem isso, o
  // `updateUser` retorna 401 (sem sessao). Idempotente: se ja houver
  // sessao valida, passamos direto para o stage "ready".
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function run() {
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeErr } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) {
          if (!cancelled) {
            setTokenError(
              "Este link de recuperacao expirou ou ja foi usado. Solicite um novo."
            );
            setStage("error");
          }
          return;
        }
      }
      // Confirma sessao — quando o link vem por hash, o SDK ja
      // populou a sessao em background ao montar.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStage("ready");
      } else {
        setTokenError(
          "Sessao de recuperacao nao encontrada. Solicite um novo link."
        );
        setStage("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LEN} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("As senhas nao coincidem.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
      });
      if (updateErr) {
        setError(`Nao foi possivel salvar: ${updateErr.message}`);
        return;
      }
      // Encerra a sessao temporaria de recuperacao para forcar login
      // limpo com a nova senha.
      await supabase.auth.signOut();
      toast.success("Senha redefinida com sucesso!");
      router.push(`/${domain}`);
    } finally {
      setSaving(false);
    }
  }

  if (stage === "validating") {
    return (
      <div className="text-sm text-gray-500">Validando link de recuperacao…</div>
    );
  }

  if (stage === "error") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {tokenError ?? "Link invalido."}
        </div>
        <Link
          href={`/${domain}`}
          className="block text-sm font-medium text-blue-600 hover:underline"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Nova senha"
        type="password"
        placeholder="••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoFocus
        autoComplete="new-password"
      />
      <Input
        label="Confirmar nova senha"
        type="password"
        placeholder="••••••"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        autoComplete="new-password"
      />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button type="submit" loading={saving} className="w-full">
        Salvar nova senha
      </Button>
      <Link
        href={`/${domain}`}
        className="block text-center text-sm text-gray-600 hover:text-gray-900"
      >
        Cancelar
      </Link>
    </form>
  );
}
