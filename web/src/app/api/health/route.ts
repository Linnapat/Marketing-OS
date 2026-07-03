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
      const tables = ["brands", "campaigns", "tasks", "content_posts", "expense_requests", "kols", "agency_tasks"];
      const counts = await Promise.all(
        tables.map((t) => db.from(t).select("*", { count: "exact", head: true })),
      );
      const firstErr = counts.find((c) => c.error)?.error;
      if (firstErr) throw firstErr;
      const byTable: Record<string, number> = {};
      tables.forEach((t, i) => { byTable[t] = counts[i].count ?? 0; });
      result.dbReachable = true;
      result.brands = byTable.brands;
      result.campaigns = byTable.campaigns;
      result.counts = byTable;
      result.seeded = byTable.brands > 0;
      if (!result.seeded) result.hint = "Connected. Tables are empty — run the seed to load demo data.";
    } catch (e) {
      result.error = (e as Error).message;
      result.hint = "Env vars set but query failed — check the schema.sql was run and the keys are correct.";
    }
  }

  return NextResponse.json(result);
}
