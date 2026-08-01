"use client";

// Month / week view of the KOL plan.
//
// It used to key each deal on its due date alone, which put every August deal
// on 1 August in one stack — because postDueDate holds the START of the agreed
// window, and the window itself ("Aug 1 – Aug 31", "Sep 15 – Sep 21") was
// sitting unread in postingPeriod. A calendar that answers "are we dumping six
// posts on the same Friday" cannot work off start dates: two deals that overlap
// for three weeks looked identical to two that shared one morning.
//
// So a deal is drawn as a BAND across the days it may post in, and the day it
// actually posted is drawn as a solid marker on top. The gap between the two is
// the thing worth seeing — a post that landed outside its own window, or a
// window that closed with nothing in it.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { brandColor, brandName } from "@/lib/brands";
import { platformIcon } from "@/lib/platforms";
import { baht } from "@/lib/format";
import { Kol } from "@/lib/data/kol";

const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MON_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DAY = 86_400_000;

/** How many bands a week row shows before collapsing the rest into a count. */
const MAX_LANES = 4;

/**
 * Deal dates are not stored in one shape: postedDate is ISO, while postDueDate
 * and postingDate are display labels like "Aug 1" written by the drawer.
 *
 * A bare "Aug 1" carries no year. Rather than assume the current one — which
 * puts "Dec 25" ten months away when read in January — pick whichever adjacent
 * year lands closest to today.
 */
function toDay(value: string | null | undefined): Date | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
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
  return best;
}

/**
 * The window this deal may post in. postingPeriod holds it as "Aug 1 – Aug 31"
 * (en dash, hyphen and "to" all seen in the sheet); when it is missing or reads
 * "TBD", fall back to the due date as a single day so the deal still appears
 * rather than vanishing from the plan.
 */
function planRange(k: Kol): { start: Date; end: Date } | null {
  const raw = (k.postingPeriod ?? "").trim();
  const parts = raw.split(/\s*(?:–|—|-|to)\s*/i);
  if (parts.length === 2) {
    const start = toDay(parts[0]);
    let end = toDay(parts[1]);
    // "Dec 28 – Jan 3" wraps the year; nudge the end forward rather than
    // rendering a band that runs backwards for 360 days.
    if (start && end && +end < +start) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
    if (start && end) return { start, end };
  }
  const single = toDay(raw) ?? toDay(k.postDueDate) ?? toDay(k.postingDate);
  return single ? { start: single, end: single } : null;
}

const actualDay = (k: Kol): Date | null => toDay(k.postedDate);

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

interface Band {
  k: Kol;
  start: Date;
  end: Date;
  posted: Date | null;
  lane: number;
}

/**
 * Give every band a row of its own where it overlaps another. Lanes are packed
 * once across the whole visible range, not per week, so a band that spans a
 * week boundary stays on the same line and reads as one thing.
 */
function packLanes(bands: Omit<Band, "lane">[]): Band[] {
  const laneEnds: number[] = [];
  return [...bands]
    .sort((a, b) => +a.start - +b.start || +b.end - +a.end)
    .map((b) => {
      let lane = laneEnds.findIndex((end) => end < +b.start);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = +b.end;
      return { ...b, lane };
    });
}

export function KolPlanCalendar({ kols, mode, onOpen }: {
  kols: Kol[]; mode: "month" | "week"; onOpen: (k: Kol) => void;
}) {
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });

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
    const cells = Math.ceil((Math.round((+startOfWeek(last) - +gridStart) / DAY) + 7) / 7) * 7;
    return {
      days: Array.from({ length: cells }, (_, i) => addDays(gridStart, i)),
      title: `${MON_TH[anchor.getMonth()]} ${anchor.getFullYear() + 543}`,
    };
  }, [anchor, mode]);

  const gridFrom = days[0];
  const gridTo = days[days.length - 1];

  const bands = useMemo(() => {
    const out: Omit<Band, "lane">[] = [];
    for (const k of kols) {
      const r = planRange(k);
      if (!r) continue;                                   // TBD / on hold — no date to draw
      const posted = actualDay(k);
      // A post that landed outside its own window still belongs on the grid.
      const from = posted && +posted < +r.start ? posted : r.start;
      const to = posted && +posted > +r.end ? posted : r.end;
      if (+to < +gridFrom || +from > +gridTo) continue;
      out.push({ k, start: r.start, end: r.end, posted });
    }
    return packLanes(out);
  }, [kols, gridFrom, gridTo]);

  const weeks = useMemo(() => {
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const step = (dir: 1 | -1) => setAnchor((a) => {
    if (mode === "week") return addDays(a, dir * 7);
    return new Date(a.getFullYear(), a.getMonth() + dir, 1);
  });

  const todayIso = iso(new Date());
  const inScope = mode === "week" ? bands : bands.filter((b) =>
    +b.end >= +new Date(anchor.getFullYear(), anchor.getMonth(), 1) &&
    +b.start <= +new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
  const scopeCost = inScope.reduce((s, b) => s + (b.k.totalCost || b.k.fee || 0), 0);
  const postedCount = inScope.filter((b) => b.posted).length;

  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line4 flex-wrap">
        <button onClick={() => step(-1)} aria-label="ก่อนหน้า" className="text-faint hover:text-ink p-1"><ChevronLeft size={16} /></button>
        <span className="text-[13px] font-extrabold text-ink min-w-[150px] text-center">{title}</span>
        <button onClick={() => step(1)} aria-label="ถัดไป" className="text-faint hover:text-ink p-1"><ChevronRight size={16} /></button>
        <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}
          className="text-[11.5px] font-bold text-muted border border-line2 rounded-[8px] px-3 py-[5px] bg-white hover:border-line">วันนี้</button>

        {/* The two marks mean different things and the difference is the point,
            so it is stated rather than left to be inferred from the styling. */}
        <span className="flex items-center gap-3 text-[10.5px] text-faint ml-2">
          <span className="flex items-center gap-[5px]">
            <span className="w-[16px] h-[9px] rounded-[3px]" style={{ background: "#6C5CE71F", borderLeft: "3px solid #6C5CE7" }} />
            ช่วงที่วางแผนโพสต์
          </span>
          <span className="flex items-center gap-[5px]">
            <span className="w-[9px] h-[9px] rounded-full" style={{ background: "#3F6A34" }} />
            โพสต์จริง
          </span>
        </span>

        <span className="ml-auto text-[11.5px] text-faint">
          {inScope.length} ดีล · โพสต์แล้ว {postedCount} · {baht(scopeCost, { compact: true })}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {DOW.map((d) => (
          <div key={d} className="px-2 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold text-center border-b border-line4">{d}</div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const wFrom = week[0];
        const wTo = week[6];
        const hits = bands.filter((b) => +b.end >= +wFrom && +b.start <= +wTo);
        const shown = hits.filter((b) => b.lane < MAX_LANES);
        const hidden = hits.length - shown.length;
        const laneCount = shown.length ? Math.max(...shown.map((b) => b.lane)) + 1 : 0;
        const laneH = mode === "week" ? 26 : 22;

        return (
          <div key={wi} className="relative border-b border-line4 last:border-b-0">
            {/* Day cells sit underneath; the bands are laid over them so one bar
                can cross a cell boundary instead of being cut into pieces. */}
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {week.map((d) => {
                const key = iso(d);
                const dim = mode === "month" && d.getMonth() !== anchor.getMonth();
                const isToday = key === todayIso;
                return (
                  <div key={key} className="border-r border-line4 last:border-r-0 px-[6px] pt-[5px]"
                    style={{
                      // The row is as tall as its bands need, with a floor so an
                      // empty week still reads as a week rather than a hairline.
                      minHeight: Math.max(mode === "week" ? 190 : 62, 26 + laneCount * laneH + 8),
                      background: dim ? "#FAF9F7" : undefined,
                      opacity: dim ? 0.55 : 1,
                    }}>
                    <span className={`text-[11px] font-bold ${isToday ? "text-white bg-accent rounded-full w-[20px] h-[20px] flex items-center justify-center" : "text-muted"}`}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 26, height: laneCount * laneH }}>
              {shown.map((b) => {
                const from = +b.start < +wFrom ? wFrom : b.start;
                const to = +b.end > +wTo ? wTo : b.end;
                const col = Math.round((+from - +wFrom) / DAY);
                const span = Math.round((+to - +from) / DAY) + 1;
                const bc = brandColor(b.k.b);
                const pi = platformIcon(b.k.plat);
                const opensLeft = +b.start < +wFrom;
                const runsRight = +b.end > +wTo;
                const done = !!b.posted;
                return (
                  <div key={`${b.k.id}-${wi}`} className="grid pointer-events-none absolute left-0 right-0"
                    style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", height: laneH, top: b.lane * laneH }}>
                    <button
                      onClick={() => onOpen(b.k)}
                      title={`${b.k.name} · ${brandName(b.k.b)} · ${b.k.campaign}\nแผน ${b.k.postingPeriod || "—"}${b.posted ? `\nโพสต์จริง ${iso(b.posted)}` : "\nยังไม่ได้โพสต์"}\n${baht(b.k.totalCost || b.k.fee, { compact: true })}`}
                      className="pointer-events-auto text-left flex items-center gap-[4px] min-w-0 mx-[3px] px-[5px] hover:brightness-95 transition"
                      style={{
                        gridColumn: `${col + 1} / span ${span}`,
                        height: laneH - 4,
                        background: `${bc}1F`,
                        // A window still open is drawn dashed; once the post has
                        // landed the band is closed with a solid edge.
                        border: done ? `1px solid ${bc}55` : `1px dashed ${bc}66`,
                        borderLeft: opensLeft ? undefined : `3px solid ${bc}`,
                        borderTopLeftRadius: opensLeft ? 0 : 6,
                        borderBottomLeftRadius: opensLeft ? 0 : 6,
                        borderTopRightRadius: runsRight ? 0 : 6,
                        borderBottomRightRadius: runsRight ? 0 : 6,
                      }}>
                      {!opensLeft && (
                        <span className="w-[12px] h-[12px] rounded-[3px] flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                          style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                      )}
                      <span className="text-[10.5px] font-bold text-ink truncate">{b.k.name}</span>
                      {mode === "week" && (
                        <span className="text-[9.5px] text-faint truncate">· {b.k.campaign}</span>
                      )}
                    </button>
                  </div>
                );
              })}

              {/* The actual post, over the band it belongs to. Drawn even when it
                  falls outside the window — that is exactly the case to see. */}
              {shown.filter((b) => b.posted && +b.posted! >= +wFrom && +b.posted! <= +wTo).map((b) => {
                const col = Math.round((+b.posted! - +wFrom) / DAY);
                const outside = +b.posted! < +b.start || +b.posted! > +b.end;
                return (
                  <div key={`dot-${b.k.id}-${wi}`} className="grid pointer-events-none absolute left-0 right-0"
                    style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", top: b.lane * laneH }}>
                    <span className="flex items-center justify-end pr-[7px]" style={{ gridColumn: `${col + 1} / span 1`, height: laneH - 4 }}>
                      <span className="w-[9px] h-[9px] rounded-full flex-shrink-0"
                        title={outside ? "โพสต์นอกช่วงที่วางแผนไว้" : "โพสต์จริง"}
                        style={{ background: outside ? "#B33A2E" : "#3F6A34", boxShadow: "0 0 0 2px #fff" }} />
                    </span>
                  </div>
                );
              })}
            </div>

            {hidden > 0 && (
              <div className="absolute bottom-[3px] left-[8px] text-[9.5px] text-faint">+{hidden} อื่นๆ</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
