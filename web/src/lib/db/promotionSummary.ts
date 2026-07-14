import { supabase } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";
import type { BrandId } from "@/lib/brands";
import type {
  OmdStorePromotion,
  OmdStorePromotionCategory,
  OmdStorePromotionStatus,
} from "@/lib/data/omdStorePromotions";

type Row = {
  id: string;
  brand: BrandId;
  category: OmdStorePromotionCategory;
  title: string;
  description: string;
  pos_name: string | null;
  branches: string[] | null;
  start_date: string;
  end_date: string | null;
  status: OmdStorePromotionStatus;
  source: "manual" | "campaign" | "seed";
};

const toPromotion = (row: Row): OmdStorePromotion => ({
  id: row.id,
  brand: row.brand,
  category: row.category,
  title: row.title,
  description: row.description,
  posName: row.pos_name ?? "",
  branches: row.branches?.length ? row.branches : ["All Branch"],
  startDate: row.start_date,
  endDate: row.end_date ?? undefined,
  status: row.status,
  source: row.source,
});

const toRow = (item: OmdStorePromotion): Row => ({
  id: item.id,
  brand: item.brand,
  category: item.category,
  title: item.title,
  description: item.description,
  pos_name: item.posName || null,
  branches: item.branches,
  start_date: item.startDate,
  end_date: item.endDate ?? null,
  status: item.status,
  source: item.source ?? "manual",
});

export async function fetchPromotionSummaryItems(): Promise<OmdStorePromotion[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db
    .from("promotion_summary_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(toPromotion);
}

export async function savePromotionSummaryItem(item: OmdStorePromotion): Promise<OmdStorePromotion> {
  const db = supabase();
  if (!db) return item;
  const { error } = await db.from("promotion_summary_items").upsert(toRow(item), { onConflict: "id" });
  assertDbOk(error, "Could not save promotion summary item");
  return item;
}

export async function deletePromotionSummaryItem(id: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("promotion_summary_items").delete().eq("id", id);
  assertDbOk(error, "Could not delete promotion summary item");
}
