// Cross-module campaign hub: reads every record linked to a campaign (by name)
// from the same source of truth the child modules write to, and can generate the
// Planner's starter tasks. This is what makes the Campaign detail tabs, counters,
// and readiness widgets reflect real data.

import { fetchContent, createContent } from "./content";
import { fetchKols, createKol, buildKol } from "./kol";
import { fetchGraphics, createGraphic, buildGraphic } from "./graphic";
import { fetchTasks, createTaskDb } from "./tasks";
import { fetchExpenseRequests, createExpenseRequest } from "./finance";
import { CampaignBrief, budgetSummary } from "@/lib/data/brief";
import { canonicalBucket, canonicalAdsPlatform } from "@/lib/data/financeCategories";
import { ContentItem } from "@/lib/data/content";
import { Kol } from "@/lib/data/kol";
import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";
import { RequestRow } from "@/lib/data/finance";
import { CampaignRow } from "@/lib/data/campaigns";
import { brandName } from "@/lib/brands";

export interface CampaignHub {
  content: ContentItem[];
  kols: Kol[];
  graphics: Graphic[];
  tasks: Task[];
  expenses: RequestRow[];
}

/** Everything linked to one campaign, pulled from the live tables. */
export async function fetchCampaignHub(name: string): Promise<CampaignHub> {
  const [content, kols, graphics, t, expenses] = await Promise.all([
    fetchContent(), fetchKols(), fetchGraphics(), fetchTasks(), fetchExpenseRequests(),
  ]);
  const eq = (x?: string) => (x ?? "") === name;
  return {
    content: content.filter((c) => eq(c.campaign)),
    kols: kols.filter((k) => eq(k.campaign)),
    graphics: graphics.filter((g) => eq(g.campaign)),
    tasks: t.tasks.filter((x) => eq(x.campaign)),
    expenses: expenses.filter((e) => eq(e.campaign)),
  };
}

export interface HubStats {
  total: number; done: number; inProgress: number; blocked: number; waiting: number;
  content: number; graphics: number; kols: number; tasks: number; expenses: number; expenseTotal: number;
  /** Actual spend = only APPROVED/PAID expense requests (same rule as Finance). */
  approvedTotal: number;
}

const CONTENT_DONE = /Approved|Published|Scheduled|Ready/i;
const GRAPHIC_DONE = /Approved|Delivered/i;
const KOL_DONE = /Posted|Live|Completed|Approved/i;

export function hubStats(hub: CampaignHub): HubStats {
  const total = hub.content.length + hub.graphics.length + hub.kols.length + hub.tasks.length;
  const done =
    hub.content.filter((c) => CONTENT_DONE.test(c.approvalStatus) || CONTENT_DONE.test(c.status)).length +
    hub.graphics.filter((g) => GRAPHIC_DONE.test(g.stage)).length +
    hub.kols.filter((k) => KOL_DONE.test(k.status)).length +
    hub.tasks.filter((t) => t.status === "Done").length;
  const blocked = hub.tasks.filter((t) => t.status === "Stuck").length + hub.graphics.filter((g) => g.blocker).length;
  const waiting = hub.tasks.filter((t) => t.status === "Waiting").length;
  return {
    total, done, inProgress: Math.max(0, total - done - blocked), blocked, waiting,
    content: hub.content.length, graphics: hub.graphics.length, kols: hub.kols.length, tasks: hub.tasks.length,
    expenses: hub.expenses.length, expenseTotal: hub.expenses.reduce((s, e) => s + (e.requested || 0), 0),
    approvedTotal: hub.expenses.filter((e) => /approved|paid/i.test(e.status)).reduce((s, e) => s + (e.approved || e.requested || 0), 0),
  };
}

/** When a campaign brief is approved, pre-open one Draft expense request per
 *  funded budget bucket so Finance doesn't re-key the plan by hand. Skips
 *  buckets that already have a request for this campaign (safe to call twice).
 *  Returns how many drafts were created. */
export async function createBudgetExpenseDrafts(c: CampaignRow, brief: CampaignBrief): Promise<number> {
  const buckets = budgetSummary(brief).byBucket.filter((b) => b.amount > 0);
  if (!buckets.length) return 0;
  const existing = (await fetchExpenseRequests()).filter((e) => e.campaign === c.name);
  const requester = brief.plannerOwner || c.owner;
  // Draft rows use canonical category names (matching the budget sheet) so the
  // P&L by Category aligns actual vs budget. The "Ads" bucket is split into one
  // draft per funded platform (Facebook/Instagram → "Facebook / Instagram Ads", …).
  const drafts: { category: string; amount: number }[] = [];
  for (const b of buckets) {
    if (b.label === "Ads") {
      const platforms = brief.budget.adsByPlatform.filter((a) => a.amount > 0);
      if (platforms.length) {
        for (const p of platforms) drafts.push({ category: canonicalAdsPlatform(p.platform), amount: p.amount });
      } else {
        drafts.push({ category: "Facebook / Instagram Ads", amount: b.amount });
      }
    } else {
      drafts.push({ category: canonicalBucket(b.label), amount: b.amount });
    }
  }
  let created = 0;
  for (const d of drafts) {
    if (d.amount <= 0 || existing.some((e) => e.category === d.category)) continue;
    await createExpenseRequest(
      { category: d.category, b: c.b, campaign: c.name, requested: d.amount, approved: 0, due: "—", status: "Draft" },
      { requester },
    );
    existing.push({ category: d.category, b: c.b, campaign: c.name, requested: d.amount, approved: 0, due: "—", status: "Draft" });
    created++;
  }
  return created;
}

/** Generate the Planner's starter tasks for a campaign — real records tagged
 *  with the campaign name so they show up across every module. */
export async function createPlannerTasks(c: CampaignRow): Promise<void> {
  const stamp = Date.now();
  const bn = brandName(c.b);

  for (let i = 1; i <= 4; i++) {
    await createContent({
      id: `c${stamp}${i}`, day: 1, time: "10:00", title: `${c.name} — Content ${i}`, b: c.b,
      plat: "Instagram", platforms: ["Instagram"], status: "Draft", campaign: c.name, owner: c.owner,
      caption: "", hashtags: "", cta: "", captionStatus: "Missing", assetStatus: "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    });
  }
  for (let i = 1; i <= 3; i++) {
    await createGraphic(buildGraphic({
      id: stamp + i, b: c.b, campaign: c.name, title: `${c.name} — Artwork ${i}`, type: "Key Visual",
      due: "TBD", designer: "Unassigned", requester: c.owner, approver: c.nextApproval, channels: [],
    }));
  }
  for (let i = 1; i <= 2; i++) {
    await createKol(buildKol({
      id: stamp + 50 + i, campaign: c.name, b: c.b, kolType: "Food Blogger",
      count: 1, budget: 0, deliverables: "", notes: "",
    }));
  }
  const mkTask = (n: number, module: string, icon: string, color: string, type: string, title: string, channel?: string): Task => ({
    id: stamp + 100 + n, title, module, moduleIcon: icon, moduleColor: color, type,
    assignee: c.owner, brand: bn, campaign: c.name, status: "Todo", priority: "Med", group: "quickWins",
    due: "TBD", blocker: null, pendingApprover: null, isQuickWin: false, nextAction: "Start when ready.", checklist: [], channel,
  });
  await createTaskDb(mkTask(1, "Ads", "📣", "#C68A1E", "Ads", `${c.name} — Meta Ads setup`, "Meta"));
  await createTaskDb(mkTask(2, "Ads", "📣", "#C68A1E", "Ads", `${c.name} — Google Ads optimization`, "Google"));
  await createTaskDb(mkTask(3, "Campaign", "📊", "#B33A2E", "Report", `${c.name} — Result report`));

  // Draft for the full planning budget — the team adjusts and submits it, rather
  // than the old fabricated 40% figure going straight to approval.
  await createExpenseRequest({
    category: "Campaign budget", b: c.b, campaign: c.name, requested: c.budget,
    approved: 0, due: "TBD", status: "Draft",
  });
}
