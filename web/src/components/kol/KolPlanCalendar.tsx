"use client";

// Month / week view of the KOL plan, keyed on post due date. The list view
// answers "what is due next"; this answers "are we dumping six posts on the
// same Friday" — which the sheet could never show and is the reason two
// campaigns kept colliding on the same weekend.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { brandColor, brandName } from "@/lib/brands";
import { platformIcon } from "@/lib/platforms";
import { baht } from "@/lib/format";
import { Kol } from "@/lib/data/kol";

const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MON_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Deal dates are not stored in one shape: postedDate is ISO, while postDueDate
 * and postingDate are display labels like "Aug 1" written by the drawer. Keying
 * the grid on ISO alone matched nothing at all, so both are parsed here.
 *
 * A bare "Aug 1" carries no year. Rather than assume the current one — which
 * puts "Dec 25" ten months away when read in January — pick whichever adjacent
 * year lands closest to today.
 */
function toIsoDay(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2})$/);
  if (!m) return null;                                   // "TBD", "On hold", …
  const mon = MON_EN.indexOf(m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase());
  const day = Number(m[2]);
  if (mon < 0 || !day) return null;
  const now = new Date();
  let best: Date | null = null;
  for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const cand = new Date(y, mon, day);
    if (!best || Math.abs(+cand - +now) < Math.abs(+best - +now)) best = cand;
  }
  return best ? iso(best) : null;
}
/** Monday-first: the posting week the team actually plans in. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function KolPlanCalendar({ kols, mode, onOpen }: {
  kols: Kol[]; mode: "month" | "week"; onOpen: (k: Kol) => void;
}) {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

  const byDate = useMemo(() => {
    const m = new Map<string, Kol[]>();
    for (const k of kols) {
      const day = toIsoDay(k.postedDate) ?? toIsoDay(k.postingDate) ?? toIsoDay(k.postDueDate);
      if (!day) continue;
      const list = m.get(day) ?? [];
      list.push(k);
      m.set(day, list);
    }
    return m;
  }, [kols]);

  const { days, title } = useMemo(() => {
    if (mode === "week") {
      const from = startOfWeek(anchor);
      return {
        days: Array.from({ length: 7 }, (_, i) => addDays(from, i)),
        title: `${from.getDate()} ${MON_TH[from.getMonth()]} – ${addDays(from, 6).getDate()} ${MON_TH[addDays(from, 6).getMonth()]} ${from.getFullYear() + 543}`,
      };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const cells = Math.ceil((Math.round((+startOfWeek(last) - +gridStart) / 86400000) + 7) / 7) * 7;
    return {
      days: Array.from({ length: cells }, (_, i) => addDays(gridStart, i)),
      title: `${MON_TH[anchor.getMonth()]} ${anchor.getFullYear() + 543}`,
    };
  }, [anchor, mode]);

  const step = (dir: 1 | -1) => setAnchor((a) => {
    if (mode === "week") return addDays(a, dir * 7);
    return new Date(a.getFullYear(), a.getMonth() + dir, 1);
  });

  const todayIso = iso(new Date());
  const inScope = days.filter((d) => mode === "week" || d.getMonth() === anchor.getMonth());
  const scopeKols = inScope.flatMap((d) => byDate.get(iso(d)) ?? []);
  const scopeCost = scopeKols.reduce((s, k) => s + (k.totalCost || k.fee || 0), 0);

  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line4 flex-wrap">
        <button onClick={() => step(-1)} aria-label="ก่อนหน้า" className="text-faint hover:text-ink p-1"><ChevronLeft size={16} /></button>
        <span className="text-[13px] font-extrabold text-ink min-w-[150px] text-center">{title}</span>
        <button onClick={() => step(1)} aria-label="ถัดไป" className="text-faint hover:text-ink p-1"><ChevronRight size={16} /></button>
        <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}
          className="text-[11.5px] font-bold text-muted border border-line2 rounded-[8px] px-3 py-[5px] bg-white hover:border-line">วันนี้</button>
        <span className="ml-auto text-[11.5px] text-faint">
          {scopeKols.length} โพสต์ · {baht(scopeCost, { compact: true })}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {DOW.map((d) => (
          <div key={d} className="px-2 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold text-center border-b border-line4">{d}</div>
        ))}
        {days.map((d) => {
          const key = iso(d);
          const items = byDate.get(key) ?? [];
          const dim = mode === "month" && d.getMonth() !== anchor.getMonth();
          const isToday = key === todayIso;
          return (
            <div key={key}
              className="border-b border-r border-line4 last:border-r-0 p-[6px] flex flex-col gap-[4px]"
              style={{ minHeight: mode === "week" ? 220 : 104, background: dim ? "#FAF9F7" : undefined, opacity: dim ? 0.55 : 1 }}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold ${isToday ? "text-white bg-accent rounded-full w-[20px] h-[20px] flex items-center justify-center" : "text-muted"}`}>
                  {d.getDate()}
                </span>
                {items.length > 2 && mode === "month" && <span className="text-[9.5px] text-faint">{items.length}</span>}
              </div>
              {(mode === "week" ? items : items.slice(0, 3)).map((k) => {
                const bc = brandColor(k.b);
                const pi = platformIcon(k.plat);
                return (
                  <button key={k.id} onClick={() => onOpen(k)}
                    title={`${k.name} · ${brandName(k.b)} · ${k.campaign} · ${baht(k.totalCost || k.fee, { compact: true })}`}
                    className="text-left rounded-[7px] px-[6px] py-[4px] hover:brightness-95 transition"
                    style={{ background: `${bc}1F`, borderLeft: `3px solid ${bc}` }}>
                    <span className="flex items-center gap-[4px] min-w-0">
                      <span className="w-[12px] h-[12px] rounded-[3px] flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                        style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                      <span className="text-[10.5px] font-bold text-ink truncate">{k.name}</span>
                    </span>
                    {mode === "week" && (
                      <span className="block text-[9.5px] text-faint truncate mt-[1px]">{k.campaign}</span>
                    )}
                  </button>
                );
              })}
              {mode === "month" && items.length > 3 && (
                <span className="text-[9.5px] text-faint pl-[2px]">+{items.length - 3} อื่นๆ</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
