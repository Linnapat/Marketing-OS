// Data access for Finance expense requests. Persists to Supabase when
// configured, else falls back to the mock list.
//
// Columns added by supabase/expenses_p1.sql (ref, requester, vendor, tax,
// timestamps, reject_reason) are written in a separate update after the base
// insert, so a database that hasn't run the migration still gets the row.

import { supabase } from "@/lib/supabase";
import { REQUESTS, RequestRow, EXPENSES, ExpenseRow } from "@/lib/data/finance";
import { BrandId } from "@/lib/brands";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/db/audit";
import { baht } from "@/lib/format";
import { assertDbData, assertDbOk, softColumnUpdate } from "@/lib/db/assert";

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
  if (error || !data) return []; // query error = no live data, never demo rows
  return (data as Row[]).map(toReq);
}

type ExpRow = { id: number; vendor: string; category: string; brand: BrandId; amount: number; vat: number; date: string; status: string; reimburse_type?: string | null; wht?: number | null };

/** A spending-log row that also carries its DB id (for Mark Paid). */
export type ExpenseLogRow = ExpenseRow & { _id?: number };

/** Spending log — actual expenses from Supabase (empty on a fresh DB), else mock. */
export async function fetchExpenses(): Promise<ExpenseLogRow[]> {
  const db = supabase();
  if (!db) return EXPENSES.map((e) => ({ ...e }));
  const { data, error } = await db.from("expenses").select("*").order("id", { ascending: false });
  if (error || !data) return []; // query error = no live data, never demo rows
  return (data as ExpRow[]).map((r) => ({ _id: r.id, vendor: r.vendor, category: r.category, b: r.brand, amount: Number(r.amount), vat: Number(r.vat), date: r.date, status: r.status, reimburseType: r.reimburse_type ?? undefined, wht: Number(r.wht ?? 0) }));
}

/** Approve a request: persist status + amount, stamp approved_at, drop the
 *  approved spend into the Spending Log as "Unpaid" (Finance marks it Paid
 *  after the actual payment), and move the linked queue card to Approved. */
export async function approveExpenseRequest(req: ExpenseReq, approved: number): Promise<void> {
  const db = supabase();
  if (!db || req._id === undefined) {
    // Demo mode (no DB) — nothing to persist, but still fire the notification.
    notify("approved", `✅ อนุมัติเบิกงบ${req.ref ? ` ${req.ref}` : ""} · ${req.category}`,
      `${baht(approved)}${req.requester ? ` · ของ ${req.requester}` : ""} — Finance บันทึกลง Spending Log แล้ว (Unpaid)`, "/expenses");
    return;
  }
  // Atomic: the RPC claims the still-"Waiting Approval" row, books the approved
  // spend into the Spending Log (Unpaid), and moves the linked card to Approved —
  // all in one transaction, so a mid-way failure can't leave a partial state, and
  // a double-click / second tab can't book the spend twice (ok=false when the row
  // was already processed). See supabase/finance_atomic.sql.
  const { data, error } = await db.rpc("approve_expense_request", { p_id: req._id, p_approved: approved });
  assertDbOk(error, "Could not approve expense request");
  if (!(data as { ok?: boolean } | null)?.ok) {
    throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว (อาจมีการอนุมัติพร้อมกันจากอีกหน้าจอ) — รีเฟรชแล้วตรวจสอบสถานะอีกครั้ง");
  }
  // Notifications + audit are best-effort side effects, kept on the client.
  notify("approved", `✅ อนุมัติเบิกงบ${req.ref ? ` ${req.ref}` : ""} · ${req.category}`,
    `${baht(approved)}${req.requester ? ` · ของ ${req.requester}` : ""} — Finance บันทึกลง Spending Log แล้ว (Unpaid)`, "/expenses");
  logAudit(`อนุมัติเบิกงบ${req.ref ? ` ${req.ref}` : ""} · ${req.category}`, "Finance", {
    before: `ขอ ${baht(req.requested)}`, after: `อนุมัติ ${baht(approved)}`, meta: { ref: req.ref, brand: req.b, campaign: req.campaign },
  });
}

/** Reject a request with a mandatory reason; the linked queue card goes back
 *  to Revision with the reason on its feedback history. */
export async function rejectExpenseRequest(req: ExpenseReq, reason: string, by: string): Promise<void> {
  const rejectNote = () => notify("rejected", `↩️ ตีกลับคำขอเบิก${req.ref ? ` ${req.ref}` : ""} · ${req.category}`,
    `เหตุผล: ${reason} — โดย ${by}${req.requester ? ` → ${req.requester} แก้แล้ว submit ใหม่` : ""}`, "/expenses");
  const db = supabase();
  if (!db || req._id === undefined) { rejectNote(); return; } // demo mode — just notify

  // Atomic: the RPC claims the still-"Waiting Approval" row, records the reason,
  // sends the linked card back to Revision, and APPENDS to its feedback history —
  // one transaction. ok=false means it was already processed (double-click / 2nd
  // tab), so we don't notify twice. See supabase/finance_atomic.sql.
  const { data, error } = await db.rpc("reject_expense_request", { p_id: req._id, p_reason: reason, p_by: by });
  assertDbOk(error, "Could not reject expense request");
  if (!(data as { ok?: boolean } | null)?.ok) {
    throw new Error("คำขอนี้ถูกดำเนินการไปแล้ว (อาจมีการดำเนินการพร้อมกันจากอีกหน้าจอ) — รีเฟรชแล้วตรวจสอบสถานะอีกครั้ง");
  }
  rejectNote();
  logAudit(`ตีกลับคำขอเบิก${req.ref ? ` ${req.ref}` : ""} · ${req.category}`, "Finance", {
    before: "Waiting Approval", after: "Rejected", actorName: by, meta: { reason, ref: req.ref },
  });
}

/** Approver corrects a wrongly-submitted request (category / item / amount)
 *  before deciding. Only the request row changes — approved spend is written
 *  to the Spending Log at approval time, so editing a pending row never
 *  touches recorded money. The requester is notified of the correction. */
export async function updateExpenseRequest(req: ExpenseReq, patch: {
  category: string; vendor?: string; requested: number;
}, by: string): Promise<void> {
  notify("approval", `✏️ แก้ไขคำขอเบิก${req.ref ? ` ${req.ref}` : ""} · ${patch.category}`,
    `ยอดขอ ${baht(patch.requested)}${patch.vendor ? ` · ${patch.vendor}` : ""} — แก้โดย ${by}${req.requester ? ` (แจ้ง ${req.requester})` : ""}`, "/expenses");
  const db = supabase();
  if (!db || req._id === undefined) return;
  const { error } = await db.from("expense_requests")
    .update({ category: patch.category, requested: patch.requested }).eq("id", req._id);
  assertDbOk(error, "Could not update expense request");
  // Separate so a DB missing expenses_p1.sql still keeps the base correction.
  await softColumnUpdate(
    db.from("expense_requests").update({ vendor: patch.vendor ?? null }).eq("id", req._id),
    "Could not update vendor",
  );
  if (req.ref) {
    await db.from("requests").update({
      title: `${patch.category} · ${baht(patch.requested)}${req.reimburseType ? ` · ${req.reimburseType}` : ""}${patch.vendor ? ` · ${patch.vendor}` : ""}`,
    }).eq("id", req.ref);
  }
}

/** Finance marks an Unpaid spending-log row as Paid after the actual payment. */
export async function markExpensePaid(id: number | undefined): Promise<void> {
  const db = supabase();
  if (!db || id === undefined) return;
  const { error } = await db.from("expenses").update({ status: "Paid" }).eq("id", id);
  assertDbOk(error, "Could not mark expense as paid");
}

/** Submit a Draft expense request (auto-created from an approved campaign
 *  budget) into the approval flow. */
export async function submitExpenseDraft(req: ExpenseReq): Promise<void> {
  const db = supabase();
  if (!db || req._id === undefined) return;
  // Only a Draft may be submitted, in one conditional update — so a double-click
  // or a second tab can't push the same request into the queue (and fire the
  // approval notification) twice.
  const { data: claimed, error } = await db.from("expense_requests")
    .update({ status: "Waiting Approval" })
    .eq("id", req._id)
    .eq("status", "Draft")
    .select("id");
  assertDbOk(error, "Could not submit expense draft");
  if (!claimed || claimed.length === 0) return; // already submitted elsewhere — no-op
  notify("approval", `📥 คำขอเบิกงบจากงบแคมเปญ · ${req.category}`,
    `${baht(req.requested)} · ${req.campaign} → รออนุมัติ`, "/my-tasks");
}

/** Insert a new expense request; extended columns go in a second update so the
 *  base row survives on a DB that hasn't run expenses_p1.sql yet. */
export async function createExpenseRequest(r: RequestRow, extra?: {
  ref?: string; requester?: string; vendor?: string; reimburseType?: string; vat?: number; wht?: number;
}): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { data, error } = await db.from("expense_requests").insert({
    category: r.category, brand: r.b, campaign: r.campaign === "—" ? null : r.campaign,
    requested: r.requested, approved: r.approved, due: r.due, status: r.status,
  }).select("id").single();
  const row = assertDbData(data, error, "Could not save expense request");
  if (extra && row.id !== undefined) {
    await softColumnUpdate(
      db.from("expense_requests").update({
        ref: extra.ref ?? null, requester: extra.requester ?? null, vendor: extra.vendor ?? null,
        reimburse_type: extra.reimburseType ?? null, vat: extra.vat ?? 0, wht: extra.wht ?? 0,
      }).eq("id", row.id),
      "Could not save expense request detail",
    );
  }
}
