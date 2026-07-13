// Data access for Campaign Result rows. Reads Supabase when configured, else the
// mock seed. Each row is stored whole in the `data` jsonb column (like content_posts)
// so every UI field round-trips losslessly; `campaign_id` is mirrored to a column so
// per-campaign queries stay indexable.

import { supabase } from "@/lib/supabase";
import { CampaignResultRow, seedResults, allSeedResults } from "@/lib/data/campaignResult";
import { updateCampaignSpend } from "@/lib/db/campaigns";

type Row = { id: number; campaign_id: string; data: CampaignResultRow };

/** Roll a campaign's ad-level ACTUAL spend up to the campaign record (spend =
 *  Σ row.budgetActual). The planned budget stays fixed at the campaign — it is
 *  never overwritten here. Call after saving result rows so the Campaigns list /
 *  Dashboard / Finance stay in sync. Pass the campaign's FULL current row set. */
export async function syncCampaignSpend(campaignId: string, campaignRows: CampaignResultRow[]): Promise<void> {
  const spend = campaignRows.reduce((s, r) => s + (r.budgetActual || 0), 0);
  await updateCampaignSpend(campaignId, spend);
}

/** Every result row across all campaigns — for the Platform Performance page. */
export async function fetchAllResults(): Promise<CampaignResultRow[]> {
  const db = supabase();
  if (!db) return allSeedResults();
  const { data, error } = await db
    .from("campaign_results")
    .select("id, campaign_id, data")
    .order("id");
  if (error || !data) return allSeedResults();
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
  if (error || !data) return seedResults(campaignId);
  return (data as Row[])
    .map((r) => (r.data ? { ...r.data, campaignId: r.campaign_id } : null))
    .filter(Boolean) as CampaignResultRow[];
}

/** Upsert a single row (matched on the stable id inside the blob). No-op without
 *  Supabase — the caller keeps local state either way. */
export async function saveResultRow(row: CampaignResultRow): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("campaign_results").upsert(
    { row_id: row.id, campaign_id: row.campaignId, data: row },
    { onConflict: "row_id" },
  );
}

/** Save every row of a campaign in one round-trip (the Save button). */
export async function saveResults(rows: CampaignResultRow[]): Promise<void> {
  const db = supabase();
  if (!db || rows.length === 0) return;
  await db.from("campaign_results").upsert(
    rows.map((r) => ({ row_id: r.id, campaign_id: r.campaignId, data: r })),
    { onConflict: "row_id" },
  );
}

/** Remove a row. */
export async function deleteResultRow(id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("campaign_results").delete().eq("row_id", id);
}
