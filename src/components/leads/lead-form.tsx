"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ManagedSelect } from "@/components/ui/managed-select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useAuth } from "@/hooks/use-auth";
import {
  CustomFieldRenderer,
  isCustomFieldEmpty,
} from "@/components/leads/lead-custom-fields";
import { AddCustomFieldForm } from "@/components/settings/add-custom-field-form";
import { AvailabilityPanel } from "@/components/agenda/availability-panel";
import type {
  CustomField,
  CustomFieldValue,
  Lead,
  LeadSource,
  ProcedureType,
  Room,
  Sector,
  Tag,
  User,
} from "@/lib/types/database";

const TAG_PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

interface LeadFormProps {
  domain: string;
  lead?: Lead | null;
  submitMode?: "navigate" | "stay";
  /**
   * "single"      → 1 coluna (default, mantido para modal/edicao).
   * "two-column"  → 2 colunas em telas >= lg, ideal para pagina /leads/new
   *                 ocupar o espaco horizontal disponivel.
   */
  layout?: "single" | "two-column";
  /**
   * Telefone pre-preenchido na criacao (ex.: vindo de uma conversa do
   * WhatsApp em /conversas). Ignorado em modo edicao (usa o do lead).
   */
  initialPhone?: string;
  /**
   * Quando informado, apos criar o lead vinculamos esta conversa
   * (`whatsapp_chats.id`) ao novo lead — fluxo "Criar lead" a partir do
   * painel de contato das Conversas.
   */
  linkChatId?: string;
  onSaved?: (lead: Lead) => void;
  onCancelAction?: () => void;
}

interface AgendaSettings {
  default_appointment_minutes: number;
  allow_overlap: boolean;
}

const DEFAULT_AGENDA_SETTINGS: AgendaSettings = {
  default_appointment_minutes: 30,
  allow_overlap: false,
};

const AVAILABILITY_MESSAGES: Record<string, string> = {
  closed:
    "O profissional nao esta disponivel neste horario (fora do expediente da organizacao).",
  lunch:
    "O horario escolhido cai durante o intervalo de almoco da organizacao.",
  holiday: "Esta data e feriado da organizacao.",
  block:
    "Este intervalo esta bloqueado na agenda (profissional, sala ou bloqueio geral).",
  appointment:
    "Ja existe outro agendamento para este profissional ou sala neste intervalo.",
};

function Section({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.24 4.38a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}

// Datetime-local input precisa de "YYYY-MM-DDTHH:mm" no fuso local.
function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutesIso(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function LeadForm({
  domain,
  lead,
  submitMode = "navigate",
  layout = "single",
  initialPhone,
  linkChatId,
  onSaved,
  onCancelAction,
}: LeadFormProps) {
  const router = useRouter();
  const { companyId } = useCurrentCompany();
  const { profile } = useAuth();
  const isEditing = !!lead;
  const canManageFields =
    profile?.role === "admin" || profile?.role === "super_admin";
  const [showAddFieldForm, setShowAddFieldForm] = useState(false);

  const [name, setName] = useState(lead?.name || "");
  const [phone, setPhone] = useState(() => {
    const raw = lead?.phone || initialPhone || "";
    return formatPhone(raw);
  });
  // Email opcional — usado para enriquecer integracoes (ex.: Clinicorp) e
  // futuras notificacoes. NAO participa de login/autenticacao.
  const [email, setEmail] = useState(lead?.email || "");
  const [sourceId, setSourceId] = useState(lead?.source_id || "");
  const [sectorId, setSectorId] = useState(lead?.sector_id || "");
  const [assignedTo, setAssignedTo] = useState(lead?.assigned_to || "");
  const [notes, setNotes] = useState(lead?.notes || "");

  // Valores monetarios do fechamento (alimentam o Ticket Medio no
  // painel Analitico). Mantemos como string para preservar campo vazio
  // como "nao informado" — convertemos para number so no submit.
  const [closingValue, setClosingValue] = useState<string>(
    lead?.closing_value != null ? String(lead.closing_value) : ""
  );
  const [downPayment, setDownPayment] = useState<string>(
    lead?.down_payment != null ? String(lead.down_payment) : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Quando preenchido, o submit foi pausado porque ja existe lead com este
  // telefone na organizacao. O usuario decide: abrir o lead existente,
  // criar mesmo assim (segue o submit ignorando a checagem) ou cancelar.
  const [duplicateConfirm, setDuplicateConfirm] = useState<
    { id: string; name: string } | null
  >(null);

  const [sources, setSources] = useState<LeadSource[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  // Operadores (admin + operator) ativos da clinica — usados pelo campo
  // "Operador responsavel". Super_admin nao aparece (e cross-clinic).
  const [operators, setOperators] = useState<
    Pick<User, "id" | "name" | "role">[]
  >([]);

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [existingCustomValues, setExistingCustomValues] = useState<
    CustomFieldValue[]
  >([]);
  const [missingCustomFields, setMissingCustomFields] = useState<string[]>([]);

  // Tags da organizacao + selecao do lead. `initialTagIds` guarda o
  // snapshot do banco (para fazer diff insert/delete no submit).
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [initialTagIds, setInitialTagIds] = useState<string[]>([]);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_PRESET_COLORS[0]);
  const [newTagSaving, setNewTagSaving] = useState(false);
  const [newTagError, setNewTagError] = useState<string | null>(null);

  // Bloco "Ja agendou?" — appearance opcional, recolhido por padrao.
  // No modo edicao nao oferecemos, porque a relacao lead<->appointment
  // se mantem independente apos a criacao (decisao do plano).
  const [agendaSettings, setAgendaSettings] = useState<AgendaSettings>(
    DEFAULT_AGENDA_SETTINGS
  );
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [dentists, setDentists] = useState<
    Pick<User, "id" | "name" | "is_dentist">[]
  >([]);
  const [procedures, setProcedures] = useState<ProcedureType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scheduleStartsAt, setScheduleStartsAt] = useState<string>(() =>
    toDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [scheduleDuration, setScheduleDuration] = useState<number>(
    DEFAULT_AGENDA_SETTINGS.default_appointment_minutes
  );
  const [scheduleDentistId, setScheduleDentistId] = useState<string>("");
  const [scheduleRoomId, setScheduleRoomId] = useState<string>("");
  const [scheduleProcedureId, setScheduleProcedureId] = useState<string>("");
  const [scheduleNotes, setScheduleNotes] = useState<string>("");
  const [confirmOverlap, setConfirmOverlap] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const leadId = lead?.id ?? null;

    async function loadOptions() {
      const supabase = createClient();

      const [
        sourcesRes,
        sectorsRes,
        customFieldsRes,
        customValuesRes,
        dentistsRes,
        proceduresRes,
        roomsRes,
        operatorsRes,
        tagsRes,
        leadTagsRes,
      ] = await Promise.all([
        supabase
          .from("lead_sources")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("sectors")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("custom_fields")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("display_order"),
        leadId
          ? supabase
              .from("custom_field_values")
              .select("*")
              .eq("company_id", companyId!)
              .eq("lead_id", leadId)
          : Promise.resolve({ data: [] as CustomFieldValue[] }),
        // "Profissional" sao todos os usuarios marcados como dentista
        // (is_dentist) — o backend cuida da visibilidade.
        supabase
          .from("users")
          .select("id, name, is_dentist")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .eq("is_dentist", true)
          .order("name"),
        supabase
          .from("procedure_types")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("rooms")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("users")
          .select("id, name, role")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .in("role", ["admin", "operator"])
          .order("name"),
        supabase
          .from("tags")
          .select("*")
          .eq("company_id", companyId!)
          .order("name"),
        leadId
          ? supabase
              .from("lead_tags")
              .select("tag_id")
              .eq("lead_id", leadId)
          : Promise.resolve({ data: [] as { tag_id: string }[] }),
      ]);

      if (sourcesRes.data)
        setSources(sourcesRes.data as unknown as LeadSource[]);
      if (sectorsRes.data) {
        const sectorList = sectorsRes.data as unknown as Sector[];
        setSectors(sectorList);
        // Lead novo entra por padrao no setor de entrada (CRC Leads).
        // Em edicao mantemos o setor atual do lead.
        if (!lead?.sector_id) {
          const entrySector = sectorList.find(
            (s) => s.system_key === "crc_leads"
          );
          if (entrySector) {
            setSectorId((prev) => prev || entrySector.id);
          }
        }
      }

      const fieldsList =
        (customFieldsRes.data as unknown as CustomField[]) || [];
      const valuesList =
        (customValuesRes.data as unknown as CustomFieldValue[]) || [];

      setCustomFields(fieldsList);
      setExistingCustomValues(valuesList);

      const valuesMap: Record<string, string> = {};
      valuesList.forEach((v) => {
        valuesMap[v.custom_field_id] = v.value || "";
      });
      setCustomValues(valuesMap);

      setDentists(
        (dentistsRes.data as
          | Pick<User, "id" | "name" | "is_dentist">[]
          | null) ?? []
      );
      setProcedures((proceduresRes.data as ProcedureType[] | null) ?? []);
      setRooms((roomsRes.data as Room[] | null) ?? []);
      setOperators(
        (operatorsRes.data as
          | Pick<User, "id" | "name" | "role">[]
          | null) ?? []
      );

      setTags((tagsRes.data as unknown as Tag[] | null) ?? []);
      const assigned =
        (leadTagsRes.data as { tag_id: string }[] | null)?.map(
          (r) => r.tag_id
        ) ?? [];
      setInitialTagIds(assigned);
      setSelectedTagIds(assigned);
    }

    loadOptions();

    // Carrega configuracoes de Agenda (padrao 30min, sem overlap).
    fetch(`/api/clinic/agenda-settings?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { settings: AgendaSettings } | null) => {
        if (p?.settings) {
          setAgendaSettings(p.settings);
          setScheduleDuration(p.settings.default_appointment_minutes);
        }
      })
      .catch(() => {});
  }, [companyId, lead?.id, lead?.sector_id]);

  function handleCustomFieldChange(fieldId: string, val: string) {
    setCustomValues((prev) => ({ ...prev, [fieldId]: val }));
    if (missingCustomFields.includes(fieldId)) {
      setMissingCustomFields((prev) => prev.filter((id) => id !== fieldId));
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }

  async function handleCreateTagInline() {
    if (!companyId) return;
    const name = newTagName.trim();
    if (!name) return;

    if (
      tags.some((t) => t.name.toLowerCase() === name.toLowerCase())
    ) {
      setNewTagError("Ja existe uma tag com esse nome.");
      return;
    }

    setNewTagError(null);
    setNewTagSaving(true);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("tags")
      .insert({ name, color: newTagColor, company_id: companyId })
      .select("*")
      .single();

    if (insertError || !data) {
      setNewTagError(insertError?.message ?? "Erro ao criar tag.");
      setNewTagSaving(false);
      return;
    }

    const created = data as unknown as Tag;
    setTags((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    setSelectedTagIds((prev) => [...prev, created.id]);
    setNewTagName("");
    setNewTagColor(TAG_PRESET_COLORS[0]);
    setShowNewTagForm(false);
    setNewTagSaving(false);
  }

  async function persistLeadTags(targetLeadId: string) {
    const initial = new Set(initialTagIds);
    const selected = new Set(selectedTagIds);
    const toAdd = [...selected].filter((id) => !initial.has(id));
    const toRemove = [...initial].filter((id) => !selected.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) return;

    const supabase = createClient();
    if (toAdd.length > 0) {
      await supabase.from("lead_tags").insert(
        toAdd.map((tagId) => ({ lead_id: targetLeadId, tag_id: tagId }))
      );
    }
    if (toRemove.length > 0) {
      await supabase
        .from("lead_tags")
        .delete()
        .eq("lead_id", targetLeadId)
        .in("tag_id", toRemove);
    }
    setInitialTagIds(selectedTagIds);
  }

  function handleProcedureChange(id: string) {
    setScheduleProcedureId(id);
    const proc = procedures.find((p) => p.id === id);
    if (proc) setScheduleDuration(proc.default_duration_minutes);
  }

  async function persistCustomFieldValues(targetLeadId: string) {
    if (customFields.length === 0 || !companyId) return;
    const supabase = createClient();

    const promises = customFields.map((field) => {
      const val = customValues[field.id] ?? "";
      const existing = existingCustomValues.find(
        (v) => v.custom_field_id === field.id
      );

      if (existing) {
        if (existing.value !== val) {
          return supabase
            .from("custom_field_values")
            .update({ value: val || null })
            .eq("id", existing.id);
        }
      } else if (val) {
        return supabase.from("custom_field_values").insert({
          lead_id: targetLeadId,
          custom_field_id: field.id,
          company_id: companyId,
          value: val,
        });
      }
      return null;
    });

    await Promise.all(promises.filter(Boolean));

    const { data: refreshed } = await supabase
      .from("custom_field_values")
      .select("*")
      .eq("lead_id", targetLeadId);
    if (refreshed) {
      setExistingCustomValues(refreshed as unknown as CustomFieldValue[]);
    }
  }

  // Procura por outro lead com o mesmo telefone na organizacao. Usa a RPC
  // `find_lead_by_phone` (normaliza formato no banco) e, se achar, faz
  // um SELECT pelo nome para mostrar ao usuario. Em modo edicao, ignora
  // o proprio lead. Retorna null quando seguro para prosseguir.
  async function checkPhoneDuplicate(): Promise<
    { id: string; name: string } | null
  > {
    const phoneTrimmed = phone.trim();
    if (!phoneTrimmed || !companyId) return null;
    try {
      const supabase = createClient();
      const { data: foundId, error: rpcError } = await supabase.rpc(
        "find_lead_by_phone",
        { p_company_id: companyId, p_phone: phoneTrimmed }
      );
      if (rpcError || !foundId || typeof foundId !== "string") return null;
      if (lead && foundId === lead.id) return null;
      const { data: row } = await supabase
        .from("leads")
        .select("id, name")
        .eq("id", foundId)
        .maybeSingle();
      if (!row) return null;
      const typed = row as { id: string; name: string };
      return { id: typed.id, name: typed.name };
    } catch {
      // Falha na checagem nao deve bloquear o submit — segue normalmente.
      return null;
    }
  }

  // Atalho Ctrl/Cmd+Enter salva o lead de qualquer campo do formulario,
  // sem o usuario precisar rolar ate o botao. Fica no nivel do <form> para
  // funcionar mesmo com o foco dentro de inputs/textarea.
  function handleFormKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!saving) {
        void handleSubmit({ preventDefault() {} } as unknown as FormEvent);
      }
    }
  }

  async function handleSubmit(
    e: FormEvent,
    options: { skipDuplicateCheck?: boolean } = {}
  ) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("O nome e obrigatorio.");
      return;
    }

    if (!isEditing && !companyId) {
      setError("Nao foi possivel identificar a empresa. Tente recarregar a pagina.");
      return;
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError("O e-mail informado e invalido.");
        return;
      }
    }

    let normalizedPhone: string | null = null;
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        setError("O telefone deve ter entre 10 e 15 digitos (com DDD).");
        return;
      }
      if (digits.length === 10 || digits.length === 11) {
        normalizedPhone = `+55${digits}`;
      } else {
        normalizedPhone = `+${digits}`;
      }
    }

    // Telefone duplicado: pausa o submit e mostra modal de confirmacao.
    // Quando o usuario escolhe "Criar mesmo assim", chamamos novamente
    // este handler com `skipDuplicateCheck: true`.
    if (!options.skipDuplicateCheck) {
      const dup = await checkPhoneDuplicate();
      if (dup) {
        setDuplicateConfirm(dup);
        return;
      }
    }

    const missing = customFields
      .filter((f) => f.is_required && isCustomFieldEmpty(f, customValues[f.id]))
      .map((f) => f.id);
    if (missing.length > 0) {
      setMissingCustomFields(missing);
      const labels = customFields
        .filter((f) => missing.includes(f.id))
        .map((f) => f.name)
        .join(", ");
      setError(`Preencha os campos obrigatorios: ${labels}.`);
      return;
    }
    setMissingCustomFields([]);

    // Strings vazias viram null para o banco — `numeric(12,2)` aceita nulo.
    const parseMoney = (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const n = Number(trimmed.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const basePayload = {
      name: name.trim(),
      phone: normalizedPhone,
      email: email.trim() || null,
      source_id: sourceId || null,
      sector_id: sectorId || null,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      closing_value: parseMoney(closingValue),
      down_payment: parseMoney(downPayment),
    };

    setSaving(true);

    if (isEditing && lead) {
      // Edicao continua via update direto: preserva campos legados que
      // nao sao mais exibidos no form (birthdate/gender/guardian_*).
      const supabase = createClient();
      const { data: updated, error: updateError } = await supabase
        .from("leads")
        .update(basePayload)
        .eq("id", lead.id)
        .select("*")
        .single();

      if (updateError) {
        const msg = `Erro ao atualizar: ${updateError.message}`;
        setError(msg);
        toast.error("Nao foi possivel salvar o lead", {
          description: updateError.message,
        });
        setSaving(false);
        return;
      }

      await persistCustomFieldValues(lead.id);
      await persistLeadTags(lead.id);

      if (submitMode === "stay") {
        setSaving(false);
        toast.success("Lead atualizado");
        onSaved?.((updated as unknown as Lead) ?? { ...lead, ...basePayload });
        return;
      }

      toast.success("Lead atualizado");
      router.push(`/${domain}/leads/${lead.id}`);
      return;
    }

    // Criacao via RPC transacional. Quando "Ja agendou?" estiver ligado,
    // monta o bloco appointment; caso contrario passa null.
    let appointmentPayload: Record<string, unknown> | null = null;
    if (scheduleEnabled) {
      if (!scheduleStartsAt) {
        setError("Informe data e hora do agendamento.");
        setSaving(false);
        return;
      }
      const startsIso = new Date(scheduleStartsAt).toISOString();
      const endsIso = addMinutesIso(startsIso, scheduleDuration);
      appointmentPayload = {
        dentist_id: scheduleDentistId || null,
        room_id: scheduleRoomId || null,
        procedure_type_id: scheduleProcedureId || null,
        starts_at: startsIso,
        ends_at: endsIso,
        notes: scheduleNotes.trim() || null,
        visibility: scheduleDentistId ? "assigned_dentist" : "clinic_wide",
        allow_overlap: agendaSettings.allow_overlap && confirmOverlap,
      };
    }

    const customFieldValuesPayload = customFields
      .map((f) => ({
        custom_field_id: f.id,
        value: customValues[f.id] ?? "",
      }))
      .filter((v) => v.value !== "");

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        lead: basePayload,
        appointment: appointmentPayload,
        custom_field_values: customFieldValuesPayload,
      }),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
      };
      if (payload.error === "AVAILABILITY" && payload.reason) {
        // Overlap so e tratado como warning quando allow_overlap esta
        // ligado E o usuario ainda nao confirmou. Mostra o checkbox.
        if (payload.reason === "appointment" && agendaSettings.allow_overlap) {
          setConfirmOverlap(false);
          setError(
            "Ja existe agendamento neste horario para o mesmo profissional ou sala. Marque 'Confirmar mesmo assim' abaixo para prosseguir."
          );
        } else {
          const msg =
            AVAILABILITY_MESSAGES[payload.reason] ?? "Horario indisponivel.";
          setError(msg);
          toast.error("Horario indisponivel", { description: msg });
        }
      } else {
        const msg = payload.error ?? "Erro ao criar lead.";
        setError(msg);
        toast.error("Nao foi possivel criar o lead", { description: msg });
      }
      setSaving(false);
      return;
    }

    const result = (await res.json()) as {
      lead_id?: string;
      appointment_id?: string | null;
    };
    const newId = result.lead_id;
    if (newId && selectedTagIds.length > 0) {
      await persistLeadTags(newId);
    }
    // Vincula a conversa de origem (WhatsApp) ao lead recem-criado, quando
    // o form foi aberto a partir do painel de contato em /conversas.
    if (newId && linkChatId) {
      const supabase = createClient();
      await supabase
        .from("whatsapp_chats")
        .update({ lead_id: newId })
        .eq("id", linkChatId);
    }
    setSaving(false);
    toast.success(
      scheduleEnabled ? "Lead criado e agendado" : "Lead criado"
    );
    // Notifica a Sidebar para atualizar o badge "novos leads (24h)"
    // sem ter que esperar o polling de 60s.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("crm:lead-created"));
    }
    router.push(newId ? `/${domain}/leads/${newId}` : `/${domain}/leads`);
  }

  // Em layout "two-column", as secoes ficam distribuidas entre duas
  // colunas (esquerda = identificacao + financeiro + agendamento; direita
  // = campos adicionais + observacoes). Em "single", tudo cai em uma so.
  const identificationSection = (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Identificação
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Dados básicos para registrar o lead no pipeline.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <Input
          label="Nome *"
          placeholder="Nome do lead"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Telefone"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
          />
          <Input
            label="Email (opcional)"
            type="email"
            tooltip="Usado para integrações (ex.: Clinicorp) e futuras notificações. Não é usado para login."
            placeholder="email@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Operador responsável"
            tooltip="Usuario que ficara responsavel por atender este lead. Admins e operadores ativos da organizacao podem ser atribuidos."
            placeholder={
              operators.length === 0
                ? "Nenhum operador cadastrado"
                : "Sem operador responsável"
            }
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={operators.length === 0}
            options={operators.map((op) => ({
              value: op.id,
              label:
                op.role === "admin" ? `${op.name} (Admin)` : op.name,
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ManagedSelect<LeadSource>
            label="Fonte"
            placeholder="Selecione a fonte"
            value={sourceId}
            onChange={setSourceId}
            items={sources}
            createLabel="Criar nova fonte"
            emptyLabel="Nenhuma fonte cadastrada"
            onCreate={async ({ name }) => {
              if (!companyId) throw new Error("Empresa nao identificada.");
              const supabase = createClient();
              const { data, error: insertError } = await supabase
                .from("lead_sources")
                .insert({ name, company_id: companyId })
                .select("*")
                .single();
              if (insertError || !data) {
                throw new Error(insertError?.message || "Erro ao criar fonte.");
              }
              const created = data as unknown as LeadSource;
              setSources((prev) =>
                [...prev, created].sort((a, b) =>
                  a.name.localeCompare(b.name)
                )
              );
              return created;
            }}
            onUpdate={async (id, { name }) => {
              const supabase = createClient();
              const { data, error: updateError } = await supabase
                .from("lead_sources")
                .update({ name })
                .eq("id", id)
                .select("*")
                .single();
              if (updateError || !data) {
                throw new Error(
                  updateError?.message || "Erro ao atualizar fonte."
                );
              }
              const updated = data as unknown as LeadSource;
              setSources((prev) =>
                prev
                  .map((s) => (s.id === id ? updated : s))
                  .sort((a, b) => a.name.localeCompare(b.name))
              );
              return updated;
            }}
          />
          <div>
            <Select
              label="Setor"
              tooltip="Departamento ou area que agrupa membros e leads — ex: Comercial, Suporte, Captacao."
              placeholder={
                sectors.length === 0
                  ? "Nenhum setor cadastrado"
                  : "Selecione o setor"
              }
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              options={sectors.map((s) => ({ value: s.id, label: s.name }))}
              disabled={sectors.length === 0}
            />
            {sectors.length === 0 && (
              <p className="mt-1 text-[11px] text-gray-500">
                Cadastre setores em Configurações &rsaquo; Equipe &rsaquo;
                Setores para organizar a distribuição dos leads.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const financialSection = (
    <Section
      title="Financeiro"
      description="Valores de fechamento e entrada — usados no Ticket Médio do painel Analítico."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Valor de fechamento (R$)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="0,00"
          value={closingValue}
          onChange={(e) => setClosingValue(e.target.value)}
        />
        <Input
          label="Valor de entrada (R$)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="0,00"
          value={downPayment}
          onChange={(e) => setDownPayment(e.target.value)}
        />
      </div>
    </Section>
  );

  const customFieldsSection =
    customFields.length > 0 || canManageFields ? (
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start justify-between px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Campos adicionais
              </h3>
              <p className="mt-0.5 text-xs text-blue-600">
                Campos extras criados pela organizacao
              </p>
            </div>
            {customFields.length > 0 && canManageFields && !showAddFieldForm && (
              <button
                type="button"
                onClick={() => setShowAddFieldForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                <svg
                  className="h-3.5 w-3.5"
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
                Novo campo
              </button>
            )}
          </div>

          <div className="border-t border-gray-100 px-5 py-4 space-y-4">
            {showAddFieldForm && companyId && (
              <AddCustomFieldForm
                companyId={companyId}
                currentFieldCount={customFields.length}
                onCreated={async () => {
                  setShowAddFieldForm(false);
                  const supabase = createClient();
                  const { data } = await supabase
                    .from("custom_fields")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("is_active", true)
                    .order("display_order");
                  if (data) setCustomFields(data as unknown as CustomField[]);
                }}
                onCancel={() => setShowAddFieldForm(false)}
              />
            )}

            {missingCustomFields.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Preencha os campos obrigatorios:{" "}
                {customFields
                  .filter((f) => missingCustomFields.includes(f.id))
                  .map((f) => f.name)
                  .join(", ")}
                .
              </div>
            )}

            {customFields.length === 0 && !showAddFieldForm && (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  <svg
                    className="h-6 w-6 text-blue-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </div>
                <p className="max-w-xs text-sm text-gray-500">
                  {canManageFields
                    ? "Nenhum campo personalizado configurado para esta organizacao."
                    : "Nenhum campo personalizado configurado. Peca ao admin para cadastrar."}
                </p>
                {canManageFields && (
                  <button
                    type="button"
                    onClick={() => setShowAddFieldForm(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                    Criar campo personalizado
                  </button>
                )}
              </div>
            )}

            <div className="space-y-3">
              {customFields.map((field) => (
                <CustomFieldRenderer
                  key={field.id}
                  field={field}
                  value={customValues[field.id] || ""}
                  onChange={(val) => handleCustomFieldChange(field.id, val)}
                  hasError={missingCustomFields.includes(field.id)}
                />
              ))}
            </div>
          </div>
        </section>
    ) : null;

  const observationsSection = (
    <Section title="Observações gerais" defaultOpen>
      <Textarea
        label=""
        placeholder="Anotações sobre o lead..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
      />
    </Section>
  );

  const tagsSection = (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6h.008v.008H6V6Z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Tags</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Etiquetas rapidas para classificar e filtrar.
            </p>
          </div>
        </div>
        {canManageFields && !showNewTagForm && (
          <button
            type="button"
            onClick={() => {
              setShowNewTagForm(true);
              setNewTagError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <svg
              className="h-3.5 w-3.5"
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
            Nova tag
          </button>
        )}
      </header>

      {tags.length === 0 && !showNewTagForm ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <p className="text-xs text-gray-500">
            {canManageFields
              ? "Nenhuma tag cadastrada nesta organizacao."
              : "Nenhuma tag cadastrada. Peca ao admin para criar."}
          </p>
          {canManageFields && (
            <button
              type="button"
              onClick={() => {
                setShowNewTagForm(true);
                setNewTagError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <svg
                className="h-3.5 w-3.5"
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
              Criar primeira tag
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selected
                    ? "border-transparent text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
                style={selected ? { backgroundColor: tag.color } : undefined}
              >
                <span
                  className={`h-2 w-2 rounded-full ${selected ? "bg-white/70" : ""}`}
                  style={!selected ? { backgroundColor: tag.color } : undefined}
                />
                {tag.name}
                {selected && (
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showNewTagForm && (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <input
            type="text"
            placeholder="Nome da tag (ex: VIP, Indicacao, Urgente)"
            value={newTagName}
            onChange={(e) => {
              setNewTagName(e.target.value);
              if (newTagError) setNewTagError(null);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {TAG_PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                className={`h-6 w-6 rounded-full transition-transform ${
                  newTagColor === c
                    ? "scale-110 ring-2 ring-gray-400 ring-offset-1"
                    : ""
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
          {newTagError && (
            <p className="text-xs text-red-600">{newTagError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowNewTagForm(false);
                setNewTagName("");
                setNewTagColor(TAG_PRESET_COLORS[0]);
                setNewTagError(null);
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateTagInline}
              disabled={newTagSaving || !newTagName.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {newTagSaving ? "Criando..." : "Criar tag"}
            </button>
          </div>
        </div>
      )}
    </section>
  );

  const scheduleSection = !isEditing ? (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <label className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Ja agendou?
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Ao marcar, criamos o agendamento e movemos o lead direto para
                a etapa &quot;Agendado&quot; do pipeline.
              </p>
            </div>
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          {scheduleEnabled && (
            <div className="space-y-3 border-t border-gray-100 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Data e hora *
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleStartsAt}
                    onChange={(e) => setScheduleStartsAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Duracao (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={scheduleDuration}
                    onChange={(e) =>
                      setScheduleDuration(
                        parseInt(e.target.value, 10) ||
                          agendaSettings.default_appointment_minutes
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Profissional
                  </label>
                  <select
                    value={scheduleDentistId}
                    onChange={(e) => setScheduleDentistId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Sem profissional</option>
                    {dentists.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {dentists.length === 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Cadastre membros como profissionais em Configuracoes &rsaquo;
                      Equipe.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Sala
                  </label>
                  <select
                    value={scheduleRoomId}
                    onChange={(e) => setScheduleRoomId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Sem sala</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Serviço
                </label>
                <select
                  value={scheduleProcedureId}
                  onChange={(e) => handleProcedureChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Nenhum</option>
                  {procedures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.default_duration_minutes}min
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Observacoes do agendamento
                </label>
                <textarea
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Anotacoes para a agenda..."
                />
              </div>

              {agendaSettings.allow_overlap && (
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={confirmOverlap}
                    onChange={(e) => setConfirmOverlap(e.target.checked)}
                  />
                  Permitir sobreposicao com agendamento existente.
                </label>
              )}

              {companyId && (
                <details className="rounded-lg border border-gray-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700">
                    Ver disponibilidade dos profissionais no dia
                  </summary>
                  <div className="border-t border-gray-100 px-3 py-2">
                    {scheduleStartsAt ? (
                      <AvailabilityPanel
                        companyId={companyId}
                        date={scheduleStartsAt.slice(0, 10)}
                        highlightDentistId={scheduleDentistId || undefined}
                      />
                    ) : (
                      <p className="text-xs text-gray-500">
                        Informe data e hora para visualizar a disponibilidade.
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
    ) : null;

  const errorBanner = error ? (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </div>
  ) : null;

  const actionBar = (
    <div className="flex items-center justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={() => (onCancelAction ? onCancelAction() : router.back())}
        className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar lead"}
      </button>
    </div>
  );

  // Modal de telefone duplicado — render por cima do form quando o submit
  // detectou outro lead com o mesmo telefone na organizacao.
  const duplicateModal = duplicateConfirm ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setDuplicateConfirm(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
      >
        <h3 className="text-base font-semibold text-gray-900">
          Telefone ja cadastrado
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Ja existe um lead com este telefone na organizacao:{" "}
          <strong className="text-gray-900">{duplicateConfirm.name}</strong>.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Cadastrar leads duplicados pode espalhar o historico de
          conversas e agendamentos. Escolha como prosseguir.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setDuplicateConfirm(null)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={async () => {
              const id = duplicateConfirm.id;
              setDuplicateConfirm(null);
              router.push(`/${domain}/leads/${id}`);
            }}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Abrir lead existente
          </button>
          <button
            type="button"
            onClick={async () => {
              setDuplicateConfirm(null);
              const fakeEvent = {
                preventDefault() {},
              } as unknown as FormEvent;
              await handleSubmit(fakeEvent, { skipDuplicateCheck: true });
            }}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
          >
            Criar mesmo assim
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (layout === "two-column") {
    // Layout 2 colunas, ideal para /leads/new ocupar a largura toda.
    // Esquerda concentra identificacao + financeiro + agendamento;
    // Direita fica com campos adicionais + tags + observacoes.
    return (
      <>
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className="space-y-4"
        >
          {errorBanner}
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              {identificationSection}
              {financialSection}
              {scheduleSection}
            </div>
            <div className="space-y-4 lg:col-span-5">
              {customFieldsSection}
              {tagsSection}
              {observationsSection}
            </div>
          </div>
          {actionBar}
        </form>
        {duplicateModal}
      </>
    );
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        className="space-y-4"
      >
        {errorBanner}
        {identificationSection}
        {financialSection}
        {customFieldsSection}
        {tagsSection}
        {observationsSection}
        {scheduleSection}
        {actionBar}
      </form>
      {duplicateModal}
    </>
  );
}
