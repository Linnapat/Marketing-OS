/* The month's deadlines, as an announcement — and as a reminder that comes and
 * finds people.
 *
 * The dates already exist: the Team Calendar holds them, and four modules
 * resolve them through useDeadlines to police their own forms. What was missing
 * is the plain statement of them. Nobody opens a 31-column grid to ask "when do
 * I owe the brief"; they ask in a chat and someone screenshots the calendar.
 *
 * So: one board, read from the same rows the calendar owns — no second copy of
 * the dates, and no way for a board to disagree with the grid it came from —
 * plus a reminder schedule so a deadline arrives before it passes rather than
 * after.
 *
 * Pure: scripts/test-deadline-board.ts exercises it against fixed dates, and
 * the digest cron uses the same functions the page does.
 */

import { MilestoneDeadline, MilestoneKey } from "@/lib/data/deadlinePolicy";

export type DeadlineState = "overdue" | "today" | "soon" | "ahead";

export interface DeadlineRow extends MilestoneDeadline {
  /** Whole days from today to the deadline. Negative once it has passed. */
  daysLeft: number;
  state: DeadlineState;
}

/** Inside this many days the board treats a deadline as imminent. */
export const SOON_DAYS = 3;

/** Days before a deadline that a reminder goes out, plus the day itself.
 *
 *  Three points, not a daily drip: a reminder people learn to ignore is worse
 *  than none, and the day-before one is the only one that ever changes what
 *  somebody does today. The "0" is the morning of, not the evening after. */
export const REMIND_BEFORE = [3, 1, 0];

const DAY = 86_400_000;

/** Midnight UTC of a YYYY-MM-DD, so a comparison never lands mid-day. */
function atMidnight(iso: string): number {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? NaN : t;
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = atMidnight(fromIso), b = atMidnight(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY);
}

export function stateOf(daysLeft: number): DeadlineState {
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "today";
  return daysLeft <= SOON_DAYS ? "soon" : "ahead";
}

/** How far ahead to look for work-months whose deadlines land in the month
 *  being shown. A brief for September's work falls due in June, so the span has
 *  to cover several months out — anything past this is not a board, it is a
 *  plan. */
const LOOKAHEAD_MONTHS = 5;

/** Shift a "YYYY-MM" by n months. */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month;
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Deadlines whose DATE lands in `month` — which is the question a board is
 *  asked ("what is due this month"), not the one the resolver answers ("when is
 *  the brief for September's work due").
 *
 *  Those are different months, and confusing them is how a board ends up
 *  announcing June dates on an August screen. Each row keeps `forMonth`, so the
 *  card can still say which month's work it is for — the fact that makes an
 *  early date make sense rather than look wrong. */
export function deadlinesLandingIn(
  month: string,
  resolve: (forMonth: string) => MilestoneDeadline[],
): MilestoneDeadline[] {
  const seen = new Set<string>();
  const out: MilestoneDeadline[] = [];
  for (let n = 0; n <= LOOKAHEAD_MONTHS; n++) {
    for (const d of resolve(shiftMonth(month, n))) {
      if (!d.iso.startsWith(month)) continue;
      const id = `${d.key}:${d.iso}:${d.forMonth}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(d);
    }
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

/** The board: every milestone the calendar states for this month, earliest
 *  first, each with how long is left. Rows whose date cannot be parsed are
 *  dropped — a deadline the board cannot place is one it must not announce. */
export function deadlineBoard(list: MilestoneDeadline[], todayIso: string): DeadlineRow[] {
  return list
    .map((m) => {
      const daysLeft = daysBetween(todayIso, m.iso);
      return daysLeft === null ? null : { ...m, daysLeft, state: stateOf(daysLeft) };
    })
    .filter((r): r is DeadlineRow => !!r)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/** How the countdown reads. Deliberately plain: "อีก 3 วัน" is a fact, while
 *  "เหลือเวลาอีกเพียง 3 วัน!" is pressure, and this board is read by the people
 *  who are already doing the work. */
export function countdownLabel(daysLeft: number): string {
  if (daysLeft === 0) return "วันนี้";
  if (daysLeft === 1) return "พรุ่งนี้";
  if (daysLeft === -1) return "เลยมา 1 วัน";
  if (daysLeft < 0) return `เลยมา ${Math.abs(daysLeft)} วัน`;
  return `อีก ${daysLeft} วัน`;
}

/** Which milestones to remind about today.
 *
 *  Only the scheduled points, and never anything already past: a deadline that
 *  slipped is a conversation, not a nightly notification — the board still
 *  shows it in red, which is where an overdue date belongs. */
export function dueReminders(rows: DeadlineRow[]): DeadlineRow[] {
  return rows.filter((r) => REMIND_BEFORE.includes(r.daysLeft));
}

/** Who each deadline is for — the side that owes the work, not everyone.
 *
 *  Rooms AND names, because only some of this team has a room. The campaign
 *  brief is owed by the marketing side, which posts to no channel at all
 *  (notifyRouting: "general" work never reaches one), so routing it to a room
 *  would have sent that reminder precisely nowhere — quietly, and only for the
 *  one milestone every other deadline in the month waits on.
 *
 *  Kept here beside the milestones rather than in the notify router: it is a
 *  fact about who does the work, not about Slack. */
export interface MilestoneRoute {
  /** Channel teams, as notifyRouting names them. */
  rooms: string[];
  /** Roles to DM, spelled as the members table spells them. */
  roles: string[];
}

export const MILESTONE_ROUTE: Record<MilestoneKey, MilestoneRoute> = {
  campaignBrief: { rooms: [], roles: ["Marketing Manager / BGL", "Marketing Executive"] },
  contentPlan: { rooms: ["content"], roles: [] },
  storyboard: { rooms: ["content"], roles: [] },
  // Final artwork is the deadline both production teams work back from.
  finalAw: { rooms: ["graphic", "vdo"], roles: [] },
};

/** One reminder line, in the words the team uses for the milestone. */
export function reminderText(row: DeadlineRow): string {
  const when = row.daysLeft === 0 ? "วันนี้" : row.daysLeft === 1 ? "พรุ่งนี้" : `อีก ${row.daysLeft} วัน`;
  return `⏰ ${when}: ${row.label} — ${row.governs} (กำหนด ${row.iso.slice(8, 10)}/${row.iso.slice(5, 7)})`;
}
