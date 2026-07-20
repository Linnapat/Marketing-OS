// Import KOL actuals from the shared "KOL_Activities" Google Sheet tab into
// kol_collaboration_history (which the Monthly Branch Report reads). Reads the
// tab server-side, then writes under the user's RLS session. Sync semantics:
// sheet-sourced collaborations of every campaign in the sheet are replaced with
// the fresh set (tagged source:"sheet"); rows logged in-app are never touched.

import { supabase, authHeaders } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";
import { ensureKolProfile } from "@/lib/db/kolMaster";
import { KolSheetRow } from "@/lib/data/kolActualsSheet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function importKolActualsFromSheet(
  sheetUrl: string,
): Promise<{ imported: number; removed: number; skipped: number }> {
  const res = await fetch(`/api/kol-actuals-sheet?url=${encodeURIComponent(sheetUrl)}`, {
    headers: await authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "นำเข้าไม่สำเร็จ");
  return syncKolCollab((body.rows ?? []) as KolSheetRow[]);
}

async function syncKolCollab(
  rows: KolSheetRow[],
): Promise<{ imported: number; removed: number; skipped: number }> {
  const db = supabase();
  if (!db) return { imported: 0, removed: 0, skipped: 0 };

  const campaignIds = [...new Set(rows.map((r) => r.campaignId).filter(Boolean))];
  let removed = 0;
  if (campaignIds.length) {
    const { data: existing, error } = await db
      .from("kol_collaboration_history")
      .select("collab_id, data")
      .in("campaign_id", campaignIds);
    assertDbOk(error, "Could not read existing collaborations");
    const staleIds = ((existing ?? []) as { collab_id: string; data: { source?: string } | null }[])
      .filter((r) => r.data?.source === "sheet")
      .map((r) => r.collab_id);
    if (staleIds.length) {
      const { error: delErr } = await db
        .from("kol_collaboration_history")
        .delete()
        .in("collab_id", staleIds);
      assertDbOk(delErr, "Could not remove stale sheet collaborations");
      removed = staleIds.length;
    }
  }

  // Resolve each KOL to a kol_profiles id (FK), then insert the fresh rows.
  let skipped = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const r of rows) {
    const kolId = await ensureKolProfile({
      masterKolId: UUID.test(r.kolId) ? r.kolId : undefined,
      name: r.kolName,
      handle: r.kolName,
      kolType: r.category,
      followers: r.followers,
      platform: "KOL",
    });
    if (!kolId) { skipped++; continue; }
    inserts.push({
      kol_id: kolId,
      campaign_id: r.campaignId,
      fee_paid: r.paidCost || null,
      actual_reach: r.reach || null,
      actual_engagement: r.engagement || null,
      data: { source: "sheet", food_cost: r.foodCost, branch: r.branch, post_date: r.postDate },
    });
  }

  if (inserts.length) {
    const { error } = await db.from("kol_collaboration_history").insert(inserts);
    assertDbOk(error, "Could not save KOL collaborations");
  }
  return { imported: inserts.length, removed, skipped };
}
