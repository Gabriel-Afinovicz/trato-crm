"use client";

import { useState } from "react";

/**
 * Seletor de período inline (de / até) com validação básica.
 *
 * - Datas locais em formato `YYYY-MM-DD`.
 * - O `end` aqui é o **último dia inclusivo** mostrado ao usuário; quem
 *   consumir deve converter para `< end + 1 dia` antes de enviar à API
 *   (a função `endInclusiveToExclusive` exportada faz isso).
 *
 * Usado pelo Analítico, pelo Kanban e pela tela Leads.
 */

interface DateRangePickerProps {
  initialStart: string;
  initialEndInclusive: string;
  isPending?: boolean;
  onCancel: () => void;
  onApply: (startStr: string, endInclusiveStr: string) => void;
}

export function DateRangePicker({
  initialStart,
  initialEndInclusive,
  isPending,
  onCancel,
  onApply,
}: DateRangePickerProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEndInclusive);
  const [error, setError] = useState<string | null>(null);

  function handleApply() {
    if (!start || !end) {
      setError("Selecione as duas datas.");
      return;
    }
    if (end < start) {
      setError("A data final precisa ser igual ou posterior à inicial.");
      return;
    }
    setError(null);
    onApply(start, end);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          De
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Até
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={isPending}
          onClick={handleApply}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Converte ISO em `YYYY-MM-DD` no fuso local sem virar para UTC. */
export function toLocalDateInput(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fromLocalDateInputStart(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Usuário escolhe o último dia inclusivo; transformamos em exclusivo. */
export function fromLocalDateInputEndExclusive(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
}

export function endExclusiveToInclusiveLabel(endExclusiveISO: string): string {
  const d = new Date(new Date(endExclusiveISO).getTime() - 24 * 60 * 60 * 1000);
  return toLocalDateInput(d.toISOString());
}

export function formatRangeLabel(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const lastInclusive = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(start)} — ${fmt(lastInclusive)}`;
}
