/* The Creative round for a month's work — three Fridays, each a different thing.
 *
 * Creative Leader's schedule (Nov 2026), for work that publishes in month M:
 *
 *   third Friday of M−2   Final Brief       — the last day to brief it
 *   third Friday of M−1   1st draft AW      — the first version is in
 *   last  Friday of M−1   Final (revise)    — the finished file is in
 *
 * The form used to read the artwork date from the Team Calendar's "Final AW"
 * row. The team has since renamed that row to the Final BRIEF and marks one
 * day for two months at once ("12-1" on 20 Nov: December's draft, January's
 * brief) — which a single row cannot tell apart. So January's briefs came in
 * with the brief deadline (20 Nov) stamped on them as the day the artwork was
 * due. The round is stated here instead, where each date has one meaning.
 *
 * Pure: the form, the drawer and the tests must all name the same Fridays. */

const pad = (n: number) => String(n).padStart(2, "0");

function parseMonth(month: string): { y: number; m: number } | null {
  const hit = /^(\d{4})-(\d{2})/.exec(month ?? "");
  if (!hit) return null;
  const m = Number(hit[2]);
  return m >= 1 && m <= 12 ? { y: Number(hit[1]), m } : null;
}

function shift(month: string, delta: number): string {
  const at = parseMonth(month);
  if (!at) return "";
  const zero = at.y * 12 + (at.m - 1) + delta;
  return `${Math.floor(zero / 12)}-${pad((zero % 12) + 1)}`;
}

const FRIDAY = 5;

/** The third Friday of a "YYYY-MM", ISO. "" when the month cannot be read. */
export function thirdFriday(month: string): string {
  const at = parseMonth(month);
  if (!at) return "";
  const firstWeekday = new Date(Date.UTC(at.y, at.m - 1, 1)).getUTCDay();
  const day = 1 + ((FRIDAY - firstWeekday + 7) % 7) + 14;
  return `${at.y}-${pad(at.m)}-${pad(day)}`;
}

/** The last Friday of a "YYYY-MM", ISO. */
export function lastFriday(month: string): string {
  const at = parseMonth(month);
  if (!at) return "";
  const last = new Date(Date.UTC(at.y, at.m, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - FRIDAY + 7) % 7);
  return `${at.y}-${pad(at.m)}-${pad(day)}`;
}

export interface ArtworkSchedule {
  /** The month the work publishes in ("YYYY-MM"). */
  forMonth: string;
  /** Last day to brief it. */
  finalBrief: string;
  /** First version due — the brief's "เดดไลน์ส่งตรวจงาน". */
  firstDraft: string;
  /** Finished file due — the brief's "วันส่ง Final Artwork". */
  finalAw: string;
}

/** The round for work publishing in `forMonth` (a "YYYY-MM" or any ISO date in
 *  it). null when there is no month to plan against. */
export function artworkScheduleFor(forMonth?: string): ArtworkSchedule | null {
  const at = parseMonth(forMonth ?? "");
  if (!at) return null;
  const month = `${at.y}-${pad(at.m)}`;
  const before = shift(month, -1);
  return {
    forMonth: month,
    finalBrief: thirdFriday(shift(month, -2)),
    firstDraft: thirdFriday(before),
    finalAw: lastFriday(before),
  };
}

/** Which month's work a request due on THIS date serves, if the date is one
 *  the round hands out — the inverse of artworkScheduleFor. */
export function monthServedByArtworkDue(dueIso?: string): string | null {
  const due = (dueIso ?? "").slice(0, 10);
  const month = due.slice(0, 7);
  if (!parseMonth(month)) return null;
  return due === lastFriday(month) ? shift(month, 1) : null;
}
