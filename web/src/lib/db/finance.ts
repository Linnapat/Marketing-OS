// Data access for Finance expense requests. Persists to Supabase when
// configured, else falls back to the mock list.

import { supabase } from "@/lib/supabase";
import { REQUESTS, RequestRow, EXPENSES, ExpenseRow } from "@/lib/data/finance";
import { BrandId } from "@/lib/brands";

type Row = {
  id: number; category: string; brand: BrandId; campaign: string | null;
  requested: number; approved: number; due: string; status: string;
};

/** A request row that also carries its DB id (for status updates). */
export type ExpenseReq = RequestRow & { _id?: number };

const toReq = (r: Row): ExpenseReq => ({
  _id: r.id, category: r.category, b: r.brand, campaign: r.campaign ?? "—",
  requested: Number(r.requested), approved: Number(r.approved), due: r.due, status: r.status,
});

/** Expense requests — newest first from Supabase, else the mock. */
export async function fetchExpenseRequests(): Promise<ExpenseReq[]> {
  const db = supabase();
  if (!db) return REQUESTS.map((r) => ({ ...r }));
  const { data, error } = await db.from("expense_requests").select("*").order("id", { ascending: false });
  if (error || !data) return REQUESTS.map((r) => ({ ...r }));
  return (data as Row[]).map(toReq);
}

type ExpRow = { id: number; vendor: string; category: string; brand: BrandId; amount: number; vat: number; date: string; status: string };

/** Spending log — actual expenses from Supabase (empty on a fresh DB), else mock. */
export async function fetchExpenses(): Promise<ExpenseRow[]> {
  const db = supabase();
  if (!db) return EXPENSES.map((e) => ({ ...e }));
  const { data, error } = await db.from("expenses").select("*").order("id", { ascending: false });
  if (error || !data) return EXPENSES.map((e) => ({ ...e }));
  return (data as ExpRow[]).map((r) => ({ vendor: r.vendor, category: r.category, b: r.brand, amount: Number(r.amount), vat: Number(r.vat), date: r.date, status: r.status }));
}

/** Mark a request approved (persists status + approved amount). */
export async function approveExpenseRequest(id: number | undefined, approved: number): Promise<void> {
  const db = supabase();
  if (!db || id === undefined) return;
  await db.from("expense_requests").update({ status: "Approved", approved }).eq("id", id);
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
