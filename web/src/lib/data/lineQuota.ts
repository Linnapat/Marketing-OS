// LINE OA broadcast: messages are the real cost, baht often is not.
//
// A broadcast sent inside the monthly free allowance bills almost nothing, so
// campaigns were landing in the system at ฿3 next to ฿70,000 ones. Three things
// go wrong with that, and only the first is cosmetic:
//
//   1. ฿3 reads as a typo. It is not — but everyone who sees it assumes so.
//   2. Any efficiency metric divides by it. A campaign that returns ฿50,000 on
//      ฿3 shows a ROAS of 16,667×, becomes the best campaign in company
//      history, and drags every brand average with it.
//   3. The allowance is finite and shared. Spending 20,000 messages leaves
//      15,000 for everything else that month, and nothing in the system said so
//      until the overage bill arrived.
//
// So a broadcast carries a message count, and that count converts to a notional
// cost at the same rate LINE charges for overage. Inside the allowance the
// notional cost is what the messages were worth; past it, it is what they
// actually cost. The number does not change shape when the quota runs out —
// only which column it lands in.

import { BrandId } from "@/lib/brands";

/** Overage price per message, THB. LINE bills at this rate past the allowance. */
export const DEFAULT_LINE_RATE_THB = 0.06;
/** Messages included per month. Each brand has its own LINE OA, so its own pot. */
export const DEFAULT_LINE_FREE_MESSAGES = 35_000;

export interface LineOaConfig {
  /** Brand key this OA belongs to — quota is never shared across brands. */
  brand: string;
  freeMessages: number;
  ratePerMessage: number;
}

export const DEFAULT_LINE_OA: Omit<LineOaConfig, "brand"> = {
  freeMessages: DEFAULT_LINE_FREE_MESSAGES,
  ratePerMessage: DEFAULT_LINE_RATE_THB,
};

export function lineConfigFor(brand: BrandId | string, configs: LineOaConfig[]): LineOaConfig {
  const hit = configs.find((c) => c.brand === brand);
  return hit ?? { brand: String(brand), ...DEFAULT_LINE_OA };
}

/** What a broadcast is worth, whether or not it was billed. */
export function notionalCost(messages: number | undefined, rate: number): number {
  const n = Math.max(0, Math.round(messages ?? 0));
  return Math.round(n * rate * 100) / 100;
}

export interface QuotaUsage {
  used: number;
  free: number;
  remaining: number;
  /** Messages past the allowance — these are the ones that turn into a bill. */
  over: number;
  /** 0..100, capped for the bar; `over` carries the rest of the story. */
  pct: number;
  billable: number;
}

export function quotaUsage(usedMessages: number, cfg: LineOaConfig): QuotaUsage {
  const used = Math.max(0, Math.round(usedMessages));
  const free = Math.max(0, cfg.freeMessages);
  const over = Math.max(0, used - free);
  return {
    used,
    free,
    remaining: Math.max(0, free - used),
    over,
    pct: free > 0 ? Math.min(100, (used / free) * 100) : used > 0 ? 100 : 0,
    billable: Math.round(over * cfg.ratePerMessage * 100) / 100,
  };
}

/** How a campaign's money should be read — a ฿3 broadcast is not a ฿3 campaign. */
export const COST_BASES = [
  { value: "paid", label: "จ่ายเงินจริง" },
  { value: "free_quota", label: "ในโควตาฟรี" },
  { value: "barter", label: "Barter / แลกเปลี่ยน" },
  { value: "in_kind", label: "ใช้ของที่มีอยู่" },
] as const;

export type CostBasis = (typeof COST_BASES)[number]["value"];

export function costBasisLabel(v: string | undefined): string {
  return COST_BASES.find((c) => c.value === v)?.label ?? "";
}

/**
 * The cost to judge a campaign by. Cash is what left the bank; this is what the
 * campaign consumed. For a free-quota broadcast they are wildly different, and
 * using cash would make the campaign look infinitely efficient.
 */
export function effectiveCost(cashCost: number, messages: number | undefined, cfg: LineOaConfig): number {
  const notional = notionalCost(messages, cfg.ratePerMessage);
  return Math.max(cashCost || 0, notional);
}
