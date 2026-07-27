/* How long has this been sitting here, and is anyone expected to move it?
 *
 * The board could say what state a piece of work was in but never for how
 * long, so a request waiting two days and one waiting three weeks looked
 * identical. Live data when this was written: 43 graphic requests had no
 * designer, 28 of them had been waiting a week or more, the oldest 12 days —
 * and nothing anywhere said so.
 *
 * Two ideas, deliberately separate:
 *   - AGE: time since the work last moved. Applies to everything.
 *   - THE ASSIGNMENT QUEUE: work with nobody's name on it. Not a status but an
 *     owner problem — somebody has to hand it out, and that somebody is the
 *     Creative Leader, so it is their queue rather than a silent default.
 *
 * Pure, so the same numbers appear in the queue card, the board and any report. */

/** Names that mean "nobody", not a person. */
export function isUnowned(owner?: string): boolean {
  const o = (owner ?? "").trim();
  return !o || /^(unassigned|-|—|tbd|n\/a)$/i.test(o);
}

/** Whole days between two ISO dates (or timestamps), never negative.
 *  UTC arithmetic: building dates locally and diffing them drifts by a day
 *  across DST boundaries and timezones. */
export function daysBetween(fromIso: string | undefined, toIso: string): number | null {
  const from = (fromIso ?? "").slice(0, 10);
  const to = (toIso ?? "").slice(0, 10);
  if (!from || !to) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (!fy || !ty) return null;
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.max(0, Math.round(ms / 86400000));
}

/** Minimal shape needed to age a graphic request — avoids importing the whole
 *  Graphic type and lets the same function serve anything with a history. */
export interface Ageable {
  createdAt?: string;
  history?: { at: string }[];
}

/** When the current stage began: the last thing that happened to it, falling
 *  back to when it was raised. A request nobody has touched has been in its
 *  opening stage since it arrived, which is exactly the number that matters. */
export function stageStartedAt(item: Ageable): string | undefined {
  const events = item.history ?? [];
  let latest = "";
  for (const e of events) {
    const at = (e?.at ?? "").trim();
    if (at && at > latest) latest = at;
  }
  return latest || item.createdAt || undefined;
}

/** Days in the current stage. null when nothing dates the work at all —
 *  shown as "ไม่ทราบ" rather than as zero, which would read as brand new. */
export function stageAgeDays(item: Ageable, todayIso: string): number | null {
  return daysBetween(stageStartedAt(item), todayIso);
}

export type AgeLevel = "fresh" | "slow" | "stuck";

export const AGE_META: Record<AgeLevel, { label: string; fg: string; bg: string }> = {
  fresh: { label: "ปกติ", fg: "#4E7A4E", bg: "#EEF4EE" },
  slow: { label: "เริ่มนาน", fg: "#B3641E", bg: "#FFF7ED" },
  stuck: { label: "ค้างนาน", fg: "#B33A2E", bg: "#FFF5F4" },
};

/** Default thresholds for the assignment queue. Three working days is the
 *  point at which "I'll get to it" has quietly become "nobody did". */
export const ASSIGN_SLOW_DAYS = 3;
export const ASSIGN_STUCK_DAYS = 7;

export function ageLevel(days: number | null, slowAfter = ASSIGN_SLOW_DAYS, stuckAfter = ASSIGN_STUCK_DAYS): AgeLevel {
  if (days === null) return "fresh";
  if (days >= stuckAfter) return "stuck";
  return days >= slowAfter ? "slow" : "fresh";
}

/* ── the assignment queue ─────────────────────────────────────────────── */

export interface QueueEntry<T> {
  item: T;
  days: number | null;
  level: AgeLevel;
}

/** Work nobody owns yet, oldest first — the order it should be handed out in.
 *  Finished work is excluded by the caller, not here: what counts as finished
 *  differs per module and this must not have to know. */
export function assignmentQueue<T extends Ageable>(
  items: T[],
  ownerOf: (item: T) => string | undefined,
  todayIso: string,
  slowAfter = ASSIGN_SLOW_DAYS,
  stuckAfter = ASSIGN_STUCK_DAYS,
): QueueEntry<T>[] {
  return items
    .filter((i) => isUnowned(ownerOf(i)))
    .map((item) => {
      const days = stageAgeDays(item, todayIso);
      return { item, days, level: ageLevel(days, slowAfter, stuckAfter) };
    })
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

/** Headline for the queue card: how many are waiting, and how many have waited
 *  long enough that someone should be told. */
export function queueSummary<T>(entries: QueueEntry<T>[]): { total: number; slow: number; stuck: number; oldest: number | null } {
  return {
    total: entries.length,
    slow: entries.filter((e) => e.level === "slow").length,
    stuck: entries.filter((e) => e.level === "stuck").length,
    oldest: entries.reduce<number | null>((max, e) => (e.days === null ? max : Math.max(max ?? 0, e.days)), null),
  };
}
