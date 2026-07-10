"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, RotateCcw, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useRole } from "@/lib/role";
import {
  WORK_SECTIONS, MONTH_NAMES, monthMeta, isWeekendDate, projectMarks,
  applyOverrides, nextValue, TEMPLATE_YEAR, TEMPLATE_MONTH,
} from "@/lib/data/workflow";
import { fetchWorkflowState, saveWorkflowState } from "@/lib/db/workflowState";

interface ResolvedTask {
  en: string; jp: string; r: string; a: string;
  link?: string; note?: string; qty?: string;
  taskKey: string; marks: Record<number, string>;
}
interface ResolvedSection {
  key: string; label: string; accent: string; bg: string; tasks: ResolvedTask[];
}

export default function WorkCalendarPage() {
  // Default to the real current month (falls back to the July 2026 template month).
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [overrides, setOverridesRaw] = useState<Record<string, string>>({});
  const [done, setDoneRaw] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"grid" | "agenda">("grid");
  const [edit, setEdit] = useState(false);

  const { role } = useRole();
  const canEdit = role === "CMO";

  // Load the shared calendar state once, then persist every change — the
  // overrides and checkmarks used to evaporate on refresh.
  const stateRef = useRef({ overrides, done });
  stateRef.current = { overrides, done };
  useEffect(() => {
    let alive = true;
    fetchWorkflowState().then((s) => {
      if (alive && s) { setOverridesRaw(s.overrides); setDoneRaw(s.done); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const setOverrides: typeof setOverridesRaw = (action) => {
    setOverridesRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveWorkflowState({ overrides: next, done: stateRef.current.done });
      return next;
    });
  };
  const setDone: typeof setDoneRaw = (action) => {
    setDoneRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveWorkflowState({ overrides: stateRef.current.overrides, done: next });
      return next;
    });
  };

  const monthKey = `${ym.y}-${ym.m}`;
  const meta = useMemo(() => monthMeta(ym.y, ym.m), [ym]);
  const monthLabel = `${MONTH_NAMES[ym.m]} ${ym.y}`;
  const isTemplate = ym.y === TEMPLATE_YEAR && ym.m === TEMPLATE_MONTH;
  const todayDay = now.getFullYear() === ym.y && now.getMonth() === ym.m ? now.getDate() : null;

  // Resolve every task's markers for the selected month (generate → override).
  const sections: ResolvedSection[] = useMemo(() =>
    WORK_SECTIONS.map((sec) => ({
      ...sec,
      tasks: sec.tasks.map((t) => {
        const taskKey = `${sec.key}::${t.en}`;
        const base = projectMarks(t.marks, ym.y, ym.m);
        return { ...t, taskKey, marks: applyOverrides(base, monthKey, taskKey, overrides) };
      }),
    })), [ym, monthKey, overrides]);

  const allTasks = useMemo(() => sections.flatMap((s) => s.tasks.map((t) => ({ ...t, section: s }))), [sections]);
  const monthOverrides = Object.keys(overrides).filter((k) => k.startsWith(`${monthKey}::`) && overrides[k] !== undefined);

  const todaysCount = todayDay ? allTasks.filter((t) => t.marks[todayDay] !== undefined).length : 0;
  const weekRange = todayDay ? Array.from({ length: 7 }, (_, i) => todayDay + i).filter((d) => d <= meta.days.length) : [];
  const weekCount = allTasks.filter((t) => weekRange.some((d) => t.marks[d] !== undefined)).length;
  const doneCount = Object.entries(done).filter(([k, v]) => v && k.startsWith(`${monthKey}::`)).length;
  const totalTasks = allTasks.length;

  const shiftMonth = (delta: number) => {
    setEdit(false);
    setYm(({ y, m }) => {
      const nm = m + delta;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  };

  const onCell = (taskKey: string, day: number, current: string | undefined) => {
    if (!edit || !canEdit) return;
    setOverrides((o) => ({ ...o, [`${monthKey}::${taskKey}::${day}`]: nextValue(current) }));
  };
  const resetMonth = () => setOverrides((o) => {
    const next = { ...o };
    Object.keys(next).forEach((k) => { if (k.startsWith(`${monthKey}::`)) delete next[k]; });
    return next;
  });

  return (
    <>
      <PageHeader
        eyebrow="Work Flow"
        title="Work Calendar"
        subtitle={`${monthLabel} · team timeline & deliverable reminders${isTemplate ? "" : " · auto-generated"}`}
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

      {/* Month navigator + admin edit */}
      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="w-8 h-8 rounded-[9px] border border-line2 bg-white flex items-center justify-center text-muted hover:bg-ivory">
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (y && m) { setEdit(false); setYm({ y, m: m - 1 }); }
            }}
            className="text-[13px] font-bold text-ink bg-white border border-line2 rounded-[9px] px-3 py-[7px] outline-none"
          />
          <button onClick={() => shiftMonth(1)} aria-label="Next month" className="w-8 h-8 rounded-[9px] border border-line2 bg-white flex items-center justify-center text-muted hover:bg-ivory">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setEdit(false); setYm({ y: TEMPLATE_YEAR, m: TEMPLATE_MONTH }); }}
            className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white hover:bg-ivory">
            Jul 2026
          </button>
        </div>

        {canEdit && view === "grid" && (
          <div className="flex items-center gap-2">
            {edit && monthOverrides.length > 0 && (
              <button onClick={resetMonth} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white">
                <RotateCcw size={13} /> Reset month
              </button>
            )}
            <button onClick={() => setEdit((e) => !e)}
              className="inline-flex items-center gap-[6px] text-[12px] font-bold rounded-[9px] px-4 py-[7px]"
              style={edit ? { background: "#4E7A4E", color: "#fff" } : { background: "#211F1C", color: "#fff" }}>
              {edit ? <><Check size={13} /> Done editing</> : <><Pencil size={13} /> Edit</>}
            </button>
          </div>
        )}
      </div>

      {edit && (
        <div className="mt-3 rounded-card px-4 py-[10px] text-[12px] font-semibold flex items-center gap-2" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
          ✏️ Admin edit mode — คลิกช่องวันเพื่อ เพิ่ม / เปลี่ยนค่า (7→8→9→6→8-9) / ลบ marker · การแก้ไขจะผูกกับเดือน {monthLabel}
        </div>
      )}

      {/* Reminder strip */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div className="rounded-card p-4" style={{ background: "#211F1C", color: "#fff" }}>
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-accent">Due today</div>
          <div className="text-[25px] font-bold mt-[4px]">{todaysCount}</div>
          <div className="text-[11px] text-white/50 mt-[2px]">{todayDay ? `${MONTH_NAMES[ym.m]} ${todayDay}` : `not viewing this month`}</div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">Next 7 days</div>
          <div className="text-[25px] font-bold mt-[4px] text-ink">{weekCount}</div>
          <div className="text-[11px] text-faint mt-[2px]">tasks with a deadline</div>
        </div>
        <div className="bg-surface border border-line rounded-card p-4">
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">Checked off</div>
          <div className="text-[25px] font-bold mt-[4px] text-ink">{doneCount}<span className="text-[15px] text-faint font-semibold"> / {totalTasks}</span></div>
          <div className="text-[11px] text-faint mt-[2px]">in {MONTH_NAMES[ym.m]}</div>
        </div>
      </div>

      {view === "grid" ? (
        <GridView sections={sections} meta={meta} today={todayDay} done={done} setDone={setDone}
          monthKey={monthKey} edit={edit && canEdit} onCell={onCell} overrides={overrides} />
      ) : (
        <AgendaView sections={sections} meta={meta} today={todayDay} done={done} setDone={setDone} monthKey={monthKey} />
      )}
    </>
  );
}

/* ── Grid: the month timeline ──────────────────────────────────────── */
function GridView({ sections, meta, today, done, setDone, monthKey, edit, onCell, overrides }: {
  sections: ResolvedSection[];
  meta: ReturnType<typeof monthMeta>;
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  monthKey: string;
  edit: boolean;
  onCell: (taskKey: string, day: number, current: string | undefined) => void;
  overrides: Record<string, string>;
}) {
  const colW = 30;
  return (
    <div className="mt-5 bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[12px] w-full" style={{ minWidth: 420 + meta.days.length * colW }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-panel text-white text-left font-bold px-3 py-2 text-[11px]" style={{ minWidth: 300 }}>Task</th>
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 96 }}>R</th>
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 60 }}>A</th>
              {meta.days.map((d) => {
                const weekend = meta.letters[d - 1] === "S";
                return (
                  <th key={d} className="px-0 py-1 text-center font-bold border-l border-white/10"
                    style={{
                      minWidth: colW, width: colW,
                      background: today === d ? "#B8945A" : weekend ? "#3a2f2b" : "#211F1C",
                      color: today === d ? "#211F1C" : "#fff",
                    }}>
                    <div className="text-[10px] leading-none">{d}</div>
                    <div className="text-[8px] leading-none mt-[2px] opacity-60">{meta.letters[d - 1]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <SectionRows key={sec.key} sec={sec} meta={meta} today={today} done={done} setDone={setDone}
                monthKey={monthKey} edit={edit} onCell={onCell} overrides={overrides} colW={colW} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRows({ sec, meta, today, done, setDone, monthKey, edit, onCell, overrides, colW }: {
  sec: ResolvedSection;
  meta: ReturnType<typeof monthMeta>;
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  monthKey: string;
  edit: boolean;
  onCell: (taskKey: string, day: number, current: string | undefined) => void;
  overrides: Record<string, string>;
  colW: number;
}) {
  return (
    <>
      <tr>
        <td colSpan={3 + meta.days.length} className="px-3 py-[6px] font-extrabold text-[11.5px] tracking-[0.04em] uppercase border-y border-line4"
          style={{ background: sec.bg, color: sec.accent }}>
          {sec.label}
        </td>
      </tr>
      {sec.tasks.map((t) => {
        const dk = `${monthKey}::${t.taskKey}`;
        const isDone = done[dk];
        return (
          <tr key={t.en} className="border-b border-line4 hover:bg-ivory/50">
            <td className="sticky left-0 z-10 bg-surface px-3 py-[7px] align-top" style={{ minWidth: 300 }}>
              <div className="flex items-start gap-2">
                <button onClick={() => setDone((d) => ({ ...d, [dk]: !d[dk] }))} aria-label="toggle done"
                  className="mt-[2px] w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center flex-shrink-0 text-[10px]"
                  style={isDone ? { background: sec.accent, borderColor: sec.accent, color: "#fff" } : { borderColor: "#CFC6B6", color: "transparent" }}>
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
            {meta.days.map((d) => {
              const v = t.marks[d];
              const weekend = meta.letters[d - 1] === "S";
              const isToday = today === d;
              const overridden = overrides[`${monthKey}::${t.taskKey}::${d}`] !== undefined;
              return (
                <td key={d}
                  onClick={() => onCell(t.taskKey, d, v)}
                  className={"text-center border-l border-line4 p-0 " + (edit ? "cursor-pointer hover:bg-accent/10" : "")}
                  style={{
                    width: colW, minWidth: colW,
                    background: isToday ? "rgba(184,148,90,0.12)" : weekend ? "#FBEFF1" : undefined,
                    boxShadow: edit && overridden ? "inset 0 0 0 1.5px #4E7A4E" : undefined,
                  }}>
                  {v
                    ? <span className="inline-block text-[10.5px] font-bold rounded-[4px] px-[3px] leading-[16px] min-w-[16px]" style={{ background: sec.accent, color: "#fff" }}>{v}</span>
                    : edit ? <span className="text-[11px] text-line2 leading-[16px]">+</span> : null}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/* ── Agenda: reminder list grouped by day ──────────────────────────── */
function AgendaView({ sections, meta, today, done, setDone, monthKey }: {
  sections: ResolvedSection[];
  meta: ReturnType<typeof monthMeta>;
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  monthKey: string;
}) {
  const byDay = useMemo(() => {
    const map: Record<number, { section: ResolvedSection; en: string; jp: string; r: string; a: string; taskKey: string; value: string }[]> = {};
    sections.forEach((sec) => sec.tasks.forEach((t) => {
      Object.entries(t.marks).forEach(([d, value]) => {
        (map[Number(d)] ||= []).push({ section: sec, en: t.en, jp: t.jp, r: t.r, a: t.a, taskKey: t.taskKey, value });
      });
    }));
    return map;
  }, [sections]);
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const fullWeekday = (day: number) => (
    { S: "Weekend", M: "Monday", T: "Tuesday", W: "Wednesday", TH: "Thursday", F: "Friday" }[meta.letters[day - 1]] ?? ""
  );

  if (days.length === 0) {
    return <div className="mt-5 bg-surface border border-line rounded-cardLg p-10 text-center text-[13px] text-faint">No scheduled deliverables this month.</div>;
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      {days.map((day) => {
        const isToday = today === day;
        const isPast = today !== null && day < today;
        const weekend = meta.letters[day - 1] === "S";
        return (
          <div key={day} className="bg-surface border rounded-cardLg overflow-hidden" style={{ borderColor: isToday ? "#B8945A" : "#EDE7DA", opacity: isPast ? 0.6 : 1 }}>
            <div className="flex items-center gap-3 px-4 py-[9px] border-b border-line4" style={{ background: isToday ? "#B8945A" : weekend ? "#FBEFF1" : "#FAFAF7" }}>
              <div className="text-[15px] font-extrabold" style={{ color: isToday ? "#fff" : "#211F1C" }}>{MONTH_NAMES[meta.month]} {day}</div>
              <div className="text-[11px] font-bold px-2 py-[1px] rounded-pill" style={{ background: isToday ? "rgba(255,255,255,0.25)" : "#EEE8DE", color: isToday ? "#fff" : "#6b6258" }}>{fullWeekday(day)}</div>
              {isToday && <span className="text-[11px] font-bold text-white ml-auto">● Today</span>}
            </div>
            <div className="divide-y divide-line4">
              {byDay[day].map((item, i) => {
                const dk = `${monthKey}::${item.taskKey}`;
                const isDone = done[dk];
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-[10px]">
                    <button onClick={() => setDone((d) => ({ ...d, [dk]: !d[dk] }))}
                      className="mt-[2px] w-[16px] h-[16px] rounded-[4px] border flex items-center justify-center flex-shrink-0 text-[10px]"
                      style={isDone ? { background: item.section.accent, borderColor: item.section.accent, color: "#fff" } : { borderColor: "#CFC6B6", color: "transparent" }}>✓</button>
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
