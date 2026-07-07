// Data access for the KOL / Influencer MASTER database (campaign-independent).
// Backed by the tables in supabase/kol_master.sql. When Supabase isn't
// configured the whole app falls back to mock data, so here we synthesise
// master rows from the bundled KOLS mock — the "Request KOL" picker still works.

import { supabase } from "@/lib/supabase";
import { KOLS } from "@/lib/data/kol";

/** One flat row from the `kol_master_view` — what the Request KOL picker shows. */
export interface KolMasterRow {
  kol_id: string;
  display_name: string;
  kol_type: string | null;
  tier: string | null;
  status: string | null;
  owner_specialist: string | null;
  total_followers: number | null;
  platforms: string[] | null;
  primary_handle: string | null;
  rank_score: number | null;
  rank_label: string | null;
}

/** Derive mock master rows from the bundled creators (used when no DB). */
function mockMaster(): KolMasterRow[] {
  const seen = new Set<string>();
  const rows: KolMasterRow[] = [];
  for (const k of KOLS) {
    if (seen.has(k.h)) continue;
    seen.add(k.h);
    rows.push({
      kol_id: `mock-${k.id}`,
      display_name: k.name,
      kol_type: k.kolType,
      tier: null,
      status: "Active",
      owner_specialist: k.owner,
      total_followers: k.followers,
      platforms: [k.plat],
      primary_handle: k.h,
      rank_score: k.roi ? Math.min(100, Math.round(k.roi * 22)) : null,
      rank_label: k.roi >= 3.6 ? "S" : k.roi >= 2.9 ? "A" : k.roi >= 2 ? "B" : k.roi > 0 ? "C" : null,
    });
  }
  return rows;
}

/** Search master profiles by name/handle for the picker. Empty query → top N. */
export async function searchKolProfiles(q: string, limit = 8): Promise<KolMasterRow[]> {
  const db = supabase();
  if (!db) {
    const rows = mockMaster();
    const t = q.trim().toLowerCase();
    return (t
      ? rows.filter((r) => r.display_name.toLowerCase().includes(t) || (r.primary_handle ?? "").toLowerCase().includes(t))
      : rows
    ).slice(0, limit);
  }
  let query = db.from("kol_master_view").select("*").limit(limit);
  if (q.trim()) query = query.ilike("display_name", `%${q.trim()}%`);
  const { data, error } = await query;
  if (error || !data) return [];
  const rows = data as KolMasterRow[];

  // Some existing master-view rows predate the follower roll-up. Enrich missing
  // totals from the linked channels so selecting a Library result fills the form.
  const missingIds = rows.filter((r) => !r.total_followers).map((r) => r.kol_id);
  if (!missingIds.length) return rows;
  const { data: channels } = await db.from("kol_channels").select("kol_id, followers").in("kol_id", missingIds);
  if (!channels) return rows;
  const followerByKol = new Map<string, number>();
  for (const c of channels as { kol_id: string; followers: number | null }[]) {
    followerByKol.set(c.kol_id, Math.max(followerByKol.get(c.kol_id) ?? 0, c.followers ?? 0));
  }
  return rows.map((r) => ({ ...r, total_followers: r.total_followers || followerByKol.get(r.kol_id) || 0 }));
}

/** Create a new master profile (+ optional first channel). Returns its kol_id. */
export async function createKolProfile(input: {
  display_name: string;
  kol_type?: string;
  tier?: string;
  owner_specialist?: string;
  contact_agency?: string;
  notes?: string;
  platform?: string;
  handle_url?: string;
  followers?: number;
}): Promise<string | null> {
  const db = supabase();
  if (!db) return `mock-new-${Date.now()}`;
  const { data, error } = await db.from("kol_profiles").insert({
    display_name: input.display_name,
    kol_type: input.kol_type,
    tier: input.tier ?? tierFromFollowers(input.followers),
    owner_specialist: input.owner_specialist,
    contact_agency: input.contact_agency,
    notes: input.notes,
  }).select("kol_id").single();
  if (error || !data) return null;
  const kolId = (data as { kol_id: string }).kol_id;
  if (input.handle_url || input.platform) {
    await db.from("kol_channels").insert({
      kol_id: kolId, platform: input.platform ?? "Instagram",
      handle_url: input.handle_url, followers: input.followers,
    });
  }
  return kolId;
}

/** Ensure a master profile exists once a campaign KOL's real page is known
 *  (specialist filled name + handle). Creates it + a first channel and returns
 *  the linked kol_id; returns the existing id, or undefined for placeholder pages. */
export async function ensureKolProfile(input: {
  masterKolId?: string; name: string; handle: string; kolType: string; followers: number; platform: string;
}): Promise<string | undefined> {
  if (input.masterKolId) return input.masterKolId;
  const handle = (input.handle || "").trim();
  const name = (input.name || "").trim();
  if (!handle || handle.toLowerCase() === "@tbd") return undefined;
  if (!name || /^new request/i.test(name)) return undefined;
  return (await createKolProfile({
    display_name: name, kol_type: input.kolType,
    tier: tierFromFollowers(input.followers || undefined),
    handle_url: handle, followers: input.followers || undefined, platform: input.platform,
  })) ?? undefined;
}

/** Log a completed collaboration, then recompute the cached rank. */
export async function logCollaboration(input: {
  kol_id: string;
  campaign_id?: string;
  brand?: string;
  fee_paid?: number;
  deliverables?: string;
  actual_reach?: number;
  actual_engagement?: number;
  roas?: number;
  on_time_delivery?: boolean;
  brand_feedback_score?: number;
}): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("kol_collaboration_history").insert(input);
  await db.rpc("recompute_kol_rank", { p_kol: input.kol_id });
}

/** Follower-count → tier, matching the Nano/Micro/Mid/Macro/Mega bands. */
export function tierFromFollowers(f?: number): string | undefined {
  if (f == null) return undefined;
  if (f < 10_000) return "Nano";
  if (f < 50_000) return "Micro";
  if (f < 500_000) return "Mid";
  if (f < 1_000_000) return "Macro";
  return "Mega";
}
