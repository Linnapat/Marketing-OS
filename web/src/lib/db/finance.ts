// Data access for Finance expense requests. Persists to Supabase when
// configured, else falls back to the mock list.
//
// Columns added by supabase/expenses_p1.sql (ref, requester, vendor, tax,
// timestamps, reject_reason) are written in a separate update after the base
// insert, so a database that hasn't run the migration still gets the row.

import { supabase } from "@/lib/supabase";
import { REQUESTS, RequestRow, EXPENSES, ExpenseRow } from "@/lib/data/finance";
import { BrandId } from "@/lib/brands";

type Row = {
  id: number; category: string; brand: BrandId; campaign: string | null;
  requested: number; approved: number; due: string; status: string;
  ref?: string | null; requester?: string | null; vendor?: string | null;
  reimburse_type?: string | null; vat?: number | null; wht?: number | null;
  reject_reason?: string | null; created_at?: string | null; approved_at?: string | null;
};

/** A request row that also carries its DB id (for status updates). */
export type ExpenseReq = RequestRow & {
  _id?: number;
  ref?: string;
  requester?: string;
  vendor?: string;
  reimburseType?: string;
  vatAmt?: number;
  whtAmt?: number;
  rejectReason?: string;
  createdAt?: string;
  approvedAt?: string;
};

const toReq = (r: Row): ExpenseReq => ({
  _id: r.id, category: r.category, b: r.brand, campaign: r.campaign ?? "—",
  requested: Number(r.requested), approved: Number(r.approved), due: r.due, status: r.status,
  ref: r.ref ?? undefined, requester: r.requester ?? undefined, vendor: r.vendor ?? undefined,
  reimburseType: r.reimburse_type ?? undefined, vatAmt: Number(r.vat ?? 0), whtAmt: Number(r.wht ?? 0),
  rejectReason: r.reject_reason ?? undefined, createdAt: r.created_at ?? undefined, approvedAt: r.approved_at ?? undefined,
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

/** A spending-log row that also carries its DB id (for Mark Paid). */
export type ExpenseLogRow = ExpenseRow & { _id?: number };

/** Spending log — actual expenses from Supabase (empty on a fresh DB), else mock. */
export async function fetchExpenses(): Promise<ExpenseLogRow[]> {
  const db = supabase();
  if (!db) return EXPENSES.map((e) => ({ ...e }));
  const { data, error } = await db.from("expenses").select("*").order("id", { ascending: false });
  if (error || !data) return EXPENSES.map((e) => ({ ...e }));
  return (data as ExpRow[]).map((r) => ({ _id: r.id, vendor: r.vendor, category: r.category, b: r.brand, amount: Number(r.amount), vat: Number(r.vat), date: r.date, status: r.status }));
}

const shortDate = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Approve a request: persist status + amount, stamp approved_at, drop the
 *  approved spend into the Spending Log as "Unpaid" (Finance marks it Paid
 *  after the actual payment), and move the linked queue card to Approved. */
export async function approveExpenseRequest(req: ExpenseReq, approved: number): Promise<void> {
  const db = supabase();
  if (!db || req._id === undefined) return;
  await db.from("expense_requests").update({ status: "Approved", approved }).eq("id", req._id);
  // Separate so a DB missing the migration still keeps the approval.
  await db.from("expense_requests").update({ approved_at: new Date().toISOString() }).eq("id", req._id);
  await db.from("expenses").insert({
    vendor: req.vendor || req.category, category: req.category, brand: req.b,
    amount: approved, vat: req.vatAmt ?? 0, date: shortDate(), status: "Unpaid",
  });
  if (req.ref) await db.from("requests").update({ stage: "Approved" }).eq("id", req.ref);
}

/** Reject a request with a mandatory reason; the linked queue card goes back
 *  to Revision with the reason on its feedback history. */
export async function rejectExpenseRequest(req: ExpenseReq, reason: string, by: string): Promise<void> {
  const db = supabase();
  if (!db || req._id === undefined) return;
  await db.from("expense_requests").update({ status: "Rejected" }).eq("id", req._id);
  await db.from("expense_requests").update({ reject_reason: reason }).eq("id", req._id);
  if (req.ref) {
    await db.from("requests").update({ stage: "Revision" }).eq("id", req.ref);
    await db.from("requests").update({
      feedback: [{ stage: "Revision", reason, by, at: new Date().toISOString() }],
    }).eq("id", req.ref);
  }
}

/** Finance marks an Unpaid spending-log row as Paid after the actual payment. */
export async function markExpensePaid(id: number | undefined): Promise<void> {
  const db = supabase();
  if (!db || id === undefined) return;
  await db.from("expenses").update({ status: "Paid" }).eq("id", id);
}

/** Insert a new expense request; extended columns go in a second update so the
 *  base row survives on a DB that hasn't run expenses_p1.sql yet. */
export async function createExpenseRequest(r: RequestRow, extra?: {
  ref?: string; requester?: string; vendor?: string; reimburseType?: string; vat?: number; wht?: number;
}): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { data } = await db.from("expense_requests").insert({
    category: r.category, brand: r.b, campaign: r.campaign === "—" ? null : r.campaign,
    requested: r.requested, approved: r.approved, due: r.due, status: r.status,
  }).select("id").single();
  if (extra && data?.id !== undefined) {
    await db.from("expense_requests").update({
      ref: extra.ref ?? null, requester: extra.requester ?? null, vendor: extra.vendor ?? null,
      reimburse_type: extra.reimburseType ?? null, vat: extra.vat ?? 0, wht: extra.wht ?? 0,
    }).eq("id", data.id);
  }
}
