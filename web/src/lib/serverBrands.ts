// Server-side loading of the configured brands, for the Google-Sheet importers.
//
// These routes run on the server and can't use the client brand registry
// (lib/brands, hydrated in AppShell), so they read `brands_config` from
// org_settings directly. The matching logic itself is pure and lives in
// lib/brandResolve so it can be unit-tested (scripts/test-brands.ts).
//
// It reads as the CALLER, not with the service role: the route has already
// verified their bearer token (requireApiUser), and org_settings' `org_read`
// policy lets any staff/admin select. Using the service role here would make the
// importers silently depend on SUPABASE_SERVICE_ROLE_KEY being present — and if
// it were missing, loading would fail, brand labels would resolve to nothing, and
// whole brands' budgets would just be skipped. The service role stays as a
// fallback only for demo mode, where there's no caller token to borrow.

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BrandCfgLite } from "@/lib/brandResolve";

export { makeBrandResolver } from "@/lib/brandResolve";
export type { BrandCfgLite } from "@/lib/brandResolve";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** A client that reads with the caller's own rights, or null when we can't. */
function clientFor(authHeader: string | null) {
  const token = (authHeader || "").toLowerCase().startsWith("bearer ") ? authHeader! : "";
  if (token && url && anon) {
    return createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: token } },
    });
  }
  return supabaseAdmin(); // demo mode / no caller token — may be null
}

/** Brands as configured in Settings → Brands. Empty when neither the caller's
 *  token nor the service role can read it; the resolver then falls back to its
 *  legacy aliases, which keeps the seed brands importing rather than dropping
 *  every row. Pass the request so we can borrow the caller's Authorization. */
export async function loadBrandConfig(authHeader: string | null): Promise<BrandCfgLite[]> {
  try {
    const db = clientFor(authHeader);
    if (!db) return [];
    const { data } = await db.from("org_settings").select("value").eq("key", "brands_config").maybeSingle();
    if (!data?.value) return [];
    const parsed = JSON.parse(data.value as string) as BrandCfgLite[];
    return Array.isArray(parsed) ? parsed.filter((b) => b?.key) : [];
  } catch {
    return [];
  }
}
