"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Progress } from "@/components/ui/Progress";
import { SignaturePad } from "@/components/finance/SignaturePad";
import { BrandFilterValue, brandName, brandColor } from "@/lib/brands";
import { useRole, canSeeOperation } from "@/lib/role";
import { baht } from "@/lib/format";
import {
  BUDGET_SECTIONS, SECTION_ICON, REQUESTS, PNL,
  BUDGET_BY_BRAND, BUDGET_BY_CATEGORY, STATUS_TONE, buildCsv, RequestRow,
} from "@/lib/data/finance";
import { fetchExpenseRequests, approveExpenseRequest, ExpenseReq } from "@/lib/db/finance";
import { getSavedSignature, saveSignature, clearSignature } from "@/lib/signature";

const TABS = [
  ["plan", "Budget Plan"],
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
  const { role, can } = useRole();
  const canOps = canSeeOperation(role);

  const exportCsv = () => {
    if (tab === "approval") {
      download("expense-requests.csv", buildCsv(
        ["Category", "Brand", "Campaign", "Requested", "Approved", "Due", "Status"],
        REQUESTS.filter((r) => brand === "all" || r.b === brand).map((r) => [r.category, brandName(r.b), r.campaign, r.requested, r.approved, r.due, r.status]),
      ));
    } else if (tab === "roi") {
      download("budget-breakdown.csv", buildCsv(
        ["Section", "Item", "Budget", "Actual", "Remaining", "Used %"],
        BUDGET_SECTIONS.filter((s) => canOps || s.key !== "operation").flatMap((s) => s.items.map((i) => [s.label, i.name, i.budget, i.actual, i.budget - i.actual, (i.budget ? Math.round((i.actual / Math.abs(i.budget)) * 100) : 0) + "%"])),
      ));
    } else {
      download("campaign-pnl.csv", buildCsv(
        ["Campaign", "Brand", "Revenue", "Budget", "Expense", "Gross Profit", "ROI", "ROAS"],
        PNL.filter((p) => brand === "all" || p.b === brand).map((p) => [p.name, brandName(p.b), p.revenue, p.budget, p.expense, p.revenue - p.expense, p.roi + "x", p.roas + "x"]),
      ));
    }
  };

  if (!can("Finance")) return <NoFinanceAccess />;

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
        {tab === "roi" && <RoiTab canOps={canOps} />}
        {tab === "approval" && <ApprovalTab brand={brand} />}
      </div>
    </>
  );
}

/** Shown when the current role isn't permitted to view Finance (Settings → Permissions). */
function NoFinanceAccess() {
  return (
    <>
      <PageHeader eyebrow="Finance & Budget" title="Finance" subtitle="Restricted module." />
      <div className="mt-6 bg-surface border border-line rounded-cardLg p-10 text-center max-w-lg mx-auto">
        <div className="text-[34px] mb-2">🔒</div>
        <div className="text-[15px] font-bold text-ink">You don’t have access to Finance</div>
        <div className="text-[13px] text-faint mt-1">Budget, P&amp;L and approvals are limited to Finance and Admin roles. Ask an admin to grant access in <b className="text-muted">Settings → Permissions</b>. For expense requests and spending, use the <b className="text-muted">Expenses</b> module.</div>
      </div>
    </>
  );
}

/* ── Budget Plan: allocation + campaign-level profitability ─────────── */
function BudgetPlanTab({ brand }: { brand: BrandFilterValue }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const rows = PNL.filter((p) => brand === "all" || p.b === brand);
  const brandAlloc = BUDGET_BY_BRAND.filter((b) => brand === "all" || b.b === brand);
  const maxCat = Math.max(...BUDGET_BY_CATEGORY.map((c) => c.amount));

  return (
    <div className="flex flex-col gap-4">
      {/* Top KPI cards */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-card p-[18px]" style={{ background: "#211F1C", color: "#fff" }}>
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-accent">Total Plan</div>
          <div className="text-[25px] font-bold mt-[6px]">฿4.50M</div>
        </div>
        {[["Committed", "฿2.84M"], ["Available", "฿1.66M"]].map(([l, v]) => (
          <div key={l} className="bg-surface border border-line rounded-card p-[18px]">
            <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">{l}</div>
            <div className="text-[25px] font-bold mt-[6px] text-ink">{v}</div>
          </div>
        ))}
      </div>

      {/* Allocation panels */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[15px] font-bold mb-4">Allocation by brand</div>
          <div className="flex flex-col gap-[15px]">
            {brandAlloc.map((b) => {
              const pct = Math.round((b.spent / b.plan) * 100);
              return (
                <div key={b.b}>
                  <div className="flex justify-between text-[12.5px] mb-[5px]">
                    <span className="font-semibold">{brandName(b.b)}</span>
                    <span className="text-muted">{baht(b.spent, { compact: true })} / {baht(b.plan, { compact: true })} · <b style={{ color: pct > 95 ? "#B33A2E" : "#6b6258" }}>{pct}%</b></span>
                  </div>
                  <Progress value={pct} color={brandColor(b.b)} height={8} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[15px] font-bold mb-4">By category</div>
          <div className="flex flex-col gap-[15px]">
            {BUDGET_BY_CATEGORY.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-[12.5px] mb-[5px]">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted">{baht(c.amount, { compact: true })}</span>
                </div>
                <Progress value={Math.round((c.amount / maxCat) * 100)} color="#B8945A" height={8} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <BudgetProfitability rows={rows} open={open} setOpen={setOpen} />
    </div>
  );
}

function BudgetProfitability({ rows, open, setOpen }: {
  rows: typeof PNL; open: Record<string, boolean>; setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
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
function RoiTab({ canOps }: { canOps: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ digital: true });
  return (
    <div className="flex flex-col gap-3">
      {BUDGET_SECTIONS.map((sec) => {
        // Operation costs (salary, bonus, incentives) are CMO-only.
        if (sec.key === "operation" && !canOps) {
          return (
            <div key={sec.key} className="bg-surface border border-line rounded-cardLg overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-[14px]">
                <span className="text-[16px] grayscale opacity-60">{SECTION_ICON[sec.key]}</span>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-faint flex items-center gap-2">
                    {sec.label} <span className="text-[11px]">🔒</span>
                  </div>
                  <div className="text-[11px] text-faint">Restricted — visible to CMO / Admin only</div>
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint border border-line2 rounded-pill px-[9px] py-[3px]">
                  CMO only
                </span>
              </div>
            </div>
          );
        }
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
  const [allReqs, setAllReqs] = useState<ExpenseReq[]>(REQUESTS);
  // Remembered signature — sign once, then later approvals only need a Confirm.
  const [sig, setSig] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSig(getSavedSignature());
    fetchExpenseRequests().then((r) => { if (alive) setAllReqs(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows = allReqs.map((r, i) => ({ r, i })).filter(({ r }) => brand === "all" || r.b === brand);
  const approve = (i: number, r: ExpenseReq) => {
    setApproved((a) => ({ ...a, [i]: true }));
    setSigning(null);
    approveExpenseRequest(r._id, r.requested);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12px] text-faint">
          {allReqs.filter((r, i) => !approved[i] && r.status === "Waiting Approval").length} request(s) waiting for your approval.
        </div>
        {sig && (
          <div className="flex items-center gap-2 text-[11.5px] text-muted">
            <span className="font-semibold">✍️ Signature on file</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sig} alt="signature" className="h-6 border border-line3 rounded bg-white" />
            <button onClick={() => { clearSignature(); setSig(null); }} className="font-bold text-accent">Change</button>
          </div>
        )}
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
              ) : sig ? (
                <button onClick={() => approve(i, r)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">✓ Confirm &amp; Approve</button>
              ) : (
                <button onClick={() => setSigning(signing === i ? null : i)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">
                  {signing === i ? "Cancel" : "✓ Approve"}
                </button>
              )}
            </div>
            {signing === i && !isApproved && !sig && (
              <div className="mt-4 pt-4 border-t border-line4">
                <div className="text-[12px] font-semibold text-muted mb-2">Sign once — we’ll remember it for next time</div>
                <SignaturePad confirmLabel="Save signature &amp; Approve" onSave={(dataUrl) => { saveSignature(dataUrl); setSig(dataUrl); approve(i, r); }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
