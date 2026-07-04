"use client";

import { useEffect, useRef, useState } from "react";

// One date picker for the whole app. Displays DD/MM/YYYY, stores ISO YYYY-MM-DD,
// never accepts typed input (calendar only), and supports min/max so callers can
// enforce rules like "End ≥ Start" or "within the campaign period".

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** ISO (YYYY-MM-DD) → DD/MM/YYYY for display. */
export function fmtDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function parseIso(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

const toIso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function DatePicker({
  value, onChange, min, max, placeholder = "Select date", disabled, invalid, className,
}: {
  value: string | null;
  onChange: (iso: string) => void;
  min?: string | null;
  max?: string | null;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = parseIso(value);
  const [view, setView] = useState(() => {
    const s = sel ?? { y: new Date().getFullYear(), m: new Date().getMonth() + 1, d: 1 };
    return { y: s.y, m: s.m - 1 }; // m is 0-indexed here
  });

  useEffect(() => {
    if (open && sel) setView({ y: sel.y, m: sel.m - 1 });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const disabledDay = (d: number) => {
    const iso = toIso(view.y, view.m, d);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const base = "w-full text-left text-[13.5px] px-[13px] py-[10px] rounded-[10px] border bg-ivory outline-none flex items-center justify-between gap-2 transition";
  const border = invalid ? "border-status-red" : "border-line2";

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={`${base} ${border} disabled:opacity-50 disabled:cursor-default`}>
        <span className={value ? "text-ink" : "text-faint"}>{value ? fmtDisplay(value) : placeholder}</span>
        <span className="text-faint text-[13px]">📅</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[264px] bg-surface border border-line rounded-[14px] shadow-2xl p-3" style={{ boxShadow: "0 12px 40px rgba(0,0,0,.18)" }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView((v) => v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 })}
              className="w-7 h-7 rounded-[8px] hover:bg-ivory text-muted font-bold">‹</button>
            <div className="text-[13px] font-bold text-ink">{MONTHS[view.m]} {view.y}</div>
            <button type="button" onClick={() => setView((v) => v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 })}
              className="w-7 h-7 rounded-[8px] hover:bg-ivory text-muted font-bold">›</button>
          </div>
          <div className="grid grid-cols-7 gap-[2px] mb-1">
            {DOW.map((d) => <div key={d} className="text-[10px] font-bold text-faint text-center py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-[2px]">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const iso = toIso(view.y, view.m, d);
              const isSel = value === iso;
              const off = disabledDay(d);
              return (
                <button key={i} type="button" disabled={off}
                  onClick={() => { onChange(iso); setOpen(false); }}
                  className="h-8 rounded-[8px] text-[12.5px] font-semibold transition disabled:opacity-25 disabled:cursor-default"
                  style={isSel ? { background: "#211F1C", color: "#fff" } : { color: "#4a463f" }}
                  onMouseEnter={(e) => { if (!isSel && !off) e.currentTarget.style.background = "#F2EEE4"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-line4">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-[11.5px] font-semibold text-faint hover:text-ink">Clear</button>
            <button type="button" onClick={() => {
              const n = new Date(); const iso = toIso(n.getFullYear(), n.getMonth(), n.getDate());
              if ((!min || iso >= min) && (!max || iso <= max)) { onChange(iso); setOpen(false); }
            }} className="text-[11.5px] font-bold text-accent">Today</button>
          </div>
        </div>
      )}
    </div>
  );
}
