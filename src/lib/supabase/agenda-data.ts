import { cache } from "react";
import { createClient } from "./server";
import type {
  AgendaBlock,
  Appointment,
  AppointmentDetailed,
  ClinicHoliday,
  ClinicHours,
  MessageTemplate,
  ProcedureType,
  Room,
  Tag,
} from "@/lib/types/database";

export const getAgendaResources = cache(async (companyId: string) => {
  const supabase = await createClient();
  const [roomsRes, proceduresRes, dentistsRes, hoursRes, templatesRes, sysUsersRes] =
    await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("procedure_types")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("clinicorp_professionals")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("clinic_hours")
        .select("*")
        .eq("company_id", companyId)
        .order("weekday"),
      supabase
        .from("message_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("users")
        .select("id, name, is_dentist")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .neq("role", "super_admin")
        .order("name"),
    ]);

  const clinicorpProfs = (dentistsRes.data as { id: string; name: string }[] | null) ?? [];
  const sysDentists = (sysUsersRes.data as { id: string; name: string; is_dentist: boolean }[] | null) ?? [];
  
  const dentists = [
    ...sysDentists.map(d => ({ id: d.id, name: d.name, is_dentist: d.is_dentist })),
    ...clinicorpProfs
      .filter(p => !sysDentists.some(d => d.id === p.id))
      .map(p => ({ id: p.id, name: `${p.name} (CliniCorp)`, is_dentist: true }))
  ].sort((a, b) => a.name.localeCompare(b.name));
  return {
    rooms: (roomsRes.data as unknown as Room[]) ?? [],
    procedures: (proceduresRes.data as unknown as ProcedureType[]) ?? [],
    dentists,
    clinicHours: (hoursRes.data as unknown as ClinicHours[]) ?? [],
    templates: (templatesRes.data as unknown as MessageTemplate[]) ?? [],
  };
});

export const getAgendaSchedule = cache(
  async (
    companyId: string,
    startIso: string,
    endIso: string
  ): Promise<{
    appointments: AppointmentDetailed[];
    blocks: AgendaBlock[];
    holidays: ClinicHoliday[];
  }> => {
    const supabase = await createClient();
    const startDate = startIso.slice(0, 10);
    const endDate = endIso.slice(0, 10);

    const [appointmentsRes, blocksRes, holidaysRes] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `id, company_id, lead_id, dentist_id, room_id, procedure_type_id, starts_at, ends_at, status, notes, clinicorp_appointment_id, clinicorp_sync_status, clinicorp_sync_error, created_at, updated_at,
           leads!inner(id, name, phone, lead_tags(tags(id, name, color, clinicorp_category_id))),
           appointment_tags(tags(id, name, color, clinicorp_category_id)),
           clinicorp_professionals:dentist_id(name),
           rooms:room_id(name, color),
           procedure_types:procedure_type_id(name, default_duration_minutes)`
        )
        .eq("company_id", companyId)
        .gte("starts_at", startIso)
        .lt("starts_at", endIso)
        .order("starts_at", { ascending: true }),
      supabase
        .from("agenda_blocks")
        .select("*")
        .eq("company_id", companyId)
        .lt("starts_at", endIso)
        .gt("ends_at", startIso)
        .order("starts_at", { ascending: true }),
      supabase
        .from("clinic_holidays")
        .select("*")
        .eq("company_id", companyId)
        .gte("date", startDate)
        .lte("date", endDate),
    ]);

    const rows =
      (appointmentsRes.data as unknown as (Appointment & {
        leads: {
          id: string;
          name: string;
          phone: string | null;
          lead_tags?: unknown;
        } | null;
        appointment_tags?: unknown;
        clinicorp_professionals: { name: string } | null;
        rooms: { name: string; color: string } | null;
        procedure_types: {
          name: string;
          default_duration_minutes: number;
        } | null;
      })[] | null) ?? [];

    const appointments: AppointmentDetailed[] = rows.map((r) => {
      // Map lead tags
      const lTags: Tag[] = [];
      const leadTagsRaw = r.leads?.lead_tags;
      const leadTagsArr = Array.isArray(leadTagsRaw) ? leadTagsRaw : leadTagsRaw ? [leadTagsRaw] : [];
      for (const lt of leadTagsArr) {
        const t = (lt as { tags?: unknown })?.tags;
        if (t) {
          const tArr = Array.isArray(t) ? t : [t];
          for (const item of tArr) {
            if (item) lTags.push(item as Tag);
          }
        }
      }

      // Map appointment tags
      const apptTags: Tag[] = [];
      const apptTagsRaw = r.appointment_tags;
      const apptTagsArr = Array.isArray(apptTagsRaw) ? apptTagsRaw : apptTagsRaw ? [apptTagsRaw] : [];
      for (const at of apptTagsArr) {
        const t = (at as { tags?: unknown })?.tags;
        if (t) {
          const tArr = Array.isArray(t) ? t : [t];
          for (const item of tArr) {
            if (item) apptTags.push(item as Tag);
          }
        }
      }

      return {
        id: r.id,
        company_id: r.company_id,
        lead_id: r.lead_id,
        dentist_id: r.dentist_id,
        room_id: r.room_id,
        procedure_type_id: r.procedure_type_id,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
        notes: r.notes,
        clinicorp_appointment_id: r.clinicorp_appointment_id,
        clinicorp_sync_status: r.clinicorp_sync_status,
        clinicorp_sync_error: r.clinicorp_sync_error,
        created_at: r.created_at,
        updated_at: r.updated_at,
        lead_name: r.leads?.name ?? null,
        lead_phone: r.leads?.phone ?? null,
        dentist_name: r.clinicorp_professionals?.name ?? null,
        room_name: r.rooms?.name ?? null,
        room_color: r.rooms?.color ?? null,
        procedure_name: r.procedure_types?.name ?? null,
        procedure_duration_minutes:
          r.procedure_types?.default_duration_minutes ?? null,
        lead_tags: lTags,
        appointment_tags: apptTags,
      };
    });

    return {
      appointments,
      blocks: (blocksRes.data as unknown as AgendaBlock[]) ?? [],
      holidays: (holidaysRes.data as unknown as ClinicHoliday[]) ?? [],
    };
  }
);

/**
 * Indica se a empresa tem a integracao Clinicorp ativa. Usado pela agenda
 * para decidir se mostra o selo de sincronizacao nos cards de agendamento.
 */
export const getClinicorpEnabled = cache(
  async (companyId: string): Promise<boolean> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("company_integrations")
      .select("status")
      .eq("company_id", companyId)
      .eq("provider", "clinicorp")
      .maybeSingle();
    const row = data as { status?: string } | null;
    return !!row && row.status !== "disabled";
  }
);

export const getMonthAppointments = cache(
  async (
    companyId: string,
    startIso: string,
    endIso: string
  ): Promise<{ starts_at: string; status: string }[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("appointments")
      .select("starts_at, status")
      .eq("company_id", companyId)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso);
    return (data as { starts_at: string; status: string }[] | null) ?? [];
  }
);
