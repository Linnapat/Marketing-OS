"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, ExternalLink, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { notify } from "@/lib/notify";
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
import { CampaignRow } from "@/lib/data/campaigns";
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
export interface SheetBudgetRow { month: string; category: string; budget: number; group?: string; brand?: BrandFilterValue; }
interface CatPnlRow { section: string; category: string; budget: number; requested: number; approved: number; }

function fallbackSection(category: string): string {
  const value = category.toLowerCase();
  if (/crm|line oa|line broadcast|loyalty|member|coupon/.test(value)) return "CRM";
  if (/creative|graphic|production|photo|shoot|printing|posm|content|video|artwork|design/.test(value)) return "Creative & Production";
  if (/office|rent|salary|system|website|cloud|eatlab|agency|outsource|admin|software|subscription/.test(value)) return "Office & Administration";
  return "Marketing";
}

/** One row per category for the selected period: Budget (sheet months covered
 *  by the period, summed) vs the real expense requests logged in the period.
 *  When a brand is selected, both budget and actual must belong to that brand. */
function categoryPnl(sheetRows: SheetBudgetRow[], reqs: ExpenseReq[], f: PeriodFilter, brand: BrandFilterValue): CatPnlRow[] {
  const monthKeys = new Set(filterMonthKeys(f));
  const budgets = new Map<string, { amount: number; section: string }>();
  for (const r of sheetRows) {
    if (!monthKeys.has(r.month)) continue;
    if (brand !== "all" && r.brand !== brand) continue;
    const current = budgets.get(r.category);
    budgets.set(r.category, {
      amount: (current?.amount || 0) + r.budget,
      section: r.group || current?.section || fallbackSection(r.category),
    });
  }
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
      section: budgets.get(category)?.section || fallbackSection(category),
      budget: budgets.get(category)?.amount || 0,
      requested: requested.get(category) || 0,
      approved: approved.get(category) || 0,
    }))
    .sort((a, b) => b.budget - a.budget || b.requested - a.requested);
}

function budgetPlanCategories(reqs: ExpenseReq[], brand: BrandFilterValue) {
  const catMap = new Map<string, number>();
  for (const r of reqs) {
    if (brand !== "all" && r.b !== brand) continue;
    if (r.status === "Draft" || r.status === "Rejected") continue;
    catMap.set(r.category, (catMap.get(r.category) || 0) + (r.requested || 0));
  }
  return Array.from(catMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
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
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
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
      .then(([c, r, b]) => { if (alive) { setFin(financeFromDb(c, r)); setCampaigns(c); setReqs(r); setBriefs(b); } })
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
        {tab === "plan" && <BudgetPlanTab brand={brand} fin={fin} reqs={reqs} briefs={briefs} period={period} setPeriod={setPeriod} />}
        {tab === "roi" && (
          <CategoryPnlTab
            brand={brand} reqs={reqs} sheetRows={sheetRows} period={period} setPeriod={setPeriod}
            campaigns={campaigns}
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
function BudgetPlanTab({ brand, fin, reqs, briefs, period, setPeriod }: {
  brand: BrandFilterValue; fin: FinanceView | null; reqs: ExpenseReq[]; briefs: Record<string, CampaignBrief>;
  period: PeriodFilter; setPeriod: (f: PeriodFilter) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!fin) return <div className="text-[13px] text-faint text-center py-12">Loading…</div>;
  const filteredReqs = reqs.filter((r) => inDateFilter(period, r.createdAt));
  const rows = fin.pnl.filter((p) => brand === "all" || p.b === brand);
  const brandAlloc = fin.byBrand
    .filter((b) => brand === "all" || b.b === brand)
    .map((b) => ({ ...b }));
  const totalPlan = brand === "all" ? fin.totalPlan : brandAlloc.reduce((sum, row) => sum + row.plan, 0);
  const committed = brandAlloc.reduce((sum, row) => sum + row.spent, 0);
  const available = totalPlan - committed;
  const cats = budgetPlanCategories(filteredReqs, brand);
  const maxCat = Math.max(1, ...cats.map((c) => c.amount));
  const periodLabel = period.mode === "year"
    ? `${period.year}`
    : period.mode === "month"
      ? `${MONTHS[period.month]} ${period.year}`
      : `${period.start} → ${period.end}`;

  return (
    <div className="flex flex-col gap-4">
      <DateFilterBar
        value={period}
        onChange={setPeriod}
        trailing={brand !== "all" ? <span>กำลังแสดง Budget Plan เฉพาะ {brandName(brand)}</span> : undefined}
      />

      {/* Top KPI cards */}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-card p-[18px]" style={{ background: "#211F1C", color: "#fff" }}>
          <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-accent">Total Plan</div>
          <div className="text-[25px] font-bold mt-[6px]">{baht(totalPlan, { compact: true })}</div>
          <div className="text-[11px] text-white/60 mt-1">{periodLabel}</div>
        </div>
        {([["Committed", committed], ["Available", available]] as const).map(([l, v]) => (
          <div key={l} className="bg-surface border border-line rounded-card p-[18px]">
            <div className="text-[11px] tracking-[0.07em] uppercase font-bold text-faint">{l}</div>
            <div className="text-[25px] font-bold mt-[6px] text-ink">{baht(v, { compact: true })}</div>
            <div className="text-[11px] text-faint mt-1">{periodLabel}</div>
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
  const profitGridCols = "0.4fr 2fr 1.2fr 1.1fr 1.1fr 1.1fr 0.8fr 0.8fr";
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
        style={{ gridTemplateColumns: profitGridCols }}>
        <div></div><div>Campaign</div><div>Revenue</div><div>Budget</div><div>Expense</div><div>Gross Profit</div><div>ROI</div><div>ROAS</div>
      </div>
      {rows.map((p) => {
        const gp = p.revenue - p.expense;
        const isOpen = open[p.name];
        return (
          <div key={p.name} className="border-b border-line4 last:border-0">
            <button onClick={() => setOpen((o) => ({ ...o, [p.name]: !o[p.name] }))}
              className="w-full grid gap-y-1 px-5 py-3 items-center text-left hover:bg-ivory/60"
              style={{ gridTemplateColumns: profitGridCols }}>
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
                  <div key={d.label} className="grid gap-y-1 py-[7px] text-[12px] items-center" style={{ gridTemplateColumns: profitGridCols }}>
                    <span></span>
                    <span className="text-muted">{d.label}</span>
                    <span></span>
                    <span className="text-faint">{baht(d.budget, { compact: true })}</span>
                    <span className="text-ink font-semibold">{baht(d.actual, { compact: true })}</span>
                    <span></span>
                    <span></span>
                    <span></span>
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
const PNL_COST_CENTERS = ["marketing", "crm", "creative", "office"] as const;
type PnlCostCenter = (typeof PNL_COST_CENTERS)[number];

const COST_CENTER_LABEL: Record<PnlCostCenter, string> = {
  marketing: "Marketing", crm: "CRM", creative: "Creative", office: "Office",
};

/** Expense requests do not have a cost-centre field yet. Keep the fallback in
 * one place so the matrix is stable now and easy to replace with a DB field. */
function categoryCostCenter(category: string): PnlCostCenter {
  const value = category.toLowerCase();
  if (/crm|line oa|line broadcast|loyalty|member|coupon/.test(value)) return "crm";
  if (/creative|graphic|production|photo|shoot|printing|posm|content|video|artwork|design/.test(value)) return "creative";
  if (/office|rent|salary|system|website|cloud|eatlab|agency|outsource|admin|software|subscription/.test(value)) return "office";
  return "marketing";
}

function CategoryPnlTab({ brand, reqs, sheetRows, period, setPeriod, sheetUrl, onSaveUrl, onReload, status, campaigns }: {
  brand: BrandFilterValue; reqs: ExpenseReq[]; sheetRows: SheetBudgetRow[];
  period: PeriodFilter; setPeriod: (f: PeriodFilter) => void;
  sheetUrl: string; onSaveUrl: (url: string) => void; onReload: () => void; status: string;
  campaigns: CampaignRow[];
}) {
  const [urlDraft, setUrlDraft] = useState(sheetUrl);
  const [sheetConfigOpen, setSheetConfigOpen] = useState(false);
  const [openSection, setOpenSection] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  useEffect(() => setUrlDraft(sheetUrl), [sheetUrl]);

  const rows = categoryPnl(sheetRows, reqs, period, brand);
  const periodLabel = period.mode === "year"
    ? `${period.year}`
    : period.mode === "month"
      ? `${MONTHS[period.month]} ${period.year}`
      : `${period.start} → ${period.end}`;
  const cols = "minmax(220px,2fr) repeat(8,minmax(82px,1fr)) minmax(100px,1fr)";
  const campaignByName = new Map(campaigns.map((campaign) => [campaign.name, campaign]));
  const categoryContributors = (category: string) => reqs.filter((request) =>
    request.category === category && request.createdAt && inDateFilter(period, request.createdAt) &&
    (brand === "all" || request.b === brand) && request.status !== "Draft" && request.status !== "Rejected"
  );
  const selectedContributors = selectedCategory ? categoryContributors(selectedCategory) : [];
  const visibleRows = rows.filter((row) => row.section.trim().toLowerCase() !== "marketing");
  const sections = Array.from(new Set(visibleRows.map((row) => row.section))).map((section) => ({
    section,
    rows: visibleRows.filter((row) => row.section === section),
  }));
  const grandTotals = Object.fromEntries(PNL_COST_CENTERS.map((center) => {
    const centerRows = visibleRows.filter((row) => categoryCostCenter(row.category) === center);
    return [center, {
      budget: centerRows.reduce((sum, row) => sum + row.budget, 0),
      actual: centerRows.reduce((sum, row) => sum + row.approved, 0),
    }];
  })) as Record<PnlCostCenter, { budget: number; actual: number }>;
  const totalBudget = PNL_COST_CENTERS.reduce((sum, center) => sum + grandTotals[center].budget, 0);
  const totalActual = PNL_COST_CENTERS.reduce((sum, center) => sum + grandTotals[center].actual, 0);
  const totalRemaining = totalBudget - totalActual;
  const totalUsedPct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
  const overBudgetItems = visibleRows.filter((row) => row.budget > 0 && row.approved > row.budget).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Google Sheet connection */}
      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <button onClick={() => setSheetConfigOpen((open) => !open)} aria-expanded={sheetConfigOpen} className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-ivory/40">
          <span>
            <span className="text-[13px] font-bold text-ink">Google Sheet Budget</span>
            <span className="text-[11.5px] ml-3" style={{ color: status.startsWith("⚠") ? "#B33A2E" : sheetUrl ? "#4E7A4E" : "#9A9387" }}>
              {status || (sheetUrl ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ")}
            </span>
          </span>
          {sheetConfigOpen ? <ChevronDown size={16} className="text-faint" /> : <ChevronRight size={16} className="text-faint" />}
        </button>
        {sheetConfigOpen && (
          <div className="px-5 pb-5 pt-1 border-t border-line4">
            <div className="text-[11.5px] text-faint my-3">
              แชร์ sheet แบบ <b className="text-muted">Anyone with the link · Viewer</b> แล้ววางลิงก์ด้านล่าง ·
              คอลัมน์: <b className="text-muted">A = เดือน (2026-07) · B = Category · C = Budget (บาท) · D = Brand (ถ้ามี)</b>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"
                className="flex-1 min-w-[260px] text-[13px] px-[13px] py-[9px] rounded-[10px] border border-line2 bg-ivory outline-none" />
              <button onClick={() => onSaveUrl(urlDraft)} disabled={!urlDraft.trim() || urlDraft === sheetUrl}
                className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 disabled:opacity-40">บันทึก & โหลด</button>
              {sheetUrl && <button onClick={onReload} className="text-[12.5px] font-bold text-muted border border-line2 rounded-[9px] px-4 bg-white">โหลดใหม่</button>}
              {sheetUrl && <a href={sheetUrl} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-muted border border-line2 rounded-[9px] px-4 py-[8px] bg-white">เปิด Sheet ↗</a>}
            </div>
          </div>
        )}
      </div>

      {/* Period picker — day-level range up to whole months/years */}
      <DateFilterBar value={period} onChange={setPeriod}
        trailing={brand !== "all" ? <span>กำลังแสดง Budget และ Actual เฉพาะ {brandName(brand)}</span> : undefined} />

      {/* P&L summary dashboard */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-card border border-line p-4" style={{ background: "#FBF6EA" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">Total Budget</div>
          <div className="text-[23px] font-bold text-ink mt-1">{baht(totalBudget, { compact: true })}</div>
          <div className="text-[11px] text-muted mt-1">{brand === "all" ? "ทุกแบรนด์" : brandName(brand)} · {periodLabel}</div>
        </div>
        <div className="rounded-card border border-line p-4" style={{ background: "#F2F8F1" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">Actual Used</div>
          <div className="text-[23px] font-bold text-ink mt-1">{baht(totalActual, { compact: true })}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="flex-1"><Progress value={Math.min(100, totalUsedPct)} color={totalUsedPct > 100 ? "#B33A2E" : totalUsedPct > 85 ? "#C68A1E" : "#4E7A4E"} height={6} /></span>
            <span className="text-[11px] font-bold text-muted">{totalUsedPct}%</span>
          </div>
        </div>
        <div className="rounded-card border p-4" style={{ background: totalRemaining < 0 ? "#FFF2F0" : "#F5F7F3", borderColor: totalRemaining < 0 ? "#F5C8C4" : "#E3E0D8" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">{totalRemaining < 0 ? "Over Budget" : "Remaining"}</div>
          <div className="text-[23px] font-bold mt-1" style={{ color: totalRemaining < 0 ? "#B33A2E" : "#4E7A4E" }}>{baht(Math.abs(totalRemaining), { compact: true })}</div>
          <div className="text-[11px] text-muted mt-1">Budget − Actual</div>
        </div>
        <div className="rounded-card border p-4" style={{ background: overBudgetItems ? "#FFF5F4" : "#F5F7F3", borderColor: overBudgetItems ? "#F5C8C4" : "#E3E0D8" }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">Budget Health</div>
          <div className="text-[18px] font-bold mt-2" style={{ color: overBudgetItems ? "#B33A2E" : "#4E7A4E" }}>{overBudgetItems ? `เกินงบ ${overBudgetItems} รายการ` : "อยู่ในงบ"}</div>
          <div className="text-[11px] text-muted mt-1">{overBudgetItems ? "ตรวจรายการสีแดงด้านล่าง" : "ยังไม่มีรายการใช้เกิน"}</div>
        </div>
      </div>

      {/* Over-budget alert — the sheet budget is the monthly cap; campaign
          expenses draw it down. Hard = approved already exceeds; soft = pending
          requests would exceed. */}
      {(() => {
        const hard = rows.filter((r) => r.budget > 0 && r.approved > r.budget);
        const soft = rows.filter((r) => r.budget > 0 && r.approved <= r.budget && r.approved + r.requested > r.budget);
        if (!hard.length && !soft.length) return null;
        const line = (r: CatPnlRow, over: number) => `${r.category} เกิน ${baht(over, { compact: true })} (${baht(r.approved, { compact: true })}/${baht(r.budget, { compact: true })})`;
        const notifyOver = () => {
          const parts = [...hard.map((r) => line(r, r.approved - r.budget)), ...soft.map((r) => line(r, r.approved + r.requested - r.budget))];
          notify("approval", `⚠️ งบเกินเพดาน ${hard.length + soft.length} หมวด · ${periodLabel}`, parts.join("\n"), "/finance");
        };
        return (
          <div className="rounded-cardLg px-5 py-4" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div className="text-[13px] font-bold text-status-red">⚠️ เกินงบ {hard.length} หมวด{soft.length ? ` · ใกล้เกิน (รออนุมัติ) ${soft.length} หมวด` : ""}</div>
              <button onClick={notifyOver} className="text-[12px] font-bold text-white rounded-[9px] px-3 py-[6px]" style={{ background: "#B33A2E" }}>แจ้งเตือนทีม (LINE/Email)</button>
            </div>
            <div className="flex flex-col gap-[3px]">
              {hard.map((r) => <div key={r.category} className="text-[12px] text-status-red">🔴 <b>{r.category}</b> — อนุมัติ {baht(r.approved, { compact: true })} เกินงบ {baht(r.budget, { compact: true })} อยู่ <b>{baht(r.approved - r.budget, { compact: true })}</b></div>)}
              {soft.map((r) => <div key={r.category} className="text-[12px]" style={{ color: "#C2691E" }}>🟠 <b>{r.category}</b> — อนุมัติแล้ว {baht(r.approved, { compact: true })} + รออนุมัติ {baht(r.requested, { compact: true })} จะเกินงบ {baht(r.budget, { compact: true })}</div>)}
            </div>
          </div>
        );
      })()}

      {/* Category table */}
      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="px-5 py-3 border-b border-line4 flex items-center justify-between gap-3">
          <div className="text-[13px] font-bold">P&amp;L · {periodLabel}</div>
          <div className="text-[11px] text-faint">เลือก Category เพื่อดู Campaign ที่เกี่ยวข้อง</div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1180px]">
            <div className="grid px-5 pt-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold" style={{ gridTemplateColumns: cols }}>
              <div>Section / Category</div>
              {PNL_COST_CENTERS.map((center) => <div key={center} className="text-center border-l border-line4" style={{ gridColumn: "span 2" }}>{COST_CENTER_LABEL[center]}</div>)}
              <div className="text-right sticky right-0 bg-surface pl-2 border-l border-line4">Diff</div>
            </div>
            <div className="grid px-5 pb-2 pt-1 text-[9.5px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: cols }}>
              <div></div>
              {PNL_COST_CENTERS.flatMap((center) => [
                <div key={`${center}-budget`} className="text-right border-l border-line4 px-2 py-1 -my-1" style={{ background: "#FBF6EA" }}>Budget</div>,
                <div key={`${center}-actual`} className="text-right border-l border-line4 px-2 py-1 -my-1" style={{ background: "#F2F8F1" }}>Actual</div>,
              ])}
              <div className="text-right sticky right-0 bg-surface pl-2 border-l border-line4">Budget − Actual</div>
            </div>
            {sections.map((section) => {
              const isOpen = Boolean(openSection[section.section]);
              const sectionRows = section.rows;
              const totals = Object.fromEntries(PNL_COST_CENTERS.map((center) => {
                const centerRows = sectionRows.filter((row) => categoryCostCenter(row.category) === center);
                return [center, {
                  budget: centerRows.reduce((sum, row) => sum + row.budget, 0),
                  actual: centerRows.reduce((sum, row) => sum + row.approved, 0),
                }];
              })) as Record<PnlCostCenter, { budget: number; actual: number }>;
              const sectionBudget = PNL_COST_CENTERS.reduce((sum, center) => sum + totals[center].budget, 0);
              const sectionActual = PNL_COST_CENTERS.reduce((sum, center) => sum + totals[center].actual, 0);
              return (
                <div key={section.section} className="border-b border-line4 last:border-0">
                  <button onClick={() => setOpenSection((open) => ({ ...open, [section.section]: !open[section.section] }))}
                    className="w-full grid px-5 py-3 items-center text-left bg-ivory/65 hover:bg-ivory" style={{ gridTemplateColumns: cols }}>
                    <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                      {isOpen ? <ChevronDown size={14} className="text-faint" /> : <ChevronRight size={14} className="text-faint" />}
                      {section.section}
                    </span>
                    {PNL_COST_CENTERS.flatMap((center) => [
                      <span key={`${center}-budget`} className="text-[12.5px] font-semibold text-right self-stretch flex items-center justify-end border-l border-line4 px-2 -my-3" style={{ background: "#FBF6EA" }}>{baht(totals[center].budget, { compact: true })}</span>,
                      <span key={`${center}-actual`} className="text-[12.5px] font-semibold text-right self-stretch flex items-center justify-end border-l border-line4 px-2 -my-3" style={{ background: "#F2F8F1" }}>{baht(totals[center].actual, { compact: true })}</span>,
                    ])}
                    <span className="text-[13px] font-bold text-right sticky right-0 bg-ivory pl-2 border-l border-line4" style={{ color: sectionBudget - sectionActual < 0 ? "#B33A2E" : "#4E7A4E" }}>{baht(sectionBudget - sectionActual, { compact: true })}</span>
                  </button>
                  {isOpen && sectionRows.map((row) => {
                    const center = categoryCostCenter(row.category);
                    const campaignCount = new Set(categoryContributors(row.category).map((request) => request.campaign).filter((name) => name && name !== "—")).size;
                    return (
                      <button key={`${section.section}-${row.category}`} onClick={() => setSelectedCategory(row.category)}
                        className="w-full grid px-5 py-[10px] items-center text-left hover:bg-ivory/45 border-t border-line4/60" style={{ gridTemplateColumns: cols }}>
                        <span className="pl-6 text-[12.5px] text-muted flex items-center gap-2 min-w-0">
                          <span className="truncate">{row.category}</span>
                          {campaignCount > 0 && <span className="shrink-0 text-[10px] font-bold text-accent">ดูรายละเอียด</span>}
                        </span>
                        {PNL_COST_CENTERS.flatMap((column) => [
                          <span key={`${column}-budget`} className="text-[12.5px] text-right text-muted self-stretch flex items-center justify-end border-l border-line4 px-2 -my-[10px]" style={{ background: "#FFFCF5" }}>{column === center ? baht(row.budget, { compact: true }) : "—"}</span>,
                          <span key={`${column}-actual`} className="text-[12.5px] text-right text-muted self-stretch flex items-center justify-end border-l border-line4 px-2 -my-[10px]" style={{ background: "#F8FBF7" }}>{column === center ? baht(row.approved, { compact: true }) : "—"}</span>,
                        ])}
                        <span className="text-[12.5px] font-semibold text-right sticky right-0 bg-surface pl-2 border-l border-line4" style={{ color: row.budget - row.approved < 0 ? "#B33A2E" : "#4E7A4E" }}>{baht(row.budget - row.approved, { compact: true })}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {visibleRows.length > 0 && (() => {
              const budget = PNL_COST_CENTERS.reduce((sum, center) => sum + grandTotals[center].budget, 0);
              const actual = PNL_COST_CENTERS.reduce((sum, center) => sum + grandTotals[center].actual, 0);
              return (
                <div className="grid px-5 py-3 items-center bg-panel text-white border-t-2 border-line2" style={{ gridTemplateColumns: cols }}>
                  <span className="text-[13px] font-bold">Grand Total</span>
                  {PNL_COST_CENTERS.flatMap((center) => [
                    <span key={`${center}-grand-budget`} className="text-[12.5px] font-semibold text-right border-l border-white/15 px-2">{baht(grandTotals[center].budget, { compact: true })}</span>,
                    <span key={`${center}-grand-actual`} className="text-[12.5px] font-semibold text-right border-l border-white/15 px-2">{baht(grandTotals[center].actual, { compact: true })}</span>,
                  ])}
                  <span className="text-[13px] font-bold text-right sticky right-0 bg-panel pl-2 border-l border-white/15" style={{ color: budget - actual < 0 ? "#FF9E94" : "#A8D5A8" }}>{baht(budget - actual, { compact: true })}</span>
                </div>
              );
            })()}
          </div>
        </div>
        {visibleRows.length === 0 && (
          <div className="px-5 py-10 text-[12.5px] text-faint text-center">
            ยังไม่มีข้อมูลช่วงนี้ — {sheetUrl ? "เพิ่มงบช่วงนี้ใน Google Sheet แล้วกดโหลดใหม่" : "เชื่อม Google Sheet ด้านบนเพื่อตั้งงบรายหมวด"}
          </div>
        )}
      </div>

      {selectedCategory && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Campaign detail for ${selectedCategory}`}>
          <button className="absolute inset-0 bg-black/25" aria-label="Close campaign detail" onClick={() => setSelectedCategory(null)} />
          <aside className="relative h-full w-full max-w-[460px] bg-surface shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-[0.07em] uppercase text-faint">Category detail</div>
                <div className="text-[16px] font-bold text-ink mt-1">{selectedCategory}</div>
                <div className="text-[11.5px] text-muted mt-1">{COST_CENTER_LABEL[categoryCostCenter(selectedCategory)]} · {brand === "all" ? "All Brands" : brandName(brand)}</div>
              </div>
              <button onClick={() => setSelectedCategory(null)} className="p-2 rounded-lg hover:bg-ivory" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="text-[12px] font-bold text-muted mb-3">Campaigns ที่ผูกกับรายการนี้</div>
              {selectedContributors.length === 0 ? (
                <div className="rounded-card border border-line bg-ivory p-4 text-[12px] text-faint">ยังไม่มี Campaign หรือคำขอเบิกที่ผูกกับ Category นี้ในช่วงที่เลือก</div>
              ) : Array.from(new Set(selectedContributors.map((request) => request.campaign).filter((name) => name && name !== "—"))).map((name) => {
                const campaign = campaignByName.get(name);
                const requests = selectedContributors.filter((request) => request.campaign === name);
                const requested = requests.reduce((sum, request) => sum + (request.requested || 0), 0);
                const approved = requests.reduce((sum, request) => sum + (request.approved || 0), 0);
                const card = (
                  <div className="rounded-card border border-line p-4 hover:bg-ivory/60">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-bold text-ink">{name}</span>
                      {campaign && <ExternalLink size={14} className="text-faint shrink-0" />}
                    </div>
                    <div className="text-[11.5px] text-muted mt-2">Requested {baht(requested, { compact: true })} · Approved {baht(approved, { compact: true })}</div>
                  </div>
                );
                return campaign ? <Link key={name} href={`/campaigns/${campaign.id}`}>{card}</Link> : <div key={name}>{card}</div>;
              })}
            </div>
          </aside>
        </div>
      )}
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
  const [period, setPeriod] = useState<PeriodFilter>({ ...DEFAULT_DATE_FILTER, mode: "range" });
  const { member, user } = useAuth();
  const approverName = member?.name || user?.email?.split("@")[0] || "CMO";
  const [sig, setSig] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSig(getSavedSignature("approver"));
    fetchExpenseRequests().then((r) => { if (alive) setAllReqs(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const rows = allReqs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (brand === "all" || r.b === brand) && inDateFilter(period, r.createdAt));
  const waitingCount = rows.filter(({ r, i }) => !approved[i] && !rejected[i] && r.status === "Waiting Approval").length;
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
      <DateFilterBar
        value={period}
        onChange={setPeriod}
        trailing={brand !== "all" ? <span>Approval เฉพาะ {brandName(brand)}</span> : <span>Approval ทุกแบรนด์</span>}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12px] text-faint">
          {waitingCount} request(s) waiting for your approval.
        </div>
        <div className="flex items-center gap-4 flex-wrap text-[11.5px] text-muted">
          <div className="flex items-center gap-2">
            <span className="font-semibold">ผู้อนุมัติ</span>
            {sig ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sig} alt="approver signature" className="h-6 border border-line3 rounded bg-white" />
                <button onClick={() => { clearSignature("approver"); setSig(null); }} className="font-bold text-accent">Change</button>
              </>
            ) : <span className="text-faint">ยังไม่มีลายเซ็น</span>}
          </div>
        </div>
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
                <div className="text-[12px] font-semibold text-muted mb-2">
                  Sign once — we’ll remember it for next time
                </div>
                <SignaturePad
                  confirmLabel="Save signature &amp; Approve"
                  onSave={(dataUrl) => {
                    saveSignature("approver", dataUrl);
                    setSig(dataUrl);
                    approve(i, r);
                  }}
                />
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
