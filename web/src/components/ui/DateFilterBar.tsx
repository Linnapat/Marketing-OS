"use client";

import { useState } from "react";
import { Segmented } from "./Segmented";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface DateFilter {
  mode: "month" | "range";
  month: number; // 0-indexed
  year: number;
  start: string;
  end: string;
}

const now = new Date();
export const DEFAULT_DATE_FILTER: DateFilter = {
  mode: "month",
  month: now.getMonth(),
  year: now.getFullYear(),
  start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
};

/* ── Actually filtering with the selected period ─────────────────────── */
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Parse the date formats rows carry: ISO timestamps/dates and short display
 *  strings like "Jul 5" (assumed current year). Null when unparseable. */
export function parseRowDate(v?: string | null): Date | null {
  if (!v) return null;
  const iso = new Date(v);
  if (!isNaN(+iso) && /\d{4}/.test(v)) return iso;
  const m = /^([A-Za-z]{3})\w*\s+(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const mi = MONTHS_SHORT.indexOf(m[1].toLowerCase());
  return mi < 0 ? null : new Date(new Date().getFullYear(), mi, Number(m[2]));
}

/** Whether a row belongs to the selected period. Undated rows stay visible so
 *  data never silently disappears. */
export function inDateFilter(f: DateFilter, v?: string | null): boolean {
  const d = parseRowDate(v);
  if (!d) return true;
  if (f.mode === "month") return d.getFullYear() === f.year && d.getMonth() === f.month;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const s = f.start ? new Date(`${f.start}T00:00:00`).getTime() : -Infinity;
  const e = f.end ? new Date(`${f.end}T23:59:59`).getTime() : Infinity;
  return t >= s && t <= e;
}

/**
 * The unified period selector reused across Finance, Campaigns, KOL, Dashboard —
 * Month/Range segmented control + ‹ › nav + month/year selects + "This month".
 */
export function DateFilterBar({
  value,
  onChange,
  trailing,
}: {
  value?: DateFilter;
  onChange?: (v: DateFilter) => void;
  trailing?: React.ReactNode;
}) {
  const [internal, setInternal] = useState<DateFilter>(value ?? DEFAULT_DATE_FILTER);
  const f = value ?? internal;
  const set = (next: DateFilter) => {
    if (onChange) onChange(next);
    else setInternal(next);
  };

  const selectStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, padding: "8px 12px", borderRadius: 10,
    border: "1px solid #E5DECF", background: "#fff", color: "#211F1C", cursor: "pointer",
  };
  const arrow = "w-[34px] h-[36px] rounded-[9px] border border-line2 bg-white flex items-center justify-center cursor-pointer text-[16px] text-ink flex-shrink-0 select-none";

  const prev = () => {
    let m = f.month - 1, y = f.year;
    if (m < 0) { m = 11; y--; }
    set({ ...f, month: m, year: y });
  };
  const next = () => {
    let m = f.month + 1, y = f.year;
    if (m > 11) { m = 0; y++; }
    set({ ...f, month: m, year: y });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface border border-line rounded-[14px] px-4 py-3">
      <Segmented
        value={f.mode}
        onChange={(mode) => set({ ...f, mode })}
        options={[{ value: "month", label: "Month" }, { value: "range", label: "Range" }]}
      />
      {f.mode === "month" ? (
        <>
          <span className={arrow} onClick={prev}>‹</span>
          <select
            style={selectStyle}
            value={f.month}
            onChange={(e) => set({ ...f, month: parseInt(e.target.value) })}
          >
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            style={selectStyle}
            value={f.year}
            onChange={(e) => set({ ...f, year: parseInt(e.target.value) })}
          >
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className={arrow} onClick={next}>›</span>
        </>
      ) : (
        <>
          <input type="date" value={f.start} onChange={(e) => set({ ...f, start: e.target.value })}
            style={{ ...selectStyle, fontWeight: 600 }} />
          <span className="text-[13px] text-faint font-bold">→</span>
          <input type="date" value={f.end} onChange={(e) => set({ ...f, end: e.target.value })}
            style={{ ...selectStyle, fontWeight: 600 }} />
        </>
      )}
      <button
        onClick={() => set(DEFAULT_DATE_FILTER)}
        className="text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white whitespace-nowrap"
      >
        This month
      </button>
      <div className="text-[12.5px] font-semibold text-faint whitespace-nowrap ml-auto flex items-center gap-4">
        {trailing}
        <span>{MONTHS[f.month]} {f.year}</span>
      </div>
    </div>
  );
}

export { MONTHS };
