"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  WORK_SECTIONS, DAYS, WEEKDAYS, MONTH_LABEL, isWeekend, ALL_WORK_TASKS,
} from "@/lib/data/workflow";

// Highlight "today" only when the real date falls inside the sheet's month (July 2026).
function useToday(): number | null {
  const now = new Date();
  return now.getFullYear() === 2026 && now.getMonth() === 6 ? now.getDate() : null;
}

export default function WorkCalendarPage() {
  const today = useToday();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"grid" | "agenda">("grid");
  const key = (s: string, en: string) => `${s}::${en}`;

  // Reminder rollups
  const todaysTasks = today
    ? ALL_WORK_TASKS.filter((t) => t.marks[today] !== undefined)
    : [];
  const weekRange = today ? [today, today + 1, today + 2, today + 3, today + 4, today + 5, today + 6] : [];
  const weekTasks = useMemo(
    () => ALL_WORK_TASKS
      .map((t) => ({ t, days: weekRange.filter((d) => d <= 31 && t.marks[d] !== undefined) }))
      .filter((x) => x.days.length > 0),
    [weekRange],
  );

  const doneCount = Object.values(done).filter(Boolean).length;
  const totalTasks = ALL_WORK_TASKS.length;

  return (
    <>
      <PageHeader
        eyebrow="Work Flow"
        title="Work Calendar"
        subtitle={`${MONTH_LABEL} · team timeline & deliverable reminders`}
        right={
          <div className="flex items-center gap-1 bg-ivory border border-line2 rounded-pill p-[3px]">
            {(["grid", "agenda"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className="text-[12px] font-bold px-[13px] py-[5px] rounded-pill capitalize"
                style={view === v ? { background: "#211F1C", color: "#fff" } : { color: "#6b6258" }}>
                {v}
              </button>
            ))}
          </div>
        }
      />

      {/* Reminder strip */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        <div className="rounded-card p-4" style={{ background: "#211F1C", color: "#fff" }}>
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-accent">Due today</div>
          <div className="text-[25px] font-bold mt-[4px]">{todaysTasks.length}</div>
          <div className="text-[11px] text-white/50 mt-[2px]">
            {today ? `${MONTH_LABEL.split(" ")[0]} ${today}` : "outside July 2026"}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">Next 7 days</div>
          <div className="text-[25px] font-bold mt-[4px] text-ink">{weekTasks.length}</div>
          <div className="text-[11px] text-faint mt-[2px]">tasks with a deadline</div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">Checked off</div>
          <div className="text-[25px] font-bold mt-[4px] text-ink">{doneCount}<span className="text-[15px] text-faint font-semibold"> / {totalTasks}</span></div>
          <div className="text-[11px] text-faint mt-[2px]">this month</div>
        </div>
      </div>

      {view === "grid" ? (
        <GridView today={today} done={done} setDone={setDone} keyFn={key} />
      ) : (
        <AgendaView today={today} done={done} setDone={setDone} keyFn={key} />
      )}
    </>
  );
}

/* ── Grid: the faithful month timeline ─────────────────────────────── */
function GridView({ today, done, setDone, keyFn }: {
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  keyFn: (s: string, en: string) => string;
}) {
  return (
    <div className="mt-5 bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[12px] w-full" style={{ minWidth: 1200 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-panel text-white text-left font-bold px-3 py-2 text-[11px] tracking-[0.03em]" style={{ minWidth: 300 }}>
                {MONTH_LABEL} — Task
              </th>
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 96 }}>R</th>
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 60 }}>A</th>
              {DAYS.map((d) => (
                <th key={d}
                  className="px-0 py-1 text-center font-bold border-l border-white/10"
                  style={{
                    minWidth: 30, width: 30,
                    background: today === d ? "#B8945A" : isWeekend(d) ? "#3a2f2b" : "#211F1C",
                    color: today === d ? "#211F1C" : "#fff",
                  }}>
                  <div className="text-[10px] leading-none">{d}</div>
                  <div className="text-[8px] leading-none mt-[2px] opacity-60">{WEEKDAYS[d - 1]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORK_SECTIONS.map((sec) => (
              <SectionRows key={sec.key} sec={sec} today={today} done={done} setDone={setDone} keyFn={keyFn} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRows({ sec, today, done, setDone, keyFn }: {
  sec: (typeof WORK_SECTIONS)[number];
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  keyFn: (s: string, en: string) => string;
}) {
  return (
    <>
      <tr>
        <td colSpan={34} className="px-3 py-[6px] font-extrabold text-[11.5px] tracking-[0.04em] uppercase border-y border-line4"
          style={{ background: sec.bg, color: sec.accent }}>
          {sec.label}
        </td>
      </tr>
      {sec.tasks.map((t) => {
        const k = keyFn(sec.key, t.en);
        const isDone = done[k];
        return (
          <tr key={t.en} className="border-b border-line4 hover:bg-ivory/50">
            {/* Task (sticky) */}
            <td className="sticky left-0 z-10 bg-surface px-3 py-[7px] align-top" style={{ minWidth: 300 }}>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => setDone((d) => ({ ...d, [k]: !d[k] }))}
                  aria-label="toggle done"
                  className="mt-[2px] w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center flex-shrink-0 text-[10px]"
                  style={isDone
                    ? { background: sec.accent, borderColor: sec.accent, color: "#fff" }
                    : { borderColor: "#CFC6B6", color: "transparent" }}>
                  ✓
                </button>
                <div className="min-w-0">
                  <div className={"text-[12.5px] font-semibold leading-tight " + (isDone ? "line-through text-faint" : "text-ink")}>
                    {t.en}
                    {t.qty && <span className="ml-1 text-[10px] font-bold px-[5px] py-[1px] rounded-[5px] align-middle" style={{ background: sec.bg, color: sec.accent }}>{t.qty}</span>}
                  </div>
                  <div className="text-[10.5px] text-faint leading-tight">{t.jp}</div>
                  {t.link && <div className="text-[10.5px] font-semibold text-accent mt-[1px]">{t.link} ↗</div>}
                  {t.note && <div className="text-[10px] text-status-red mt-[1px]">{t.note}</div>}
                </div>
              </div>
            </td>
            <td className="px-2 py-[7px] text-[10.5px] text-muted align-top">{t.r}</td>
            <td className="px-2 py-[7px] text-[10.5px] font-bold text-ink align-top">{t.a}</td>
            {/* Day cells */}
            {DAYS.map((d) => {
              const v = t.marks[d];
              const weekend = isWeekend(d);
              const isToday = today === d;
              return (
                <td key={d}
                  className="text-center border-l border-line4 p-0"
                  style={{
                    width: 30, minWidth: 30,
                    background: isToday ? "rgba(184,148,90,0.12)" : weekend ? "#FBEFF1" : undefined,
                  }}>
                  {v && (
                    <span className="inline-block text-[10.5px] font-bold rounded-[4px] px-[3px] leading-[16px] min-w-[16px]"
                      style={{ background: sec.accent, color: "#fff" }}>
                      {v}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/* ── Agenda: reminder-oriented list, grouped by day ────────────────── */
function AgendaView({ today, done, setDone, keyFn }: {
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  keyFn: (s: string, en: string) => string;
}) {
  const byDay = useMemo(() => {
    const map: Record<number, { section: (typeof WORK_SECTIONS)[number]; en: string; jp: string; r: string; a: string; value: string }[]> = {};
    WORK_SECTIONS.forEach((sec) => sec.tasks.forEach((t) => {
      Object.entries(t.marks).forEach(([d, value]) => {
        const day = Number(d);
        (map[day] ||= []).push({ section: sec, en: t.en, jp: t.jp, r: t.r, a: t.a, value });
      });
    }));
    return map;
  }, []);
  const daysWithTasks = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  return (
    <div className="mt-5 flex flex-col gap-3">
      {daysWithTasks.map((day) => {
        const isToday = today === day;
        const isPast = today !== null && day < today;
        return (
          <div key={day} className="bg-surface border rounded-cardLg overflow-hidden"
            style={{ borderColor: isToday ? "#B8945A" : "#EDE7DA", opacity: isPast ? 0.6 : 1 }}>
            <div className="flex items-center gap-3 px-4 py-[9px] border-b border-line4"
              style={{ background: isToday ? "#B8945A" : isWeekend(day) ? "#FBEFF1" : "#FAFAF7" }}>
              <div className="text-[15px] font-extrabold" style={{ color: isToday ? "#fff" : "#211F1C" }}>
                {MONTH_LABEL.split(" ")[0]} {day}
              </div>
              <div className="text-[11px] font-bold px-2 py-[1px] rounded-pill"
                style={{ background: isToday ? "rgba(255,255,255,0.25)" : "#EEE8DE", color: isToday ? "#fff" : "#6b6258" }}>
                {fullWeekday(day)}
              </div>
              {isToday && <span className="text-[11px] font-bold text-white ml-auto">● Today</span>}
            </div>
            <div className="divide-y divide-line4">
              {byDay[day].map((item, i) => {
                const k = keyFn(item.section.key, item.en);
                const isDone = done[k];
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-[10px]">
                    <button
                      onClick={() => setDone((d) => ({ ...d, [k]: !d[k] }))}
                      className="mt-[2px] w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center flex-shrink-0 text-[10px]"
                      style={isDone
                        ? { background: item.section.accent, borderColor: item.section.accent, color: "#fff" }
                        : { borderColor: "#CFC6B6", color: "transparent" }}>
                      ✓
                    </button>
                    <div className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: item.section.accent }} />
                    <div className="flex-1 min-w-0">
                      <div className={"text-[13px] font-semibold leading-tight " + (isDone ? "line-through text-faint" : "text-ink")}>{item.en}</div>
                      <div className="text-[11px] text-faint">{item.jp}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: item.section.accent }}>{item.section.label}</div>
                      <div className="text-[11px] text-muted">{item.r} → <b className="text-ink">{item.a}</b></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fullWeekday(day: number) {
  const map: Record<string, string> = { S: "Weekend", M: "Monday", T: "Tuesday", W: "Wednesday", TH: "Thursday", F: "Friday" };
  return map[WEEKDAYS[day - 1]] ?? "";
}
