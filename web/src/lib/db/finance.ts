// Data access for Finance expense requests. Persists to Supabase when
// configured, else falls back to the mock list.

import { supabase } from "@/lib/supabase";
import { REQUESTS, RequestRow } from "@/lib/data/finance";
import { BrandId } from "@/lib/brands";

type Row = {
  id: number; category: string; brand: BrandId; campaign: string | null;
  requested: number; approved: number; due: string; status: string;
};

const toReq = (r: Row): RequestRow => ({
  category: r.category, b: r.brand, campaign: r.campaign ?? "—",
  requested: Number(r.requested), approved: Number(r.approved), due: r.due, status: r.status,
});

/** Expense requests — newest first from Supabase, else the mock. */
export async function fetchExpenseRequests(): Promise<RequestRow[]> {
  const db = supabase();
  if (!db) return REQUESTS.map((r) => ({ ...r }));
  const { data, error } = await db.from("expense_requests").select("*").order("id", { ascending: false });
  if (error || !data || data.length === 0) return REQUESTS.map((r) => ({ ...r }));
  return (data as Row[]).map(toReq);
}

/** Insert a new expense request; returns the created row (with its DB id). */
export async function createExpenseRequest(r: RequestRow): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("expense_requests").insert({
    category: r.category, brand: r.b, campaign: r.campaign === "—" ? null : r.campaign,
    requested: r.requested, approved: r.approved, due: r.due, status: r.status,
  });
}
