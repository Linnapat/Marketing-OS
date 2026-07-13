// Data access for Campaigns. Reads Supabase when configured, else the mock.

import { supabase } from "@/lib/supabase";
import { CAMPAIGNS, CampaignRow, Readiness } from "@/lib/data/campaigns";
import { BrandId } from "@/lib/brands";

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
  if (error || !data) return CAMPAIGNS.map((c) => ({ ...c }));
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
  await db.from("campaign_types").upsert({ name });
}

/** Insert a new campaign; returns it. */
export async function createCampaign(c: CampaignRow): Promise<CampaignRow> {
  const db = supabase();
  if (!db) return c;
  await db.from("campaigns").insert({
    id: c.id, name: c.name, brand: c.b, branch: c.branch, owner: c.owner, budget: c.budget, spend: c.spend,
    roi: c.roi, dates: c.dates, status: c.status, camp_type: c.campType, readiness: c.readiness,
    task_blocked: c.taskBlocked, task_waiting: c.taskWaiting, task_overdue: c.taskOverdue,
    task_total: c.taskTotal, task_done: c.taskDone, task_in_progress: c.taskInProgress,
    bottleneck_team: c.bottleneckTeam, next_approval: c.nextApproval,
  });
  return c;
}

/** Update a campaign's status (used by the temporary approve/reject action while
 *  the dedicated Approval Queue module is still coming soon). */
export async function updateCampaignStatus(id: string, status: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("campaigns").update({ status }).eq("id", id);
}

/** Roll the ad-level ACTUAL spend up to the campaign (spend = Σ budgetActual). The
 *  planned budget stays fixed at the campaign — it is never overwritten here. In
 *  mock mode the in-memory campaign is mutated so the Platform Performance edits
 *  reflect in the Campaigns list within the session; with Supabase it persists. */
export async function updateCampaignSpend(id: string, spend: number): Promise<void> {
  const db = supabase();
  if (!db) {
    const c = CAMPAIGNS.find((x) => x.id === id);
    if (c) c.spend = spend;
    return;
  }
  await db.from("campaigns").update({ spend }).eq("id", id);
}

/** A single campaign by id — for the detail page. */
export async function fetchCampaign(id: string): Promise<CampaignRow | undefined> {
  const db = supabase();
  if (!db) return CAMPAIGNS.find((c) => c.id === id);
  const { data, error } = await db.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !data) return CAMPAIGNS.find((c) => c.id === id);
  return toCampaign(data as Row);
}
