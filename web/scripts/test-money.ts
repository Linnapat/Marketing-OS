/* Runtime tests for the MONEY math (pure functions) — the layers where a
 * silent wrong number hurts most: period pro-rating, Finance derivation
 * (Plan / Committed / Actual), and ROAS.
 * Run with:  npm test   (chained after test-flows.ts)
 * Same self-contained assert harness as test-flows — no runner needed. */

import { DateFilter, rangeOverlapFraction, rangeInFilter, filterMonthKeys } from "../src/components/ui/DateFilterBar";
import { financeFromDb } from "../src/lib/data/derive";
import { kolRoas, Kol, KOLS, computeKolOverdue, kolMetrics } from "../src/lib/data/kol";
import { Graphic, GRAPHICS, computeGraphicOverdue, graphicMetrics } from "../src/lib/data/graphic";
import { resultsRoas, deriveResultRow, CampaignResultRow } from "../src/lib/data/campaignResult";
import { kolMonthlyTotals, CampaignBrief } from "../src/lib/data/brief";
import { CampaignRow } from "../src/lib/data/campaigns";
import { RequestRow } from "../src/lib/data/finance";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function eqStr(name: string, actual: string, expected: string) { check(name + ` (got "${actual}")`, actual === expected); }
function eq(name: string, actual: number, expected: number, tolerance = 1e-9) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) console.error(`    expected ${expected}, got ${actual}`);
  check(name, ok);
}

const Y = new Date().getFullYear();
const july: DateFilter = { mode: "month", month: 6, year: Y, start: "", end: "" };
const june: DateFilter = { mode: "month", month: 5, year: Y, start: "", end: "" };
const yearF: DateFilter = { mode: "year", month: 0, year: Y, start: "", end: "" };

console.log("rangeOverlapFraction — pro-rating a campaign into a period");
{
  eq("Jun 1 – Jul 15 → July gets 15/45", rangeOverlapFraction(july, "Jun 1 – Jul 15"), 15 / 45);
  eq("Jun 1 – Jul 15 → June gets 30/45", rangeOverlapFraction(june, "Jun 1 – Jul 15"), 30 / 45);
  eq("fully inside the month → 1", rangeOverlapFraction(july, "Jul 1 – Jul 31"), 1);
  eq("no overlap → 0", rangeOverlapFraction(july, "Apr 1 – Apr 30"), 0);
  eq("undated (TBD) stays visible → 1", rangeOverlapFraction(july, "TBD"), 1);
  eq("whole year covers any range → 1", rangeOverlapFraction(yearF, "Jun 1 – Jul 15"), 1);
  eq("single-day campaign inside → 1", rangeOverlapFraction(july, "Jul 10 – Jul 10"), 1);
  // June + July fractions of the same campaign must cover it exactly once.
  eq("Jun+Jul fractions sum to 1", rangeOverlapFraction(june, "Jun 1 – Jul 15") + rangeOverlapFraction(july, "Jun 1 – Jul 15"), 1);
}

console.log("filterMonthKeys / rangeInFilter — window membership");
{
  check("july month key", filterMonthKeys(july).join() === `${Y}-07`);
  check("year mode = 12 keys", filterMonthKeys(yearF).length === 12);
  check("overlapping range is in filter", rangeInFilter(july, "Jun 20 – Jul 5"));
  check("non-overlapping range is out", !rangeInFilter(july, "May 1 – May 31"));
}

const camp = (over: Partial<CampaignRow>): CampaignRow => ({
  id: "CAM-T-1", name: "Test", b: "teppen", branch: "—", owner: "—",
  budget: 0, spend: 0, roi: 0, dates: "Jul 1 – Jul 31", status: "Active",
  campType: "Online", readiness: "ready", taskBlocked: 0, taskWaiting: 0,
  taskOverdue: 0, taskTotal: 0, taskDone: 0, taskInProgress: 0,
  bottleneckTeam: "None", nextApproval: "None", ...over,
});
const req = (over: Partial<RequestRow>): RequestRow => ({
  category: "KOL fee", b: "teppen", campaign: "Test", requested: 0, approved: 0,
  due: "Jul 5", status: "Waiting Approval", ...over,
});

console.log("financeFromDb — Plan / Committed / Actual must never mix");
{
  // Allocation is NOT an expense: a fully-allocated campaign with no approved
  // request reads Expense 0 / GP 0, not −budget.
  const fin = financeFromDb(
    [camp({ name: "Kani festival", budget: 50000, spend: 50000 })],
    [req({ campaign: "Kani festival", requested: 15000, status: "Waiting Approval" })],
    july,
  );
  eq("totalPlan = budget", fin.totalPlan, 50000);
  eq("committed = allocation", fin.committed, 50000);
  eq("pending request is NOT actual spend", fin.actualSpend, 0);
  eq("campaign expense = 0 before approval", fin.pnl[0].expense, 0);
  eq("GP = 0, not −budget", fin.pnl[0].revenue - fin.pnl[0].expense, 0);
  eq("available = plan − committed", fin.available, 0);
}
{
  // Approved/paid requests ARE the expense.
  const fin = financeFromDb(
    [camp({ budget: 50000, spend: 50000 })],
    [
      req({ requested: 20000, approved: 20000, status: "Approved" }),
      req({ requested: 5000, approved: 5000, status: "Paid" }),
      req({ requested: 9000, status: "Rejected" }),
    ],
    july,
  );
  eq("actualSpend = approved + paid only", fin.actualSpend, 25000);
  eq("campaign expense matches", fin.pnl[0].expense, 25000);
}
{
  // Cross-month campaign pro-rates plan + committed by day overlap.
  const days = 30; // Jun 16 – Jul 15
  const fin = financeFromDb([camp({ budget: 90000, spend: 30000, dates: "Jun 16 – Jul 15" })], [], july);
  eq("plan pro-rated 15/30", fin.totalPlan, Math.round(90000 * (15 / days)));
  eq("committed pro-rated 15/30", fin.committed, Math.round(30000 * (15 / days)));
  const out = financeFromDb([camp({ budget: 90000, dates: "Apr 1 – Apr 30" })], [], july);
  check("out-of-period campaign excluded from P&L", out.pnl.length === 0 && out.totalPlan === 0);
}
{
  // No period = totals across everything (legacy behaviour).
  const fin = financeFromDb([camp({ budget: 10000, dates: "Apr 1 – Apr 30" }), camp({ id: "CAM-T-2", name: "B", budget: 20000 })], []);
  eq("no period sums all campaigns", fin.totalPlan, 30000);
}

console.log("kolRoas / resultsRoas — ROAS = revenue ÷ cost, never fabricated");
{
  const k = (over: Partial<Kol>): Kol => ({ ...(KOLS[0] as Kol), ...over });
  eq("revenue ÷ totalCost", kolRoas(k({ revenue: 100000, totalCost: 50000, roi: 9 })), 2);
  eq("falls back to legacy roi", kolRoas(k({ revenue: 0, totalCost: 50000, roi: 3.2 })), 3.2);
  eq("no revenue, no roi → 0", kolRoas(k({ revenue: 0, totalCost: 50000, roi: 0 })), 0);
  eq("zero cost cannot divide → legacy roi", kolRoas(k({ revenue: 100, totalCost: 0, roi: 0 })), 0);

  const row = (over: Partial<CampaignResultRow>): CampaignResultRow => ({
    id: "r1", campaignId: "CAM-T-1", ad: "A", audience: "", role: "", platform: "FB/IG",
    type: "", kpi: "Reach", target: 0, budget: 0, days: 30, cvTargetPct: 0,
    reachActual: 0, budgetActual: 0, conversions: 0, ...over,
  });
  eq("Σrevenue ÷ Σspend", resultsRoas([
    row({ revenue: 30000, budgetActual: 10000 }),
    row({ id: "r2", revenue: 10000, budgetActual: 10000 }),
  ]) ?? -1, 2);
  check("no revenue → null (not 0×)", resultsRoas([row({ budgetActual: 10000 })]) === null);
  check("no spend → null", resultsRoas([row({ revenue: 10000 })]) === null);

  // CV% actual = Marketing Visit ÷ Reach (same as overview: Reach × CV% = Visit)
  eq("cv = visits ÷ reach", deriveResultRow(row({ reachActual: 10000, marketingVisits: 250, conversions: 999 })).cvActual ?? -1, 0.025);
  eq("no visits → legacy conversions fallback", deriveResultRow(row({ reachActual: 10000, conversions: 100 })).cvActual ?? -1, 0.01);
  check("no reach → null (never divide by 0)", deriveResultRow(row({ marketingVisits: 250 })).cvActual === null);
  check("nothing recorded → null", deriveResultRow(row({ reachActual: 10000 })).cvActual === null);
}

console.log("kolMonthlyTotals — KOL split must roll up per month");
{
  const brief = {
    kols: [
      { budget: 50000, monthly: [
        { month: "2026-09", budget: 20000, pages: 2 },
        { month: "2026-10", budget: 20000, pages: 1 },
        { month: "2026-11", budget: 10000, pages: 2 },
        { month: "2026-12", budget: 0, pages: 0 },
      ] },
      { budget: 12000, monthly: [{ month: "2026-09", budget: 12000, pages: 1 }] },
      { budget: 8000 }, // no monthly split — counts in total only, not per month
    ],
  } as unknown as CampaignBrief;
  const m = kolMonthlyTotals(brief);
  eq("Sep sums across KOL items", m["2026-09"], 32000);
  eq("Oct from single item", m["2026-10"], 20000);
  eq("Nov from single item", m["2026-11"], 10000);
  check("zero-budget month omitted", !("2026-12" in m));
  eq("unsplit item not attributed per month", Object.values(m).reduce((s, v) => s + v, 0), 62000);
}

console.log("on-plan KPI — live overdue + on-time vs due date");
{
  const now = new Date(`${Y}-07-15T10:00:00`);
  const g = (over: Partial<Graphic>): Graphic => ({ ...(GRAPHICS[0] as Graphic), history: [], deliverables: [], ...over });
  check("graphic past due & unfinished → overdue", computeGraphicOverdue(g({ dueIso: `${Y}-07-10`, stage: "In Progress" }), now));
  check("graphic future due → not overdue", !computeGraphicOverdue(g({ dueIso: `${Y}-07-20`, stage: "In Progress" }), now));
  check("graphic Delivered stops the clock", !computeGraphicOverdue(g({ dueIso: `${Y}-07-10`, stage: "Delivered" }), now));
  const onTimeG = graphicMetrics(g({ dueIso: `${Y}-07-10`, stage: "Delivered", history: [{ type: "delivered", at: `${Y}-07-09T10:00:00`, by: "Boss" }] }));
  eq("graphic delivered before due → onTime 1", onTimeG.onTime ?? -1, 1);
  const lateG = graphicMetrics(g({ dueIso: `${Y}-07-10`, stage: "Delivered", history: [{ type: "delivered", at: `${Y}-07-12T10:00:00`, by: "Boss" }] }));
  eq("graphic delivered after due → onTime 0", lateG.onTime ?? -1, 0);
  check("graphic unfinished → onTime null (excluded)", graphicMetrics(g({ dueIso: `${Y}-07-10`, stage: "In Progress" })).onTime === null);

  const k = (over: Partial<Kol>): Kol => ({ ...(KOLS[0] as Kol), history: [], postedDate: null, ...over });
  check("kol past due & not posted → overdue", computeKolOverdue(k({ postDueDate: `${Y}-07-10`, status: "Producing" }), now));
  check("kol Posted stops the clock", !computeKolOverdue(k({ postDueDate: `${Y}-07-10`, status: "Posted" }), now));
  check("kol Paused excluded", !computeKolOverdue(k({ postDueDate: `${Y}-07-10`, status: "Paused" }), now));
  eq("kol posted before due → onTime 1", kolMetrics(k({ postDueDate: `${Y}-07-10`, status: "Posted", postedDate: `${Y}-07-09` })).onTime ?? -1, 1);
  eq("kol posted after due → onTime 0", kolMetrics(k({ postDueDate: `${Y}-07-10`, status: "Posted", postedDate: `${Y}-07-12` })).onTime ?? -1, 0);
}

console.log("Performance shows the assigned KOL page name, not the placeholder");
{
  const label = (names: string[], fallback: string) =>
    names.length ? names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "") : fallback;
  eqStr("no assignment yet keeps the planner label", label([], "Lifestyle"), "Lifestyle");
  eqStr("one assigned page shows its name", label(["@nong.eats"], "Lifestyle"), "@nong.eats");
  eqStr("two pages both show", label(["@a", "@b"], "Lifestyle"), "@a, @b");
  eqStr("three+ pages collapse with +N", label(["@a", "@b", "@c", "@d"], "Lifestyle"), "@a, @b +2");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
