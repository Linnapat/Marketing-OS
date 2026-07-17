// Derive the Dashboard + Finance views from real DB rows (campaigns, expense
// requests, tasks, KOLs) instead of standalone mock constants — so both pages
// reflect actual data and are empty on a freshly-cleared database.

import { CampaignRow } from "@/lib/data/campaigns";
import { BudgetBrand, PnlRow, RequestRow } from "@/lib/data/finance";
import { Kpi } from "@/components/ui/KpiCard";
import { collapseTaskWorkItems, Task } from "@/lib/data/tasks";
import { Kol } from "@/lib/data/kol";
import type { Member } from "@/lib/db/settings";
import { ContentItem } from "@/lib/data/content";
import { Graphic, artworkUnits } from "@/lib/data/graphic";
import { BRAND_ORDER, brandName } from "@/lib/brands";
import { baht } from "@/lib/format";
import { DateFilter, rangeOverlapFraction } from "@/components/ui/DateFilterBar";

// ── Finance ────────────────────────────────────────────────────────────────
// Three distinct layers of money — never mix them:
//   Plan      = budget approved for a campaign (c.budget). Not a transaction.
//   Committed = plan-time allocation reserved across buckets (c.spend).
//               Money earmarked, NOT yet spent — never shown as expense.
//   Expense   = only approved/paid expense requests. The single source for
//               P&L Expense → Gross Profit → ROI/ROAS (same rule as Dashboard).
export interface FinanceView {
  totalPlan: number;
  committed: number;
  actualSpend: number;
  available: number;
  byBrand: BudgetBrand[];
  byCategory: { name: string; amount: number }[];
  pnl: PnlRow[];
}

const isSpentReq = (status: string) => /approved|paid/i.test(status);

/** When `period` is given, campaigns are limited to those overlapping it and
 *  their fixed budgets/allocations are pro-rated by day overlap (a Jun 1–Jul 15
 *  campaign contributes 15/45 of its budget to July). Callers should pass
 *  `reqs` already filtered to the same period. */
export function financeFromDb(campaigns: CampaignRow[], reqs: RequestRow[], period?: DateFilter): FinanceView {
  const inPeriod = campaigns
    .map((c) => ({ c, f: period ? rangeOverlapFraction(period, c.dates) : 1 }))
    .filter((x) => x.f > 0);

  const totalPlan = inPeriod.reduce((s, x) => s + Math.round((x.c.budget || 0) * x.f), 0);
  const committed = inPeriod.reduce((s, x) => s + Math.round((x.c.spend || 0) * x.f), 0);

  // Actual expense per campaign — allocating a plan is never an expense; money
  // must clear approval before it hits the P&L.
  const spentByCampaign = new Map<string, number>();
  let actualSpend = 0;
  for (const r of reqs) {
    if (!isSpentReq(r.status)) continue;
    const amt = r.approved || r.requested || 0;
    spentByCampaign.set(r.campaign, (spentByCampaign.get(r.campaign) || 0) + amt);
    actualSpend += amt;
  }

  const byBrand: BudgetBrand[] = BRAND_ORDER
    .map((b) => {
      const cs = inPeriod.filter((x) => x.c.b === b);
      return {
        b,
        plan: cs.reduce((s, x) => s + Math.round((x.c.budget || 0) * x.f), 0),
        spent: cs.reduce((s, x) => s + Math.round((x.c.spend || 0) * x.f), 0),
      };
    })
    .filter((x) => x.plan > 0 || x.spent > 0);

  const catMap = new Map<string, number>();
  for (const r of reqs) catMap.set(r.category, (catMap.get(r.category) || 0) + (r.requested || 0));
  const byCategory = Array.from(catMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // P&L per campaign — expense is real approved spend (0 until a request is
  // approved, so a freshly-allocated campaign shows GP 0, not −budget).
  const pnl: PnlRow[] = inPeriod.map(({ c, f }) => {
    const expense = spentByCampaign.get(c.name) || 0;
    const roi = c.roi || 0;
    return { name: c.name, b: c.b, revenue: Math.round(expense * roi), budget: Math.round((c.budget || 0) * f), expense, roi, roas: roi };
  });

  return { totalPlan, committed, actualSpend, available: totalPlan - committed, byBrand, byCategory, pnl };
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface DashboardView {
  budgetTotal: number;
  spentTotal: number;
  usedPct: number;
  kpis: Kpi[];
  needsAttention: Task[];
}

const ACTIVE_CAMPAIGN = new Set(["Active", "In Progress", "In progress", "Ready", "Waiting Approval"]);

export function dashboardFromDb(campaigns: CampaignRow[], tasks: Task[], kols: Kol[], expenseReqs: RequestRow[] = []): DashboardView {
  const workItems = collapseTaskWorkItems(tasks);
  const budgetTotal = campaigns.reduce((s, c) => s + (c.budget || 0), 0);
  // "Committed" = planned allocation across campaigns (includes KOL fees).
  const committedTotal = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  // "Actual Spend" = only money with an APPROVED expense/payment behind it —
  // KOL fees never count here until an expense request is approved.
  const spentTotal = expenseReqs.filter((r) => /approved|paid/i.test(r.status)).reduce((s, r) => s + (r.approved || r.requested || 0), 0);
  const usedPct = budgetTotal ? Math.round((spentTotal / budgetTotal) * 100) : 0;
  const committedPct = budgetTotal ? Math.round((committedTotal / budgetTotal) * 100) : 0;
  const activeCampaigns = campaigns.filter((c) => ACTIVE_CAMPAIGN.has(c.status)).length;
  const openTasks = workItems.filter((t) => t.status !== "Done").length;
  const needsAttention = workItems.filter((t) => t.status === "Stuck" || !!t.blocker).slice(0, 6);

  const kpis: Kpi[] = [
    { label: "Total Budget", value: baht(budgetTotal, { compact: true }) },
    { label: "Committed", value: baht(committedTotal, { compact: true }), meta: `${committedPct}% planned` },
    { label: "Actual Spend", value: baht(spentTotal, { compact: true }), meta: `${usedPct}% approved` },
    { label: "Active Campaigns", value: String(activeCampaigns) },
    { label: "Open Tasks", value: String(openTasks), valColor: openTasks ? "#C68A1E" : undefined },
    { label: "Campaigns", value: String(campaigns.length), dark: true, cardBg: "#211F1C", labelColor: "#B8945A", valColor: "#fff" },
  ];

  return { budgetTotal, spentTotal, usedPct, kpis, needsAttention };
}

// ── Dashboard feed — aggregate pending/attention across every module ─────────
export interface FeedItem { id: string; title: string; meta: string; module: string; href: string; }
export interface DashFeed { pendingApproval: FeedItem[]; needsAttention: FeedItem[]; }

/** Real "Pending Approval" + "Needs Attention" pulled from Campaigns, Content,
 *  Graphics, Tasks and Expense requests — so the Dashboard reflects every
 *  module, not just one. Expense rows link to My Tasks › My Approval. */
export function dashboardFeed(campaigns: CampaignRow[], content: ContentItem[], graphics: Graphic[], tasks: Task[], expenseReqs: RequestRow[] = []): DashFeed {
  const pendingApproval: FeedItem[] = [];
  const needsAttention: FeedItem[] = [];

  expenseReqs.forEach((r, i) => {
    if (r.status === "Waiting Approval") pendingApproval.push({ id: `exp-${i}`, title: `${r.category} · ${baht(r.requested, { compact: true })}`, meta: `${brandName(r.b)} · Expense`, module: "Expenses", href: "/my-tasks" });
  });

  for (const c of campaigns) {
    if (c.status === "Waiting for Approval") pendingApproval.push({ id: `cam-${c.id}`, title: c.name, meta: `${brandName(c.b)} · Campaign`, module: "Campaign", href: `/campaigns/${c.id}` });
    else if (c.readiness === "needs_attention" && (c.taskBlocked > 0 || c.taskOverdue > 0)) needsAttention.push({ id: `cam-${c.id}`, title: c.name, meta: `${brandName(c.b)} · ${c.taskBlocked} blocked · ${c.taskOverdue} overdue`, module: "Campaign", href: `/campaigns/${c.id}` });
  }
  for (const c of content) {
    if (c.status === "Waiting Approval" || c.approvalStatus === "Waiting Approval") pendingApproval.push({ id: `ct-${c.id}`, title: c.title, meta: `${brandName(c.b)} · Content`, module: "Content", href: "/content" });
    else if (c.assetStatus === "Waiting Design") needsAttention.push({ id: `ct-${c.id}`, title: c.title, meta: `${brandName(c.b)} · Waiting Design`, module: "Content", href: "/content" });
  }
  for (const g of graphics) {
    if (g.stage === "Waiting Approval") pendingApproval.push({ id: `gr-${g.id}`, title: g.title, meta: `${brandName(g.b)} · Graphic`, module: "Graphic", href: "/graphic" });
    else if (["Revision Requested", "Brief Incomplete", "Waiting Feedback"].includes(g.stage)) needsAttention.push({ id: `gr-${g.id}`, title: g.title, meta: `${brandName(g.b)} · ${g.stage}`, module: "Graphic", href: "/graphic" });
  }
  for (const t of tasks) {
    if (t.status === "Stuck" || t.blocker) needsAttention.push({ id: `tk-${t.id}`, title: t.title, meta: `${t.brand} · ${t.blocker || "Stuck"}`, module: "Task", href: "/my-tasks" });
  }
  return { pendingApproval, needsAttention };
}

// ── Team Workload ────────────────────────────────────────────────────────────
export type Load = "healthy" | "busy" | "needsSupport";

export interface TeamMemberView {
  name: string;
  role: string;
  color: string;
  avatarUrl?: string;
  presence?: string;
  statusNote?: string;
  open: number;
  done: number;
  inProgress: number;
  waiting: number;
  stuck: number;
  overdue: number;
  /** Open work in PIECES: a graphic request for three sizes weighs three, other
   *  work weighs one each. */
  pieces: number;
  /** `pieces` expressed in working days at PIECES_PER_DAY — the readable form.
   *  "12 pieces open" says little; "3½ days of work" says whether to step in. */
  days: number;
  load: Load;
  /** Why this person is flagged, in their own row — so the status can be acted
   *  on without opening anything. */
  reason: string;
}

export interface TeamView {
  members: TeamMemberView[];
  pulse: { healthy: number; busy: number; needsSupport: number; stuckTasks: number; overdue: number; done: number };
}

/** What one person clears in a working day, in pieces of artwork — the team's
 *  own figure (3–4/day, 2026-07). Everything below is measured against it, so
 *  when the pace changes this is the single number to change. */
export const PIECES_PER_DAY = 3.5;
/** Backlog past this many days of work is more than a week's runway: that is
 *  overload, not a busy stretch. */
const OVERLOADED_DAYS = 4;
/** Below this it's a normal day's queue. */
const BUSY_DAYS = 2;

/** Per-person workload derived from real tasks (matched on assignee name).
 *
 *  "Need help" means BLOCKED OR BURIED, not simply "has many rows". It used to
 *  be `open >= 8`, counting every task as one regardless of what it holds: a
 *  person with eight trivial items looked like an emergency, while someone with
 *  three requests stuck behind a blocker for a fortnight read as "healthy" —
 *  which is exactly the person a lead should be helping.
 *
 *  So two different questions are answered separately:
 *    - Stuck / blocked work → 🛟 needs support. A lead can unblock it today,
 *      and no threshold is needed to know that.
 *    - Volume → weighed in artwork pieces (a 3-size request is 3 pieces, via
 *      artworkUnits) and converted to days at PIECES_PER_DAY.
 *
 *  `graphics` is optional: without it every task weighs one and the view still
 *  works, just less precisely.
 */
export function teamFromDb(members: Member[], tasks: Task[], doneIds: number[], graphics: Graphic[] = []): TeamView {
  // Per-person rows count each person's OWN tasks, uncollapsed. Collapsing is
  // for the team totals, where one brief item spawning a Content task and a
  // Graphic task must not be counted twice — but those are two people's work,
  // and the collapse keeps only the Graphic side's assignee, which erased the
  // writer's task from their own workload.
  const workItems = collapseTaskWorkItems(tasks, doneIds);
  const today = new Date().toISOString().slice(0, 10);
  const done = (t: Task) => doneIds.includes(t.id) || t.status === "Done";
  const isStuck = (t: Task) => t.status === "Stuck" || !!t.blocker;
  const isOverdue = (t: Task) => !done(t) && !!t.dueIso && t.dueIso < today;

  // A graphic task weighs what it actually holds: three sizes = three pieces.
  const graphicById = new Map(graphics.map((g) => [String(g.id), g]));
  const piecesOf = (t: Task) => {
    const g = t.relatedGraphicId ? graphicById.get(String(t.relatedGraphicId)) : undefined;
    return g ? artworkUnits(g) : 1;
  };

  const bucket = (mine: Task[]) => {
    const openTasks = mine.filter((t) => !done(t));
    const pieces = openTasks.reduce((sum, t) => sum + piecesOf(t), 0);
    const days = Math.round((pieces / PIECES_PER_DAY) * 10) / 10;
    const stuck = mine.filter(isStuck).length;
    const overdue = mine.filter(isOverdue).length;

    // Blocked work comes first: it is the one a lead can move today.
    const load: Load = stuck > 0 || days > OVERLOADED_DAYS ? "needsSupport"
      : days >= BUSY_DAYS || overdue > 0 ? "busy"
      : "healthy";
    const reason = stuck > 0 ? `${stuck} งานติดอยู่ — ปลดล็อกได้วันนี้`
      : days > OVERLOADED_DAYS ? `งานค้าง ${days} วันทำงาน — เกินหนึ่งสัปดาห์`
      : overdue > 0 ? `${overdue} งานเลยกำหนด`
      : days >= BUSY_DAYS ? `งานค้าง ${days} วันทำงาน`
      : "ไหลอยู่ — ยังรับเพิ่มได้";

    return {
      open: openTasks.length,
      done: mine.filter(done).length,
      inProgress: mine.filter((t) => t.status === "In Progress").length,
      waiting: mine.filter((t) => t.status === "Waiting" || t.status === "Need Approval").length,
      stuck,
      overdue,
      pieces,
      days,
      load,
      reason,
    };
  };

  const view: TeamMemberView[] = members.map((m) => ({
    name: m.name, role: m.role, color: m.color, avatarUrl: m.avatarUrl, presence: m.presence, statusNote: m.statusNote,
    ...bucket(tasks.filter((t) => t.assignee === m.name)),
  }));

  // Work assigned to nobody — or to a name that isn't a real member — is still
  // load the team must absorb. Surface it as its own row instead of letting it
  // vanish from the summary.
  const known = new Set(members.map((m) => m.name));
  const orphans = tasks.filter((t) => !known.has(t.assignee));
  if (orphans.length) {
    view.push({
      name: "Unassigned", role: "งานที่ยังไม่มีเจ้าของจริงในระบบ — ต้องมีคนรับ", color: "#9A9387",
      ...bucket(orphans),
    });
  }

  return {
    members: view,
    pulse: {
      healthy: view.filter((v) => v.load === "healthy").length,
      busy: view.filter((v) => v.load === "busy").length,
      needsSupport: view.filter((v) => v.load === "needsSupport").length,
      stuckTasks: workItems.filter(isStuck).length,
      overdue: workItems.filter(isOverdue).length,
      done: workItems.filter(done).length,
    },
  };
}
