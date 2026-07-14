// Data access for Campaign Result rows. Reads Supabase when configured, else the
// mock seed. Each row is stored whole in the `data` jsonb column (like content_posts)
// so every UI field round-trips losslessly; `campaign_id` is mirrored to a column so
// per-campaign queries stay indexable.

import { supabase } from "@/lib/supabase";
import { CampaignResultRow, seedResults, allSeedResults } from "@/lib/data/campaignResult";
import { assertDbOk } from "@/lib/db/assert";

type Row = { id: number; campaign_id: string; data: CampaignResultRow };

// NOTE: ad-level actuals live only in campaign_results. They must never be
// rolled up into campaigns.spend — that column is the plan-time COMMITTED
// allocation (written by the brief flow), and overwriting it silently turned
// "Committed" into "Actual" across Finance/Dashboard.

/** Every result row across all campaigns — for the Platform Performance page. */
export async function fetchAllResults(): Promise<CampaignResultRow[]> {
  const db = supabase();
  if (!db) return allSeedResults();
  const { data, error } = await db
    .from("campaign_results")
    .select("id, campaign_id, data")
    .order("id");
  if (error || !data) return []; // query error = no live data, never demo rows
  return (data as Row[])
    .map((r) => (r.data ? { ...r.data, campaignId: r.campaign_id } : null))
    .filter(Boolean) as CampaignResultRow[];
}

/** All result rows for one campaign — from Supabase if configured, else the mock. */
export async function fetchResults(campaignId: string): Promise<CampaignResultRow[]> {
  const db = supabase();
  if (!db) return seedResults(campaignId);
  const { data, error } = await db
    .from("campaign_results")
    .select("id, campaign_id, data")
    .eq("campaign_id", campaignId)
    .order("id");
  if (error || !data) return []; // query error = no live data, never demo rows
  return (data as Row[])
    .map((r) => (r.data ? { ...r.data, campaignId: r.campaign_id } : null))
    .filter(Boolean) as CampaignResultRow[];
}

/** Upsert a single row (matched on the stable id inside the blob). No-op without
 *  Supabase — the caller keeps local state either way. */
export async function saveResultRow(row: CampaignResultRow): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("campaign_results").upsert(
    { row_id: row.id, campaign_id: row.campaignId, data: row },
    { onConflict: "row_id" },
  );
  assertDbOk(error, "Could not save performance result row");
}

/** Save every row of a campaign in one round-trip (the Save button). */
export async function saveResults(rows: CampaignResultRow[]): Promise<void> {
  const db = supabase();
  if (!db || rows.length === 0) return;
  const { error } = await db.from("campaign_results").upsert(
    rows.map((r) => ({ row_id: r.id, campaign_id: r.campaignId, data: r })),
    { onConflict: "row_id" },
  );
  assertDbOk(error, "Could not save performance results");
}

/** Remove a row. */
export async function deleteResultRow(id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("campaign_results").delete().eq("row_id", id);
  assertDbOk(error, "Could not delete performance result row");
}
