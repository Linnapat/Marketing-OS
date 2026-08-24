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

/** When a decision was made, in Thai — "24 ส.ค. 2569 14:32".
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
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}
