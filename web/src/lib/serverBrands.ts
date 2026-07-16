// Server-side loading of the configured brands, for the Google-Sheet importers.
//
// These routes run on the server and can't use the client brand registry
// (lib/brands, hydrated in AppShell), so they read `brands_config` from
// org_settings directly. The matching logic itself is pure and lives in
// lib/brandResolve so it can be unit-tested (scripts/test-brands.ts).

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BrandCfgLite } from "@/lib/brandResolve";

export { makeBrandResolver } from "@/lib/brandResolve";
export type { BrandCfgLite } from "@/lib/brandResolve";

/** Brands as configured in Settings → Brands. Empty when Supabase or the service
 *  key is unavailable; the resolver then falls back to its legacy aliases, which
 *  keeps the four seed brands importing rather than dropping every row. */
export async function loadBrandConfig(): Promise<BrandCfgLite[]> {
  try {
    const db = supabaseAdmin();
    if (!db) return [];
    const { data } = await db.from("org_settings").select("value").eq("key", "brands_config").maybeSingle();
    if (!data?.value) return [];
    const parsed = JSON.parse(data.value as string) as BrandCfgLite[];
    return Array.isArray(parsed) ? parsed.filter((b) => b?.key) : [];
  } catch {
    return [];
  }
}
