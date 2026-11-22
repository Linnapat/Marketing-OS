/* Days the team does not work — the one thing the Creative round cannot know
 * by itself.
 *
 * The round hands out Fridays by rule (artworkSchedule). A rule does not know
 * that the last Friday of December 2026 is the 25th: January's final files
 * were due on a day nobody would be at a desk. So the team keeps its own list
 * here, and any round date that lands on one moves back to the working day
 * before it — earlier, never later, because everything downstream of a
 * deadline (revise, approve, publish) was planned against the later date.
 *
 * A list people type, on purpose: which days this team takes off is a
 * decision, not a public-holiday table to be guessed at in code. */

/** app_settings key. JSON array of "YYYY-MM-DD". */
export const TEAM_HOLIDAYS_SETTING_KEY = "team_holidays";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Read the stored list: valid days only, unique, in date order. Anything
 *  unreadable is no holidays at all — the round then stands as the rule. */
export function parseTeamHolidays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((d): d is string => typeof d === "string" && ISO_DAY.test(d)))].sort();
  } catch { return []; }
}

export function withTeamHoliday(list: string[], iso: string, on: boolean): string[] {
  const rest = list.filter((d) => d !== iso);
  return (on && ISO_DAY.test(iso) ? [...rest, iso] : rest).sort();
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + delta));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** `iso` itself when the team works that day, else the nearest working day
 *  before it. Weekends never count as working days. */
export function workingDayOnOrBefore(iso: string, holidays: readonly string[] = []): string {
  if (!ISO_DAY.test(iso ?? "")) return iso;
  const off = new Set(holidays);
  let day = iso;
  // Bounded: a fortnight of consecutive days off is a typo, not a calendar.
  for (let i = 0; i < 14; i++) {
    const [y, m, d] = day.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6 && !off.has(day)) return day;
    day = addDays(day, -1);
  }
  return iso;
}
