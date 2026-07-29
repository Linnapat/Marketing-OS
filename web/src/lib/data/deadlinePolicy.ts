// Deadline policy — read the Team Calendar as DATA, not just as a picture.
//
// The team already writes its deadlines down: the Work Calendar says "Final AW
// on the 23rd", "Present VDO storyboard on the 16th", "Campaign Brief days
// 1–10". Until now nothing read those rows, so every module carried its own
// hardcoded rule (the graphic due date was "publish − 2 business days") and the
// calendar was decoration that happened to disagree with the app.
//
// This module resolves a milestone row into a real date for a target month, so
// the calendar becomes the single source of the deadlines and editing it moves
// the whole system.
//
// ── How a row means a date ───────────────────────────────────────────────
// A marker is the MONTH THE WORK IS FOR; the day it sits on is in the month you
// are looking at. The team plans two months ahead, so "Final AW · day 23 ·
// marker 9" in the July grid means: September's final artwork is due 23 July.
//
// So resolving runs backwards: for target month M, look in the months that
// could carry a marker pointing at M (M−2 first, since that is the team's
// rhythm), and find the days whose marker resolves to M.

import {
  WORK_SECTIONS, projectMarks, applyOverrides, monthMeta, TEMPLATE_YEAR, TEMPLATE_MONTH,
} from "@/lib/data/workflow";

export type MilestoneKey = "campaignBrief" | "contentPlan" | "storyboard" | "finalAw";

interface MilestoneDef {
  key: MilestoneKey;
  label: string;
  /** The calendar row this milestone reads, matched on its English name. */
  rowEn: string;
  section: string;
  /** What it governs, in the words the module shows. */
  governs: string;
}

/** The rows that carry a deadline another module depends on.
 *
 *  Matched on the row's exact English text: the calendar is edited as a grid of
 *  markers, not by renaming rows, and an exact key beats a fuzzy match that
 *  could silently latch onto "AW revise" instead of "Final AW". A renamed row
 *  resolves to nothing and the caller falls back — never to a wrong date. */
export const MILESTONES: MilestoneDef[] = [
  {
    key: "campaignBrief",
    label: "Campaign Brief",
    rowEn: "Campaign Brief ( AW : POP / Ads )",
    section: "mkt",
    governs: "ส่ง Campaign Brief ให้ Creative",
  },
  {
    key: "contentPlan",
    label: "Content Post Plan + Caption",
    rowEn: "ส่ง Content Post Plan + Caption ทางอีเมล (Reply MKT campaign)",
    section: "creative",
    governs: "ส่งแผนโพสต์ + caption",
  },
  {
    key: "storyboard",
    label: "Present VDO story board",
    rowEn: "Present VDO story board (MKT final caption for post)",
    section: "creative",
    governs: "ส่ง storyboard ให้เจ้าของงานอนุมัติ",
  },
  {
    key: "finalAw",
    label: "Final AW",
    rowEn: "Final AW",
    section: "creative",
    governs: "ส่ง Final Artwork",
  },
];

export const milestoneDef = (key: MilestoneKey) => MILESTONES.find((m) => m.key === key);

/** "YYYY-MM" → { y, m } with m 1-based. */
function parseMonthKey(key: string): { y: number; m: number } | null {
  const hit = /^(\d{4})-(\d{2})$/.exec(key);
  if (!hit) return null;
  const m = Number(hit[2]);
  if (m < 1 || m > 12) return null;
  return { y: Number(hit[1]), m };
}

const monthKeyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** Shift a month key by whole months, wrapping the year. */
export function shiftMonthKey(key: string, delta: number): string {
  const at = parseMonthKey(key);
  if (!at) return "";
  const zero = at.y * 12 + (at.m - 1) + delta;
  return monthKeyOf(Math.floor(zero / 12), (zero % 12) + 1);
}

/** Which month(s) a marker points at, seen from a given view month.
 *
 *  A marker is a bare month number ("9") or a range ("8-9"). The number carries
 *  no year, so the year comes from the marker's offset from the view month —
 *  the same window the editor offers (previous, current, +1, +2). That is what
 *  makes "1" read as next January when you are standing in November, instead of
 *  jumping back eleven months. */
export function markerMonths(marker: string, viewYear: number, viewMonth: number): string[] {
  const parts = String(marker ?? "").split("-").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 12) continue;
    // Offset of the marker's month from the view month, forwards 0..11.
    const forward = (n - viewMonth + 12) % 12;
    // The editor's window is −1..+2; anything else is treated as forward, which
    // only matters for hand-typed legacy values.
    const delta = forward === 11 ? -1 : forward;
    out.push(shiftMonthKey(monthKeyOf(viewYear, viewMonth), delta));
  }
  return out;
}

export interface MilestoneDeadline {
  key: MilestoneKey;
  label: string;
  governs: string;
  /** The deadline date, ISO. */
  iso: string;
  /** Day-of-month it sits on in the calendar. */
  day: number;
  /** The calendar month the row was read from ("YYYY-MM"). */
  fromMonth: string;
  /** The month the work is FOR ("YYYY-MM"). */
  forMonth: string;
}

/** Resolve a milestone into a real date for the month the work is FOR.
 *
 *  `overrides` are the admin's per-month cell edits, so a calendar the team has
 *  adjusted drives the app rather than the shipped template.
 *
 *  Returns null when the row carries no marker pointing at that month — a
 *  quiet, honest "the calendar does not say", which every caller treats as
 *  "fall back to your own rule" rather than inventing a date. */
export function resolveMilestone(
  key: MilestoneKey,
  forMonth: string,
  overrides: Record<string, string> = {},
): MilestoneDeadline | null {
  const def = milestoneDef(key);
  const target = parseMonthKey(forMonth);
  if (!def || !target) return null;

  const section = WORK_SECTIONS.find((s) => s.key === def.section);
  const row = section?.tasks.find((t) => t.en === def.rowEn);
  if (!section || !row) return null;

  const taskKey = `${section.key}::${row.en}`;
  const templateKey = monthKeyOf(TEMPLATE_YEAR, TEMPLATE_MONTH + 1);
  const hits: { iso: string; day: number; fromMonth: string }[] = [];

  // Look across the months that could carry a marker aimed at `forMonth`. The
  // team's rhythm is two ahead, so that is the usual answer, but a re-timed
  // calendar must still resolve.
  for (const back of [0, 1, 2, 3]) {
    const viewKey = shiftMonthKey(forMonth, -back);
    const view = parseMonthKey(viewKey);
    if (!view) continue;
    const monthKey = `${view.y}-${view.m - 1}`;          // the Work Calendar's own key shape
    const projected = projectMarks(row.marks, view.y, view.m - 1);
    const effective = applyOverrides(projected, monthKey, taskKey, overrides);
    const size = monthMeta(view.y, view.m - 1).days.length;

    for (const [dayStr, marker] of Object.entries(effective)) {
      const day = Number(dayStr);
      if (!Number.isFinite(day)) continue;
      const overridden = Object.prototype.hasOwnProperty.call(overrides, `${monthKey}::${taskKey}::${day}`);
      // An OVERRIDDEN cell is literal: the admin typed that month number while
      // looking at this month, so it means what it says.
      //
      // A TEMPLATE cell is relative. The shipped row says "23 → 9", authored
      // against July 2026, and what it encodes is "+2 months", not "September
      // forever". Read literally, August's grid still claimed to be September's
      // deadline — so October resolved to nothing and September resolved twice,
      // once to a date in August that means nothing at all.
      const targets = overridden
        ? markerMonths(marker, view.y, view.m)
        : markerMonths(marker, TEMPLATE_YEAR, TEMPLATE_MONTH + 1)
          .map((templateTarget) => shiftMonthKey(viewKey, monthsBetween(templateKey, templateTarget)));
      if (!targets.includes(forMonth)) continue;
      const safeDay = Math.min(day, size);
      hits.push({ iso: `${viewKey}-${String(safeDay).padStart(2, "0")}`, day: safeDay, fromMonth: viewKey });
    }
  }
  if (!hits.length) return null;
  // A milestone spanning several days (Campaign Brief runs 1–10) is due on the
  // LAST of them — the window closes, it does not open.
  hits.sort((a, b) => a.iso.localeCompare(b.iso));
  const last = hits[hits.length - 1];
  return { key, label: def.label, governs: def.governs, ...last, forMonth };
}

/** Whole months from one "YYYY-MM" to another. */
function monthsBetween(from: string, to: string): number {
  const a = parseMonthKey(from);
  const b = parseMonthKey(to);
  if (!a || !b) return 0;
  return (b.y * 12 + b.m) - (a.y * 12 + a.m);
}

/** Every milestone that has something to say about a month — for the banner
 *  that shows a module its own deadlines. */
export function milestonesFor(
  forMonth: string,
  overrides: Record<string, string> = {},
): MilestoneDeadline[] {
  return MILESTONES
    .map((m) => resolveMilestone(m.key, forMonth, overrides))
    .filter((d): d is MilestoneDeadline => !!d)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/** Milestones whose date falls out of dependency order for a month.
 *
 *  The process only makes sense in one order: brief → content plan →
 *  storyboard → final artwork. The calendar projects a template row onto other
 *  months by weekday-and-occurrence, not by ordinal day, so two rows can swap
 *  places — in May 2026 the Content Plan row lands on the 11th while the
 *  Campaign Brief window closes on the 14th, which asks Creative for the plan
 *  before the brief exists.
 *
 *  That is a real problem with the calendar for that month, not something to
 *  paper over, so it is reported and shown rather than silently re-sorted. */
export function outOfSequence(list: MilestoneDeadline[]): MilestoneKey[] {
  const order = MILESTONES.map((m) => m.key);
  const byOrder = [...list].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const bad: MilestoneKey[] = [];
  for (let i = 1; i < byOrder.length; i++) {
    if (byOrder[i].iso < byOrder[i - 1].iso) bad.push(byOrder[i].key);
  }
  return bad;
}

/** The canonical process order, whatever the dates say. */
export function inProcessOrder(list: MilestoneDeadline[]): MilestoneDeadline[] {
  const order = MILESTONES.map((m) => m.key);
  return [...list].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/** Month key of an ISO date — the month a piece of content is FOR. */
export const monthKeyOfIso = (iso?: string) => (iso ?? "").slice(0, 7);

/** Which month's work is a request with THIS final-artwork date serving?
 *
 *  The inverse of resolveMilestone("finalAw"). A graphic request stores the
 *  deadline it must hit, not the month it is for, so a drawer showing "Final AW
 *  23 Jul" cannot otherwise tell you that this is September's work — and the
 *  storyboard deadline for the same job would resolve against July and come out
 *  two months wrong. Searches the months the row could plausibly serve and
 *  returns the one whose Final AW lands on this date. */
export function monthServedByFinalAw(
  dueIso?: string,
  overrides: Record<string, string> = {},
): string | null {
  const due = (dueIso ?? "").slice(0, 10);
  if (!due) return null;
  const dueMonth = monthKeyOfIso(due);
  for (const ahead of [2, 1, 3, 0]) {
    const candidate = shiftMonthKey(dueMonth, ahead);
    if (resolveMilestone("finalAw", candidate, overrides)?.iso === due) return candidate;
  }
  return null;
}
