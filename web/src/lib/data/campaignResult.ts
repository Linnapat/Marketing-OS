// Campaign Result — per-ad performance rows tied to a campaign (campaign_id).
// Mirrors the planning sheet: plan columns come from the Ads plan, actual columns
// are entered by hand once the ads have run, and every derived metric (CPR, pacing,
// CV%, status) is computed here so the UI and any report share one source of truth.
//
// Shaped so a Supabase `campaign_results` table can replace the mock later — see
// lib/db/campaignResult.ts for the data access (mock fallback / Supabase blob).

import { Tone } from "@/lib/status";
import { CampaignBrief } from "@/lib/data/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import type { Kol } from "@/lib/data/kol";

export type ResultKpi = "Reach" | "Click" | "Conversion";

export interface CampaignResultRow {
  id: string;            // stable row id, e.g. res-CAM-2026-0001-01
  campaignId: string;    // FK → CampaignRow.id (CAM-2026-0001)

  // Descriptors (carried over from the Ads plan)
  ad: string;            // ad / creative name
  audience: string;      // target audience
  role: string;          // Awareness | Social proof | Conversion ...
  platform: string;      // KOL | FB/IG | Grabfood Ads ...
  type: string;          // Reels | Album | Keyword Searching ...
  kpi: ResultKpi;        // what `target` / `reachActual` count in

  // Plan (entered when the campaign is set up)
  target: number;        // reach target OR click target — unit follows `kpi`
  budget: number;        // planned budget (฿)
  days: number;          // flight length in days
  cvTargetPct: number;   // planned conversion rate, as a percent (0.3 = 0.30%)

  // Actual — filled in by hand after the flight
  reachActual: number;   // actual count of the KPI unit (reach / clicks)
  budgetActual: number;  // actual spend (฿)
  conversions: number;   // actual conversions (drives CV% actual)
  marketingVisits?: number; // actual store visits attributed to this ad — drives Cost/Visit
  revenue?: number;      // legacy: sales attributed (฿); kept for old rows / future POS sync

  // Optional manual status override; when unset the status is derived.
  statusOverride?: ResultStatusKey;

  // Audit — stamped on each manual save (daily update trail).
  updatedAt?: string;    // ISO timestamp of the last actuals change
  updatedBy?: string;    // who made the change
}

export type ResultStatusKey =
  | "pending" | "on_track" | "over_budget" | "under_deliver" | "off_track";

export const RESULT_STATUS_META: Record<ResultStatusKey, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  on_track: { label: "On track", tone: "green" },
  over_budget: { label: "Over budget", tone: "gold" },
  under_deliver: { label: "Under-deliver", tone: "gold" },
  off_track: { label: "Off track", tone: "red" },
};

export interface DerivedResultRow {
  cprPlan: number;             // budget / target
  perDay: number;             // budget / days
  cprActual: number | null;   // budgetActual / reachActual
  pctReach: number | null;    // reachActual / target (0..1+)
  pctBudget: number | null;   // budgetActual / budget (0..1+)
  cvActual: number | null;    // conversions / reachActual (0..1)
  status: ResultStatusKey;
}

/** Campaign ROAS from its result rows: Σ revenue ÷ Σ actual spend. Null until
 *  someone enters revenue AND there is real spend — no fabricated multiples. */
export function resultsRoas(rows: CampaignResultRow[]): number | null {
  const revenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const spend = rows.reduce((s, r) => s + (r.budgetActual || 0), 0);
  return revenue > 0 && spend > 0 ? revenue / spend : null;
}

/** Pure per-row math. No side effects — safe to call in render. */
export function deriveResultRow(r: CampaignResultRow): DerivedResultRow {
  const cprPlan = r.target > 0 ? r.budget / r.target : 0;
  const perDay = r.days > 0 ? r.budget / r.days : 0;
  const cprActual = r.reachActual > 0 ? r.budgetActual / r.reachActual : null;
  const pctReach = r.target > 0 && r.reachActual > 0 ? r.reachActual / r.target : null;
  const pctBudget = r.budget > 0 && r.budgetActual > 0 ? r.budgetActual / r.budget : null;
  // CV% actual = Marketing Visits ÷ Reach (same formula as the campaign
  // overview: Reach × CV% = Visit). Falls back to conversions for legacy rows
  // that never recorded visits.
  const visits = r.marketingVisits || 0;
  const cvActual = r.reachActual > 0 && (visits > 0 || r.conversions > 0)
    ? (visits > 0 ? visits : r.conversions) / r.reachActual
    : null;

  let status: ResultStatusKey = "pending";
  if (r.statusOverride) {
    status = r.statusOverride;
  } else if (r.reachActual > 0) {
    const overReach = (pctReach ?? 0) >= 1;
    const overBudget = (pctBudget ?? 0) > 1;
    if (overReach && !overBudget) status = "on_track";
    else if (overReach && overBudget) status = "over_budget";
    else if (!overReach && !overBudget) status = "under_deliver";
    else status = "off_track";
  }
  return { cprPlan, perDay, cprActual, pctReach, pctBudget, cvActual, status };
}

export interface ResultSummary {
  budgetPlan: number;
  budgetActual: number;
  budgetPct: number;          // 0..100+
  reachTarget: number;        // Σ target for KPI = Reach rows
  reachActual: number;
  reachPct: number;           // 0..100+
  cprReachPlan: number | null;   // blended cost-per-reach, plan
  cprReachActual: number | null; // blended cost-per-reach, actual
  resultTarget: number;       // Σ target for Click / Conversion rows
  resultActual: number;
  cprResultActual: number | null; // blended cost-per-result (click/conv), actual
  rowsFilled: number;
  rowsTotal: number;
}

/** Roll-up across a campaign's rows. Reach and click/conversion units are kept
 *  apart — a cost-per-reach and a cost-per-click must never be blended. */
export function deriveResultSummary(rows: CampaignResultRow[]): ResultSummary {
  const reachRows = rows.filter((r) => r.kpi === "Reach");
  const resultRows = rows.filter((r) => r.kpi !== "Reach");
  const sum = (xs: CampaignResultRow[], f: (r: CampaignResultRow) => number) =>
    xs.reduce((s, r) => s + (f(r) || 0), 0);

  const budgetPlan = sum(rows, (r) => r.budget);
  const budgetActual = sum(rows, (r) => r.budgetActual);
  const reachTarget = sum(reachRows, (r) => r.target);
  const reachActual = sum(reachRows, (r) => r.reachActual);
  const reachSpend = sum(reachRows, (r) => r.budgetActual);
  const reachBudget = sum(reachRows, (r) => r.budget);
  const resultTarget = sum(resultRows, (r) => r.target);
  const resultActual = sum(resultRows, (r) => r.reachActual);
  const resultSpend = sum(resultRows, (r) => r.budgetActual);

  return {
    budgetPlan,
    budgetActual,
    budgetPct: budgetPlan > 0 ? (budgetActual / budgetPlan) * 100 : 0,
    reachTarget,
    reachActual,
    reachPct: reachTarget > 0 ? (reachActual / reachTarget) * 100 : 0,
    cprReachPlan: reachTarget > 0 ? reachBudget / reachTarget : null,
    cprReachActual: reachActual > 0 ? reachSpend / reachActual : null,
    resultTarget,
    resultActual,
    cprResultActual: resultActual > 0 ? resultSpend / resultActual : null,
    rowsFilled: rows.filter((r) => r.reachActual > 0 || r.budgetActual > 0).length,
    rowsTotal: rows.length,
  };
}

/** Cost-per-result formatter — sub-฿1 needs 3 decimals (฿/reach), else 2. */
export function cpr(n: number | null): string {
  if (n == null) return "—";
  return n < 1 ? `฿${n.toFixed(3)}` : `฿${n.toFixed(2)}`;
}

/** Relative "updated N ago" label in Thai; falls back to a short date/time. */
export function fmtUpdated(iso?: string): string {
  if (!iso) return "ยังไม่อัพเดต";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "ยังไม่อัพเดต";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "เมื่อครู่นี้";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** The most recent update stamp across a set of rows (campaign roll-up). */
export function latestUpdate(rows: CampaignResultRow[]): string | undefined {
  return rows
    .map((r) => r.updatedAt)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
}

/** A blank row for the given campaign, ready to edit. */
export function emptyResultRow(campaignId: string, seq: number): CampaignResultRow {
  return {
    id: `res-${campaignId}-${String(seq).padStart(2, "0")}`,
    campaignId,
    ad: "",
    audience: "",
    role: "Awareness",
    platform: "FB/IG",
    type: "Reels",
    kpi: "Reach",
    target: 0,
    budget: 0,
    days: 30,
    cvTargetPct: 0,
    reachActual: 0,
    budgetActual: 0,
    conversions: 0,
  };
}

// ── Sample rows (mock mode) ───────────────────────────────────────────
// The CPN01 "Sit and done" branding plan, attached to the first mock campaign so
// the Result tab renders with data before Supabase is wired. Real deployments read
// from the `campaign_results` table instead (empty until entered).
export const SEED_RESULTS: Record<string, CampaignResultRow[]> = {
  "CAM-2026-0001": [
    { id: "res-CAM-2026-0001-01", campaignId: "CAM-2026-0001", ad: "KOL — Central Park + TDPK", audience: "Central Park+TDPK", role: "Social proof", platform: "KOL", type: "Reels", kpi: "Reach", target: 600000, budget: 25000, days: 31, cvTargetPct: 0.3, reachActual: 548000, budgetActual: 25000, conversions: 1750 },
    { id: "res-CAM-2026-0001-02", campaignId: "CAM-2026-0001", ad: "[Awareness] 9 Ocean Don", audience: "General", role: "Awareness", platform: "FB/IG", type: "Own Reels", kpi: "Reach", target: 500000, budget: 3500, days: 31, cvTargetPct: 0.2, reachActual: 512000, budgetActual: 3480, conversions: 980 },
    { id: "res-CAM-2026-0001-03", campaignId: "CAM-2026-0001", ad: "[Awareness] Fresh egg ASMR", audience: "General", role: "Awareness", platform: "FB/IG", type: "Own Reels", kpi: "Reach", target: 600000, budget: 6000, days: 31, cvTargetPct: 0.2, reachActual: 634000, budgetActual: 6120, conversions: 1210 },
    { id: "res-CAM-2026-0001-04", campaignId: "CAM-2026-0001", ad: "[Awareness] Grand menu — Reels", audience: "General", role: "Awareness", platform: "FB/IG", type: "Own Reels", kpi: "Reach", target: 600000, budget: 6000, days: 31, cvTargetPct: 0.5, reachActual: 470000, budgetActual: 6500, conversions: 1900 },
    { id: "res-CAM-2026-0001-05", campaignId: "CAM-2026-0001", ad: "[Awareness] Grand menu — Album", audience: "General", role: "Awareness", platform: "FB/IG", type: "Album", kpi: "Reach", target: 600000, budget: 6000, days: 31, cvTargetPct: 0.5, reachActual: 0, budgetActual: 0, conversions: 0 },
  ],
  "CAM-2026-0002": [
    { id: "res-CAM-2026-0002-01", campaignId: "CAM-2026-0002", ad: "Grabfood — Keyword (DK)", audience: "Delivery app", role: "Conversion", platform: "Grabfood Ads", type: "Keyword Searching", kpi: "Click", target: 1500, budget: 5000, days: 31, cvTargetPct: 0, reachActual: 1720, budgetActual: 4900, conversions: 340 },
    { id: "res-CAM-2026-0002-02", campaignId: "CAM-2026-0002", ad: "Grabfood — Keyword (PS)", audience: "Delivery app", role: "Conversion", platform: "Grabfood Ads", type: "Keyword Searching", kpi: "Click", target: 1500, budget: 5000, days: 31, cvTargetPct: 0, reachActual: 1290, budgetActual: 5200, conversions: 205 },
    { id: "res-CAM-2026-0002-03", campaignId: "CAM-2026-0002", ad: "Grabfood — Keyword (TDPK)", audience: "Delivery app", role: "Conversion", platform: "Grabfood Ads", type: "Keyword Searching", kpi: "Click", target: 1500, budget: 5000, days: 31, cvTargetPct: 0, reachActual: 1610, budgetActual: 4750, conversions: 298 },
  ],
};

export function seedResults(campaignId: string): CampaignResultRow[] {
  return (SEED_RESULTS[campaignId] ?? []).map((r) => ({ ...r }));
}

/** Every seeded row, flattened — mock source for the Platform Performance page. */
export function allSeedResults(): CampaignResultRow[] {
  return Object.values(SEED_RESULTS).flat().map((r) => ({ ...r }));
}

const slug = (v: string) => (v || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function flightDays(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 30;
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (isNaN(+start) || isNaN(+end)) return 30;
  return Math.max(1, Math.round((+end - +start) / 86400000) + 1);
}

function planRow(base: Omit<CampaignResultRow, "reachActual" | "budgetActual" | "conversions">): CampaignResultRow {
  return { ...base, reachActual: 0, budgetActual: 0, conversions: 0 };
}

/** Performance Bar should show planned media/KOL budget as soon as a Campaign
 *  Brief exists, even before actual rows have been entered. Existing saved
 *  result rows win; missing rows are derived from Budget allocation. */
export function mergeBudgetAllocationRows(
  results: CampaignResultRow[],
  campaigns: CampaignRow[],
  briefsByCampaignName: Record<string, CampaignBrief>,
  kols: Kol[] = [],
): CampaignResultRow[] {
  const out = [...results];
  const existing = new Set(results.map((r) => r.id));
  const pushIfMissing = (row: CampaignResultRow) => {
    if (existing.has(row.id)) return;
    existing.add(row.id);
    out.push(row);
  };

  for (const campaign of campaigns) {
    const brief = briefsByCampaignName[campaign.name];
    if (!brief) continue;
    const days = flightDays(brief.startDate, brief.endDate);
    const audience = brief.audience || "Campaign audience";

    const adLines = (brief.budget.adsByPlatform ?? []).filter((line) => (line.amount || 0) > 0);
    const fallbackAds = !adLines.length && (brief.budget.ads || 0) > 0
      ? [{ platform: brief.channels.find((c) => /facebook|instagram|tiktok|google|youtube|line/i.test(c)) ?? "Ads", amount: brief.budget.ads }]
      : [];

    for (const line of [...adLines, ...fallbackAds]) {
      pushIfMissing(planRow({
        id: `plan-${campaign.id}-ads-${slug(line.platform)}`,
        campaignId: campaign.id,
        ad: `Planned Ads — ${line.platform}`,
        audience,
        role: "Media plan",
        platform: line.platform,
        type: "Ads Budget Allocation",
        kpi: "Reach",
        target: 0,
        budget: line.amount || 0,
        days,
        cvTargetPct: 0,
      }));
    }

    for (const kol of brief.kols ?? []) {
      const budget = kol.budget || 0;
      if (budget <= 0) continue;
      const platforms = kol.platforms?.length ? kol.platforms : ["KOL"];
      const budgetPerPlatform = Math.round(budget / platforms.length);
      const reachPerPlatform = Math.round((kol.expectedReach || 0) * Math.max(1, kol.count || 1) / platforms.length);
      // Match the KOL module's real results: sum actualReach + committed cost of
      // the creator rows fanned out from this brief item, split across platforms
      // so the Performance Bar KOL row shows the same numbers as KOL Performance.
      const matched = kols.filter((k) => k.campaignId === campaign.id && (k.sourceKolRequirementId || "").split("#")[0] === kol.id);
      const actualReachTotal = matched.reduce((s, k) => s + (k.actualReach || 0), 0);
      const actualCostTotal = matched.reduce((s, k) => s + (k.totalCost || 0), 0);
      // Show the ASSIGNED page name(s) once the KOL specialist has picked real
      // creators — otherwise the Performance row keeps the planner's placeholder
      // ("Lifestyle") and it looks like the assignment never landed. The brief's
      // kolType is the fallback until a page is chosen.
      const assignedNames = Array.from(new Set(
        matched.map((k) => (k.name || "").trim()).filter(Boolean),
      ));
      const kolLabel = assignedNames.length
        ? assignedNames.slice(0, 2).join(", ") + (assignedNames.length > 2 ? ` +${assignedNames.length - 2}` : "")
        : (kol.name || kol.kolType || "Creator");
      const reachActualPer = Math.round(actualReachTotal / platforms.length);
      const budgetActualPer = Math.round(actualCostTotal / platforms.length);
      platforms.forEach((platform, index) => {
        pushIfMissing({
          ...planRow({
            id: `plan-${campaign.id}-kol-${slug(kol.id)}-${slug(platform)}`,
            campaignId: campaign.id,
            ad: `Planned KOL — ${kolLabel}`,
            audience: kol.area || audience,
            role: "KOL plan",
            platform: platform || "KOL",
            type: (kol.contentRequired ?? []).join(" + ") || "KOL Content",
            kpi: "Reach",
            target: reachPerPlatform,
            budget: budgetPerPlatform,
            days,
            cvTargetPct: 0,
          }),
          reachActual: reachActualPer,
          budgetActual: budgetActualPer,
        });
      });
    }
  }

  return out;
}

// ── Platform aggregation (Platform Performance page) ──────────────────

/** Display metadata per marketing platform (short badge code + brand color). */
export const PLATFORM_META: Record<string, { code: string; color: string }> = {
  "KOL": { code: "KOL", color: "#C68A1E" },
  "FB/IG": { code: "FB", color: "#1877F2" },
  "Facebook": { code: "FB", color: "#1877F2" },
  "Instagram": { code: "IG", color: "#E1306C" },
  "TikTok": { code: "TK", color: "#010101" },
  "Grabfood Ads": { code: "GR", color: "#00B14F" },
  "LINE Ads": { code: "LN", color: "#06C755" },
  "Google": { code: "GG", color: "#4285F4" },
  "YouTube": { code: "YT", color: "#FF0000" },
};

export function platformMeta(name: string): { code: string; color: string } {
  return PLATFORM_META[name] ?? { code: name.slice(0, 2).toUpperCase(), color: "#9A9387" };
}

export interface PlatformAgg {
  platform: string;
  unit: ResultKpi;          // dominant KPI unit across the platform's rows
  rows: number;
  budgetPlan: number;
  budgetActual: number;
  budgetPct: number;        // 0..100+
  target: number;
  actual: number;
  reachPct: number;         // 0..100+
  cprPlan: number | null;
  cprActual: number | null;
  statusCounts: Record<ResultStatusKey, number>;
}

/** Group rows by platform and roll up plan vs actual. Sorted by planned budget. */
export function aggregateByPlatform(rows: CampaignResultRow[]): PlatformAgg[] {
  const groups = new Map<string, CampaignResultRow[]>();
  for (const r of rows) {
    const key = r.platform || "—";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const out: PlatformAgg[] = [];
  for (const [platform, rs] of groups) {
    const budgetPlan = rs.reduce((s, r) => s + (r.budget || 0), 0);
    const budgetActual = rs.reduce((s, r) => s + (r.budgetActual || 0), 0);
    const target = rs.reduce((s, r) => s + (r.target || 0), 0);
    const actual = rs.reduce((s, r) => s + (r.reachActual || 0), 0);

    const kpiTally = new Map<ResultKpi, number>();
    const statusCounts: Record<ResultStatusKey, number> = {
      pending: 0, on_track: 0, over_budget: 0, under_deliver: 0, off_track: 0,
    };
    for (const r of rs) {
      kpiTally.set(r.kpi, (kpiTally.get(r.kpi) ?? 0) + 1);
      statusCounts[deriveResultRow(r).status]++;
    }
    const unit = [...kpiTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Reach";

    out.push({
      platform,
      unit,
      rows: rs.length,
      budgetPlan,
      budgetActual,
      budgetPct: budgetPlan > 0 ? (budgetActual / budgetPlan) * 100 : 0,
      target,
      actual,
      reachPct: target > 0 ? (actual / target) * 100 : 0,
      cprPlan: target > 0 ? budgetPlan / target : null,
      cprActual: actual > 0 ? budgetActual / actual : null,
      statusCounts,
    });
  }
  return out.sort((a, b) => b.budgetPlan - a.budgetPlan);
}

// ── Generic grouping (Platform ⇄ Campaign view toggle) ────────────────

export type GroupDim = "platform" | "campaign";

export interface GroupAgg {
  key: string;              // platform name or campaign id
  label: string;            // display label
  unit: ResultKpi;
  rows: number;
  budgetPlan: number;
  budgetActual: number;
  budgetPct: number;
  target: number;
  actual: number;
  reachPct: number;
  cprPlan: number | null;
  cprActual: number | null;
  conversions: number;      // Σ actual conversions across the group
}

/** Group rows by platform OR by campaign and roll up plan vs actual. `labelOf`
 *  maps campaign ids to names for the campaign view. Sorted by planned budget. */
export function aggregateBy(rows: CampaignResultRow[], dim: GroupDim, labelOf?: Record<string, string>): GroupAgg[] {
  const groups = new Map<string, CampaignResultRow[]>();
  for (const r of rows) {
    const key = dim === "platform" ? (r.platform || "—") : r.campaignId;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const out: GroupAgg[] = [];
  for (const [key, rs] of groups) {
    const budgetPlan = rs.reduce((s, r) => s + (r.budget || 0), 0);
    const budgetActual = rs.reduce((s, r) => s + (r.budgetActual || 0), 0);
    const target = rs.reduce((s, r) => s + (r.target || 0), 0);
    const actual = rs.reduce((s, r) => s + (r.reachActual || 0), 0);
    const conversions = rs.reduce((s, r) => s + (r.conversions || 0), 0);

    const kpiTally = new Map<ResultKpi, number>();
    for (const r of rs) kpiTally.set(r.kpi, (kpiTally.get(r.kpi) ?? 0) + 1);
    const unit = [...kpiTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Reach";

    out.push({
      key,
      label: dim === "platform" ? key : (labelOf?.[key] ?? key),
      unit,
      rows: rs.length,
      budgetPlan,
      budgetActual,
      budgetPct: budgetPlan > 0 ? (budgetActual / budgetPlan) * 100 : 0,
      target,
      actual,
      reachPct: target > 0 ? (actual / target) * 100 : 0,
      cprPlan: target > 0 ? budgetPlan / target : null,
      cprActual: actual > 0 ? budgetActual / actual : null,
      conversions,
    });
  }
  return out.sort((a, b) => b.budgetPlan - a.budgetPlan);
}
