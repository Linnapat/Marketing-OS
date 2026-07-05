// Derive the Dashboard + Finance views from real DB rows (campaigns, expense
// requests, tasks, KOLs) instead of standalone mock constants — so both pages
// reflect actual data and are empty on a freshly-cleared database.

import { CampaignRow } from "@/lib/data/campaigns";
import { BudgetBrand, PnlRow, RequestRow } from "@/lib/data/finance";
import { Kpi } from "@/components/ui/KpiCard";
import { Task } from "@/lib/data/tasks";
import { Kol } from "@/lib/data/kol";
import type { Member } from "@/lib/db/settings";
import { BRAND_ORDER } from "@/lib/brands";
import { baht } from "@/lib/format";

// ── Finance ────────────────────────────────────────────────────────────────
export interface FinanceView {
  totalPlan: number;
  committed: number;
  available: number;
  byBrand: BudgetBrand[];
  byCategory: { name: string; amount: number }[];
  pnl: PnlRow[];
}

export function financeFromDb(campaigns: CampaignRow[], reqs: RequestRow[]): FinanceView {
  const totalPlan = campaigns.reduce((s, c) => s + (c.budget || 0), 0);
  const committed = campaigns.reduce((s, c) => s + (c.spend || 0), 0);

  const byBrand: BudgetBrand[] = BRAND_ORDER
    .map((b) => {
      const cs = campaigns.filter((c) => c.b === b);
      return { b, plan: cs.reduce((s, c) => s + (c.budget || 0), 0), spent: cs.reduce((s, c) => s + (c.spend || 0), 0) };
    })
    .filter((x) => x.plan > 0 || x.spent > 0);

  const catMap = new Map<string, number>();
  for (const r of reqs) catMap.set(r.category, (catMap.get(r.category) || 0) + (r.requested || 0));
  const byCategory = Array.from(catMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // P&L per campaign — roi drives revenue (0 until results are entered, so this
  // shows real zeros rather than fabricated numbers).
  const pnl: PnlRow[] = campaigns.map((c) => {
    const expense = c.spend || 0;
    const roi = c.roi || 0;
    return { name: c.name, b: c.b, revenue: Math.round(expense * roi), budget: c.budget || 0, expense, roi, roas: roi };
  });

  return { totalPlan, committed, available: totalPlan - committed, byBrand, byCategory, pnl };
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

export function dashboardFromDb(campaigns: CampaignRow[], tasks: Task[], kols: Kol[]): DashboardView {
  const budgetTotal = campaigns.reduce((s, c) => s + (c.budget || 0), 0);
  const spentTotal = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const usedPct = budgetTotal ? Math.round((spentTotal / budgetTotal) * 100) : 0;
  const activeCampaigns = campaigns.filter((c) => ACTIVE_CAMPAIGN.has(c.status)).length;
  const openTasks = tasks.filter((t) => t.status !== "Done").length;
  const needsAttention = tasks.filter((t) => t.status === "Stuck" || !!t.blocker).slice(0, 6);

  const kpis: Kpi[] = [
    { label: "Total Budget", value: baht(budgetTotal, { compact: true }) },
    { label: "Spent", value: baht(spentTotal, { compact: true }), meta: `${usedPct}% used` },
    { label: "Active Campaigns", value: String(activeCampaigns) },
    { label: "Open Tasks", value: String(openTasks), valColor: openTasks ? "#C68A1E" : undefined },
    { label: "KOL / Creators", value: String(kols.length) },
    { label: "Campaigns", value: String(campaigns.length), dark: true, cardBg: "#211F1C", labelColor: "#B8945A", valColor: "#fff" },
  ];

  return { budgetTotal, spentTotal, usedPct, kpis, needsAttention };
}

// ── Team Workload ────────────────────────────────────────────────────────────
export type Load = "healthy" | "busy" | "needsSupport";

export interface TeamMemberView {
  name: string;
  role: string;
  color: string;
  open: number;
  done: number;
  inProgress: number;
  waiting: number;
  stuck: number;
  overdue: number;
  load: Load;
}

export interface TeamView {
  members: TeamMemberView[];
  pulse: { healthy: number; busy: number; needsSupport: number; stuckTasks: number; overdue: number; done: number };
}

/** Per-person workload derived from real tasks (matched on assignee name).
 *  Load is a task-count heuristic — there's no stored capacity target. */
export function teamFromDb(members: Member[], tasks: Task[], doneIds: number[]): TeamView {
  const today = new Date().toISOString().slice(0, 10);
  const done = (t: Task) => doneIds.includes(t.id) || t.status === "Done";
  const isStuck = (t: Task) => t.status === "Stuck" || !!t.blocker;
  const isOverdue = (t: Task) => !done(t) && !!t.dueIso && t.dueIso < today;

  const view: TeamMemberView[] = members.map((m) => {
    const mine = tasks.filter((t) => t.assignee === m.name);
    const open = mine.filter((t) => !done(t)).length;
    return {
      name: m.name, role: m.role, color: m.color,
      open,
      done: mine.filter(done).length,
      inProgress: mine.filter((t) => t.status === "In Progress").length,
      waiting: mine.filter((t) => t.status === "Waiting" || t.status === "Need Approval").length,
      stuck: mine.filter(isStuck).length,
      overdue: mine.filter(isOverdue).length,
      load: open >= 8 ? "needsSupport" : open >= 5 ? "busy" : "healthy",
    };
  });

  return {
    members: view,
    pulse: {
      healthy: view.filter((v) => v.load === "healthy").length,
      busy: view.filter((v) => v.load === "busy").length,
      needsSupport: view.filter((v) => v.load === "needsSupport").length,
      stuckTasks: tasks.filter(isStuck).length,
      overdue: tasks.filter(isOverdue).length,
      done: tasks.filter(done).length,
    },
  };
}
