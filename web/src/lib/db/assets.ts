// Data access for the Asset Library.

import { supabase } from "@/lib/supabase";
import { ASSETS, Asset } from "@/lib/data/requests";
import { BrandId } from "@/lib/brands";

type Row = {
  id: number; name: string; type: string; brand: BrandId; campaign: string | null;
  version: string; approval: string; updated: string; drive_url: string | null; canva_url: string | null;
};

const toAsset = (r: Row): Asset => ({
  id: String(r.id), name: r.name, b: r.brand, campaign: r.campaign ?? "—", type: r.type,
  version: r.version ?? "v1", approval: r.approval ?? "Draft",
  driveUrl: r.drive_url ?? "", canvaUrl: r.canva_url ?? "", updated: r.updated ?? "just now",
});

export async function fetchAssets(): Promise<Asset[]> {
  const db = supabase();
  if (!db) return ASSETS.map((a) => ({ ...a }));
  const { data, error } = await db.from("assets").select("*").order("id", { ascending: false });
  if (error || !data) return ASSETS.map((a) => ({ ...a }));
  return (data as Row[]).map(toAsset);
}

export async function createAsset(a: Asset): Promise<Asset> {
  const db = supabase();
  if (!db) return a;
  const { data } = await db.from("assets").insert({
    name: a.name, type: a.type, brand: a.b, campaign: a.campaign, version: a.version,
    approval: a.approval, updated: a.updated, drive_url: a.driveUrl, canva_url: a.canvaUrl,
  }).select("id").single();
  return data ? { ...a, id: String(data.id) } : a;
}
