// Data access for the KOL scorecard — profile + channels + what actually happened
// every time we booked them. Backed by kol_scorecard_view (supabase/kol_engagement.sql).
//
// This is deliberately separate from kolMaster.ts: that file feeds the "Request
// KOL" picker and must stay light. Here we want the buying-decision numbers —
// how often we used them, what a reach cost, whether they out-reach their own
// follower count — which only exist once engagements are recorded.

import { supabase } from "@/lib/supabase";
import { tierFromFollowers } from "@/lib/db/kolMaster";

export interface KolChannel {
  channel_id: string;
  platform: string | null;
  followers: number | null;
  url: string | null;
  /** When a human last confirmed this number against the live profile. */
  checked_at: string | null;
}

/** A follower count nobody has confirmed in this long is treated as unknown. */
export const FOLLOWER_STALE_DAYS = 90;

export type FollowerFreshness = "fresh" | "stale" | "unverified";

export function followerFreshness(checkedAt: string | null | undefined): FollowerFreshness {
  if (!checkedAt) return "unverified";
  const days = (Date.now() - new Date(checkedAt).getTime()) / 86_400_000;
  return days > FOLLOWER_STALE_DAYS ? "stale" : "fresh";
}

export interface KolScorecardRow {
  kol_id: string;
  display_name: string;
  kol_type: string | null;
  tier: string | null;
  status: string | null;
  contact_agency: string | null;
  /** Repeat collaborator with settled terms — seeded from 2+ bookings. */
  is_partner: boolean | null;
  brand_fit: string[] | null;
  total_followers: number | null;
  channels: KolChannel[] | null;
  /** Oldest confirmation across this creator's channels. */
  followers_checked_at: string | null;
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
  avg_feedback: number | null;
  /** Share of judgeable deliveries that landed on time. Null = never judged. */
  on_time_rate: number | null;
  /** Deliveries late *because of the creator* — our own delays are excluded. */
  late_by_kol: number | null;
  /** Late deliveries where nobody has said whose fault it was yet. */
  late_unattributed: number | null;
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
  /** The date agreed with the creator — what "late" is measured against. */
  agreed_post_at: string | null;
  posted_at: string | null;
  delay_reason: DelayReason | null;
  delay_note: string | null;
  on_time_delivery: boolean | null;
  actual_reach: number | null;
  actual_engagement: number | null;
  food_cost: number | null;
  paid_fee: number | null;
  total_cost: number | null;
  paid_status: string | null;
  /** What the approver signed off. Null on everything imported from the sheet. */
  approved_amount: number | null;
  approved_by: string | null;
  expense_request_id: string | null;
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

/**
 * Who caused a post to miss its agreed date. Only `kol` counts against the
 * creator's reliability — our own approval bottleneck must not be hidden inside
 * their rating, or we would be scoring them for our problem.
 */
export type DelayReason = "kol" | "approval" | "campaign" | "venue" | "other";

export const DELAY_REASONS: { value: DelayReason; label: string; blamesKol: boolean }[] = [
  { value: "kol",      label: "KOL ส่งงาน / โพสต์ช้า",       blamesKol: true },
  { value: "approval", label: "ฝั่งเราอนุมัติช้า",            blamesKol: false },
  { value: "campaign", label: "แคมเปญเลื่อน / เปลี่ยนแผน",   blamesKol: false },
  { value: "venue",    label: "ร้าน / สาขาไม่พร้อม",          blamesKol: false },
  { value: "other",    label: "อื่นๆ",                        blamesKol: false },
];

/** Days past the agreed date, or null when there is nothing to compare. */
export function daysLate(agreed: string | null | undefined, posted: string | null | undefined): number | null {
  if (!agreed || !posted) return null;
  const d = Math.round((new Date(posted).getTime() - new Date(agreed).getTime()) / 86_400_000);
  return d > 0 ? d : 0;
}

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
    on_time_rate: num(r.on_time_rate),
    late_by_kol: num(r.late_by_kol),
    late_unattributed: num(r.late_unattributed),
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
    .select("collab_id, campaign_id, campaign_name, brand, branch, month_key, status, deal_type, why_chosen, visited_at, agreed_post_at, posted_at, delay_reason, delay_note, on_time_delivery, actual_reach, actual_engagement, food_cost, paid_fee, total_cost, paid_status, approved_amount, approved_by, expense_request_id, performance_tag, next_action, needs_review")
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
    approved_amount: num(r.approved_amount),
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
    on_time_rate: num(r.on_time_rate),
    late_by_kol: num(r.late_by_kol),
    late_unattributed: num(r.late_unattributed),
    cost_per_engagement: num(r.cost_per_engagement),
  }));
}

export interface KolNote {
  note_id: string;
  kol_id: string;
  collab_id: string | null;
  body: string;
  author: string | null;
  created_at: string;
}

/** Notes on a creator (newest first). `collab_id` pins a note to one booking. */
export async function fetchKolNotes(kolId: string): Promise<KolNote[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from("kol_notes")
    .select("*")
    .eq("kol_id", kolId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as KolNote[];
}

export async function addKolNote(input: { kol_id: string; body: string; author?: string; collab_id?: string }): Promise<KolNote | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db
    .from("kol_notes")
    .insert({ kol_id: input.kol_id, body: input.body.trim(), author: input.author, collab_id: input.collab_id ?? null })
    .select("*")
    .single();
  if (error || !data) return null;
  return data as KolNote;
}

/**
 * Confirm a channel's follower count. The timestamp is the point: an unstamped
 * number is one nobody can date, and the whole library arrived that way.
 */
export async function confirmChannelFollowers(
  channelId: string, followers: number, by?: string,
): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  const checkedAt = new Date().toISOString();
  const { error } = await db
    .from("kol_channels")
    .update({ followers, last_synced_at: checkedAt, synced_by: by ?? null })
    .eq("channel_id", channelId);
  return error ? null : checkedAt;
}

/** Mark / unmark a creator as a partner. */
export async function setKolPartner(kolId: string, isPartner: boolean): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db
    .from("kol_profiles")
    .update({ is_partner: isPartner, updated_at: new Date().toISOString() })
    .eq("kol_id", kolId);
  return !error;
}

export async function deleteKolNote(noteId: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db.from("kol_notes").delete().eq("note_id", noteId);
  return !error;
}

/** Add a creator to the library by hand, with as many channels as we know. */
export async function createKolWithChannels(input: {
  display_name: string;
  kol_type?: string;
  tier?: string;
  status?: string;
  contact_agency?: string;
  brand_fit?: string[];
  notes?: string;
  rate_thb?: number;
  channels: { platform: string; url?: string; followers?: number }[];
}): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  const channels = input.channels.filter((c) => c.platform && (c.url || c.followers));
  const total = channels.reduce((s, c) => s + (c.followers ?? 0), 0);
  const tier = input.tier || tierFromFollowers(total || undefined);

  const { data, error } = await db.from("kol_profiles").insert({
    display_name: input.display_name.trim(),
    kol_type: input.kol_type || null,
    tier: tier || null,
    status: input.status || "New",
    contact_agency: input.contact_agency || null,
    notes: input.notes || null,
    data: {
      brand_fit: input.brand_fit ?? [],
      followers: total,            // kolCollab.ts reads followers from here
      rate_thb_min: input.rate_thb ?? null,
      source: "manual",
      created_in_app: true,
    },
  }).select("kol_id").single();
  if (error || !data) return null;
  const kolId = (data as { kol_id: string }).kol_id;

  if (channels.length) {
    await db.from("kol_channels").insert(channels.map((c) => ({
      kol_id: kolId, platform: c.platform, handle_url: c.url || null, followers: c.followers ?? null,
    })));
  }
  if (input.rate_thb != null) {
    await db.from("kol_rate_cards").insert({
      kol_id: kolId, deliverable: "Package", price_thb: input.rate_thb, is_current: true,
      data: { source: "manual" },
    });
  }
  await db.rpc("recompute_kol_rank", { p_kol: kolId });
  return kolId;
}

export interface CampaignKolRow extends KolEngagementRow {
  kol_id: string;
  display_name: string;
  tier: string | null;
  /** True when we matched on the campaign's name because no id link exists. */
  matched_by_name: boolean;
}

/**
 * What this campaign actually did with creators. The campaign page has only ever
 * shown rows from the campaign-scoped `kols` table — the plan — so a finished
 * campaign displayed no reach, no cost and no posts even when all of it was
 * recorded. Engagements carry that, and 100 of the 169 predate the campaigns
 * table, hence the name fallback for the ones with no id to join on.
 */
export async function fetchCampaignKolEngagements(
  campaignId: string, campaignName?: string,
): Promise<CampaignKolRow[]> {
  const db = supabase();
  if (!db) return [];
  const cols = "collab_id, kol_id, campaign_id, campaign_name, brand, branch, month_key, status, deal_type, why_chosen, visited_at, agreed_post_at, posted_at, delay_reason, delay_note, on_time_delivery, actual_reach, actual_engagement, food_cost, paid_fee, total_cost, paid_status, approved_amount, approved_by, expense_request_id, performance_tag, next_action, needs_review, kol_profiles(display_name, tier)";

  const byId = await db.from("kol_collaboration_history").select(cols).eq("campaign_id", campaignId);
  const rows = [...((byId.data ?? []) as Record<string, unknown>[])];
  const seen = new Set(rows.map((r) => r.collab_id as string));

  if (campaignName?.trim()) {
    const byName = await db.from("kol_collaboration_history").select(cols)
      .is("campaign_id", null).ilike("campaign_name", campaignName.trim());
    for (const r of (byName.data ?? []) as Record<string, unknown>[]) {
      if (!seen.has(r.collab_id as string)) { rows.push(r); seen.add(r.collab_id as string); }
    }
  }

  return rows.map((r) => {
    const profile = r.kol_profiles as { display_name?: string; tier?: string } | null;
    return {
      ...(r as unknown as KolEngagementRow),
      display_name: profile?.display_name ?? "—",
      tier: profile?.tier ?? null,
      matched_by_name: r.campaign_id == null,
      actual_reach: num(r.actual_reach),
      actual_engagement: num(r.actual_engagement),
      total_cost: num(r.total_cost),
    } as CampaignKolRow;
  }).sort((a, b) => (b.actual_reach ?? 0) - (a.actual_reach ?? 0));
}

/** Record the date agreed with the creator — what "late" is measured against. */
export async function setAgreedPostDate(collabId: string, date: string | null): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db
    .from("kol_collaboration_history")
    .update({ agreed_post_at: date, updated_at: new Date().toISOString() })
    .eq("collab_id", collabId);
  return !error;
}

/**
 * Attribute a late post. on_time_delivery is recomputed by a database trigger
 * from this, never written here — so the UI and any script agree on the rule.
 */
export async function attributeDelay(
  collabId: string, reason: DelayReason, note?: string, by?: string,
): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db
    .from("kol_collaboration_history")
    .update({
      delay_reason: reason, delay_note: note ?? null,
      delay_logged_by: by ?? null, delay_logged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("collab_id", collabId);
  return !error;
}

/**
 * Raise the reimbursement for a booking and link it back. Filing stays a
 * deliberate act by the specialist — nothing fires automatically — but the
 * campaign, brand and amount travel with it so Finance and KOL never end up
 * holding two versions of the same number.
 */
export async function createKolExpenseRequest(input: {
  collabId: string;
  brand: string | null;
  campaign: string | null;
  campaignId: string | null;
  amount: number;
  kolName: string;
  requester?: string;
}): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("expense_requests").insert({
    category: "KOL fee",
    brand: input.brand,
    campaign: input.campaign,
    campaign_id: input.campaignId,
    requested: input.amount,
    approved: 0,
    status: "Waiting Approval",
  }).select("id").single();
  if (error || !data) return null;
  const id = String((data as { id: number | string }).id);

  // vendor/requester arrived in later migrations; skip quietly if absent rather
  // than losing the request itself.
  await db.from("expense_requests")
    .update({ vendor: input.kolName, requester: input.requester ?? null })
    .eq("id", id);

  await db.from("kol_collaboration_history")
    .update({ expense_request_id: id, updated_at: new Date().toISOString() })
    .eq("collab_id", input.collabId);
  return id;
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
