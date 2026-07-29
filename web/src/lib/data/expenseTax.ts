// VAT and withholding tax on an expense request.
//
// One place, because the request form, the amount breakdown and the printed
// voucher all state these numbers and must not each do their own arithmetic —
// a voucher that disagrees with the request it was raised from is the one
// document Finance actually files.

/** Standard Thai VAT. */
export const VAT_RATE = 7;

/** Withholding rates the team meets, by what the money is for. 3% (service /
 *  รับจ้างทำของ) was the only one the form offered, but a marketing team pays
 *  2% on advertising and 5% on rent constantly, and those were being filed as
 *  3% or left off entirely. Any other rate can be typed in. */
export const WHT_PRESETS = [
  { rate: 1, label: "1% · ค่าขนส่ง" },
  { rate: 2, label: "2% · ค่าโฆษณา" },
  { rate: 3, label: "3% · ค่าบริการ / รับจ้างทำของ" },
  { rate: 5, label: "5% · ค่าเช่า" },
] as const;

export const DEFAULT_WHT_RATE = 3;

/** Clamp a typed rate into something a tax line can hold.
 *
 *  Rejects NaN and negatives (a "refund" of withholding is not a thing here)
 *  and caps at 100 — a rate above that makes the net payable negative, which
 *  the voucher has no way to express. */
export function normaliseRate(input: unknown): number {
  const n = typeof input === "number" ? input : parseFloat(String(input ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);   // 2dp is enough for any real rate
}

export interface TaxBreakdown {
  /** The base the taxes are taken on. */
  amount: number;
  vatRate: number;
  whtRate: number;
  vat: number;
  wht: number;
  /** What the payee actually receives. */
  net: number;
}

/** VAT is ADDED to the amount; withholding is DEDUCTED from it. Both are
 *  computed on the base amount, never on each other — withholding in Thailand
 *  is taken on the pre-VAT value, so compounding them would overstate the
 *  deduction on every invoice that carries both. */
export function taxBreakdown(
  { amount, vatRate = 0, whtRate = 0 }: { amount: number; vatRate?: number; whtRate?: number },
): TaxBreakdown {
  const base = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const v = normaliseRate(vatRate);
  const w = normaliseRate(whtRate);
  const vat = Math.round(base * v) / 100;
  const wht = Math.round(base * w) / 100;
  return {
    amount: base,
    vatRate: v,
    whtRate: w,
    vat: Math.round(vat),
    wht: Math.round(wht),
    net: Math.round(base + vat - wht),
  };
}

/** "3%" / "2.5%" — for the breakdown row and the voucher's rate column. */
export function rateLabel(rate: number): string {
  const r = normaliseRate(rate);
  return r > 0 ? `${Number(r.toFixed(2))}%` : "—";
}

/** The rate a stored request was withheld at.
 *
 *  Rows saved before wht_rate existed carry only the amount, so the rate is
 *  recovered from amount ÷ base and rounded to the nearest sensible step. It is
 *  a reconstruction, not a record — used only to label an old voucher, never to
 *  recompute what to pay. */
export function inferWhtRate(whtAmount?: number, base?: number): number {
  const w = Number(whtAmount ?? 0);
  const b = Number(base ?? 0);
  if (!(w > 0) || !(b > 0)) return 0;
  return normaliseRate((w / b) * 100);
}
