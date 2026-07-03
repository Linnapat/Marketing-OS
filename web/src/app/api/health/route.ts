import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Browser-openable status check. Returns NO secrets — only whether the
// Supabase env vars are present and whether the database is reachable/seeded.
export async function GET() {
  const configured = isSupabaseConfigured;
  const result: Record<string, unknown> = {
    supabaseConfigured: configured,
    dbReachable: false,
    brands: 0,
    campaigns: 0,
    hint: configured ? "" : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.",
  };

  const db = supabase();
  if (db) {
    try {
      const [{ count: brands, error: e1 }, { count: campaigns, error: e2 }] = await Promise.all([
        db.from("brands").select("*", { count: "exact", head: true }),
        db.from("campaigns").select("*", { count: "exact", head: true }),
      ]);
      if (e1 || e2) throw (e1 || e2);
      result.dbReachable = true;
      result.brands = brands ?? 0;
      result.campaigns = campaigns ?? 0;
      result.seeded = (brands ?? 0) > 0;
      if (!result.seeded) result.hint = "Connected. Tables are empty — run the seed to load demo data.";
    } catch (e) {
      result.error = (e as Error).message;
      result.hint = "Env vars set but query failed — check the schema.sql was run and the keys are correct.";
    }
  }

  return NextResponse.json(result);
}
