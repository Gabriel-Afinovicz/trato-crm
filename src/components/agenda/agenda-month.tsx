"use client";

import type { ClinicHoliday } from "@/lib/types/database";

interface AgendaMonthProps {
  monthAnchor: Date;
  rangeStart: Date;
  counts: { starts_at: string; status: string }[];
  holidays: ClinicHoliday[];
  onPickDay: (day: Date) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function AgendaMonth({
  monthAnchor,
  rangeStart,
  counts,
  holidays,
  onPickDay,
}: AgendaMonthProps) {
  const dayBuckets = new Map<
    string,
    { total: number; cancelled: number; completed: number; noShow: number }
  >();
  for (const c of counts) {
    const day = new Date(c.starts_at);
    const key = ymd(day);
    const cur = dayBuckets.get(key) ?? {
      total: 0,
      cancelled: 0,
      completed: 0,
      noShow: 0,
    };
    cur.total += 1;
    if (c.status === "cancelled") cur.cancelled += 1;
    else if (c.status === "completed") cur.completed += 1;
    else if (c.status === "no_show") cur.noShow += 1;
    dayBuckets.set(key, cur);
  }

  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    cells.push(d);
  }

  const monthIdx = monthAnchor.getMonth();
  const today = new Date();
  const todayKey = ymd(today);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const key = ymd(day);
          const bucket = dayBuckets.get(key);
          const inMonth = day.getMonth() === monthIdx;
          const isToday = key === todayKey;
          const holiday = holidayByDate.get(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPickDay(day)}
              className={`flex min-h-[96px] flex-col items-stretch gap-1.5 border-b border-r border-slate-100 p-2.5 text-left transition-all duration-200 hover:bg-blue-50/30 cursor-pointer ${
                inMonth ? "bg-white" : "bg-slate-50/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    isToday
                      ? "rounded-full bg-blue-600 px-2 py-0.5 text-white shadow-sm"
                      : inMonth
                        ? "text-slate-700"
                        : "text-slate-400"
                  }`}
                >
                  {day.getDate()}
                </span>
                {bucket && bucket.total > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-blue-50 border border-blue-200/50 px-2 py-0.5 text-[9px] font-bold text-blue-700">
                    {bucket.total}
                  </span>
                )}
              </div>
              {holiday && (
                <div className="truncate rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700 border border-rose-100/50">
                  {holiday.name}
                </div>
              )}
              {bucket && (
                <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  {bucket.completed > 0 && (
                    <span className="inline-flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                      {bucket.completed}
                    </span>
                  )}
                  {bucket.noShow > 0 && (
                    <span className="inline-flex items-center gap-1 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-100/40 text-rose-750">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      {bucket.noShow}
                    </span>
                  )}
                  {bucket.cancelled > 0 && (
                    <span className="inline-flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200/40 text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      {bucket.cancelled}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
