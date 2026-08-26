"use client";

import { toastError, toastSuccess } from "@/lib/toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, RotateCcw, Check, Download, Printer } from "lucide-react";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";
import { useRole } from "@/lib/role";
import {
  MONTH_NAMES, monthMeta, projectMarks,
  applyOverrides, nextValue, valueCycleFor, TEMPLATE_YEAR, TEMPLATE_MONTH,
} from "@/lib/data/workflow";
import { fetchWorkflowState, saveWorkflowState, workflowTasksReady } from "@/lib/db/workflowState";
import { supabase } from "@/lib/supabase";
import { downloadXlsx } from "@/lib/xlsx";
import { resetDeadlineCache } from "@/lib/useDeadlines";
import {
  CalendarTaskEdit, resolveCalendarSections, nextCustomKey,
  withTaskEdit, withTaskRemoved, withTaskRestored, hiddenTemplateTasks,
} from "@/lib/data/calendarTasks";
import { unboundMilestones } from "@/lib/data/deadlinePolicy";
import { DatePicker, fmtShort } from "@/components/ui/DatePicker";
import { DeadlineBoard } from "@/components/work/DeadlineBoard";

interface ResolvedTask {
  en: string; jp: string; r: string; a: string;
  link?: string; note?: string; qty?: string;
  /** Stable identity — markers and done-marks are filed under it. */
  key: string;
  custom: boolean;
  taskKey: string; marks: Record<number, string>;
}
interface ResolvedSection {
  key: string; label: string; accent: string; bg: string; tasks: ResolvedTask[];
}

const usesDb = () => !!supabase();

export default function WorkCalendarPage() {
  // Default to the real current month (falls back to the July 2026 template month).
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [overrides, setOverridesRaw] = useState<Record<string, string>>({});
  const [done, setDoneRaw] = useState<Record<string, boolean>>({});
  const [taskEdits, setTaskEditsRaw] = useState<CalendarTaskEdit[]>([]);
  const [view, setView] = useState<"grid" | "agenda">("grid");
  const [edit, setEdit] = useState(false);

  const { role } = useRole();
  // Team Calendar edits: CMO + Co-ordinator (cross-team scheduling is the
  // co-ordinator's job); everyone else reads.
  const canEdit = role === "CMO" || role === "Co-ordinator";

  // Load the shared calendar state once, then persist every change — the
  // overrides and checkmarks used to evaporate on refresh.
  const stateRef = useRef({ overrides, done, tasks: taskEdits });
  stateRef.current = { overrides, done, tasks: taskEdits };
  useEffect(() => {
    let alive = true;
    fetchWorkflowState().then((s) => {
      if (alive && s) { setOverridesRaw(s.overrides); setDoneRaw(s.done); setTaskEditsRaw(s.tasks ?? []); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const setOverrides: typeof setOverridesRaw = (action) => {
    setOverridesRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      // Other modules read these markers as their deadlines and cache them once
      // per session; without this, editing the calendar left Content Plan and
      // the Graphic drawer showing the old dates until a full reload.
      resetDeadlineCache();
      saveWorkflowState({ overrides: next, done: stateRef.current.done, tasks: stateRef.current.tasks })
        .catch((error) => toastError(`บันทึก Team Calendar ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      return next;
    });
  };
  const setDone: typeof setDoneRaw = (action) => {
    setDoneRaw((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveWorkflowState({ overrides: stateRef.current.overrides, done: next, tasks: stateRef.current.tasks })
        .catch((error) => toastError(`บันทึก Team Calendar ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      return next;
    });
  };

  // Row edits need supabase/workflow_custom_tasks.sql. Without it they live for
  // the session only, so the editor says so rather than pretending to save.
  const [tasksPersist, setTasksPersist] = useState(true);
  useEffect(() => {
    let alive = true;
    void workflowTasksReady().then((ok) => { if (alive) setTasksPersist(ok || !usesDb()); });
    return () => { alive = false; };
  }, []);

  const setTaskEdits = (updater: (prev: CalendarTaskEdit[]) => CalendarTaskEdit[]) => {
    setTaskEditsRaw((prev) => {
      const next = updater(prev);
      // Rows decide which deadlines exist at all, so other modules must not go
      // on resolving against a row that was just renamed or retired.
      resetDeadlineCache();
      saveWorkflowState({ overrides: stateRef.current.overrides, done: stateRef.current.done, tasks: next })
        .catch((error) => toastError(`บันทึกรายการงานไม่สำเร็จ: ${error?.message || "Unknown error"}`));
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
    // The row list is template + the team's edits, resolved in one place so the
    // grid, the export and the deadline resolver never disagree about which
    // rows exist. taskKey comes from the row's stable identity, not its name —
    // renaming a row must not orphan its markers.
    resolveCalendarSections(taskEdits).map((sec) => ({
      ...sec,
      tasks: sec.tasks.map((t) => {
        const base = projectMarks(t.marks, ym.y, ym.m);
        return { ...t, taskKey: t.key, marks: applyOverrides(base, monthKey, t.key, overrides) };
      }),
    })), [ym, monthKey, overrides, taskEdits]);

  const allTasks = useMemo(() => sections.flatMap((s) => s.tasks.map((t) => ({ ...t, section: s }))), [sections]);
  const monthOverrides = Object.keys(overrides).filter((k) => k.startsWith(`${monthKey}::`) && overrides[k] !== undefined);

  const alertItems = useMemo(() => {
    if (todayDay == null) return { dueToday: [] as typeof allTasks, overdue: [] as typeof allTasks, pending: [] as typeof allTasks };
    const pending = allTasks.filter((t) => {
      const dk = `${monthKey}::${t.taskKey}`;
      if (done[dk]) return false;
      const days = Object.keys(t.marks).map(Number);
      return days.some((d) => d <= todayDay);
    });
    return {
      dueToday: pending.filter((t) => Object.prototype.hasOwnProperty.call(t.marks, todayDay)),
      overdue: pending.filter((t) => Object.keys(t.marks).map(Number).some((d) => d < todayDay)),
      pending,
    };
  }, [allTasks, done, monthKey, todayDay]);

  // ── Export ───────────────────────────────────────────────────────────────
  // The grid as a rectangle: Section / Task / Owner / Accountable / Qty / Note,
  // then one column per day carrying that day's marker. Same shape as the sheet
  // this calendar came from, so an exported month drops straight back into it.
  const exportRows = (): (string | number | null)[][] => {
    const header = [
      "Section", "Task (EN)", "Task (JP)", "Responsible", "Accountable", "Qty", "Note", "Done",
      ...meta.days.map((d) => `${d} ${meta.letters[d - 1]}`),
    ];
    const body = sections.flatMap((sec) =>
      sec.tasks.map((t) => [
        sec.label, t.en, t.jp, t.r, t.a, t.qty ?? "", t.note ?? "",
        done[`${monthKey}::${t.taskKey}`] ? "✓" : "",
        ...meta.days.map((d) => t.marks[d] ?? ""),
      ]),
    );
    return [[`Work Calendar — ${monthLabel}`], [], header, ...body];
  };

  const exportXlsx = () => {
    try {
      downloadXlsx(exportRows(), `work-calendar-${ym.y}-${String(ym.m + 1).padStart(2, "0")}.xlsx`, monthLabel);
    } catch (error) {
      toastError(`Export ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };
  // PDF via the browser's own print dialog ("Save as PDF"). A print stylesheet
  // beats a bundled PDF engine here: the grid is 31 columns wide and the print
  // layout is the one thing that has to adapt to the paper the user picks.
  const exportPdf = () => {
    setEdit(false);
    setView("grid");
    // @page cannot be scoped to a selector, and the global sheet pins A5
    // landscape for the expense voucher. Inject the calendar's paper size last
    // so it wins, and take it back out afterwards.
    const style = document.createElement("style");
    style.textContent = "@page { size: A3 landscape; margin: 8mm; }";
    document.head.appendChild(style);
    document.body.classList.add("printing-calendar");
    const cleanup = () => {
      document.body.classList.remove("printing-calendar");
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    // Let the grid re-render before the print dialog freezes the page.
    setTimeout(() => {
      window.print();
      // Safari never fires afterprint for the "Save as PDF" path, so the class
      // would stick and break the next voucher print. Belt and braces.
      setTimeout(cleanup, 1000);
    }, 80);
  };

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
    // ym.m is 0-based; the marker cycle speaks calendar months.
    setOverrides((o) => ({ ...o, [`${monthKey}::${taskKey}::${day}`]: nextValue(current, ym.m + 1) }));
  };

  /** Set (or clear) one day for a row from the Period column's date picker.
   *  Picking a date is not the same gesture as clicking a cell: the cell cycles
   *  through markers, while this says "this row happens on this day" and leaves
   *  the marker at the default. Clearing passes day = null. */
  const onPickDay = (taskKey: string, day: number | null, replacing?: number) => {
    if (!edit || !canEdit) return;
    setOverrides((o) => {
      const next = { ...o };
      // Moving an existing date clears the old one, so a row does not quietly
      // end up on two days when someone meant to correct one.
      if (replacing !== undefined) next[`${monthKey}::${taskKey}::${replacing}`] = "";
      if (day !== null) next[`${monthKey}::${taskKey}::${day}`] = String(ym.m + 1);
      return next;
    });
  };
  const resetMonth = () => setOverrides((o) => {
    const next = { ...o };
    Object.keys(next).forEach((k) => { if (k.startsWith(`${monthKey}::`)) delete next[k]; });
    return next;
  });

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="TEAM CALENDAR"
        title="Work Calendar"
        description={`${monthLabel} · team timeline & deliverable reminders${isTemplate ? "" : " · auto-generated"}`}
      />

      <div className="mt-5">
        <CampaignCommandBar
          action={
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
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
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
                className="text-[13px] font-bold text-ink bg-white border border-line2 rounded-[12px] px-3 py-[8px] outline-none"
              />
              <button onClick={() => shiftMonth(1)} aria-label="Next month" className="w-8 h-8 rounded-[9px] border border-line2 bg-white flex items-center justify-center text-muted hover:bg-ivory">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => { setEdit(false); setYm({ y: TEMPLATE_YEAR, m: TEMPLATE_MONTH }); }}
                className="text-[12px] font-semibold text-muted border border-line2 rounded-[12px] px-3 py-[8px] bg-white hover:bg-ivory">
                Jul 2026
              </button>
            </div>

            {/* Export is for everyone: reading the month out to a spreadsheet
                or a PDF changes nothing, so it is not gated on canEdit. */}
            <div className="flex items-center gap-2 flex-wrap no-print">
              <button onClick={exportXlsx} title="ดาวน์โหลดเป็น Excel (.xlsx)"
                className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[12px] px-3 py-[8px] bg-white hover:bg-ivory">
                <Download size={13} /> Excel
              </button>
              <button onClick={exportPdf} title="พิมพ์ / บันทึกเป็น PDF"
                className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[12px] px-3 py-[8px] bg-white hover:bg-ivory">
                <Printer size={13} /> PDF
              </button>
            </div>

            {canEdit && view === "grid" && (
              <div className="flex items-center gap-2 flex-wrap no-print">
                {edit && monthOverrides.length > 0 && (
                  <button onClick={resetMonth} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[12px] px-3 py-[8px] bg-white">
                    <RotateCcw size={13} /> Reset month
                  </button>
                )}
                <button onClick={() => setEdit((e) => !e)}
                  className="inline-flex items-center gap-[6px] text-[12px] font-bold rounded-[12px] px-4 py-[8px]"
                  style={edit ? { background: "#4E7A4E", color: "#fff" } : { background: "#211F1C", color: "#fff" }}>
                  {edit ? <><Check size={13} /> Done editing</> : <><Pencil size={13} /> Edit</>}
                </button>
              </div>
            )}
          </div>
        </CampaignCommandBar>
      </div>

      {edit && (
        <>
          <div className="mt-3 rounded-card px-4 py-[10px] text-[12px] font-semibold flex items-center gap-2" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
            ✏️ Admin edit mode — คลิกช่องวันเพื่อ เพิ่ม / เปลี่ยนค่า ({valueCycleFor(ym.m + 1).join(" → ")}) / ลบ marker · marker คือ “เดือนของงาน” วางแผนล่วงหน้าได้ 2 เดือน · การแก้ไขจะผูกกับเดือน {monthLabel}
          </div>
          <TaskEditor
            sections={sections}
            edits={taskEdits}
            setEdits={setTaskEdits}
            tasksPersist={tasksPersist}
            monthKey={monthKey}
            monthLabel={monthLabel}
            daysInMonth={meta.days.length}
            markerCycle={valueCycleFor(ym.m + 1)}
            setOverrides={setOverrides}
          />
        </>
      )}

      {(alertItems.pending.length > 0 || todayDay !== null) && (
        <div className="mt-3 rounded-cardLg border px-4 py-3 flex flex-wrap items-center gap-2"
          style={{
            background: alertItems.overdue.length > 0 ? "#FFF5F4" : "#FFF9EE",
            borderColor: alertItems.overdue.length > 0 ? "#F5C8C4" : "#F0D5BC",
          }}>
          <span className="text-[12px] font-extrabold uppercase tracking-[0.08em]"
            style={{ color: alertItems.overdue.length > 0 ? "#B33A2E" : "#C2691E" }}>
            Team alerts
          </span>
          {alertItems.overdue.length > 0 && (
            <span className="text-[12px] font-bold px-3 py-[6px] rounded-pill" style={{ background: "#FDE3E0", color: "#B33A2E" }}>
              ⏰ {alertItems.overdue.length} overdue
            </span>
          )}
          {alertItems.dueToday.length > 0 && (
            <span className="text-[12px] font-bold px-3 py-[6px] rounded-pill" style={{ background: "#FDF0D9", color: "#C2691E" }}>
              📌 {alertItems.dueToday.length} due today
            </span>
          )}
          {alertItems.pending.length > 0 && (
            <span className="text-[12px] font-bold px-3 py-[6px] rounded-pill" style={{ background: "#F7F4FF", color: "#6C5CE7" }}>
              🗂 {alertItems.pending.length} pending from schedule
            </span>
          )}
          {alertItems.pending.length === 0 && todayDay !== null && (
            <span className="text-[12px] font-bold px-3 py-[6px] rounded-pill" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
              ✅ no carry-over today
            </span>
          )}
        </div>
      )}

      {/* The grid's own answer to "what is due", above the grid. Same rows,
          read through the same resolver every other module uses — the month
          being viewed, not always today's. */}
      <div className="mt-5">
        <DeadlineBoard month={`${ym.y}-${String(ym.m + 1).padStart(2, "0")}`} compact />
      </div>

      <div className="mt-5">
        <ModuleSummaryCard
          title="Calendar Snapshot"
          style={{
            background: "linear-gradient(135deg, #EEF2FF 0%, #F7F4FF 100%)",
            border: "1px solid #DAD7FA",
            boxShadow: "0 18px 44px rgba(108, 92, 231, 0.12)",
          }}
          titleClassName="text-[#7B72B7]"
        >
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <div className="rounded-[22px] p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(123,114,183,0.16)" }}>
              <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-[#7B72B7]">Due today</div>
              <div className="text-[25px] font-bold mt-[4px] text-ink">{todaysCount}</div>
              <div className="text-[11px] mt-[2px] text-[#7D7789]">{todayDay ? `${MONTH_NAMES[ym.m]} ${todayDay}` : "not viewing this month"}</div>
            </div>
            <div className="rounded-[22px] p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(123,114,183,0.16)" }}>
              <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-[#7B72B7]">Next 7 days</div>
              <div className="text-[25px] font-bold mt-[4px] text-ink">{weekCount}</div>
              <div className="text-[11px] mt-[2px] text-[#7D7789]">tasks with a deadline</div>
            </div>
            <div className="rounded-[22px] p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(123,114,183,0.16)" }}>
              <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-[#7B72B7]">Checked off</div>
              <div className="text-[25px] font-bold mt-[4px] text-ink">{doneCount}<span className="text-[15px] font-semibold text-[#7D7789]"> / {totalTasks}</span></div>
              <div className="text-[11px] mt-[2px] text-[#7D7789]">in {MONTH_NAMES[ym.m]}</div>
            </div>
            <div className="rounded-[22px] p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(123,114,183,0.16)" }}>
              <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-[#7B72B7]">Tracked tasks</div>
              <div className="text-[25px] font-bold mt-[4px] text-ink">{totalTasks}</div>
              <div className="text-[11px] mt-[2px] text-[#7D7789]">across all workflow sections</div>
            </div>
            <div className="rounded-[22px] p-4" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(123,114,183,0.16)" }}>
              <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-[#7B72B7]">Needs attention</div>
              <div className="text-[25px] font-bold mt-[4px]" style={{ color: alertItems.overdue.length > 0 ? "#B33A2E" : "#C2691E" }}>
                {alertItems.overdue.length + alertItems.dueToday.length}
              </div>
              <div className="text-[11px] mt-[2px] text-[#7D7789]">overdue + due today</div>
            </div>
          </div>
        </ModuleSummaryCard>
      </div>

      {/* print-calendar-root marks what the PDF export prints; the heading is
          re-stated inside it because the page header above is outside. */}
      <div className="print-calendar-root">
        <div className="hidden print:block text-[14px] font-extrabold mb-2">Work Calendar — {monthLabel}</div>
        {view === "grid" ? (
          <GridView sections={sections} meta={meta} today={todayDay} done={done} setDone={setDone} onPickDay={onPickDay}
            monthKey={monthKey} edit={edit && canEdit} onCell={onCell} overrides={overrides} />
        ) : (
          <AgendaView sections={sections} meta={meta} today={todayDay} done={done} setDone={setDone} monthKey={monthKey} />
        )}
      </div>
    </>
  );
}

/* ── Row editor ───────────────────────────────────────────────────────────
 *
 * The rows ship in code because they came from the team's own sheet, but the
 * team has to be able to change them — and now that the calendar drives every
 * module's deadlines, a row nobody can add is a deadline nobody can express.
 *
 * Template rows are hidden rather than deleted: the row itself lives in code
 * and a "delete" would come back on the next deploy. Rows the team invented are
 * removed outright.
 */
function TaskEditor({ sections, edits, setEdits, tasksPersist, monthKey, monthLabel, daysInMonth, markerCycle, setOverrides }: {
  sections: ResolvedSection[];
  edits: CalendarTaskEdit[];
  setEdits: (fn: (prev: CalendarTaskEdit[]) => CalendarTaskEdit[]) => void;
  tasksPersist: boolean;
  monthKey: string;
  monthLabel: string;
  daysInMonth: number;
  markerCycle: string[];
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [openSection, setOpenSection] = useState<string>("");
  // A new row used to arrive with no marker, so the only way to date it was to
  // hunt for its cell in a 31-column grid. The date is part of adding the work.
  const [draft, setDraft] = useState({ en: "", r: "", a: "", day: "", marker: markerCycle[0] ?? "" });
  // Bounds for every picker in this editor: marks are stored per month, so a
  // date outside the month on screen has nowhere to go. monthKey is "YYYY-M"
  // with a 0-based month.
  const [monthYear, monthIdx] = monthKey.split("-").map(Number);
  const monthNum = monthIdx + 1;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const monthMin = `${monthYear}-${pad2(monthNum)}-01`;
  const monthMax = `${monthYear}-${pad2(monthNum)}-${pad2(daysInMonth)}`;

  /** Write (or clear) one day's marker for a row, in the month on screen. */
  const setDay = (taskKey: string, day: number, marker: string) => {
    if (!Number.isFinite(day) || day < 1 || day > daysInMonth) return;
    setOverrides((o) => ({ ...o, [`${monthKey}::${taskKey}::${day}`]: marker }));
  };
  const hidden = hiddenTemplateTasks(edits);
  const unbound = unboundMilestones(edits);
  const field = "text-[12px] px-[9px] py-[6px] rounded-[8px] border border-line2 bg-white outline-none";

  const add = (sectionKey: string) => {
    const en = draft.en.trim();
    if (!en) return;
    const day = Number(draft.day);
    const dated = Number.isFinite(day) && day >= 1 && day <= daysInMonth;
    let key = "";
    setEdits((prev) => {
      key = nextCustomKey(sectionKey, prev);
      return withTaskEdit(prev, {
        key, section: sectionKey, custom: true,
        en, r: draft.r.trim(), a: draft.a.trim(),
      });
    });
    // The marker is a separate write (it lives in `overrides`, keyed by month),
    // but it belongs to the same action — a row added with a date must not need
    // a second trip to the grid to actually carry one.
    if (dated && key) setDay(key, day, draft.marker || markerCycle[0]);
    setDraft({ en: "", r: "", a: "", day: "", marker: markerCycle[0] ?? "" });
    toastSuccess(dated
      ? `เพิ่มงาน “${en}” · วันที่ ${day} ${monthLabel} (งานของเดือน ${draft.marker || markerCycle[0]})`
      : `เพิ่มงาน “${en}” แล้ว — ยังไม่ได้กำหนดวัน`);
  };

  const rename = (t: ResolvedTask, sectionKey: string, en: string) => {
    if (!en.trim() || en === t.en) return;
    setEdits((prev) => withTaskEdit(prev, { key: t.key, section: sectionKey, en: en.trim() }));
  };

  const remove = (t: ResolvedTask, sectionKey: string) => {
    if (!window.confirm(`${t.custom ? "ลบ" : "ซ่อน"}งาน “${t.en}” ?\n\n${t.custom ? "งานที่ทีมเพิ่มเองจะถูกลบถาวร" : "งานจาก template จะถูกซ่อน กดคืนได้ด้านล่าง"}`)) return;
    setEdits((prev) => withTaskRemoved(prev, t.key, sectionKey));
    toastSuccess(`${t.custom ? "ลบ" : "ซ่อน"}งาน “${t.en}” แล้ว`);
  };

  return (
    <div className="mt-3 rounded-cardLg border border-line2 bg-surface p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[12.5px] font-extrabold text-ink">🧱 แก้รายการงานในปฏิทิน</span>
        <span className="text-[11px] text-faint">เพิ่ม / เปลี่ยนชื่อ / ซ่อน — marker ของแต่ละงานยังผูกกับงานเดิมแม้เปลี่ยนชื่อ</span>
      </div>
      {!tasksPersist && (
        <div className="mb-2 rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#FBF6EC", border: "1px solid #EADBC1", color: "#8A6D1E" }}>
          ⚠ ยังไม่ได้รัน <code className="font-mono">supabase/workflow_custom_tasks.sql</code> — แก้ได้แต่จะไม่ถูกบันทึก
        </div>
      )}

      {/* A milestone whose row has been retired stops driving its deadline, and
          every module quietly falls back to its own rule. That is the correct
          behaviour but a terrible surprise, so it is stated here — this editor
          is where the row was removed. */}
      {unbound.length > 0 && (
        <div className="mb-2 rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
          ⚠ เดดไลน์ที่ไม่มีแถวรองรับแล้ว: {unbound.map((u) => u.label).join(", ")} —
          โมดูลที่เคยใช้วันจากแถวนี้จะกลับไปใช้กติกาของตัวเอง กดคืนงานที่ซ่อนไว้ด้านล่าง หรือสร้างแถวใหม่แล้วผูกใหม่
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sections.map((sec) => {
          const open = openSection === sec.key;
          return (
            <div key={sec.key} className="rounded-[10px] border border-line3">
              <button onClick={() => setOpenSection(open ? "" : sec.key)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left">
                <span className="text-faint text-[12px]">{open ? "▾" : "▸"}</span>
                <span className="text-[12px] font-bold" style={{ color: sec.accent }}>{sec.label}</span>
                <span className="text-[11px] text-faint">{sec.tasks.length} งาน</span>
              </button>
              {open && (
                <div className="px-3 pb-3 flex flex-col gap-[6px]">
                  {sec.tasks.map((t) => {
                    const days = Object.keys(t.marks).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
                    return (
                      <div key={t.key} className="flex items-start gap-2 flex-wrap">
                        <input
                          defaultValue={t.en}
                          onBlur={(e) => rename(t, sec.key, e.target.value)}
                          className={`${field} flex-1 min-w-[180px]`}
                          aria-label={`ชื่องาน ${t.en}`}
                        />
                        {t.custom && <span className="text-[10px] font-bold rounded-pill px-2 py-[2px] mt-[6px]" style={{ background: "#F2EEFF", color: "#6C5CE7" }}>เพิ่มเอง</span>}
                        <button onClick={() => remove(t, sec.key)} title={t.custom ? "ลบ" : "ซ่อน"}
                          className="text-[12px] font-bold text-status-red px-2 mt-[6px]">✕</button>
                        {/* The days this row sits on IN THE MONTH ON SCREEN, editable
                            here so a wrong date does not mean hunting for one cell
                            in a 31-column grid. The number on the chip is the
                            marker — which month the work is for. */}
                        <div className="w-full flex items-center gap-[6px] flex-wrap pl-1">
                          <span className="text-[10.5px] text-faint">วันที่ใน {monthLabel}:</span>
                          {days.length === 0 && <span className="text-[10.5px] text-faint">— ยังไม่กำหนด</span>}
                          {days.map((d) => (
                            <span key={d} className="inline-flex items-center gap-[4px] rounded-pill px-[9px] py-[3px] text-[11px] font-bold"
                              style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
                              {d} <span className="opacity-60">· {t.marks[d]}</span>
                              <button onClick={() => setDay(t.key, d, "")} aria-label={`ลบวันที่ ${d}`} title="ลบวันนี้" className="opacity-50 hover:opacity-100">✕</button>
                            </span>
                          ))}
                          {/* Was a bare number box. A typed "8" carries no
                              weekday and no month, so a slip put the work on a
                              day nobody was looking at; the shared picker takes
                              no typed input at all. */}
                          <DatePicker
                            value={null}
                            min={monthMin}
                            max={monthMax}
                            placeholder="+ เลือกวัน"
                            onChange={(nextIso) => setDay(t.key, Number(nextIso.split("-")[2]), markerCycle[0])}
                            className="text-[11px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: "2fr 1fr 1fr 132px 96px auto" }}>
                    <input value={draft.en} onChange={(e) => setDraft((d) => ({ ...d, en: e.target.value }))} placeholder="ชื่องานใหม่" className={field} />
                    <input value={draft.r} onChange={(e) => setDraft((d) => ({ ...d, r: e.target.value }))} placeholder="ผู้รับผิดชอบ (R)" className={field} />
                    <input value={draft.a} onChange={(e) => setDraft((d) => ({ ...d, a: e.target.value }))} placeholder="Accountable (A)" className={field} />
                    <DatePicker
                      value={draft.day ? `${monthYear}-${String(monthNum).padStart(2, "0")}-${String(draft.day).padStart(2, "0")}` : null}
                      min={monthMin}
                      max={monthMax}
                      placeholder="วันที่"
                      onChange={(nextIso) => setDraft((d) => ({ ...d, day: nextIso.split("-")[2] }))}
                      className={field}
                    />
                    <select value={draft.marker} onChange={(e) => setDraft((d) => ({ ...d, marker: e.target.value }))}
                      aria-label="เดือนของงาน" title="marker = เดือนที่งานนี้ทำให้" className={field}>
                      {markerCycle.map((m) => <option key={m} value={m}>เดือน {m}</option>)}
                    </select>
                    <button onClick={() => add(sec.key)} disabled={!draft.en.trim()}
                      className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 disabled:opacity-40">+ เพิ่ม</button>
                  </div>
                  <div className="text-[11px] text-faint">
                    เลือกวันที่จากปฏิทิน — วันที่คือวันใน {monthLabel} ส่วน “เดือน” คือเดือนที่งานนั้นทำให้ (เว้นว่างได้ แล้วค่อยเลือกในคอลัมน์ Period ทีหลัง)
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hidden.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line3">
          <div className="text-[11.5px] font-bold text-faint mb-[6px]">งานที่ซ่อนไว้ ({hidden.length})</div>
          <div className="flex flex-wrap gap-2">
            {hidden.map((h) => (
              <button key={h.key} onClick={() => setEdits((prev) => withTaskRestored(prev, h.key))}
                className="text-[11.5px] font-bold rounded-pill border border-line2 bg-ivory px-3 py-[5px] text-muted">
                ↩ {h.en}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Grid: the month timeline ──────────────────────────────────────── */
function GridView({ sections, meta, today, done, setDone, monthKey, edit, onCell, onPickDay, overrides }: {
  sections: ResolvedSection[];
  meta: ReturnType<typeof monthMeta>;
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  monthKey: string;
  edit: boolean;
  onCell: (taskKey: string, day: number, current: string | undefined) => void;
  onPickDay: (taskKey: string, day: number | null, replacing?: number) => void;
  overrides: Record<string, string>;
}) {
  const colW = 30;
  return (
    <div className="mt-5 bg-surface border border-line rounded-cardLg overflow-hidden print-expand">
      <div className="overflow-x-auto print-expand">
        <table className="border-collapse text-[12px] w-full" style={{ minWidth: 420 + meta.days.length * colW }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-panel text-white text-left font-bold px-3 py-2 text-[11px]" style={{ minWidth: 300 }}>Task</th>
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 96 }}>R</th>
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 60 }}>A</th>
              {/* Period — the row's date in words, and the only place to change
                  it by hand. Before this the date could only be set by finding
                  one cell in a 31-column grid or typing a bare day number. */}
              <th className="bg-panel text-white/80 text-left font-semibold px-2 py-2 text-[10px]" style={{ minWidth: 132 }}>Period</th>
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
                monthKey={monthKey} edit={edit} onCell={onCell} onPickDay={onPickDay} overrides={overrides} colW={colW} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The Period cell: the row's date(s) in this month, as words, plus a
 *  calendar-only way to change them.
 *
 *  The date used to be reachable two ways, both bad: click the right cell in a
 *  31-column grid, or type a bare day number into a box ("+ วัน"). Typing a
 *  number is the part that actually hurt — "8" means nothing on its own, it
 *  cannot show you that the 8th is a Saturday, and a typo lands the work on a
 *  day nobody looks at. The shared DatePicker takes no typed input at all, so
 *  the day, its weekday and the month are always chosen from a real calendar.
 *
 *  Bounded to the month on screen: marks are stored per month, so a date from
 *  another month cannot be written from this view. Switch months to move work
 *  there — that keeps the stored shape honest instead of silently guessing. */
function PeriodCell({ task, meta, edit, onPickDay, accent }: {
  task: ResolvedSection["tasks"][number];
  meta: ReturnType<typeof monthMeta>;
  edit: boolean;
  onPickDay: (taskKey: string, day: number | null, replacing?: number) => void;
  accent: string;
}) {
  const days = Object.keys(task.marks).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: number) => `${meta.year}-${pad(meta.month + 1)}-${pad(d)}`;
  const monthMin = iso(1);
  const monthMax = iso(meta.days.length);

  if (!edit) {
    return days.length === 0
      ? <span className="text-[10.5px] text-faint">—</span>
      : (
        <span className="text-[10.5px] font-semibold" style={{ color: accent }}>
          {days.map((d) => fmtShort(iso(d))).join(", ")}
        </span>
      );
  }

  return (
    <div className="flex flex-col gap-[4px]">
      {days.map((d) => (
        <div key={d} className="flex items-center gap-[3px]">
          <DatePicker
            value={iso(d)}
            min={monthMin}
            max={monthMax}
            onChange={(next) => {
              const nd = Number(next.split("-")[2]);
              if (Number.isFinite(nd) && nd !== d) onPickDay(task.taskKey, nd, d);
            }}
            className="text-[10.5px]"
          />
          <button onClick={() => onPickDay(task.taskKey, null, d)} title="ลบวันนี้"
            aria-label={`ลบวันที่ ${d}`} className="text-[11px] text-status-red px-[3px] opacity-60 hover:opacity-100">✕</button>
        </div>
      ))}
      <DatePicker
        value={null}
        min={monthMin}
        max={monthMax}
        placeholder={days.length ? "+ อีกวัน" : "เลือกวันที่"}
        onChange={(next) => {
          const nd = Number(next.split("-")[2]);
          if (Number.isFinite(nd)) onPickDay(task.taskKey, nd);
        }}
        className="text-[10.5px]"
      />
    </div>
  );
}

function SectionRows({ sec, meta, today, done, setDone, monthKey, edit, onCell, onPickDay, overrides, colW }: {
  sec: ResolvedSection;
  meta: ReturnType<typeof monthMeta>;
  today: number | null;
  done: Record<string, boolean>;
  setDone: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  monthKey: string;
  edit: boolean;
  onCell: (taskKey: string, day: number, current: string | undefined) => void;
  onPickDay: (taskKey: string, day: number | null, replacing?: number) => void;
  overrides: Record<string, string>;
  colW: number;
}) {
  return (
    <>
      <tr>
        <td colSpan={4 + meta.days.length} className="px-3 py-[6px] font-extrabold text-[11.5px] tracking-[0.04em] uppercase border-y border-line4"
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
            <td className="px-2 py-[7px] align-top" style={{ minWidth: 132 }}>
              <PeriodCell task={t} meta={meta} edit={edit} onPickDay={onPickDay} accent={sec.accent} />
            </td>
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
