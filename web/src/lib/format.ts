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
