"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Progress } from "@/components/ui/Progress";
import { SignaturePad } from "@/components/finance/SignaturePad";
import { BrandFilterValue, brandName, brandColor } from "@/lib/brands";
import { useRole } from "@/lib/role";
import { baht } from "@/lib/format";
import { buildCsv, PnlRow } from "@/lib/data/finance";
import { fetchExpenseRequests, approveExpenseRequest, rejectExpenseRequest, ExpenseReq } from "@/lib/db/finance";
import { daysWaiting } from "@/components/finance/ExpenseTabs";
import { useAuth } from "@/lib/auth";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { financeFromDb, FinanceView } from "@/lib/data/derive";
import { fetchAllBriefs } from "@/lib/db/brief";
import { CampaignBrief, budgetSummary } from "@/lib/data/brief";
import { getAppSetting, setAppSetting } from "@/lib/db/appSettings";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter as PeriodFilter, inDateFilter, filterMonthKeys, MONTHS } from "@/components/ui/DateFilterBar";
import { getSavedSignature, saveSignature, clearSignature } from "@/lib/signature";

const TABS = [
  ["plan", "Budget Plan"],
  ["roi", "P&L by Category"],
  ["approval", "Approval"],
] as const;
type Tab = (typeof TABS)[number][0];

/* ── Monthly category budgets from the Finance Google Sheet ─────────── */
export interface SheetBudgetRow { month: string; category: string; budget: number; }
interface CatPnlRow { category: string; budget: number; requested: number; approved: number; }

/** One row per category for the selected period: Budget (sheet months covered
 *  by the period, summed) vs the real expense requests logged in the period.
 *  Brand filter applies to actuals only — sheet budgets are company-wide. */
function categoryPnl(sheetRows: SheetBudgetRow[], reqs: ExpenseReq[], f: PeriodFilter, brand: BrandFilterValue): CatPnlRow[] {
  const monthKeys = new Set(filterMonthKeys(f));
  const budgets = new Map<string, number>();
  for (const r of sheetRows) if (monthKeys.has(r.month)) budgets.set(r.category, (budgets.get(r.category) || 0) + r.budget);
  const requested = new Map<string, number>();
  const approved = new Map<string, number>();
  for (const r of reqs) {
    if (!r.createdAt || !inDateFilter(f, r.createdAt) || (brand !== "all" && r.b !== brand)) continue;
    if (r.status !== "Draft" && r.status !== "Rejected") requested.set(r.category, (requested.get(r.category) || 0) + (r.requested || 0));
    approved.set(r.category, (approved.get(r.category) || 0) + (r.approved || 0));
  }
  const cats = [...new Set([...budgets.keys(), ...requested.keys(), ...approved.keys()])];
  return cats
    .map((category) => ({
      category,
      budget: budgets.get(category) || 0,
      requested: requested.get(category) || 0,
      approved: approved.get(category) || 0,
    }))
    .sort((a, b) => b.budget - a.budget || b.requested - a.requested);
}

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
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const { can } = useRole();
  // Budget + P&L derive from real campaigns / expense requests (empty on a fresh DB).
  const [fin, setFin] = useState<FinanceView | null>(null);
  const [reqs, setReqs] = useState<ExpenseReq[]>([]);
  const [briefs, setBriefs] = useState<Record<string, CampaignBrief>>({});
  // Monthly category budgets live in a Google Sheet the Finance team edits.
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetRows, setSheetRows] = useState<SheetBudgetRow[]>([]);
  const [sheetStatus, setSheetStatus] = useState<string>("");
  const [period, setPeriod] = useState<PeriodFilter>(DEFAULT_DATE_FILTER);

  const loadSheet = async (url: string) => {
    if (!url.trim()) { setSheetRows([]); setSheetStatus(""); return; }
    setSheetStatus("กำลังโหลด…");
    try {
      const res = await fetch(`/api/budget-sheet?url=${encodeURIComponent(url.trim())}`);
      const j = await res.json();
      if (!res.ok || j.error) { setSheetRows([]); setSheetStatus(`⚠ ${j.error ?? "โหลดไม่สำเร็จ"}`); return; }
      setSheetRows(j.rows ?? []);
      setSheetStatus(`✓ โหลดงบ ${j.rows?.length ?? 0} รายการจาก Google Sheet`);
    } catch {
      setSheetRows([]); setSheetStatus("⚠ เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง");
    }
  };

  const saveSheetUrl = async (url: string) => {
    setSheetUrl(url);
    await setAppSetting("budget_sheet_url", url.trim());
    await loadSheet(url);
  };

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCampaigns(), fetchExpenseRequests(), fetchAllBriefs()])
      .then(([c, r, b]) => { if (alive) { setFin(financeFromDb(c, r)); setReqs(r); setBriefs(b); } })
      .catch(() => {});
    getAppSetting("budget_sheet_url").then((u) => {
      if (alive && u) { setSheetUrl(u); loadSheet(u); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Export the real rows the page shows, not the bundled mock data.
  const exportCsv = async () => {
    if (tab === "approval") {
      const all = await fetchExpenseRequests();
      download("expense-requests.csv", buildCsv(
        ["Ref", "Category", "Brand", "Campaign", "Requester", "Vendor", "Requested", "Approved", "Status", "Created"],
        all.filter((r) => brand === "all" || r.b === brand)
          .map((r) => [r.ref ?? "", r.category, brandName(r.b), r.campaign, r.requester ?? "", r.vendor ?? "", r.requested, r.approved, r.status, r.createdAt?.slice(0, 10) ?? ""]),
      ));
    } else if (tab === "roi") {
      const rows = categoryPnl(sheetRows, reqs, period, brand);
      const label = filterMonthKeys(period).join("_") || "period";
      download(`category-pnl-${label}.csv`, buildCsv(
        ["Period", "Category", "Budget", "Requested", "Approved", "Remaining"],
        rows.map((r) => [label, r.category, r.budget, r.requested, r.approved, r.budget - r.approved]),
      ));
    } else {
      const pnl = (fin?.pnl ?? []).filter((p) => brand === "all" || p.b === brand);
      download("campaign-pnl.csv", buildCsv(
        ["Campaign", "Brand", "Revenue", "Budget", "Expense", "Gross Profit", "ROI", "ROAS"],
        pnl.map((p) => [p.name, brandName(p.b), p.revenue, p.budget, p.expense, p.revenue - p.expense, p.roi + "x", p.roas + "x"]),
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
        {tab === "plan" && <BudgetPlanTab brand={brand} fin={fin} reqs={reqs} briefs={briefs} />}
        {tab === "roi" && (
          <CategoryPnlTab
            brand={brand} reqs={reqs} sheetRows={sheetRows} period={period} setPeriod={setPeriod}
            sheetUrl={sheetUrl} onSaveUrl={saveSheetUrl} onReload={() => loadSheet(sheetUrl)} status={sheetStatus}
          />
        )}
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
function BudgetPlanTab({ brand, fin, reqs, briefs }: { brand: BrandFilterValue; fin: FinanceView | null; reqs: ExpenseReq[]; briefs: Record<string, CampaignBrief> }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!fin) return <div className="text-[13px] text-faint text-center py-12">Loading…</div>;
  const rows = fin.pnl.filter((p) => brand === "all" || p.b === brand);
  const brandAlloc = fin.byBrand.filter((b) => brand === "all" || b.b === brand);
  const cats = fin.byCategory;
  const maxCat = Math.max(1, ...cats.map((c) => c.amount));

  return (
    <div className="flex flex-col gap-4">
      {/* Top KPI cards */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-card p-[18px]" style={{ background: "#211F1C", color: "#fff" }}>
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-accent">Total Plan</div>
          <div className="text-[25px] font-bold mt-[6px]">{baht(fin.totalPlan, { compact: true })}</div>
        </div>
        {([["Committed", fin.committed], ["Available", fin.available]] as const).map(([l, v]) => (
          <div key={l} className="bg-surface border border-line rounded-card p-[18px]">
            <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">{l}</div>
            <div className="text-[25px] font-bold mt-[6px] text-ink">{baht(v, { compact: true })}</div>
          </div>
        ))}
      </div>

      {/* Allocation panels */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[15px] font-bold mb-4">Allocation by brand</div>
          <div className="flex flex-col gap-[15px]">
            {brandAlloc.map((b) => {
              const pct = b.plan ? Math.round((b.spent / b.plan) * 100) : 0;
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
            {brandAlloc.length === 0 && <div className="text-[12.5px] text-faint py-2">No campaign budgets yet.</div>}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-cardLg p-5">
          <div className="text-[15px] font-bold mb-4">By category</div>
          <div className="flex flex-col gap-[15px]">
            {cats.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-[12.5px] mb-[5px]">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted">{baht(c.amount, { compact: true })}</span>
                </div>
                <Progress value={Math.round((c.amount / maxCat) * 100)} color="#B8945A" height={8} />
              </div>
            ))}
            {cats.length === 0 && <div className="text-[12.5px] text-faint py-2">No spending logged yet.</div>}
          </div>
        </div>
      </div>

      <BudgetProfitability rows={rows} open={open} setOpen={setOpen} reqs={reqs} briefs={briefs} />
    </div>
  );
}

function BudgetProfitability({ rows, open, setOpen, reqs, briefs }: {
  rows: PnlRow[]; open: Record<string, boolean>; setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  reqs: ExpenseReq[]; briefs: Record<string, CampaignBrief>;
}) {
  // Real breakdown: Budget side = the campaign brief's bucket allocation;
  // Actual side = expense requests logged against the campaign, by category.
  const detail = (p: PnlRow) => {
    const brief = briefs[p.name];
    const planned = brief ? budgetSummary(brief).byBucket.filter((b) => b.amount > 0) : [];
    const actualByCat = new Map<string, number>();
    for (const r of reqs.filter((r) => r.campaign === p.name)) {
      actualByCat.set(r.category, (actualByCat.get(r.category) || 0) + (r.approved || r.requested || 0));
    }
    const labels = [...new Set([...planned.map((b) => b.label), ...actualByCat.keys()])];
    return labels.map((label) => ({
      label,
      budget: planned.find((b) => b.label === label)?.amount ?? 0,
      actual: actualByCat.get(label) ?? 0,
    }));
  };
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
                {detail(p).length === 0 && (
                  <div className="py-[7px] text-[12px] text-faint">No breakdown yet — this campaign has no brief allocation or logged expenses.</div>
                )}
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
      {rows.length === 0 && <div className="px-5 py-8 text-[12.5px] text-faint text-center">No campaigns yet — add one to see profitability.</div>}
    </div>
  );
}

/* ── P&L by Category — monthly budgets from the Finance Google Sheet ── */
function CategoryPnlTab({ brand, reqs, sheetRows, period, setPeriod, sheetUrl, onSaveUrl, onReload, status }: {
  brand: BrandFilterValue; reqs: ExpenseReq[]; sheetRows: SheetBudgetRow[];
  period: PeriodFilter; setPeriod: (f: PeriodFilter) => void;
  sheetUrl: string; onSaveUrl: (url: string) => void; onReload: () => void; status: string;
}) {
  const [urlDraft, setUrlDraft] = useState(sheetUrl);
  const [openCat, setOpenCat] = useState<Record<string, boolean>>({});
  useEffect(() => setUrlDraft(sheetUrl), [sheetUrl]);

  const rows = categoryPnl(sheetRows, reqs, period, brand);
  const tot = rows.reduce((a, r) => ({ budget: a.budget + r.budget, requested: a.requested + r.requested, approved: a.approved + r.approved }), { budget: 0, requested: 0, approved: 0 });
  const periodLabel = period.mode === "month" ? `${MONTHS[period.month]} ${period.year}` : `${period.start} → ${period.end}`;
  const cols = "2fr 1.1fr 1.1fr 1.1fr 1.1fr 1.4fr";

  return (
    <div className="flex flex-col gap-4">
      {/* Google Sheet connection */}
      <div className="bg-surface border border-line rounded-cardLg p-5">
        <div className="text-[13px] font-bold mb-1">งบประมาณรายเดือนจาก Google Sheet</div>
        <div className="text-[11.5px] text-faint mb-3">
          แชร์ sheet แบบ <b className="text-muted">Anyone with the link · Viewer</b> แล้ววางลิงก์ด้านล่าง ·
          คอลัมน์: <b className="text-muted">A = เดือน (2026-07) · B = Category · C = Budget (บาท)</b> — แก้งบใน sheet แล้วกดโหลดใหม่ได้เลย
        </div>
        <div className="flex gap-2 flex-wrap">
          <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"
            className="flex-1 min-w-[260px] text-[13px] px-[13px] py-[9px] rounded-[10px] border border-line2 bg-ivory outline-none" />
          <button onClick={() => onSaveUrl(urlDraft)} disabled={!urlDraft.trim() || urlDraft === sheetUrl}
            className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 disabled:opacity-40">บันทึก & โหลด</button>
          {sheetUrl && <button onClick={onReload} className="text-[12.5px] font-bold text-muted border border-line2 rounded-[9px] px-4 bg-white">โหลดใหม่</button>}
          {sheetUrl && <a href={sheetUrl} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-muted border border-line2 rounded-[9px] px-4 py-[8px] bg-white">เปิด Sheet ↗</a>}
        </div>
        {status && <div className="text-[12px] mt-2" style={{ color: status.startsWith("⚠") ? "#B33A2E" : "#4E7A4E" }}>{status}</div>}
      </div>

      {/* Period picker — day-level range up to whole months/years */}
      <DateFilterBar value={period} onChange={setPeriod}
        trailing={brand !== "all" ? <span>ตัวกรองแบรนด์มีผลกับยอดเบิกจริงเท่านั้น</span> : undefined} />

      {/* Category table */}
      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="px-5 py-3 text-[13px] font-bold border-b border-line4">P&amp;L by Category · {periodLabel}</div>
        <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: cols }}>
          <div>Category</div><div>Budget</div><div>เบิกแล้ว</div><div>อนุมัติแล้ว</div><div>คงเหลือ</div><div>ใช้ไป</div>
        </div>
        {rows.map((r) => {
          const remaining = r.budget - r.approved;
          const pct = r.budget ? Math.round((r.approved / r.budget) * 100) : 0;
          const over = r.budget > 0 && r.approved > r.budget;
          const isOpen = openCat[r.category];
          // Drill-down: the expense requests (with their campaigns) that make up
          // this category's actual, for the selected period + brand.
          const contrib = reqs.filter((x) => x.category === r.category && x.createdAt && inDateFilter(period, x.createdAt) && (brand === "all" || x.b === brand) && x.status !== "Draft" && x.status !== "Rejected");
          const byCampaign = new Map<string, { requested: number; approved: number }>();
          for (const x of contrib) { const k = x.campaign || "—"; const v = byCampaign.get(k) ?? { requested: 0, approved: 0 }; v.requested += x.requested || 0; v.approved += x.approved || 0; byCampaign.set(k, v); }
          return (
            <div key={r.category} className="border-b border-line4 last:border-0">
              <button onClick={() => setOpenCat((o) => ({ ...o, [r.category]: !o[r.category] }))} className="w-full grid px-5 py-3 items-center gap-y-1 text-left hover:bg-ivory/50" style={{ gridTemplateColumns: cols }}>
                <span className="text-[13px] font-bold text-ink flex items-center gap-[6px]"><span className="text-faint text-[10px] w-3">{contrib.length ? (isOpen ? "▾" : "▸") : ""}</span>{r.category}</span>
                <span className="text-[13px] text-muted">{r.budget ? baht(r.budget, { compact: true }) : "—"}</span>
                <span className="text-[13px] text-ink">{baht(r.requested, { compact: true })}{contrib.length ? <span className="text-[10.5px] text-faint"> · {byCampaign.size} camp.</span> : null}</span>
                <span className="text-[13px] font-semibold" style={{ color: r.approved ? "#4E7A4E" : "#9A9387" }}>{baht(r.approved, { compact: true })}</span>
                <span className="text-[13px] font-semibold" style={{ color: over ? "#B33A2E" : "#211F1C" }}>{r.budget ? baht(remaining, { compact: true }) : "—"}</span>
                <span className="flex items-center gap-2">
                  <span className="flex-1"><Progress value={Math.min(100, pct)} color={over ? "#B33A2E" : pct > 85 ? "#C68A1E" : "#4E7A4E"} height={7} /></span>
                  <span className="text-[11.5px] font-bold w-[42px] text-right" style={{ color: over ? "#B33A2E" : "#6b6258" }}>{r.budget ? `${pct}%` : "—"}</span>
                </span>
              </button>
              {isOpen && (
                <div className="bg-ivory/60 px-5 pb-3 pt-1">
                  {byCampaign.size === 0 ? (
                    <div className="text-[11.5px] text-faint py-1 pl-6">ยังไม่มีคำขอเบิกในหมวดนี้สำหรับช่วงที่เลือก</div>
                  ) : [...byCampaign.entries()].sort((a, b) => b[1].approved - a[1].approved).map(([camp, v]) => (
                    <div key={camp} className="grid px-1 py-[5px] items-center text-[12px] border-b border-line4/60 last:border-0" style={{ gridTemplateColumns: "2fr 1.1fr 1.1fr 1.1fr 1.1fr 1.4fr" }}>
                      <span className="pl-6 text-muted truncate">🎯 {camp}</span>
                      <span></span>
                      <span className="text-ink">{baht(v.requested, { compact: true })}</span>
                      <span className="font-semibold" style={{ color: v.approved ? "#4E7A4E" : "#9A9387" }}>{baht(v.approved, { compact: true })}</span>
                      <span></span><span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-5 py-10 text-[12.5px] text-faint text-center">
            ยังไม่มีข้อมูลช่วงนี้ — {sheetUrl ? "เพิ่มงบช่วงนี้ใน Google Sheet แล้วกดโหลดใหม่" : "เชื่อม Google Sheet ด้านบนเพื่อตั้งงบรายหมวด"}
          </div>
        )}
        {rows.length > 0 && (
          <div className="grid px-5 py-3 items-center bg-ivory/70 font-bold" style={{ gridTemplateColumns: cols }}>
            <span className="text-[12px]">Total</span>
            <span className="text-[13px]">{baht(tot.budget, { compact: true })}</span>
            <span className="text-[13px]">{baht(tot.requested, { compact: true })}</span>
            <span className="text-[13px]">{baht(tot.approved, { compact: true })}</span>
            <span className="text-[13px]" style={{ color: tot.approved > tot.budget && tot.budget > 0 ? "#B33A2E" : "#211F1C" }}>{baht(tot.budget - tot.approved, { compact: true })}</span>
            <span></span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Approval: pending requests + signature ────────────────────────── */
function ApprovalTab({ brand }: { brand: BrandFilterValue }) {
  const [approved, setApproved] = useState<Record<number, boolean>>({});
  const [signing, setSigning] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [rejected, setRejected] = useState<Record<number, boolean>>({});
  const [allReqs, setAllReqs] = useState<ExpenseReq[]>([]);
  const { member, user } = useAuth();
  const approverName = member?.name || user?.email?.split("@")[0] || "CMO";
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
    approveExpenseRequest(r, r.requested);
  };
  const reject = (i: number, r: ExpenseReq) => {
    if (!reason.trim()) return;
    setRejected((a) => ({ ...a, [i]: true }));
    setRejecting(null);
    rejectExpenseRequest(r, reason.trim(), approverName);
    setReason("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12px] text-faint">
          {allReqs.filter((r, i) => !approved[i] && !rejected[i] && r.status === "Waiting Approval").length} request(s) waiting for your approval.
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
        const isRejected = rejected[i] || r.status === "Rejected";
        const isApproved = !isRejected && (approved[i] || r.status !== "Waiting Approval");
        const isPending = !isApproved && !isRejected;
        const wait = daysWaiting(r.createdAt);
        return (
          <div key={i} className="bg-surface border border-line rounded-cardLg p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <BrandDot brand={r.b} size={8} />
                  <span className="text-[14px] font-bold text-ink">{r.category}</span>
                </div>
                <div className="text-[12px] text-faint mt-1">
                  {r.campaign}{r.requester ? <> · โดย {r.requester}</> : null} · requested {baht(r.requested, { compact: true })}
                  {isPending && wait !== null && <> · <b style={{ color: wait >= 2 ? "#B33A2E" : "#C68A1E" }}>รอมา {wait} วัน</b></>}
                </div>
              </div>
              {isRejected ? (
                <StatusBadge tone="red">✕ Rejected</StatusBadge>
              ) : isApproved ? (
                <StatusBadge tone="green">✓ Approved</StatusBadge>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setRejecting(rejecting === i ? null : i); setSigning(null); }} className="text-[12.5px] font-bold rounded-[9px] px-4 py-[8px]" style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
                    {rejecting === i ? "Cancel" : "✕ Reject"}
                  </button>
                  {sig ? (
                    <button onClick={() => approve(i, r)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">✓ Confirm &amp; Approve</button>
                  ) : (
                    <button onClick={() => { setSigning(signing === i ? null : i); setRejecting(null); }} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">
                      {signing === i ? "Cancel" : "✓ Approve"}
                    </button>
                  )}
                </div>
              )}
            </div>
            {signing === i && isPending && !sig && (
              <div className="mt-4 pt-4 border-t border-line4">
                <div className="text-[12px] font-semibold text-muted mb-2">Sign once — we’ll remember it for next time</div>
                <SignaturePad confirmLabel="Save signature &amp; Approve" onSave={(dataUrl) => { saveSignature(dataUrl); setSig(dataUrl); approve(i, r); }} />
              </div>
            )}
            {rejecting === i && isPending && (
              <div className="mt-4 pt-4 border-t border-line4 flex gap-2 flex-wrap items-center">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ตีกลับ (จำเป็น) เช่น ขอใบเสนอราคาก่อน" autoFocus
                  className="flex-1 min-w-[220px] text-[13px] px-[12px] py-[9px] rounded-[9px] border border-line2 bg-ivory outline-none" />
                <button onClick={() => reject(i, r)} disabled={!reason.trim()} className="text-[12.5px] font-bold text-white rounded-[9px] px-4 py-[8px] disabled:opacity-40" style={{ background: "#B33A2E" }}>
                  Reject &amp; Send back
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
