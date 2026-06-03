"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ClinicorpCampaign } from "@/lib/clinicorp/types";

/**
 * Tela de configuracao da integracao Clinicorp.
 *
 * Fluxo:
 *  1. Carrega a config redigida (sem token) via GET .../config.
 *  2. Admin preenche Usuario + Token + Subscriber ID.
 *  3. "Testar conexao" chama .../test-connection e lista campanhas ativas
 *     (sem salvar) — serve de validacao e ja mostra quais campanhas existem.
 *  4. "Salvar" persiste em company_integrations via PUT .../config.
 *
 * O login do CRM continua por ramal+senha — esta integracao nao afeta isso.
 */
interface RedactedConfig {
  configured: boolean;
  status: "active" | "disabled" | "error" | null;
  username: string | null;
  subscriberId: string | null;
  hasToken: boolean;
  lastError: string | null;
  lastCheckAt: string | null;
}

export function ClinicorpIntegrationManager() {
  const { companyId, loading: companyLoading } = useCurrentCompany();

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [subscriberId, setSubscriberId] = useState("");
  const [config, setConfig] = useState<RedactedConfig | null>(null);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<ClinicorpCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/clinicorp/config?companyId=${companyId}`
      );
      const payload = (await res.json().catch(() => ({}))) as {
        config?: RedactedConfig;
        error?: string;
      };
      if (res.ok && payload.config) {
        setConfig(payload.config);
        setUsername(payload.config.username ?? "");
        setSubscriberId(payload.config.subscriberId ?? "");
        // Token nunca volta do servidor; deixamos em branco. Se ja existe,
        // o usuario so precisa reenviar para troca-lo.
        setToken("");
      }
    } catch {
      // silencioso — UI cai no estado "nao configurado"
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  async function handleTest() {
    setError(null);
    if (!companyId) return;
    if (!username.trim() || !token.trim() || !subscriberId.trim()) {
      setError(
        "Para testar, preencha usuário, token e subscriber ID (o token salvo não é reexibido)."
      );
      return;
    }
    setTesting(true);
    setCampaigns(null);
    try {
      const res = await fetch("/api/integrations/clinicorp/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          username: username.trim(),
          token: token.trim(),
          subscriberId: subscriberId.trim(),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: ClinicorpCampaign[];
        error?: string;
      };
      if (res.ok && payload.ok) {
        setCampaigns(payload.campaigns ?? []);
        toast.success("Conexão bem-sucedida!", {
          description: `${payload.campaigns?.length ?? 0} campanha(s) ativa(s) encontrada(s).`,
        });
      } else {
        setError(payload.error ?? "Falha ao testar a conexão.");
      }
    } catch {
      setError("Não foi possível testar a conexão agora. Tente novamente.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!companyId) return;
    if (!username.trim() || !token.trim() || !subscriberId.trim()) {
      setError("Usuário, token e subscriber ID são obrigatórios para salvar.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/clinicorp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          username: username.trim(),
          token: token.trim(),
          subscriberId: subscriberId.trim(),
          status: "active",
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && payload.ok) {
        toast.success("Integração Clinicorp salva!", {
          description:
            "Novos leads passarão a ser enviados automaticamente conforme o mapeamento de fontes.",
        });
        await fetchConfig();
      } else {
        setError(payload.error ?? "Falha ao salvar a integração.");
      }
    } catch {
      setError("Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    if (!companyId || !config?.configured) return;
    setSaving(true);
    try {
      // Reenvia as credenciais atuais com status disabled. Como o token nao
      // e reexibido, exigimos que o usuario o informe novamente para
      // desabilitar com seguranca — alternativamente poderiamos ter um
      // endpoint dedicado; aqui mantemos simples.
      if (!username.trim() || !token.trim() || !subscriberId.trim()) {
        setError(
          "Para desativar, reinforme as credenciais (o token não é reexibido por segurança)."
        );
        setSaving(false);
        return;
      }
      const res = await fetch("/api/integrations/clinicorp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          username: username.trim(),
          token: token.trim(),
          subscriberId: subscriberId.trim(),
          status: "disabled",
        }),
      });
      if (res.ok) {
        toast.success("Integração desativada.");
        await fetchConfig();
      }
    } finally {
      setSaving(false);
    }
  }

  if (companyLoading || loading) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status atual */}
      {config?.configured && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            config.status === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : config.status === "disabled"
                ? "border-gray-200 bg-gray-50 text-gray-600"
                : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          <p className="font-medium">
            {config.status === "error"
              ? "Integração com erro"
              : config.status === "disabled"
                ? "Integração desativada"
                : "Integração ativa"}
          </p>
          {config.status === "error" && config.lastError && (
            <p className="mt-0.5 text-xs">{config.lastError}</p>
          )}
          {config.status === "active" && (
            <p className="mt-0.5 text-xs text-green-600">
              Leads novos são enviados para a Clinicorp conforme o mapeamento
              de fontes em Configurações &gt; Fontes.
            </p>
          )}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          Credenciais da Clinicorp
        </h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Os dados ficam guardados com segurança e são usados apenas para
          enviar leads e criar pacientes na sua conta Clinicorp. Não afetam o
          login do CRM (que continua por ramal e senha).
        </p>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Usuário *"
              placeholder="usuário Clinicorp"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
            <Input
              label="Token *"
              type="password"
              placeholder={
                config?.hasToken ? "•••••••• (salvo)" : "token de API"
              }
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            <Input
              label="Subscriber ID *"
              placeholder="ID do assinante"
              value={subscriberId}
              onChange={(e) => setSubscriberId(e.target.value)}
              autoComplete="off"
            />
          </div>

          {config?.hasToken && (
            <p className="text-xs text-gray-400">
              Por segurança, o token salvo não é exibido. Deixe o campo de
              token preenchido apenas se quiser alterá-lo (reenvio é
              necessário ao salvar ou testar).
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              loading={testing}
            >
              Testar conexão
            </Button>
            <Button type="submit" loading={saving}>
              Salvar integração
            </Button>
            {config?.configured && config.status !== "disabled" && (
              <button
                type="button"
                onClick={handleDisable}
                disabled={saving}
                className="text-xs font-medium text-gray-500 hover:text-red-600"
              >
                Desativar
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Resultado do teste: campanhas ativas */}
      {campaigns && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">
            Campanhas ativas na Clinicorp
          </h3>
          {campaigns.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              Nenhuma campanha ativa encontrada. Crie uma campanha na Clinicorp
              para poder mapear suas fontes a ela.
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-gray-500">
                Use esses nomes ao mapear cada fonte em Configurações &gt;
                Fontes.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {campaigns.map((c) => (
                  <li
                    key={c.id ?? c.name}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
