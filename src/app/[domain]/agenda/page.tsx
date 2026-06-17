import { redirect } from "next/navigation";
import { getAuthSession, getDomainCompany } from "@/lib/supabase/cached-data";
import {
  getAgendaResources,
  getAgendaSchedule,
  getMonthAppointments,
} from "@/lib/supabase/agenda-data";
import { AgendaContent } from "./agenda-content";

interface AgendaPageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{
    date?: string;
    view?: string;
    resource?: string;
  }>;
}

function parseDateOrToday(value?: string): Date {
  if (!value) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (
      Number.isFinite(y) &&
      Number.isFinite(mo) &&
      Number.isFinite(d) &&
      mo >= 1 &&
      mo <= 12 &&
      d >= 1 &&
      d <= 31
    ) {
      return new Date(y, mo - 1, d);
    }
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Serializa um Date como data-pura "YYYY-MM-DD" usando os getters locais.
 *
 * Importante: NAO usar `.toISOString()` para passar datas-calendario ao
 * client. Na Vercel o servidor roda em UTC; um `new Date(2026,5,3)` vira
 * "2026-06-03T00:00:00Z", e o client em UTC-3 reinterpreta como 02/06 21:00,
 * exibindo o dia anterior. Passando so a data (sem hora), o client reconstroi
 * o mesmo dia-calendario via `parseDateInput`, independente do fuso.
 */
function toYmd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfMonthGrid(d: Date) {
  const first = startOfMonth(d);
  return addDays(first, -first.getDay());
}

type ViewMode = "day" | "week" | "month";
type ResourceAxis = "none" | "dentist" | "room";

export default async function AgendaPage({
  params,
  searchParams,
}: AgendaPageProps) {
  const { domain } = await params;
  const { date, view, resource } = await searchParams;

  const [session, company] = await Promise.all([
    getAuthSession(),
    getDomainCompany(domain),
  ]);

  if (!session.user) redirect(`/${domain}`);
  if (!company) redirect(`/${domain}/dashboard`);

  const viewMode: ViewMode =
    view === "week" ? "week" : view === "month" ? "month" : "day";
  const resourceAxis: ResourceAxis =
    resource === "dentist" ? "dentist" : resource === "room" ? "room" : "none";
  const selectedDate = parseDateOrToday(date);

  let rangeStart: Date;
  let rangeEnd: Date;
  if (viewMode === "month") {
    rangeStart = startOfMonthGrid(selectedDate);
    rangeEnd = addDays(rangeStart, 42);
  } else if (viewMode === "week") {
    rangeStart = startOfWeek(selectedDate);
    rangeEnd = addDays(rangeStart, 7);
  } else {
    rangeStart = startOfDay(selectedDate);
    rangeEnd = addDays(rangeStart, 1);
  }

  const resources = await getAgendaResources(company.id);

  if (viewMode === "month") {
    const monthlyAppointments = await getMonthAppointments(
      company.id,
      rangeStart.toISOString(),
      rangeEnd.toISOString()
    );

    return (
      <AgendaContent
        domain={domain}
        viewMode={viewMode}
        resourceAxis={resourceAxis}
        selectedDate={toYmd(selectedDate)}
        rangeStart={toYmd(rangeStart)}
        rangeEnd={toYmd(rangeEnd)}
        appointments={[]}
        monthCounts={monthlyAppointments}
        blocks={[]}
        holidays={[]}
        rooms={resources.rooms}
        procedures={resources.procedures}
        dentists={resources.dentists}
        clinicHours={resources.clinicHours}
        templates={resources.templates}
      />
    );
  }

  const schedule = await getAgendaSchedule(
    company.id,
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  );

  return (
    <AgendaContent
      domain={domain}
      viewMode={viewMode}
      resourceAxis={resourceAxis}
      selectedDate={toYmd(selectedDate)}
      rangeStart={toYmd(rangeStart)}
      rangeEnd={toYmd(rangeEnd)}
      appointments={schedule.appointments}
      monthCounts={[]}
      blocks={schedule.blocks}
      holidays={schedule.holidays}
      rooms={resources.rooms}
      procedures={resources.procedures}
      dentists={resources.dentists}
      clinicHours={resources.clinicHours}
      templates={resources.templates}
    />
  );
}
