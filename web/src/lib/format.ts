// Thai Baht is the app currency throughout.

const THIN = " ";

/** ฿2.84M / ฿180,000 — compact by default, matching the design copy. */
export function baht(amount: number, opts: { compact?: boolean } = {}): string {
  const { compact = false } = opts;
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) return `฿${(amount / 1_000_000).toFixed(2)}M`;
    if (Math.abs(amount) >= 1_000) return `฿${(amount / 1_000).toFixed(0)}K`;
  }
  return `฿${amount.toLocaleString("en-US")}`;
}

/** 12,400 */
export function num(n: number): string {
  return n.toLocaleString("en-US");
}

/** 3.2× */
export function mult(n: number): string {
  return `${n.toFixed(1)}×`;
}

/** 87% */
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** clamp a bar width to 0–100% */
export function barWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value))}%`;
}

export { THIN };

/** The one locale dates are printed in: day, English short month, Gregorian
 *  year — "19 Nov 2026".
 *
 *  The app printed dates two ways. Filters, columns and pickers said "Nov 2026";
 *  timestamps went through "th-TH" and came out "19 พ.ย. 2569", Buddhist year
 *  and all — so one screen could show 2026 and 2569 for the same week. One
 *  constant, used by every date this app formats, so the choice is made (and
 *  can be changed) in exactly one place. */
export const DATE_LOCALE = "en-GB";

/** The app's one date style: "19 Nov 2026" — day, three-letter English month,
 *  Gregorian year. Spelled out here rather than left to a locale, because the
 *  locale's own idea differs by browser and by month (en-GB prints "21 Sept
 *  2026"), and the UX test found seven formats on screen at once. Everything
 *  that shows a date goes through these.
 *
 *  A bare "YYYY-MM-DD" is read by its parts, never through Date — a date is a
 *  day on the calendar, and parsing it as a moment moves it across midnight in
 *  some timezones. "" for anything unreadable, so callers can print it as is. */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_ABBR: readonly string[] = MONTHS_SHORT;
const pad2 = (n: number) => String(n).padStart(2, "0");

function parts(value?: string | Date | null): { y: number; m: number; d: number; hh?: number; mm?: number } | null {
  if (!value) return null;
  if (typeof value === "string") {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (day) { const m = Number(day[2]); return m >= 1 && m <= 12 ? { y: Number(day[1]), m, d: Number(day[3]) } : null; }
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return { y: at.getFullYear(), m: at.getMonth() + 1, d: at.getDate(), hh: at.getHours(), mm: at.getMinutes() };
}

/** "19 Nov 2026". */
export function fmtDate(value?: string | Date | null): string {
  const p = parts(value);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}` : "";
}

/** "19 Nov 2026, 14:32" — or just the date when the value carries no time. */
export function fmtDateTime(value?: string | Date | null): string {
  const p = parts(value);
  if (!p) return "";
  const day = `${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}`;
  return p.hh === undefined ? day : `${day}, ${pad2(p.hh)}:${pad2(p.mm ?? 0)}`;
}

/** "Nov 2026" from "2026-11" (or any date in that month). */
export function fmtMonth(value?: string | null): string {
  const hit = /^(\d{4})-(\d{2})/.exec((value ?? "").trim());
  if (!hit) return "";
  const m = Number(hit[2]);
  return m >= 1 && m <= 12 ? `${MONTHS_SHORT[m - 1]} ${hit[1]}` : "";
}

/** "1 Aug – 31 Dec 2026"; the year is said once when both ends share it. */
export function fmtRange(start?: string | null, end?: string | null): string {
  const a = parts(start), b = parts(end);
  if (!a || !b) return fmtDate(start) || fmtDate(end);
  const left = a.y === b.y ? `${a.d} ${MONTHS_SHORT[a.m - 1]}` : fmtDate(start);
  return `${left} – ${fmtDate(end)}`;
}

/** When a decision was made — "24 Aug 2026, 14:32".
 *
 *  Every sign-off in the app used to read "อนุมัติโดย Gik" and stop there: the
 *  name without the moment. That is fine while the decision is fresh and
 *  useless a week later, when the question is whether the approval came before
 *  or after the version now sitting in the folder. The `…At` fields were
 *  always written — only the screens never showed them.
 *
 *  Returns "" for a missing or unparseable value so a caller can append it
 *  without guarding, and so rows written before a timestamp existed degrade to
 *  the old name-only line instead of "Invalid Date".
 */
export function stamp(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fmtDateTime(d);
}

/** Labels for a set of saved texts that all start the same way.
 *
 *  Saved hashtag sets share their opening tags, so in a 170px pill every one of
 *  them read "#OMDbyTEPPEN #SITDONE #…" — indistinguishable. Where two or more
 *  share leading words, each label drops the shared part and shows what is
 *  different ("… #LunchSet #Sathorn"). A set that is entirely the shared part,
 *  or a list of one, is shown as it is. */
export function distinctLabels(values: readonly string[]): string[] {
  const flat = values.map((v) => v.replace(/\s*\n+\s*/g, " · ").trim());
  if (flat.length < 2) return flat;
  const words = flat.map((v) => v.split(/\s+/));
  let shared = 0;
  while (words.every((w) => w.length > shared && w[shared] === words[0][shared])) shared++;
  if (shared === 0) return flat;
  return words.map((w, i) => (w.length > shared ? `… ${w.slice(shared).join(" ")}` : flat[i]));
}
