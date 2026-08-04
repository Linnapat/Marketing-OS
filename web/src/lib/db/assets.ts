// Data access for the Asset Library.
//
// The table has no preview column; the thumbnail lives in the existing `data`
// jsonb blob so a preview can ship without a migration on a live table. Only
// extras go in there — the columns stay authoritative for every field they
// already own.

import { supabase } from "@/lib/supabase";
import { ASSETS, Asset } from "@/lib/data/requests";
import { BrandId } from "@/lib/brands";
import { Graphic, approvedAssetRow } from "@/lib/data/graphic";
import { assertDbData, assertDbOk } from "@/lib/db/assert";

type AssetExtras = { previewUrl?: string };
type Row = {
  id: number; name: string; type: string; brand: BrandId; campaign: string | null;
  version: string; approval: string; updated: string; drive_url: string | null; canva_url: string | null;
  data: AssetExtras | null;
};

const toAsset = (r: Row): Asset => ({
  id: String(r.id), name: r.name, b: r.brand, campaign: r.campaign ?? "—", type: r.type,
  version: r.version ?? "v1", approval: r.approval ?? "Draft",
  driveUrl: r.drive_url ?? "", canvaUrl: r.canva_url ?? "", updated: r.updated ?? "just now",
  previewUrl: r.data?.previewUrl ?? "",
});

export async function fetchAssets(): Promise<Asset[]> {
  const db = supabase();
  if (!db) return ASSETS.map((a) => ({ ...a }));
  const { data, error } = await db.from("assets").select("*").order("id", { ascending: false });
  if (error || !data) return []; // query error = no live data, never demo rows
  return (data as Row[]).map(toAsset);
}

export async function createAsset(a: Asset): Promise<Asset> {
  const db = supabase();
  if (!db) return a;
  const { data, error } = await db.from("assets").insert({
    name: a.name, type: a.type, brand: a.b, campaign: a.campaign, version: a.version,
    approval: a.approval, updated: a.updated, drive_url: a.driveUrl, canva_url: a.canvaUrl,
    data: a.previewUrl ? { previewUrl: a.previewUrl } : null,
  }).select("id").single();
  const row = assertDbData(data, error, "Could not save asset");
  return { ...a, id: String(row.id) };
}

/** File a fully-approved request in the Asset Library.
 *
 *  Keyed on the request id, so a piece that went back for revision and was
 *  approved again lands on the SAME row — the team's call, and the reason the
 *  unique index is on graphic_request_id.
 *
 *  Best-effort: approval already happened and the artwork is already on its
 *  Content Plan post. Failing to file a library copy must not undo that or
 *  surface as an approval error. */
export async function fileApprovedAsset(g: Graphic): Promise<void> {
  const row = approvedAssetRow(g);
  if (!row) return;
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("assets").upsert({
    graphic_request_id: row.graphicRequestId,
    name: row.name, type: row.type, brand: row.b, campaign: row.campaign,
    version: row.version, approval: "Approved",
    updated: new Date().toISOString().slice(0, 10),
    drive_url: row.driveUrl, canva_url: row.canvaUrl || null,
  }, { onConflict: "graphic_request_id" });
  if (error) console.warn("fileApprovedAsset skipped", g.id, error.message);
}

/** Set (or clear, with "") the preview image of an asset that already exists —
 *  the library was full of rows before previews were a thing. */
export async function updateAssetPreview(id: string, previewUrl: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("assets")
    .update({ data: previewUrl ? { previewUrl } : null })
    .eq("id", Number(id));
  assertDbOk(error, "Could not save asset preview");
}
