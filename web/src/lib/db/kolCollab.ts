// Read access for KOL collaboration history (kol_collaboration_history).
// When Supabase is configured we read live rows and enrich food_cost / branch
// from the row's `data` jsonb (added without a schema change); otherwise the
// app falls back to the bundled mock so the Branch report is demonstrable.

import { supabase } from "@/lib/supabase";
import { KolCollabRow } from "@/lib/data/kolBranch";

interface LiveRow {
  collab_id: string;
  kol_id: string;
  campaign_id: string | null;
  brand: string | null;
  fee_paid: number | null;
  actual_reach: number | null;
  actual_engagement: number | null;
  data: Record<string, unknown> | null;
  kol_profiles: { display_name?: string; kol_type?: string; data?: Record<string, unknown> } | null;
}

const numOf = (value: unknown) => (typeof value === "number" ? value : Number(value)) || 0;
const strOf = (value: unknown) => (typeof value === "string" ? value : "");

export async function fetchCollaborations(): Promise<KolCollabRow[]> {
  const db = supabase();
  if (!db) return mockCollaborations();
  const { data, error } = await db
    .from("kol_collaboration_history")
    .select(
      "collab_id, kol_id, campaign_id, brand, fee_paid, actual_reach, actual_engagement, data, kol_profiles(display_name, kol_type, data)",
    );
  if (error || !data) return []; // query error = no live data, never demo rows
  return (data as unknown as LiveRow[]).map((row) => {
    const meta = row.data ?? {};
    const profile = row.kol_profiles ?? {};
    const feePaid = numOf(row.fee_paid);
    const foodCost = numOf(meta.food_cost);
    return {
      collabId: row.collab_id,
      kolId: row.kol_id,
      kolName: profile.display_name ?? "",
      campaignId: row.campaign_id ?? "",
      brand: strOf(row.brand),
      branch: strOf(meta.branch),
      category: profile.kol_type ?? "",
      followers: numOf(profile.data?.followers),
      reach: numOf(row.actual_reach),
      engagement: numOf(row.actual_engagement),
      feePaid,
      foodCost,
      totalCost: feePaid + foodCost,
      postDate: strOf(meta.post_date),
      status: strOf(meta.status),
    } satisfies KolCollabRow;
  });
}

// ── Mock collaborations (used when Supabase isn't configured) ───────────────
// Representative Omakase Don July data so the Monthly Branch Report renders in
// dev. Branch is set per row, independent of the campaign's own branch.
function mk(
  campaignId: string, branch: string, kolName: string, category: string,
  followers: number, reach: number, engagement: number, foodCost: number, feePaid: number,
): KolCollabRow {
  return {
    collabId: `mock-${kolName}`, kolId: `mock-${kolName}`, kolName, campaignId, brand: "omakase", branch, category,
    followers, reach, engagement, feePaid, foodCost, totalCost: feePaid + foodCost,
    postDate: "", status: "Posted (Waiting results)",
  };
}

function mockCollaborations(): KolCollabRow[] {
  return [
    mk("CAM-2026-0001", "Central Park", "gift_melaneesuk", "Lifestyle", 116200, 2790, 89, 1900, 0),
    mk("CAM-2026-0002", "Central Pinklao", "บีกิน", "Food Review", 429100, 298345, 16941, 1700, 8000),
    mk("CAM-2026-0002", "Central Pinklao", "ฝั่งธนมีอะไรดี", "Food Review", 42500, 3598, 186, 1700, 4000),
    mk("CAM-2026-0002", "Central Pinklao", "ฟ้าจะกิน", "Food Review", 59368, 5227, 84, 1700, 0),
    mk("CAM-2026-0002", "Central Pinklao", "Reviewnewthing", "Food Review", 67550, 60663, 212, 1700, 0),
    mk("CAM-2026-0002", "Central Pinklao", "Reviewnewtrend", "Food Review", 47000, 405, 35, 1700, 0),
    mk("CAM-2026-0002", "Central Pinklao", "seniorjnn", "Lifestyle", 14800, 0, 6, 1700, 0),
    mk("CAM-2026-0002", "Central Pinklao", "Thonburian-ธนบุเรียน", "Food Review", 336900, 32000, 1699, 1700, 22100),
    mk("CAM-2026-0002", "Central Pinklao", "กุ้งจังตะลอนกิน", "Food Review", 201342, 0, 0, 0, 2500),
    mk("CAM-2026-0002", "Central Pinklao", "ไปกับนัท paikubnut", "Lifestyle", 179800, 0, 0, 0, 2000),
    mk("CAM-2026-0002", "Central Pinklao", "ไปมาเอง", "Food Review", 82800, 0, 0, 0, 2000),
    mk("CAM-2026-0002", "Central Pinklao", "ไหนรีวิว", "Food Review", 7600, 0, 0, 0, 2000),
    mk("CAM-2026-0002", "Central Pinklao", "foodyoucaneat", "Food Review", 591200, 0, 0, 0, 5000),
    mk("CAM-2026-0002", "Central Pinklao", "Goodvibes.story", "Food Review", 46600, 0, 0, 0, 2000),
    mk("CAM-2026-0002", "Central Pinklao", "orn the table อรพากิน", "Food Review", 200300, 0, 0, 0, 5000),
  ];
}
