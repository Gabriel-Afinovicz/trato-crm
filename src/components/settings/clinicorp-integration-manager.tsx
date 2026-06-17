"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type {
  ClinicorpBusiness,
  ClinicorpCampaign,
  ClinicorpProfessional,
} from "@/lib/clinicorp/types";

interface CrmDentist {
  id: string;
  name: string;
}

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

  // --- Configuracao de AGENDA (Clinic_BusinessId + mapa de dentistas) ---
  const [clinicBusinessId, setClinicBusinessId] = useState("");
  const [defaultDentistPersonId, setDefaultDentistPersonId] = useState("");
  const [dentistMap, setDentistMap] = useState<Record<string, string>>({});
  const [businesses, setBusinesses] = useState<ClinicorpBusiness[] | null>(null);
  const [professionals, setProfessionals] = useState<
    ClinicorpProfessional[] | null
  >(null);
  const [crmDentists, setCrmDentists] = useState<CrmDentist[]>([]);
  const [loadingAgendaLists, setLoadingAgendaLists] = useState(false);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [testingAppt, setTestingAppt] = useState(false);
  const [apptResult, setApptResult] = useState<Record<string, unknown> | null>(
    null
  );

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

  const fetchAgendaConfig = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(
        `/api/integrations/clinicorp/agenda-config?companyId=${companyId}`
      );
      const payload = (await res.json().catch(() => ({}))) as {
        clinicBusinessId?: string;
        defaultDentistPersonId?: string;
        dentistMap?: Record<string, string>;
      };
      if (res.ok) {
        setClinicBusinessId(payload.clinicBusinessId ?? "");
        setDefaultDentistPersonId(payload.defaultDentistPersonId ?? "");
        setDentistMap(payload.dentistMap ?? {});
      }
    } catch {
      // silencioso
    }
  }, [companyId]);

  useEffect(() => {
    void fetchAgendaConfig();
  }, [fetchAgendaConfig]);

  const loadAgendaLists = useCallback(async () => {
    if (!companyId) return;
    setAgendaError(null);
    setLoadingAgendaLists(true);
    try {
      const supabase = createClient();
      const [bizRes, profRes, dentRes] = await Promise.all([
        fetch(`/api/integrations/clinicorp/businesses?companyId=${companyId}`),
        fetch(
          `/api/integrations/clinicorp/professionals?companyId=${companyId}`
        ),
        supabase
          .from("users")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .eq("is_dentist", true)
          .neq("role", "super_admin")
          .order("name"),
      ]);
      const bizPayload = (await bizRes.json().catch(() => ({}))) as {
        businesses?: ClinicorpBusiness[];
        error?: string;
      };
      const profPayload = (await profRes.json().catch(() => ({}))) as {
        professionals?: ClinicorpProfessional[];
        error?: string;
      };
      if (bizRes.ok && bizPayload.businesses) {
        setBusinesses(bizPayload.businesses);
      } else {
        setBusinesses([]);
        if (bizPayload.error) setAgendaError(bizPayload.error);
      }
      setProfessionals(
        profRes.ok && profPayload.professionals ? profPayload.professionals : []
      );
      setCrmDentists((dentRes.data as CrmDentist[] | null) ?? []);
    } catch {
      setAgendaError("Não foi possível carregar clínicas/profissionais agora.");
    } finally {
      setLoadingAgendaLists(false);
    }
  }, [companyId]);

  async function handleSaveAgenda() {
    if (!companyId) return;
    if (!clinicBusinessId.trim()) {
      setAgendaError("Selecione a clínica que receberá os agendamentos.");
      return;
    }
    setSavingAgenda(true);
    setAgendaError(null);
    try {
      const res = await fetch("/api/integrations/clinicorp/agenda-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          clinicBusinessId: clinicBusinessId.trim(),
          defaultDentistPersonId: defaultDentistPersonId.trim(),
          dentistMap,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && payload.ok) {
        toast.success("Configuração da agenda salva!");
      } else {
        setAgendaError(
          payload.error ?? "Falha ao salvar a configuração da agenda."
        );
      }
    } catch {
      setAgendaError("Não foi possível salvar agora. Tente novamente.");
    } finally {
      setSavingAgenda(false);
    }
  }

  async function handleTestAppointment() {
    if (!companyId) return;
    setTestingAppt(true);
    setApptResult(null);
    setAgendaError(null);
    try {
      const res = await fetch("/api/integrations/clinicorp/test-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      setApptResult(payload);
      if (res.ok && payload.ok) {
        toast.success("Teste de agendamento concluído.", {
          description: payload.warning
            ? String(payload.warning)
            : "Veja o resultado abaixo.",
        });
      } else {
        toast.error("O teste de agendamento falhou.", {
          description:
            typeof payload.error === "string" ? payload.error : undefined,
        });
      }
    } catch {
      setAgendaError("Não foi possível executar o teste agora.");
    } finally {
      setTestingAppt(false);
    }
  }

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

      {/* Configuracao de AGENDA: clinica + mapa de dentistas + teste seguro */}
      {config?.configured && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">
            Agenda · Clinicorp
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Defina em qual clínica os agendamentos do CRM serão criados na
            Clinicorp e, opcionalmente, ligue cada profissional do CRM ao
            profissional correspondente na Clinicorp.
          </p>

          {agendaError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {agendaError}
            </div>
          )}

          {!businesses ? (
            <div className="mt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={loadAgendaLists}
                loading={loadingAgendaLists}
              >
                Carregar clínicas e profissionais
              </Button>
              {clinicBusinessId && (
                <p className="mt-2 text-xs text-gray-500">
                  Clínica configurada atualmente:{" "}
                  <span className="font-medium text-gray-700">
                    {clinicBusinessId}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Clínica que receberá os agendamentos *
                </label>
                <select
                  value={clinicBusinessId}
                  onChange={(e) => setClinicBusinessId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Selecione uma clínica…</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
                {businesses.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Nenhuma clínica retornada pela Clinicorp. Verifique as
                    credenciais e o subscriber ID.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Profissional padrão *
                </label>
                <select
                  value={defaultDentistPersonId}
                  onChange={(e) => setDefaultDentistPersonId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Selecione um profissional…</option>
                  {(professionals ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Usado quando o agendamento do CRM não tem um profissional
                  mapeado. A Clinicorp exige um profissional em todo
                  agendamento.
                </p>
              </div>

              {crmDentists.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    Mapeamento de profissionais (opcional)
                  </p>
                  <p className="mb-2 text-xs text-gray-400">
                    Sem mapeamento, o agendamento entra na agenda geral da
                    clínica.
                  </p>
                  <div className="space-y-2">
                    {crmDentists.map((d) => (
                      <div
                        key={d.id}
                        className="grid grid-cols-2 items-center gap-2"
                      >
                        <span className="truncate text-sm text-gray-700">
                          {d.name}
                        </span>
                        <select
                          value={dentistMap[d.id] ?? ""}
                          onChange={(e) =>
                            setDentistMap((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[d.id] = e.target.value;
                              else delete next[d.id];
                              return next;
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">— sem mapeamento —</option>
                          {(professionals ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={handleSaveAgenda}
                  loading={savingAgenda}
                >
                  Salvar configuração da agenda
                </Button>
                <button
                  type="button"
                  onClick={loadAgendaLists}
                  disabled={loadingAgendaLists}
                  className="text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  Recarregar listas
                </button>
              </div>
            </div>
          )}

          {/* Validacao SEGURA em conta real */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">
              Validar agendamento em conta real (seguro)
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Cria um agendamento de teste chamado{" "}
              <span className="font-medium">“TESTE CRM - PODE EXCLUIR”</span> a
              90 dias da data atual e o cancela em seguida, só para confirmar
              que a integração cria de fato na agenda. Caso aconteça algum erro, copie a resposta da Clinicorp e envie para o suporte.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleTestAppointment}
                loading={testingAppt}
                disabled={!clinicBusinessId}
              >
                Testar agendamento
              </Button>
              {!clinicBusinessId && (
                <p className="mt-2 text-xs text-amber-600">
                  Selecione e salve a clínica antes de testar.
                </p>
              )}
            </div>

            {apptResult && (
              <div className="mt-4 space-y-2">
                {typeof apptResult.warning === "string" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    {apptResult.warning}
                  </div>
                )}
                {typeof apptResult.error === "string" && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {apptResult.error}
                  </div>
                )}
                <details className="rounded-lg border border-gray-200 bg-gray-50">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700">
                    Ver resposta técnica da Clinicorp
                  </summary>
                  <pre className="overflow-x-auto px-3 pb-3 text-[11px] leading-relaxed text-gray-600">
                    {JSON.stringify(apptResult, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </section>
      )}

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
