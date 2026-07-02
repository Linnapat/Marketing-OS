"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Progress } from "@/components/ui/Progress";
import { SignaturePad } from "@/components/finance/SignaturePad";
import { BrandFilterValue } from "@/lib/brands";
import { baht } from "@/lib/format";
import { brandName } from "@/lib/brands";
import {
  BUDGET_SECTIONS, SECTION_ICON, EXPENSES, REQUESTS, PNL, EXP_CATEGORIES,
  STATUS_TONE, buildCsv, ExpenseRow,
} from "@/lib/data/finance";

const TABS = [
  ["plan", "Budget Plan"],
  ["request", "Expense Request"],
  ["log", "Spending Log"],
  ["roi", "ROI / P&L"],
  ["approval", "Approval"],
] as const;
type Tab = (typeof TABS)[number][0];

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("plan");
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [pvExpense, setPvExpense] = useState<ExpenseRow | null>(null);

  const exportCsv = () => {
    if (tab === "log") {
      download("spending-log.csv", buildCsv(
        ["Vendor", "Category", "Brand", "Amount", "VAT", "Date", "Status"],
        EXPENSES.filter((e) => brand === "all" || e.b === brand).map((e) => [e.vendor, e.category, brandName(e.b), e.amount, e.vat, e.date, e.status]),
      ));
    } else if (tab === "request" || tab === "approval") {
      download("expense-requests.csv", buildCsv(
        ["Category", "Brand", "Campaign", "Requested", "Approved", "Due", "Status"],
        REQUESTS.filter((r) => brand === "all" || r.b === brand).map((r) => [r.category, brandName(r.b), r.campaign, r.requested, r.approved, r.due, r.status]),
      ));
    } else if (tab === "roi") {
      download("budget-breakdown.csv", buildCsv(
        ["Section", "Item", "Budget", "Actual", "Remaining", "Used %"],
        BUDGET_SECTIONS.flatMap((s) => s.items.map((i) => [s.label, i.name, i.budget, i.actual, i.budget - i.actual, (i.budget ? Math.round((i.actual / Math.abs(i.budget)) * 100) : 0) + "%"])),
      ));
    } else {
      download("campaign-pnl.csv", buildCsv(
        ["Campaign", "Brand", "Revenue", "Budget", "Expense", "Gross Profit", "ROI", "ROAS"],
        PNL.filter((p) => brand === "all" || p.b === brand).map((p) => [p.name, brandName(p.b), p.revenue, p.budget, p.expense, p.revenue - p.expense, p.roi + "x", p.roas + "x"]),
      ));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Finance & Budget"
        title="Finance"
        subtitle="Budget planning, expense requests, spending, and campaign P&L — in Thai Baht."
      />

      <div className="mt-[14px]">
        <DateFilterBar value={date} onChange={setDate} />
      </div>
      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <BrandFilter value={brand} onChange={setBrand} />
        <button onClick={exportCsv} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line pb-[2px]">
        {TABS.map(([id, label]) => {
          const active = id === tab;
          return (
            <button key={id} onClick={() => setTab(id)}
              className="text-[13px] font-semibold px-[14px] py-[9px] whitespace-nowrap border-b-2 -mb-[2px]"
              style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "plan" && <BudgetPlanTab brand={brand} />}
        {tab === "request" && <ExpenseRequestTab />}
        {tab === "log" && <SpendingLogTab brand={brand} onVoucher={setPvExpense} />}
        {tab === "roi" && <RoiTab />}
        {tab === "approval" && <ApprovalTab brand={brand} />}
      </div>

      {pvExpense && <VoucherModal expense={pvExpense} onClose={() => setPvExpense(null)} />}
    </>
  );
}

/* ── Budget Plan: campaign-level profitability (expandable) ─────────── */
function BudgetPlanTab({ brand }: { brand: BrandFilterValue }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const rows = PNL.filter((p) => brand === "all" || p.b === brand);
  const detail = (p: (typeof PNL)[number]) => [
    { label: "Content & Creative", budget: Math.round(p.budget * 0.15), actual: Math.round(p.expense * 0.12) },
    { label: "KOL / Influencer", budget: Math.round(p.budget * 0.25), actual: Math.round(p.expense * 0.28) },
    { label: "Paid Ads", budget: Math.round(p.budget * 0.4), actual: Math.round(p.expense * 0.42) },
    { label: "Production", budget: Math.round(p.budget * 0.12), actual: Math.round(p.expense * 0.1) },
    { label: "Event & Other", budget: Math.round(p.budget * 0.08), actual: Math.round(p.expense * 0.08) },
  ];
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="px-5 py-3 text-[13px] font-bold border-b border-line4">Campaign-level Profitability</div>
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "0.4fr 2fr 1.2fr 1.1fr 1.1fr 1.1fr 0.8fr 0.8fr" }}>
        <div></div><div>Campaign</div><div>Revenue</div><div>Budget</div><div>Expense</div><div>Gross Profit</div><div>ROI</div><div>ROAS</div>
      </div>
      {rows.map((p) => {
        const gp = p.revenue - p.expense;
        const isOpen = open[p.name];
        return (
          <div key={p.name} className="border-b border-line4 last:border-0">
            <button onClick={() => setOpen((o) => ({ ...o, [p.name]: !o[p.name] }))}
              className="w-full grid grid-cols-[0.4fr_2fr_1.2fr_1.1fr_1.1fr_1.1fr_0.8fr_0.8fr] gap-y-1 px-5 py-3 items-center text-left hover:bg-ivory/60">
              <span>{isOpen ? <ChevronDown size={15} className="text-faint" /> : <ChevronRight size={15} className="text-faint" />}</span>
              <span className="flex items-center gap-[7px] text-[13px] font-bold text-ink"><BrandDot brand={p.b} size={7} />{p.name}</span>
              <span className="text-[13px] text-ink">{baht(p.revenue, { compact: true })}</span>
              <span className="text-[13px] text-muted">{baht(p.budget, { compact: true })}</span>
              <span className="text-[13px] text-muted">{baht(p.expense, { compact: true })}</span>
              <span className="text-[13px] font-semibold" style={{ color: gp >= 0 ? "#4E7A4E" : "#B33A2E" }}>{baht(gp, { compact: true })}</span>
              <span className="text-[13px] font-bold" style={{ color: p.roi < 1 ? "#B33A2E" : "#4E7A4E" }}>{p.roi}×</span>
              <span className="text-[13px] text-ink">{p.roas}×</span>
            </button>
            {isOpen && (
              <div className="bg-ivory px-5 py-2 border-t border-line4">
                {detail(p).map((d) => (
                  <div key={d.label} className="grid grid-cols-[2fr_1fr_1fr] gap-2 py-[7px] text-[12px]">
                    <span className="text-muted">{d.label}</span>
                    <span className="text-faint">Budget {baht(d.budget, { compact: true })}</span>
                    <span className="text-ink font-semibold">Actual {baht(d.actual, { compact: true })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Expense Request: form + calculator + budget check + approval route ─ */
function ExpenseRequestTab() {
  const [catKey, setCatKey] = useState("");
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const amt = parseFloat(amount) || 0;
  const vat = Math.round(amt * 0.07);
  const wht = Math.round(amt * 0.03);
  const net = amt + vat - wht;
  const cat = EXP_CATEGORIES.find((c) => c.key === catKey);
  const remaining = cat ? cat.budget - cat.used : 0;
  const overBudget = cat ? amt > remaining : false;
  const route = amt >= 10000 ? "CMO + CFO" : "CMO only";

  const grouped = useMemo(() => {
    const g: Record<string, typeof EXP_CATEGORIES> = {};
    EXP_CATEGORIES.forEach((c) => { (g[c.group] ||= []).push(c); });
    return g;
  }, []);

  if (submitted) {
    return (
      <div className="bg-surface border border-line rounded-cardLg p-10 text-center max-w-lg mx-auto">
        <div className="text-[40px] mb-2">✓</div>
        <div className="text-[16px] font-bold text-ink">Request submitted</div>
        <div className="text-[13px] text-faint mt-1">Reference <b className="text-ink">{submitted}</b> · routed to {route}</div>
        <button onClick={() => { setSubmitted(null); setAmount(""); setCatKey(""); }} className="mt-5 text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">New Request</button>
      </div>
    );
  }

  const field = "w-full text-[14px] px-[13px] py-[11px] rounded-[10px] border border-line2 bg-ivory outline-none";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
              <select className={field}><option>TEPPEN</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option></select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Amount (฿) <span className="text-status-red">*</span></label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={field} />
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Vendor</label>
            <input className={field} placeholder="Vendor name" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Attach quotation</label>
            <div className="border-2 border-dashed border-line2 rounded-[10px] py-6 text-center text-[12px] text-faint">Drop quotation PDF / image</div>
          </div>
          <button
            onClick={() => setSubmitted(`REQ-2026-${String(Math.floor(1000 + amt % 9000)).padStart(4, "0")}`)}
            disabled={!catKey || amt <= 0}
            className="text-[13px] font-bold text-white rounded-[10px] py-[11px] disabled:opacity-40" style={{ background: "#211F1C" }}>
            Submit for Approval
          </button>
        </div>
      </div>

      {/* Side: calculator + budget check + route */}
      <div className="flex flex-col gap-4">
        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[13px] font-bold mb-3">Amount Breakdown</div>
          {[
            { label: "Amount", value: baht(amt) },
            { label: "VAT 7%", value: `+ ${baht(vat)}` },
            { label: "WHT 3% deducted", value: `− ${baht(wht)}` },
          ].map((r) => (
            <div key={r.label} className="flex justify-between py-[7px] text-[13px] border-b border-line4">
              <span className="text-muted">{r.label}</span><span className="text-ink font-semibold">{r.value}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3 text-[14px] font-bold">
            <span>Net payable</span><span className="text-accent">{baht(net)}</span>
          </div>
        </div>

        {cat && (
          <div className="rounded-cardLg p-5 border" style={{ background: overBudget ? "#FFF5F4" : "#EEF4EE", borderColor: overBudget ? "#F5C8C4" : "#C8E0C8" }}>
            <div className="text-[13px] font-bold mb-3" style={{ color: overBudget ? "#B33A2E" : "#4E7A4E" }}>
              Budget Check {overBudget ? "· over budget" : "· within budget"}
            </div>
            <div className="text-[12px] text-muted flex justify-between mb-1"><span>Budget</span><span className="font-semibold text-ink">{baht(cat.budget, { compact: true })}</span></div>
            <div className="text-[12px] text-muted flex justify-between mb-1"><span>Used</span><span className="font-semibold text-ink">{baht(cat.used, { compact: true })}</span></div>
            <div className="text-[12px] text-muted flex justify-between mb-2"><span>Remaining</span><span className="font-semibold text-ink">{baht(remaining, { compact: true })}</span></div>
            <Progress value={cat.budget ? (cat.used / cat.budget) * 100 : 0} color={overBudget ? "#B33A2E" : "#4E7A4E"} />
          </div>
        )}

        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[13px] font-bold mb-2">Approval Route</div>
          <div className="text-[12.5px] text-muted">Amount {amt >= 10000 ? "≥" : "<"} ฿10,000 → <b className="text-ink">{route}</b></div>
        </div>
      </div>
    </div>
  );
}

/* ── Spending Log: table + Voucher button ──────────────────────────── */
function SpendingLogTab({ brand, onVoucher }: { brand: BrandFilterValue; onVoucher: (e: ExpenseRow) => void }) {
  const rows = EXPENSES.filter((e) => brand === "all" || e.b === brand);
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "1.6fr 1.2fr 1.2fr 1fr 1fr 0.9fr 1fr" }}>
        <div>Vendor</div><div>Category</div><div>Brand</div><div>Amount</div><div>VAT</div><div>Status</div><div></div>
      </div>
      {rows.map((e, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-[1.6fr_1.2fr_1.2fr_1fr_1fr_0.9fr_1fr] gap-y-1 px-5 py-3 items-center border-b border-line4 last:border-0">
          <div className="text-[13px] font-semibold text-ink">{e.vendor}<div className="text-[11px] text-faint md:hidden">{e.date}</div></div>
          <div className="text-[12.5px] text-muted">{e.category}</div>
          <div className="flex items-center gap-[6px] text-[12px] text-muted"><BrandDot brand={e.b} size={7} />{brandName(e.b)}</div>
          <div className="text-[13px] font-semibold text-ink">{baht(e.amount, { compact: true })}</div>
          <div className="text-[12.5px] text-muted">{e.vat ? baht(e.vat) : "—"}</div>
          <div><StatusBadge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</StatusBadge></div>
          <div><button onClick={() => onVoucher(e)} className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[5px]">Voucher ↗</button></div>
        </div>
      ))}
    </div>
  );
}

function VoucherModal({ expense, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  const wht = Math.round(expense.amount * 0.03);
  const total = expense.amount + expense.vat - wht;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-surface rounded-cardLg w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-center mb-4">
          <div className="text-[11px] uppercase tracking-[0.1em] text-faint font-bold">Payment Voucher</div>
          <div className="text-[16px] font-extrabold mt-1">TEPPEN Group</div>
        </div>
        <div className="flex flex-col gap-[2px] text-[13px]">
          {[
            ["PV No.", `PV-2026-${String(Math.floor(1000 + expense.amount % 9000))}`],
            ["Vendor", expense.vendor],
            ["Brand", brandName(expense.b)],
            ["Category", expense.category],
            ["Date", expense.date],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-[6px] border-b border-line4"><span className="text-faint">{k}</span><span className="font-semibold text-ink">{v}</span></div>
          ))}
          <div className="flex justify-between py-[6px] border-b border-line4"><span className="text-faint">Amount</span><span className="font-semibold text-ink">{baht(expense.amount)}</span></div>
          <div className="flex justify-between py-[6px] border-b border-line4"><span className="text-faint">VAT 7%</span><span className="font-semibold text-ink">+ {baht(expense.vat)}</span></div>
          <div className="flex justify-between py-[6px] border-b border-line4"><span className="text-faint">WHT 3%</span><span className="font-semibold text-ink">− {baht(wht)}</span></div>
          <div className="flex justify-between pt-3 text-[15px] font-bold"><span>Net Total</span><span className="text-accent">{baht(total)}</span></div>
        </div>
        <button className="w-full mt-5 text-[12.5px] font-bold text-white bg-panel rounded-[9px] py-[10px]">Open Printable Version →</button>
      </div>
    </div>
  );
}

/* ── ROI / P&L: collapsible category + line-item breakdown ─────────── */
function RoiTab() {
  const [open, setOpen] = useState<Record<string, boolean>>({ digital: true });
  return (
    <div className="flex flex-col gap-3">
      {BUDGET_SECTIONS.map((sec) => {
        const budget = sec.items.reduce((s, i) => s + i.budget, 0);
        const actual = sec.items.reduce((s, i) => s + i.actual, 0);
        const remaining = budget - actual;
        const usedPct = budget ? Math.round((actual / budget) * 100) : 0;
        const isOpen = open[sec.key];
        return (
          <div key={sec.key} className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <button onClick={() => setOpen((o) => ({ ...o, [sec.key]: !o[sec.key] }))} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-ivory/60 text-left">
              {isOpen ? <ChevronDown size={16} className="text-faint" /> : <ChevronRight size={16} className="text-faint" />}
              <span className="text-[16px]">{SECTION_ICON[sec.key]}</span>
              <div className="flex-1">
                <div className="text-[13.5px] font-bold text-ink">{sec.label}</div>
                <div className="text-[11px] text-faint">{sec.sub}</div>
              </div>
              <div className="hidden sm:flex items-center gap-5 text-[12px]">
                <span className="text-muted">Budget <b className="text-ink">{baht(budget, { compact: true })}</b></span>
                <span className="text-muted">Actual <b className="text-ink">{baht(actual, { compact: true })}</b></span>
                <span style={{ color: remaining < 0 ? "#B33A2E" : "#4E7A4E" }}>Left <b>{baht(remaining, { compact: true })}</b></span>
              </div>
              <div className="w-24"><Progress value={usedPct} color={usedPct > 90 ? "#B33A2E" : "#B8945A"} /></div>
            </button>
            {isOpen && (
              <div className="border-t border-line4">
                {sec.items.map((it) => {
                  const pct = it.budget ? Math.round((it.actual / Math.abs(it.budget)) * 100) : 0;
                  return (
                    <div key={it.name} className="grid grid-cols-[2fr_1fr_1fr_1.2fr] gap-2 px-5 py-[9px] items-center border-b border-line4 last:border-0 text-[12.5px]">
                      <span className="text-ink">{it.name}</span>
                      <span className="text-muted">{baht(it.budget, { compact: true })}</span>
                      <span className="text-ink font-semibold">{baht(it.actual, { compact: true })}</span>
                      <div className="flex items-center gap-2"><Progress value={pct} color={pct > 90 ? "#B33A2E" : "#C68A1E"} /><span className="text-[11px] text-faint w-8 text-right">{pct}%</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Approval: pending requests + signature ────────────────────────── */
function ApprovalTab({ brand }: { brand: BrandFilterValue }) {
  const [approved, setApproved] = useState<Record<number, boolean>>({});
  const [signing, setSigning] = useState<number | null>(null);
  const rows = REQUESTS.map((r, i) => ({ r, i })).filter(({ r }) => brand === "all" || r.b === brand);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] text-faint">
        {REQUESTS.filter((r, i) => !approved[i] && r.status === "Waiting Approval").length} request(s) waiting for your signature.
      </div>
      {rows.map(({ r, i }) => {
        const isApproved = approved[i] || r.status !== "Waiting Approval";
        return (
          <div key={i} className="bg-surface border border-line rounded-cardLg p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <BrandDot brand={r.b} size={8} />
                  <span className="text-[14px] font-bold text-ink">{r.category}</span>
                </div>
                <div className="text-[12px] text-faint mt-1">{r.campaign} · due {r.due} · requested {baht(r.requested, { compact: true })}</div>
              </div>
              {isApproved ? (
                <StatusBadge tone="green">✓ Approved</StatusBadge>
              ) : (
                <button onClick={() => setSigning(signing === i ? null : i)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">
                  {signing === i ? "Cancel" : "✓ Approve"}
                </button>
              )}
            </div>
            {signing === i && !isApproved && (
              <div className="mt-4 pt-4 border-t border-line4">
                <div className="text-[12px] font-semibold text-muted mb-2">Sign to approve this request</div>
                <SignaturePad onSave={() => { setApproved((a) => ({ ...a, [i]: true })); setSigning(null); }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
