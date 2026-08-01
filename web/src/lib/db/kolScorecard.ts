// Data access for the KOL scorecard — profile + channels + what actually happened
// every time we booked them. Backed by kol_scorecard_view (supabase/kol_engagement.sql).
//
// This is deliberately separate from kolMaster.ts: that file feeds the "Request
// KOL" picker and must stay light. Here we want the buying-decision numbers —
// how often we used them, what a reach cost, whether they out-reach their own
// follower count — which only exist once engagements are recorded.

import { supabase } from "@/lib/supabase";

export interface KolChannel {
  platform: string | null;
  followers: number | null;
  url: string | null;
}

export interface KolScorecardRow {
  kol_id: string;
  display_name: string;
  kol_type: string | null;
  tier: string | null;
  status: string | null;
  contact_agency: string | null;
  brand_fit: string[] | null;
  total_followers: number | null;
  channels: KolChannel[] | null;
  rate_min_thb: number | null;
  rate_max_thb: number | null;
  times_used: number;
  times_resulted: number | null;
  times_cancelled: number | null;
  last_used_at: string | null;
  first_used_at: string | null;
  brands_used: string[] | null;
  branches_used: string[] | null;
  total_reach: number | null;
  total_engagement: number | null;
  total_cost: number | null;
  cost_per_reach: number | null;
  cost_per_engagement: number | null;
  reach_per_follower: number | null;
  engagement_rate: number | null;
  /** True for the profiles nobody has ever booked — shown as their own group. */
  never_used: boolean;
  rank_score: number | null;
  rank_label: string | null;
}

/** One row per time we used this KOL, newest first. */
export interface KolEngagementRow {
  collab_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  brand: string | null;
  branch: string | null;
  month_key: string | null;
  status: string | null;
  deal_type: string | null;
  why_chosen: string | null;
  visited_at: string | null;
  posted_at: string | null;
  actual_reach: number | null;
  actual_engagement: number | null;
  food_cost: number | null;
  paid_fee: number | null;
  total_cost: number | null;
  paid_status: string | null;
  performance_tag: string | null;
  next_action: string | null;
  needs_review: boolean | null;
  posts?: KolEngagementPost[];
}

export interface KolEngagementPost {
  post_id: string;
  collab_id: string;
  platform: string | null;
  post_url: string | null;
  reach: number | null;
  engagement: number | null;
}

export interface KolTierBenchmark {
  tier: string | null;
  samples: number;
  cost_per_reach: number | null;
  cost_per_engagement: number | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Numerics come back from PostgREST as strings; normalise once at the edge. */
function normalise(r: Record<string, unknown>): KolScorecardRow {
  return {
    ...(r as unknown as KolScorecardRow),
    total_followers: num(r.total_followers),
    rate_min_thb: num(r.rate_min_thb),
    rate_max_thb: num(r.rate_max_thb),
    times_used: Number(r.times_used ?? 0),
    times_resulted: num(r.times_resulted),
    times_cancelled: num(r.times_cancelled),
    total_reach: num(r.total_reach),
    total_engagement: num(r.total_engagement),
    total_cost: num(r.total_cost),
    cost_per_reach: num(r.cost_per_reach),
    cost_per_engagement: num(r.cost_per_engagement),
    reach_per_follower: num(r.reach_per_follower),
    engagement_rate: num(r.engagement_rate),
    channels: Array.isArray(r.channels)
      ? (r.channels as KolChannel[]).map((c) => ({ ...c, followers: num(c.followers) }))
      : null,
  };
}

/**
 * Search the library. Sorted so the creators we have evidence about come first —
 * most-used, then biggest reach; never-booked profiles fall to the end where the
 * UI groups them as "ยังไม่ทดลอง".
 */
export async function fetchKolScorecards(q = "", limit = 400): Promise<KolScorecardRow[]> {
  const db = supabase();
  if (!db) return [];
  let query = db
    .from("kol_scorecard_view")
    .select("*")
    .order("times_used", { ascending: false })
    .order("total_followers", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (q.trim()) query = query.ilike("display_name", `%${q.trim()}%`);
  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(normalise);
}

export async function fetchKolScorecard(kolId: string): Promise<KolScorecardRow | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("kol_scorecard_view").select("*").eq("kol_id", kolId).maybeSingle();
  if (error || !data) return null;
  return normalise(data as Record<string, unknown>);
}

/** Full booking history for one KOL, with each platform's post nested under it. */
export async function fetchKolEngagements(kolId: string): Promise<KolEngagementRow[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from("kol_collaboration_history")
    .select("collab_id, campaign_id, campaign_name, brand, branch, month_key, status, deal_type, why_chosen, visited_at, posted_at, actual_reach, actual_engagement, food_cost, paid_fee, total_cost, paid_status, performance_tag, next_action, needs_review")
    .eq("kol_id", kolId)
    .order("month_key", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  const rows = data as unknown as KolEngagementRow[];
  if (!rows.length) return rows;

  const { data: posts } = await db
    .from("kol_engagement_posts")
    .select("post_id, collab_id, platform, post_url, reach, engagement")
    .in("collab_id", rows.map((r) => r.collab_id));
  const byCollab = new Map<string, KolEngagementPost[]>();
  for (const p of (posts ?? []) as KolEngagementPost[]) {
    const list = byCollab.get(p.collab_id) ?? [];
    list.push({ ...p, reach: num(p.reach), engagement: num(p.engagement) });
    byCollab.set(p.collab_id, list);
  }
  return rows.map((r) => ({
    ...r,
    actual_reach: num(r.actual_reach),
    actual_engagement: num(r.actual_engagement),
    food_cost: num(r.food_cost),
    paid_fee: num(r.paid_fee),
    total_cost: num(r.total_cost),
    posts: byCollab.get(r.collab_id) ?? [],
  }));
}

/**
 * What a tier normally costs us per reach, from our own bookings. Used to flag a
 * quoted price as out of line before we agree to it rather than at month end.
 */
export async function fetchKolTierBenchmarks(): Promise<KolTierBenchmark[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.from("kol_tier_benchmark_view").select("*");
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    tier: (r.tier as string) ?? null,
    samples: Number(r.samples ?? 0),
    cost_per_reach: num(r.cost_per_reach),
    cost_per_engagement: num(r.cost_per_engagement),
  }));
}

/** Close the loop on a booking — the two fields that were empty on every sheet row. */
export async function reviewKolEngagement(
  collabId: string,
  patch: { performance_tag?: string; next_action?: string; brand_feedback_score?: number; on_time_delivery?: boolean; reviewed_by?: string },
): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db
    .from("kol_collaboration_history")
    .update({ ...patch, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("collab_id", collabId);
  return !error;
}
