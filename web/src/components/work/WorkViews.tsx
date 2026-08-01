"use client";

import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Graphic } from "@/lib/data/graphic";
import { graphicBriefTeaser } from "@/components/graphic/TaskGraphicBrief";

/* The My Tasks look, in one place.
 *
 * The Agency Portal was a second, unrelated design over the same underlying
 * work — a table-ish card list with its own colours, its own status chips and
 * no brief on the card — so an external designer and an internal one were
 * reading the same Graphic Request through two different lenses. Rather than
 * copy the My Tasks card into /agency (where the two would drift apart by the
 * next change), both pages now render these.
 *
 * Presentational only: every action is passed in. What a card DOES differs by
 * page — an internal task can be marked done, an agency deliverable is
 * submitted per size — and that difference is real, so it stays with the page
 * that owns it. */

/** The shape both pages normalise their rows into. Deliberately flat and
 *  display-oriented: it holds what a card SHOWS, not what a Task or an
 *  AgencyTask IS, so neither page's model leaks into the other's view. */
export interface WorkItem {
  key: string;
  title: string;
  moduleIcon: string;
  moduleColor: string;
  type: string;
  brand: string;
  campaign: string;
  status: string;
  priority: "High" | "Med" | "Low";
  group: string;
  due: string;
  dueIso?: string;
  nextAction: string;
  blocker?: string | null;
  pendingApprover?: string | null;
  assignee?: string;
  isQuickWin?: boolean;
  /** The Graphic Request behind this row, when there is one — the card shows
   *  its brief inline and can open the full request drawer. */
  graphic?: Graphic | null;
}

// Both vocabularies live here: My Tasks statuses (Todo, Need Approval, Stuck…)
// and the Agency Portal's (To Do, Submitted, Approved). One map, so the same
// state never renders in two different colours on two pages.
export const STATUS_MAP: Record<string, [string, string]> = {
  Done: ["#4E7A4E", "#EEF4EE"], Approved: ["#4E7A4E", "#EEF4EE"],
  "In Progress": ["#3E5C9A", "#EEF1F8"],
  Waiting: ["#C68A1E", "#FBF8EE"], Submitted: ["#C68A1E", "#FBF8EE"],
  "Need Approval": ["#4E7A4E", "#F0F7F0"],
  Stuck: ["#B33A2E", "#FFF5F4"],
  Revision: ["#C2691E", "#FBF1E9"],
  Todo: ["#9A9387", "#F2F0EB"], "To Do": ["#9A9387", "#F2F0EB"],
};

export const PRIORITY_MAP: Record<string, [string, string]> = {
  High: ["#B33A2E", "#FFF5F4"], Med: ["#C68A1E", "#FBF8EE"], Low: ["#9A9387", "#F2F0EB"],
};

export const TYPE_COLORS: Record<string, [string, string]> = {
  Content: ["#3E5C9A", "#EEF1F8"], KOL: ["#B5577E", "#FBF0F5"], Graphic: ["#C2691E", "#FBF1E9"],
  Budget: ["#4E7A4E", "#EEF4EE"], Ads: ["#C68A1E", "#FBF8EE"], Report: ["#6b6258", "#F0EDE6"],
  Campaign: ["#B8945A", "#FBF6ED"], Video: ["#9A5B33", "#F7EDE6"], Photo: ["#3E7A8A", "#EAF3F5"],
  Print: ["#7A6BA8", "#F1EEF8"],
};

export const badge = (s: string, map: Record<string, [string, string]>): CSSProperties => {
  const [fg, bg] = map[s] ?? ["#6b6258", "#F0EDE6"];
  return { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: bg, color: fg, display: "inline-block", whiteSpace: "nowrap" };
};

export const init = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();

export const chip = (active: boolean): CSSProperties => active
  ? { fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 999, background: "#211F1C", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }
  : { fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 999, border: "1px solid #E5DECF", color: "#6b6258", cursor: "pointer", background: "#fff", whiteSpace: "nowrap" };

/* Due-date urgency against the real calendar. Kept here rather than imported
 * from lib/data/tasks so the Agency Portal, whose rows are not Tasks, does not
 * have to pretend to be one. */
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function workDueDate(w: Pick<WorkItem, "due" | "dueIso">): Date | null {
  if (w.dueIso) {
    const d = new Date(`${w.dueIso}T00:00:00`);
    if (!isNaN(+d)) return d;
  }
  const m = /^([A-Za-z]{3})\w*\s+(\d{1,2})$/.exec((w.due || "").trim());
  if (!m) return null;
  const mi = MONTHS_SHORT.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return new Date(new Date().getFullYear(), mi, Number(m[2]));
}

/** Whole days from today to the due date (negative = overdue), null if undated. */
export function workDaysUntilDue(w: Pick<WorkItem, "due" | "dueIso">): number | null {
  const d = workDueDate(w);
  if (!d) return null;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((day(d) - day(new Date())) / 86400000);
}

export const dueColorOf = (w: Pick<WorkItem, "due" | "dueIso">) => {
  const n = workDaysUntilDue(w);
  return n === null ? "#6b6258" : n <= 0 ? "#B33A2E" : n <= 2 ? "#C68A1E" : "#6b6258";
};

export function StatMini({ label, val, fg, bg }: { label: string; val: number; fg: string; bg: string }) {
  return (
    <div className="rounded-[13px] px-[14px] py-[13px]" style={{ background: bg }}>
      <div className="text-[9.5px] font-bold tracking-[0.05em] uppercase" style={{ color: fg }}>{label}</div>
      <div className="text-[26px] font-bold mt-[3px]" style={{ color: fg }}>{val}</div>
    </div>
  );
}

export interface GroupDef { id: string; label: string; icon: string; countBg: string; countColor: string; warnMsg?: string }

export function WorkGroupHeader({ g, count }: { g: GroupDef; count: number }) {
  return (
    /* wrap: in a 340px Kanban column the label and the warning no longer fit
       on one line, and a nowrap header would push the column wider. */
    <div className="flex items-center gap-[10px] mb-[13px] flex-wrap">
      <span className="text-[17px]">{g.icon}</span>
      <span className="text-[13.5px] font-bold tracking-[-0.01em]">{g.label}</span>
      <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: g.countBg, color: g.countColor }}>{count}</span>
      {g.warnMsg && <span className="text-[11.5px] italic" style={{ color: "#B33A2E" }}>{g.warnMsg}</span>}
    </div>
  );
}

/** "Teppen · Summer Push", or just the brand when the row isn't tied to a
 *  campaign — a row with no campaign must not render a dangling "· ". */
export function brandCampaignLine(brand: string, campaign: string): string {
  return [brand, campaign?.trim()].filter(Boolean).join(" · ");
}

export function WorkCard({ item, viewer, onOpen, onOpenGraphic, actions }: {
  item: WorkItem;
  /** Who is looking — used only to hide "waiting on X" when X is you. */
  viewer?: string;
  onOpen?: () => void;
  onOpenGraphic?: (id: number) => void;
  actions?: ReactNode;
}) {
  const [typeFg, typeBg] = TYPE_COLORS[item.type] ?? ["#6b6258", "#F0EDE6"];
  const cardBorder = item.status === "Stuck" || item.status === "Revision" ? "#F5C8C4"
    : item.status === "Need Approval" ? "#B8E0B8" : "#ECE6DA";
  const hasApprover = !!item.pendingApprover && item.pendingApprover !== viewer;
  const blockerShort = item.blocker ? item.blocker.split("—")[0].trim() : "";
  const g = item.graphic ?? null;
  const teaser = g ? graphicBriefTeaser(g) : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div onClick={onOpen} className="relative overflow-hidden" style={{ background: "#fff", border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "18px 18px 14px 22px", cursor: onOpen ? "pointer" : "default" }}>
      <div className="absolute left-0 top-0 bottom-0" style={{ width: 4, background: item.moduleColor }} />
      <div className="flex items-center gap-[7px] mb-[10px] flex-wrap">
        <span className="text-[13px]">{item.moduleIcon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: typeBg, color: typeFg }}>{item.type}</span>
        <span style={badge(item.priority, PRIORITY_MAP)}>{item.priority}</span>
        {item.isQuickWin && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "#FBF6ED", color: "#B8945A" }}>✨ Quick win</span>}
        <span className="ml-auto"><span style={badge(item.status, STATUS_MAP)}>{item.status}</span></span>
      </div>
      <div className="text-[14.5px] font-bold leading-[1.35] mb-[5px]">{item.title}</div>
      <div className="text-[11.5px] text-faint mb-[10px]">{brandCampaignLine(item.brand, item.campaign)}</div>
      <div className="text-[12px] text-muted rounded-[9px] px-3 py-[9px] mb-3 italic leading-[1.5]" style={{ background: "#FAF8F4" }}>{item.nextAction}</div>
      {/* The brief, on the card. Whoever picks up the next job — staff or
          agency — should not have to open anything to know what it says or
          that it is short. */}
      {g && teaser && (
        <div onClick={(e) => { stop(e); onOpenGraphic?.(g.id); }} className="rounded-[9px] px-3 py-[9px] mb-3" style={{ background: "#FBF1E9", border: "1px solid #F0D5BC", cursor: onOpenGraphic ? "pointer" : "default" }}>
          <div className="flex items-center gap-[6px] mb-[3px]">
            <span className="text-[10px] font-bold tracking-[0.05em] uppercase" style={{ color: "#C2691E" }}>🎨 Brief</span>
            {!teaser.complete && <span className="text-[9.5px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: "#FFF5F4", color: "#B33A2E" }}>ยังไม่ครบ</span>}
            {onOpenGraphic && <span className="ml-auto text-[10px] font-bold" style={{ color: "#C2691E" }}>เปิดงาน →</span>}
          </div>
          <div className="text-[11.5px] text-muted leading-[1.45] line-clamp-2">{teaser.text}</div>
          <div className="text-[10.5px] text-faint mt-[4px] truncate">{[g.platform, g.size].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      )}
      <div className="flex items-center gap-[10px] mb-3 flex-wrap">
        <span className="text-[11px] font-semibold" style={{ color: dueColorOf(item) }}>📅 {item.due}</span>
        {hasApprover && <span className="text-[11px] font-semibold" style={{ color: "#C68A1E" }}>⏳ {item.pendingApprover}</span>}
        {item.blocker && <span className="text-[11px] font-semibold" style={{ color: "#B33A2E" }}>⚠ {blockerShort}</span>}
      </div>
      {actions && <div className="flex gap-[7px] flex-wrap" onClick={stop}>{actions}</div>}
    </div>
  );
}

/** The action pill used across both pages' cards, so a "Mark Done" on My Tasks
 *  and a "Submit" on the portal are the same object at different colours. */
export function WorkAction({ label, bg, fg = "#fff", border, onClick, disabled }: {
  label: string; bg: string; fg?: string; border?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: bg, color: fg, border: border ? `1px solid ${border}` : undefined, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      {label}
    </button>
  );
}

/* ── Calendar ──────────────────────────────────────────────────────────────
 *
 * The card and list views answer "what is on me"; neither answers "what is
 * this week going to look like", which is the question anyone with five due
 * dates in one afternoon is actually asking.
 *
 * Days are laid out Sunday-first, matching Thai calendars.
 *
 * Two things are deliberately never dropped, because a planning view that
 * hides work is worse than no planning view: rows with no due date get their
 * own strip under the grid, and rows dated outside the visible month are
 * counted in a hint rather than silently vanishing (the caller's date filter
 * may span a year, and one grid can only show one month). */

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Statuses that stop the overdue clock — a done thing is not late. */
const FINISHED = new Set(["Done", "Approved"]);

export function WorkCalendarView({ items, month, year, onNavigate, onOpen, onOpenGraphic }: {
  items: WorkItem[];
  month: number;
  year: number;
  onNavigate?: (month: number, year: number) => void;
  onOpen?: (item: WorkItem) => void;
  onOpenGraphic?: (id: number) => void;
}) {
  const today = new Date();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  // Whole weeks only, so every row has seven cells.
  const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;

  const undated: WorkItem[] = [];
  const outside: WorkItem[] = [];
  const byDay = new Map<number, WorkItem[]>();
  for (const item of items) {
    const d = workDueDate(item);
    if (!d) { undated.push(item); continue; }
    if (d.getFullYear() !== year || d.getMonth() !== month) { outside.push(item); continue; }
    const list = byDay.get(d.getDate());
    if (list) list.push(item); else byDay.set(d.getDate(), [item]);
  }

  const step = (delta: number) => {
    if (!onNavigate) return;
    const d = new Date(year, month + delta, 1);
    onNavigate(d.getMonth(), d.getFullYear());
  };

  const arrow = "w-[28px] h-[28px] rounded-[8px] border border-line2 bg-white flex items-center justify-center cursor-pointer text-[14px] text-ink flex-shrink-0 select-none";

  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 flex-wrap" style={{ background: "#FBF9F4", borderBottom: "1px solid #ECE6DA" }}>
        {onNavigate && <span className={arrow} onClick={() => step(-1)}>‹</span>}
        <span className="text-[13.5px] font-bold">{MONTH_TH[month]} {year}</span>
        {onNavigate && <span className={arrow} onClick={() => step(1)}>›</span>}
        {outside.length > 0 && (
          <span className="text-[11px] font-semibold ml-auto" style={{ color: "#C68A1E" }}>
            อีก {outside.length} งานอยู่นอกเดือนนี้ — เลื่อนเดือนเพื่อดู
          </span>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
        {WEEKDAY_TH.map((w, i) => (
          <div key={w} className="text-[10px] font-bold tracking-[0.06em] uppercase text-center py-[7px]"
            style={{ color: i === 0 || i === 6 ? "#B33A2E" : "#9A9387", borderBottom: "1px solid #ECE6DA" }}>{w}</div>
        ))}
        {Array.from({ length: cellCount }, (_, i) => {
          const dayNum = i - leading + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
          const cellDate = inMonth ? new Date(year, month, dayNum) : null;
          const isToday = !!cellDate && sameDay(cellDate, today);
          const dayItems = inMonth ? (byDay.get(dayNum) ?? []) : [];
          return (
            <div key={i} className="p-[6px] flex flex-col gap-[4px]"
              style={{
                minHeight: 108,
                borderBottom: "1px solid #F4EFE5",
                borderRight: (i + 1) % 7 === 0 ? undefined : "1px solid #F4EFE5",
                background: !inMonth ? "#FBF9F4" : isToday ? "#FFFBF0" : "#fff",
              }}>
              {inMonth && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold" style={isToday
                    ? { background: "#211F1C", color: "#fff", borderRadius: 999, padding: "1px 7px" }
                    : { color: "#6b6258" }}>{dayNum}</span>
                  {dayItems.length > 3 && <span className="text-[9.5px] text-faint">{dayItems.length} งาน</span>}
                </div>
              )}
              {dayItems.slice(0, 3).map((item) => {
                const late = !!cellDate && cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate()) && !FINISHED.has(item.status);
                const [fg, bg] = STATUS_MAP[item.status] ?? ["#6b6258", "#F0EDE6"];
                return (
                  <button key={item.key} onClick={() => onOpen?.(item)}
                    className="text-left rounded-[7px] px-[6px] py-[4px] w-full"
                    style={{ background: bg, borderLeft: `3px solid ${late ? "#B33A2E" : item.moduleColor}` }}>
                    <div className="text-[10.5px] font-bold leading-[1.3] truncate" style={{ color: "#211F1C" }}>
                      {item.moduleIcon} {item.title}
                    </div>
                    <div className="text-[9.5px] font-semibold truncate" style={{ color: late ? "#B33A2E" : fg }}>
                      {late ? "เลยกำหนด · " : ""}{item.status}
                      {item.graphic ? " · 🎨" : ""}
                    </div>
                  </button>
                );
              })}
              {dayItems.length > 3 && (
                <button onClick={() => onOpen?.(dayItems[3])} className="text-[10px] font-bold text-left" style={{ color: "#6b6258" }}>
                  +{dayItems.length - 3} เพิ่มเติม
                </button>
              )}
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div className="px-5 py-3" style={{ borderTop: "1px solid #ECE6DA", background: "#FBF9F4" }}>
          <div className="text-[10px] tracking-[0.06em] uppercase font-bold text-faint mb-2">
            ยังไม่ระบุวันครบกำหนด · {undated.length}
          </div>
          <div className="flex flex-wrap gap-2">
            {undated.map((item) => (
              <button key={item.key} onClick={() => onOpen?.(item)}
                className="rounded-[8px] px-[9px] py-[5px] text-[11px] font-semibold"
                style={{ background: "#fff", border: "1px solid #E5DECF", color: "#211F1C" }}>
                {item.moduleIcon} {item.title}
                {item.graphic && onOpenGraphic ? " 🎨" : ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Status order for the grouped list: what needs a decision first, what is
 *  moving, what is stuck, and finished work last. Anything unrecognised keeps
 *  its own group at the end rather than being folded into "other". */
const STATUS_ORDER = ["Need Approval", "Stuck", "Revision", "In Progress", "Todo", "Waiting", "Done"];

const statusRank = (s: string) => {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? STATUS_ORDER.length : i;
};

export function WorkListView({ items, viewerColorOf, onOpen, onOpenGraphic, assigneeHeader = "Assignee", groupByStatus = false }: {
  items: WorkItem[];
  viewerColorOf?: (n: string) => string;
  onOpen?: (item: WorkItem) => void;
  onOpenGraphic?: (id: number) => void;
  assigneeHeader?: string;
  /** Opt-in so the Agency Portal, which shares this view, is left as it was. */
  groupByStatus?: boolean;
}) {
  // Done starts collapsed: it is the biggest group and the least actionable.
  const [closed, setClosed] = useState<Record<string, boolean>>({ Done: true });
  /* The header and every row are separate grids, so the tracks only line up if
   * they resolve to the same widths independently of what is in the row. A bare
   * `2.5fr` means `minmax(auto, 2.5fr)`: a long brief line (nowrap, for the
   * ellipsis) sets a min-content floor, that row's Task column grows, and the
   * rest of the row slides right and starts wrapping. minmax(0, …) drops the
   * floor, so the split is purely proportional and identical on every row. */
  const cols = "minmax(0,2.4fr) minmax(0,0.8fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,1fr)";

  // Status buckets, in decision order. Built even when grouping is off — the
  // cost is one pass over a list the page has already filtered.
  const groups = useMemo(() => {
    const by = new Map<string, WorkItem[]>();
    for (const it of items) {
      const key = it.status || "—";
      const arr = by.get(key);
      if (arr) arr.push(it); else by.set(key, [it]);
    }
    return [...by.entries()].sort((a, b) => statusRank(a[0]) - statusRank(b[0]) || a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="grid gap-2 px-5 py-[11px] text-[10px] font-bold tracking-[0.06em] uppercase text-faint" style={{ gridTemplateColumns: cols, background: "#FBF9F4", borderBottom: "1px solid #ECE6DA" }}>
        <span>Task</span><span>Module</span><span>{assigneeHeader}</span><span>Campaign</span><span>Due</span><span>Priority</span><span>Status</span>
      </div>
      {items.length === 0 && <div className="py-12 text-center text-faint text-[13.5px]">No work matches — try a wider filter.</div>}
      {groupByStatus && groups.map(([status, rows]) => {
        const open = !closed[status];
        return (
          <div key={status}>
            <button
              type="button"
              onClick={() => setClosed((c) => ({ ...c, [status]: open }))}
              aria-expanded={open}
              className="w-full flex items-center gap-2 px-5 py-[9px] text-left hover:bg-ivory/60 transition"
              style={{ background: "#FBF9F4", borderBottom: "1px solid #F0EADE" }}>
              {open ? <ChevronDown size={14} className="text-faint" /> : <ChevronRight size={14} className="text-faint" />}
              <span style={{ ...badge(status, STATUS_MAP) }}>{status}</span>
              <span className="text-[11.5px] font-bold text-faint">{rows.length}</span>
            </button>
            {open && rows.map((item) => renderRow(item))}
          </div>
        );
      })}
      {!groupByStatus && items.map(renderRow)}
    </div>
  );

  function renderRow(item: WorkItem) {
        const [typeFg, typeBg] = TYPE_COLORS[item.type] ?? ["#6b6258", "#F0EDE6"];
        const rowBg = item.status === "Stuck" ? "#FFFAF9" : item.status === "Need Approval" ? "#FAFFF9" : "#fff";
        const blockerShort = item.blocker ? item.blocker.split("—")[0].trim() : "";
        const g = item.graphic ?? null;
        const who = item.assignee ?? "";
        return (
          <div key={item.key} onClick={() => onOpen?.(item)} className="grid gap-2 px-5 py-[13px] items-center" style={{ gridTemplateColumns: cols, borderBottom: "1px solid #F4EFE5", background: rowBg, cursor: onOpen ? "pointer" : "default" }}>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate">{item.moduleIcon} {item.title}</div>
              {g && (
                <div onClick={(e) => { e.stopPropagation(); onOpenGraphic?.(g.id); }} className="text-[10.5px] mt-[1px] truncate font-semibold" style={{ color: g.briefComplete ? "#C2691E" : "#B33A2E" }}>
                  🎨 Brief {g.briefComplete ? "" : "ยังไม่ครบ "}· {[g.platform, g.size].filter(Boolean).join(" · ") || "—"}{onOpenGraphic ? " · เปิดงาน →" : ""}
                </div>
              )}
              {item.blocker && <div className="text-[10.5px] font-semibold mt-[1px]" style={{ color: "#B33A2E" }}>⚠ {blockerShort}</div>}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: typeBg, color: typeFg, justifySelf: "start" }}>{item.type}</span>
            <div className="flex items-center gap-[6px] min-w-0">
              {who ? (
                <>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0" style={{ background: viewerColorOf?.(who) ?? "#9A9387" }}>{init(who)}</span>
                  <span className="text-[12px] font-semibold truncate">{who}</span>
                </>
              ) : <span className="text-[12px] text-faint">—</span>}
            </div>
            <span className="text-[12px] text-muted truncate min-w-0">{item.campaign?.trim() || "—"}</span>
            <span className="text-[12px] font-semibold truncate" style={{ color: dueColorOf(item) }}>{item.due}</span>
            <span style={{ ...badge(item.priority, PRIORITY_MAP), justifySelf: "start" }}>{item.priority}</span>
            <span style={{ ...badge(item.status, STATUS_MAP), justifySelf: "start" }}>{item.status}</span>
          </div>
        );
  }
}
