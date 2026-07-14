// Data access for Campaigns. Reads Supabase when configured, else the mock.

import { supabase } from "@/lib/supabase";
import { CAMPAIGNS, CampaignRow, Readiness } from "@/lib/data/campaigns";
import { BrandId } from "@/lib/brands";
import { assertDbOk } from "@/lib/db/assert";

type Row = {
  id: string; name: string; brand: BrandId; branch: string; owner: string;
  budget: number; spend: number; roi: number; dates: string; status: string;
  camp_type: string; readiness: string;
  task_blocked: number; task_waiting: number; task_overdue: number;
  task_total: number; task_done: number; task_in_progress: number;
  bottleneck_team: string; next_approval: string;
};

const toCampaign = (r: Row): CampaignRow => ({
  id: r.id, name: r.name, b: r.brand, branch: r.branch, owner: r.owner,
  budget: Number(r.budget), spend: Number(r.spend), roi: Number(r.roi), dates: r.dates,
  status: r.status, campType: r.camp_type, readiness: (r.readiness as Readiness) ?? "ready",
  taskBlocked: r.task_blocked, taskWaiting: r.task_waiting, taskOverdue: r.task_overdue,
  taskTotal: r.task_total, taskDone: r.task_done, taskInProgress: r.task_in_progress,
  bottleneckTeam: r.bottleneck_team, nextApproval: r.next_approval,
});

/** All campaigns — from Supabase if configured, else the mock. */
export async function fetchCampaigns(): Promise<CampaignRow[]> {
  const db = supabase();
  if (!db) return CAMPAIGNS.map((c) => ({ ...c }));
  const { data, error } = await db.from("campaigns").select("*").order("id");
  // In production, never fall back to demo campaigns when Supabase is present.
  // A query error should read as "no live campaign data" instead of showing
  // sample work that has already been cleared for real usage.
  if (error || !data) return [];
  return (data as Row[]).map(toCampaign);
}

/** Team-shared custom campaign types (added by admins). Empty if not configured
 *  or the table doesn't exist yet. */
export async function fetchCampaignTypes(): Promise<string[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.from("campaign_types").select("name").order("name");
  if (error || !data) return [];
  return data.map((r) => r.name as string);
}

/** Add a shared campaign type (admin only — the UI gates this). */
export async function addCampaignType(name: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("campaign_types").upsert({ name });
  assertDbOk(error, "Could not save campaign type");
}

/** Insert a new campaign; returns it. */
export async function createCampaign(c: CampaignRow): Promise<CampaignRow> {
  const db = supabase();
  if (!db) return c;
  const { error } = await db.from("campaigns").upsert({
    id: c.id, name: c.name, brand: c.b, branch: c.branch, owner: c.owner, budget: c.budget, spend: c.spend,
    roi: c.roi, dates: c.dates, status: c.status, camp_type: c.campType, readiness: c.readiness,
    task_blocked: c.taskBlocked, task_waiting: c.taskWaiting, task_overdue: c.taskOverdue,
    task_total: c.taskTotal, task_done: c.taskDone, task_in_progress: c.taskInProgress,
    bottleneck_team: c.bottleneckTeam, next_approval: c.nextApproval,
  }, { onConflict: "id" });
  assertDbOk(error, "Could not save campaign");
  return c;
}

/** Update a campaign's status (used by the temporary approve/reject action while
 *  the dedicated Approval Queue module is still coming soon). */
export async function updateCampaignStatus(id: string, status: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const nextApproval = status === "Waiting Approval" || status === "Waiting for Approval" ? "CMO" : "None";
  const { error } = await db.from("campaigns").update({ status, next_approval: nextApproval }).eq("id", id);
  assertDbOk(error, "Could not update campaign status");
}

/** Delete a campaign and the records Marketing OS generated from its brief so
 * the list, planner modules, and task views stay in sync. */
export async function deleteCampaign(id: string): Promise<void> {
  const db = supabase();
  if (!db) return;

  const results = await Promise.all([
    db.from("content_posts").delete().eq("campaign_id", id),
    db.from("graphic_requests").delete().eq("campaign_id", id),
    db.from("campaign_results").delete().eq("campaign_id", id),
    db.from("tasks").delete().filter("data->>relatedBrief", "eq", id),
    db.from("kols").delete().filter("data->>campaignId", "eq", id),
  ]);
  for (const result of results) assertDbOk(result.error, "Could not delete linked campaign records");

  const { error } = await db.from("campaigns").delete().eq("id", id);
  assertDbOk(error, "Could not delete campaign");
}

/** Keep the campaign's ROAS multiple (stored in the legacy `roi` column) in
 *  sync with entered results: ROAS = Σ ad revenue ÷ Σ ad actual spend. Called
 *  after saving result rows so Campaign Café / Finance show the real multiple. */
export async function updateCampaignRoas(id: string, roas: number): Promise<void> {
  const rounded = Math.round(roas * 100) / 100;
  const db = supabase();
  if (!db) {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) c.roi = rounded;
    return;
  }
  const { error } = await db.from("campaigns").update({ roi: rounded }).eq("id", id);
  assertDbOk(error, "Could not update campaign ROAS");
}

/** CMO-approved budget revision. Spend stays untouched; only the campaign plan
 *  cap changes so Finance / Dashboard recalculate from the same source. */
export async function updateCampaignBudget(id: string, budget: number): Promise<void> {
  const db = supabase();
  if (!db) {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) c.budget = budget;
    return;
  }
  const { error } = await db.from("campaigns").update({ budget }).eq("id", id);
  assertDbOk(error, "Could not update campaign budget");
}

/** A single campaign by id — for the detail page. */
export async function fetchCampaign(id: string): Promise<CampaignRow | undefined> {
  const db = supabase();
  if (!db) return CAMPAIGNS.find((c) => c.id === id);
  const { data, error } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !data) return undefined;
  return toCampaign(data as Row);
}
