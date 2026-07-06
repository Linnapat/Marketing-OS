"use client";

// Expense Request + Spending Log — pulled out of the Finance module into their
// own "Expenses" page so day-to-day spending is reachable without Finance access.

import { useEffect, useMemo, useState } from "react";
import { BrandDot } from "@/components/ui/BrandDot";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { baht } from "@/lib/format";
import { brandName, BrandFilterValue, BrandId } from "@/lib/brands";
import { EXPENSES, REQUESTS, EXP_CATEGORIES, STATUS_TONE, ExpenseRow, RequestRow } from "@/lib/data/finance";
import { fetchExpenseRequests, fetchExpenses, createExpenseRequest, markExpensePaid, ExpenseReq, ExpenseLogRow } from "@/lib/db/finance";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignRow } from "@/lib/data/campaigns";
import { createRequest } from "@/lib/db/requests";
import { RequestRow as QueueRow } from "@/lib/data/requests";
import { useAuth } from "@/lib/auth";

/** Days a request has been waiting, from its created_at (needs expenses_p1.sql). */
export function daysWaiting(createdAt?: string): number | null {
  if (!createdAt) return null;
  const d = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

interface ExtraLine { desc: string; amount: number; vat: number; }
const BRAND_NAME_TO_ID: Record<string, BrandId> = { TEPPEN: "teppen", "Omakase Don": "omakase", Mainichi: "mainichi", Touka: "touka" };
const REIMBURSE_TYPES = ["Petty Cash", "Payment Voucher"];
// Vendor suggestions for the searchable field — distinct past vendors + free text.
const VENDORS = Array.from(new Set(EXPENSES.map((e) => e.vendor))).sort();

export function ExpenseRequestTab({ brand }: { brand: BrandFilterValue }) {
  const [catKey, setCatKey] = useState("");
  const [amount, setAmount] = useState("");
  const [formBrand, setFormBrand] = useState("TEPPEN");
  const [campaign, setCampaign] = useState("");
  const [vendor, setVendor] = useState("");
  const [reimburseType, setReimburseType] = useState(REIMBURSE_TYPES[0]);
  // VAT 7% / WHT 3% are the requester's choice (some expenses have neither).
  const [applyVat, setApplyVat] = useState(true);
  const [applyWht, setApplyWht] = useState(true);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [requests, setRequests] = useState<ExpenseReq[]>(REQUESTS);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const { member, user } = useAuth();
  // Real requester name from the signed-in account (demo mode falls back).
  const requesterName = member?.name || user?.email?.split("@")[0] || "You";

  useEffect(() => {
    let alive = true;
    fetchExpenseRequests().then((r) => { if (alive) setRequests(r); }).catch(() => {});
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, [submitted]);

  const formBrandId = BRAND_NAME_TO_ID[formBrand] ?? "teppen";
  // Campaigns available for the chosen brand (cascade by brand).
  const brandCampaigns = useMemo(
    () => campaigns.filter((c) => c.b === formBrandId),
    [campaigns, formBrandId],
  );
  // Reset the campaign choice when it no longer belongs to the selected brand.
  useEffect(() => {
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign]);

  const submit = async () => {
    // Unique reference — time-based so equal amounts never collide.
    const ref = `REQ-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const row: RequestRow = {
      category: cat?.label ?? "Expense", b: formBrandId,
      campaign: campaign || "—", requested: amt, approved: 0, due: "—", status: "Waiting Approval",
    };
    await createExpenseRequest(row, { ref, requester: requesterName, vendor, reimburseType, vat, wht });
    // Also drop a card into the shared Approval Queue (same table My Tasks ›
    // My Approval + the Dashboard's Pending Approval read from), stage "Submitted".
    const queueRow: QueueRow = {
      id: ref, type: "Budget", typeIcon: "฿",
      title: `${cat?.label ?? "Expense"} · ${baht(amt)} · ${reimburseType}${vendor ? ` · ${vendor}` : ""}`, b: formBrandId,
      campaign: campaign || "—", requester: requesterName, approver: route,
      due: "—", stage: "Submitted", priority: amt >= 10000 ? "High" : "Med",
    };
    await createRequest(queueRow);
    setSubmitted(ref);
  };
  // Additional line items
  const [lines, setLines] = useState<ExtraLine[]>([]);
  const [lineOpen, setLineOpen] = useState(false);
  const [lineDesc, setLineDesc] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [lineVat, setLineVat] = useState(0);

  const amt = parseFloat(amount) || 0;
  const vat = applyVat ? Math.round(amt * 0.07) : 0;
  const wht = applyWht ? Math.round(amt * 0.03) : 0;
  const net = amt + vat - wht;
  const cat = EXP_CATEGORIES.find((c) => c.key === catKey);
  // Marketing expenses are approved by the CMO alone (no CFO tier).
  const route = "CMO";
  const grandTotal = amt + vat + lines.reduce((s, l) => s + l.amount + Math.round(l.amount * l.vat / 100), 0);

  const grouped = useMemo(() => {
    const g: Record<string, typeof EXP_CATEGORIES> = {};
    EXP_CATEGORIES.forEach((c) => { (g[c.group] ||= []).push(c); });
    return g;
  }, []);

  const addLine = () => {
    const a = parseFloat(lineAmount) || 0;
    if (!lineDesc || a <= 0) return;
    setLines((ls) => [...ls, { desc: lineDesc, amount: a, vat: lineVat }]);
    setLineDesc(""); setLineAmount(""); setLineVat(0); setLineOpen(false);
  };

  if (submitted) {
    return (
      <div className="bg-surface border border-line rounded-cardLg p-10 text-center max-w-lg mx-auto">
        <div className="text-[40px] mb-2">✓</div>
        <div className="text-[16px] font-bold text-ink">Request submitted</div>
        <div className="text-[13px] text-faint mt-1">Reference <b className="text-ink">{submitted}</b> · {lines.length + 1} line item(s) · routed to {route}</div>
        <button onClick={() => { setSubmitted(null); setAmount(""); setCatKey(""); setLines([]); }} className="mt-5 text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">New Request</button>
      </div>
    );
  }

  const field = "w-full text-[14px] px-[13px] py-[11px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const lineField = "w-full text-[13px] px-[10px] py-[8px] rounded-[8px] border border-line2 bg-ivory outline-none";

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* LEFT: form */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[13px] font-bold mb-4">New Expense Request</div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Category <span className="text-status-red">*</span></label>
              <select value={catKey} onChange={(e) => setCatKey(e.target.value)} className={field}>
                <option value="">Select category…</option>
                {Object.entries(grouped).map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">ประเภทการเบิกเงิน / Reimbursement Type</label>
              <select value={reimburseType} onChange={(e) => setReimburseType(e.target.value)} className={field}>
                {REIMBURSE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
                <select value={formBrand} onChange={(e) => setFormBrand(e.target.value)} className={field}><option>TEPPEN</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option></select>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Amount (฿) <span className="text-status-red">*</span></label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={field} />
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}>
                <option value="">{brandCampaigns.length ? "Select campaign…" : "No campaigns for this brand"}</option>
                {brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Vendor</label>
                <input value={vendor} onChange={(e) => setVendor(e.target.value)} list="expense-vendors" className={field} placeholder="Search or type vendor…" />
                <datalist id="expense-vendors">{VENDORS.map((v) => <option key={v} value={v} />)}</datalist>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Payment Type</label>
                <select className={field}><option>Bank Transfer</option><option>Cash</option><option>Credit Card</option><option>Cheque</option></select>
              </div>
            </div>

            {/* Tax — requester chooses whether VAT / WHT apply. */}
            <div className="flex items-center gap-5">
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted cursor-pointer"><input type="checkbox" checked={applyVat} onChange={(e) => setApplyVat(e.target.checked)} /> VAT 7%</label>
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted cursor-pointer"><input type="checkbox" checked={applyWht} onChange={(e) => setApplyWht(e.target.checked)} /> WHT 3% <span className="text-faint font-normal">· หัก ณ ที่จ่าย</span></label>
            </div>

            {/* Additional Line Items */}
            <div className="border border-line2 rounded-[14px] overflow-hidden">
              <div className="flex items-center justify-between px-[14px] py-[11px]" style={{ background: "#FAFAF7", borderBottom: "1px solid #EEE8DE" }}>
                <div className="text-[12px] font-bold text-muted">Additional Line Items{lines.length ? ` · ${lines.length}` : ""}</div>
                <button onClick={() => setLineOpen((o) => !o)} className="text-[12px] font-bold px-3 py-[5px] rounded-[8px] bg-panel text-white">+ Add Line</button>
              </div>
              {lines.length > 0 && (
                <div>
                  {lines.map((el, i) => (
                    <div key={i} className="flex items-center gap-[10px] px-[14px] py-[10px] bg-surface border-b border-line4">
                      <div className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{ background: "#EEF1F8", color: "#3E5C9A" }}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate">{el.desc}</div>
                        <div className="text-[11px] text-faint">Extra line · VAT {el.vat}%</div>
                      </div>
                      <div className="text-[13px] font-bold text-ink whitespace-nowrap">{baht(el.amount + Math.round(el.amount * el.vat / 100))}</div>
                      <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-[13px] text-[#C0B8AD] px-[6px]">✕</button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-[14px] py-[10px]" style={{ background: "#F7F4EE" }}>
                    <div className="text-[12px] font-bold text-faint">Total (all lines incl. primary)</div>
                    <div className="text-[15px] font-extrabold text-accent">{baht(grandTotal)}</div>
                  </div>
                </div>
              )}
              {lineOpen && (
                <div className="p-[14px] bg-surface flex flex-col gap-[10px]" style={{ borderTop: "1px solid #EEE8DE" }}>
                  <div className="grid gap-[10px]" style={{ gridTemplateColumns: "1.5fr 1fr 0.8fr" }}>
                    <div>
                      <label className="block text-[11px] font-bold text-muted mb-[5px]">Description</label>
                      <input value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} placeholder="e.g. Food support cost" className={lineField} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted mb-[5px]">Amount (฿)</label>
                      <input type="number" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} placeholder="0" className={lineField} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted mb-[5px]">VAT</label>
                      <select value={lineVat} onChange={(e) => setLineVat(parseInt(e.target.value))} className={lineField}><option value={0}>0%</option><option value={7}>7%</option></select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addLine} className="flex-1 text-center text-[13px] font-bold py-[9px] rounded-[9px] bg-panel text-white">Confirm Line</button>
                    <button onClick={() => setLineOpen(false)} className="text-[13px] font-semibold py-[9px] px-4 rounded-[9px] border border-line2 text-muted bg-white">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Attach quotation</label>
              <div className="border-2 border-dashed border-line2 rounded-[10px] py-6 text-center text-[12px] text-faint">Drop file here or click to upload</div>
            </div>
            <button
              onClick={submit}
              disabled={!catKey || amt <= 0}
              className="text-[13px] font-bold text-white rounded-[10px] py-[11px] disabled:opacity-40" style={{ background: "#211F1C" }}>
              Submit for Approval
            </button>
          </div>
        </div>

        {/* Amount breakdown — reflects the VAT / WHT choices above. */}
        <div className="bg-surface border border-line rounded-cardLg p-5 max-w-sm">
          <div className="text-[13px] font-bold mb-3">Amount Breakdown</div>
          <div className="flex justify-between py-[6px] text-[12.5px] border-b border-line4"><span className="text-muted">Amount</span><span className="text-ink font-semibold">{baht(amt)}</span></div>
          {applyVat && <div className="flex justify-between py-[6px] text-[12.5px] border-b border-line4"><span className="text-muted">VAT 7%</span><span className="text-ink font-semibold">+ {baht(vat)}</span></div>}
          {applyWht && <div className="flex justify-between py-[6px] text-[12.5px] border-b border-line4"><span className="text-muted">WHT 3%</span><span className="text-ink font-semibold">− {baht(wht)}</span></div>}
          <div className="flex justify-between pt-3 text-[13.5px] font-bold"><span>Net Payable</span><span className="text-accent">{baht(net)}</span></div>
        </div>
      </div>

      {/* RIGHT: Recent Requests */}
      <div className="lg:w-[340px] flex-shrink-0 flex flex-col gap-3">
        <div className="text-[15px] font-bold">Recent Requests</div>
        {requests.filter((r) => brand === "all" || r.b === brand).map((r, i) => {
          const wait = daysWaiting(r.createdAt);
          return (
          <div key={i} className="bg-surface border border-line rounded-card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <BrandDot brand={r.b} size={9} />
                <div className="text-[13.5px] font-bold truncate">{r.category}</div>
              </div>
              <StatusBadge tone={STATUS_TONE[r.status] ?? "gold"}>{r.status}</StatusBadge>
            </div>
            <div className="text-[12px] text-faint mb-3">
              {brandName(r.b)} · {r.campaign}
              {r.requester ? <> · โดย {r.requester}</> : null}
              {r.status === "Waiting Approval" && wait !== null && <> · <b style={{ color: wait >= 2 ? "#B33A2E" : "#C68A1E" }}>รอมา {wait} วัน</b></>}
            </div>
            {r.status === "Rejected" && r.rejectReason && (
              <div className="text-[11.5px] rounded-[8px] px-3 py-2 mb-3" style={{ background: "#FFF5F4", color: "#B33A2E" }}>
                ตีกลับ: {r.rejectReason}
              </div>
            )}
            <div className="grid grid-cols-3 gap-[6px]">
              {[["Requested", baht(r.requested, { compact: true }), "#211F1C"], ["Approved", r.approved ? baht(r.approved, { compact: true }) : "—", r.approved ? "#4E7A4E" : "#9A9387"], ["Due", r.due, "#211F1C"]].map(([l, v, c]) => (
                <div key={l}>
                  <div className="text-[10px] text-faint font-bold uppercase tracking-[0.04em] mb-[3px]">{l}</div>
                  <div className="text-[13px] font-bold" style={{ color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

/* ── Spending Log: table + Voucher button ──────────────────────────── */
export function SpendingLogTab({ brand, onVoucher }: { brand: BrandFilterValue; onVoucher: (e: ExpenseRow) => void }) {
  // Real spending from the DB (empty on a fresh database), mock in demo mode.
  const [all, setAll] = useState<ExpenseLogRow[]>(EXPENSES);
  useEffect(() => {
    let alive = true;
    fetchExpenses().then((e) => { if (alive) setAll(e); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const rows = all.filter((e) => brand === "all" || e.b === brand);
  const markPaid = (row: ExpenseLogRow) => {
    setAll((xs) => xs.map((x) => (x === row ? { ...x, status: "Paid" } : x)));
    markExpensePaid(row._id);
  };
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "1.6fr 1.2fr 1.2fr 1fr 1fr 0.9fr 1fr" }}>
        <div>Vendor</div><div>Category</div><div>Brand</div><div>Amount</div><div>VAT</div><div>Status</div><div></div>
      </div>
      {rows.length === 0 && <div className="text-[12.5px] text-faint text-center py-10">ยังไม่มีรายการใช้จ่าย</div>}
      {rows.map((e, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-[1.6fr_1.2fr_1.2fr_1fr_1fr_0.9fr_1fr] gap-y-1 px-5 py-3 items-center border-b border-line4 last:border-0">
          <div className="text-[13px] font-semibold text-ink">{e.vendor}<div className="text-[11px] text-faint md:hidden">{e.date}</div></div>
          <div className="text-[12.5px] text-muted">{e.category}</div>
          <div className="flex items-center gap-[6px] text-[12px] text-muted"><BrandDot brand={e.b} size={7} />{brandName(e.b)}</div>
          <div className="text-[13px] font-semibold text-ink">{baht(e.amount, { compact: true })}</div>
          <div className="text-[12.5px] text-muted">{e.vat ? baht(e.vat) : "—"}</div>
          <div><StatusBadge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</StatusBadge></div>
          <div className="flex items-center gap-[6px]">
            <button onClick={() => onVoucher(e)} className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[5px]">Voucher ↗</button>
            {e.status === "Unpaid" && (
              <button onClick={() => markPaid(e)} className="text-[11.5px] font-bold text-white rounded-[8px] px-3 py-[5px]" style={{ background: "#4E7A4E" }}>Mark Paid ✓</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
