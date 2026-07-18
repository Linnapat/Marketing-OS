"use client";

// Platform Performance — cross-campaign result roll-up, viewable by Platform or by
// Campaign. Updates actuals only; Save syncs the campaign's actual spend (budget
// stays fixed at the campaign). Actual values are edited in an Excel-like grid.
// Uses the shared PageHeader (per-module theme) and brand-visibility system.

import { toastError } from "@/lib/toast";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Save, Check } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Segmented } from "@/components/ui/Segmented";
import { DateFilterBar, DateFilter, DEFAULT_DATE_FILTER, rangeInFilter, rangeOverlapFraction, MONTHS } from "@/components/ui/DateFilterBar";
import { getAppSetting, setAppSetting } from "@/lib/db/appSettings";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useRole } from "@/lib/role";
import { canSeePlatformPerformance } from "@/lib/roleGates";
import Link from "next/link";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { Tone } from "@/lib/status";
import { baht, num, pct } from "@/lib/format";
import {
  CampaignResultRow, GroupDim, ResultStatusKey, RESULT_STATUS_META, aggregateBy, platformMeta, cpr,
  deriveResultRow, mergeBudgetAllocationRows,
} from "@/lib/data/campaignResult";
import { fetchAllResults, saveResults } from "@/lib/db/campaignResult";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignRow } from "@/lib/data/campaigns";
import { useAuth } from "@/lib/auth";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchKols } from "@/lib/db/kol";
import { CampaignBrief } from "@/lib/data/brief";
import { createTaskDb } from "@/lib/db/tasks";
import { Task } from "@/lib/data/tasks";

const ACCENT = "#0EA5A0"; // Platform Performance theme (matches PageHeader /platforms)

const now = new Date();
const WIDE_RANGE: DateFilter = {
  mode: "range", month: now.getMonth(), year: now.getFullYear(),
  start: `${now.getFullYear() - 1}-01-01`, end: `${now.getFullYear() + 1}-12-31`,
};

const CHIP_TONE: Record<string, { bg: string; fg: string }> = {
  accent: { bg: "#E3F7F5", fg: "#0B7F7A" },
  info: { bg: "#EEF1F8", fg: "#3E5C9A" },
  success: { bg: "#EEF4EE", fg: "#4E7A4E" },
  danger: { bg: "#FFF5F4", fg: "#B33A2E" },
  neutral: { bg: "#F0EDE6", fg: "#6b6258" },
};

/** Budget-alert badge: over budget (red), near cap ≥90% (gold), else in budget. */
function budgetAlert(plan: number, actual: number): { label: string; tone: Tone } {
  if (!actual) return { label: "—", tone: "neutral" };
  if (actual > plan) return { label: `เกินงบ ${baht(actual - plan, { compact: true })}`, tone: "red" };
  if (plan > 0 && actual / plan >= 0.9) return { label: "ใกล้เต็มงบ", tone: "gold" };
  return { label: "ในงบ", tone: "green" };
}

const tableHeaders = [
  "Budget", "Spent actual", "%", "Reach goal", "Actual", "%", "MKT visit goal", "Actual", "%", "CV%", "CPR", "CPC", "Alert budget", "Status",
];

const visitGoal = (r: CampaignResultRow) => Math.round((r.target || 0) * ((r.cvTargetPct || 0) / 100));
const percentOf = (actual: number, goal: number) => goal > 0 ? pct((actual / goal) * 100) : "—";
const groupMetric = (rows: CampaignResultRow[]) => {
  const sum = (f: (r: CampaignResultRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const budget = sum((r) => r.budget || 0);
  const spent = sum((r) => r.budgetActual || 0);
  const reachGoal = sum((r) => r.target || 0);
  const reachActual = sum((r) => r.reachActual || 0);
  const mktGoal = sum(visitGoal);
  const mktActual = sum((r) => r.marketingVisits || 0);
  return {
    budget, spent, reachGoal, reachActual, mktGoal, mktActual,
    budgetPct: percentOf(spent, budget),
    reachPct: percentOf(reachActual, reachGoal),
    mktPct: percentOf(mktActual, mktGoal),
    cv: reachActual > 0 && mktActual > 0 ? pct((mktActual / reachActual) * 100) : "—",
    cpr: cpr(reachActual > 0 && spent > 0 ? spent / reachActual : null),
    cpc: cpr(mktActual > 0 && spent > 0 ? spent / mktActual : null),
  };
};

const dominantStatus = (rows: CampaignResultRow[]): ResultStatusKey => {
  const counts = rows.reduce((acc, r) => {
    const status = deriveResultRow(r).status;
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {} as Record<ResultStatusKey, number>);
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as ResultStatusKey) ?? "pending";
};

const periodLabel = (dates?: string) => dates ? `Period: ${dates}` : "Period: —";

export default function PlatformsPage() {
  const { member } = useAuth();
  const { visibleBrands } = useBrandVisibility();
  const { role } = useRole();

  const [rows, setRows] = useState<CampaignResultRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [date, setDate] = useState<DateFilter>(WIDE_RANGE);
  // "entry" = โหมดลงผลรายเดือน: ทุก ad ของเดือนที่เลือกในตารางแก้ไขตารางเดียว
  const [dim, setDim] = useState<GroupDim | "entry">("campaign");
  const [alertOnly, setAlertOnly] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [briefs, setBriefs] = useState<Record<string, CampaignBrief>>({});
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseCampaignId, setReviseCampaignId] = useState("");
  const [reviseAmount, setReviseAmount] = useState("");
  const [reviseReason, setReviseReason] = useState("");
  const [reviseSent, setReviseSent] = useState(false);
  const savedRef = useRef<ReturnType<typeof setTimeout>>();

  const brandOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.b])) as Record<string, BrandId>, [campaigns]);
  const nameOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const datesOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.dates])), [campaigns]);

  useEffect(() => {
    let live = true;
    Promise.all([fetchAllResults(), fetchCampaigns(), fetchAllBriefs(), fetchKols()]).then(([res, camps, briefMap, kolRows]) => {
      if (!live) return;
      // KOL actuals feed the "Planned KOL" rows so this page matches KOL Performance.
      setRows(mergeBudgetAllocationRows(res, camps, briefMap, kolRows));
      setCampaigns(camps);
      setBriefs(briefMap);
      setLoading(false);
    });
      return () => { live = false; };
  }, []);

  // Brand visibility first (rows outside the user's brands never appear), then the
  // brand + period filters. BrandFilter itself normalizes `brand` to a visible one.
  const filtered = useMemo(
    () => rows.filter((r) => {
      const b = brandOf[r.campaignId];
      return visibleBrands.includes(b) &&
        (brand === "all" || b === brand) &&
        rangeInFilter(date, datesOf[r.campaignId]);
    }),
    [rows, visibleBrands, brand, brandOf, date, datesOf],
  );
  const groupDim: GroupDim = dim === "entry" ? "campaign" : dim;
  const groupsAll = useMemo(() => aggregateBy(filtered, groupDim, nameOf), [filtered, groupDim, nameOf]);
  const groups = useMemo(
    () => alertOnly ? groupsAll.filter((g) => budgetAlert(g.budgetPlan, g.budgetActual).tone === "red") : groupsAll,
    [groupsAll, alertOnly],
  );
  const rowsByGroup = useMemo(() => {
    const m: Record<string, CampaignResultRow[]> = {};
    for (const r of filtered) {
      const key = groupDim === "platform" ? (r.platform || "—") : r.campaignId;
      (m[key] ??= []).push(r);
    }
    return m;
  }, [filtered, groupDim]);

  // ── Monthly marketing targets — org-level, NOT per campaign. Stored as one
  // shared JSON blob keyed by "YYYY-MM"; shown whenever a month is selected.
  type MonthTarget = { reach?: number; visits?: number; conversions?: number; budget?: number };
  const [monthTargets, setMonthTargets] = useState<Record<string, MonthTarget>>({});
  useEffect(() => {
    getAppSetting("monthly_marketing_targets_v1").then((raw) => {
      if (!raw) return;
      try { setMonthTargets(JSON.parse(raw)); } catch { /* keep empty */ }
    }).catch(() => {});
  }, []);
  const monthKey = date.mode === "month" ? `${date.year}-${String(date.month + 1).padStart(2, "0")}` : null;
  const target: MonthTarget = (monthKey && monthTargets[monthKey]) || {};
  const patchTarget = (patch: Partial<MonthTarget>) => {
    if (!monthKey) return;
    setMonthTargets((m) => ({ ...m, [monthKey]: { ...m[monthKey], ...patch } }));
  };
  const saveTargets = () => {
    setAppSetting("monthly_marketing_targets_v1", JSON.stringify(monthTargets))
      .catch((error) => toastError(`บันทึก Target รายเดือนไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };
  const totalVisits = filtered.reduce((s, r) => s + (r.marketingVisits || 0), 0);

  // Campaign-derived targets: pick which campaigns count toward the month's
  // target and pull Reach/Visit goals (Success Metrics) + the month's budget
  // (Monthly Budget Plan row; overlap-share of the campaign budget otherwise).
  const [pickOpen, setPickOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const monthCampaigns = useMemo(
    () => !monthKey ? [] : campaigns.filter((c) =>
      visibleBrands.includes(c.b) && (brand === "all" || c.b === brand) && rangeInFilter(date, c.dates)),
    [campaigns, visibleBrands, brand, date, monthKey],
  );
  useEffect(() => {
    setPicked(new Set(monthCampaigns.map((c) => c.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, monthCampaigns.length]);
  const goalNum = (v?: string) => Number((v ?? "").toString().replace(/[^\d.]/g, "")) || 0;
  const campaignTargetOf = (c: CampaignRow) => {
    const brief = briefs[c.name];
    const reach = goalNum(brief?.successGoals?.["Reach"]);
    const visits = goalNum(brief?.successGoals?.["Visit"]);
    const monthlyRow = monthKey ? brief?.budget.monthly?.find((m) => m.month === monthKey) : undefined;
    const budget = monthlyRow?.amount ?? Math.round((brief?.budget.total || c.budget || 0) * rangeOverlapFraction(date, c.dates));
    return { reach, visits, budget };
  };
  const applyFromCampaigns = () => {
    if (!monthKey) return;
    const sum = monthCampaigns.filter((c) => picked.has(c.id)).reduce(
      (acc, c) => { const t = campaignTargetOf(c); return { reach: acc.reach + t.reach, visits: acc.visits + t.visits, budget: acc.budget + t.budget }; },
      { reach: 0, visits: 0, budget: 0 },
    );
    setMonthTargets((m) => {
      const next = { ...m, [monthKey]: { ...m[monthKey], reach: sum.reach, visits: sum.visits, budget: sum.budget } };
      setAppSetting("monthly_marketing_targets_v1", JSON.stringify(next))
        .catch((error) => toastError(`บันทึก Target รายเดือนไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      return next;
    });
    setPickOpen(false);
  };

  const totalPlan = filtered.reduce((s, r) => s + (r.budget || 0), 0);
  const totalActual = filtered.reduce((s, r) => s + (r.budgetActual || 0), 0);
  const filledRows = filtered.filter((r) => r.reachActual > 0 || r.budgetActual > 0).length;
  const reachRows = filtered.filter((r) => r.kpi === "Reach");
  const reachActual = reachRows.reduce((s, r) => s + (r.reachActual || 0), 0);
  const reachTarget = reachRows.reduce((s, r) => s + (r.target || 0), 0);
  const reachSpend = reachRows.reduce((s, r) => s + (r.budgetActual || 0), 0);
  const totalConv = filtered.reduce((s, r) => s + (r.conversions || 0), 0);
  const overCount = groupsAll.filter((g) => budgetAlert(g.budgetPlan, g.budgetActual).tone === "red").length;

  const chips = [
    { emoji: "💰", value: baht(totalPlan, { compact: true }), label: "งบแผน", tone: "accent" },
    { emoji: "💸", value: baht(totalActual, { compact: true }), label: totalPlan ? `${pct((totalActual / totalPlan) * 100)} ใช้แล้ว` : "ใช้จริง", tone: "info" },
    { emoji: "🎯", value: num(reachActual), label: reachTarget ? `${pct((reachActual / reachTarget) * 100)} ของเป้า` : "reach", tone: "success" },
    { emoji: "🛒", value: num(totalConv), label: "conversions", tone: "accent" },
    { emoji: "⚡", value: cpr(reachActual ? reachSpend / reachActual : null), label: "CPR / reach", tone: "neutral" },
    { emoji: "✅", value: `${filledRows}/${filtered.length}`, label: "ads มีผล", tone: "neutral" },
    ...(overCount > 0 ? [{ emoji: "⚠️", value: String(overCount), label: "เกินงบ", tone: "danger" }] : []),
  ];

  const patchRow = (id: string, key: keyof CampaignResultRow, value: number) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const patchRowStatus = (id: string, status: ResultStatusKey) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, statusOverride: status } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const patchGroupStatus = (groupRows: CampaignResultRow[], status: ResultStatusKey) => {
    const ids = new Set(groupRows.map((r) => r.id));
    setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, statusOverride: status } : r)));
    setDirty((d) => { const nd = new Set(d); ids.forEach((id) => nd.add(id)); return nd; });
  };

  // Grand-total entry (monthly mode): type the month's total once and spread it
  // across every visible ad. Weight base per field — actual spend follows the
  // plan budget share, actual reach follows the target share, conversions and
  // visits follow the actual-reach share (even split when the base is all zero).
  // Rounding remainder lands on the last row so the total always matches.
  const spreadTotal = (
    list: CampaignResultRow[],
    key: "reachActual" | "budgetActual" | "conversions" | "marketingVisits",
    total: number,
  ) => {
    if (list.length === 0) return;
    const weightOf = (r: CampaignResultRow) =>
      key === "budgetActual" ? (r.budget || 0)
      : key === "reachActual" ? (r.target || 0)
      : (r.reachActual || 0);
    const tw = list.reduce((s, r) => s + weightOf(r), 0);
    const alloc = list.map((r) =>
      tw > 0 ? Math.round(total * (weightOf(r) / tw)) : Math.round(total / list.length),
    );
    alloc[alloc.length - 1] += total - alloc.reduce((a, b) => a + b, 0);
    const map = new Map(list.map((r, i) => [r.id, Math.max(0, alloc[i])]));
    setRows((rs) => rs.map((r) => (map.has(r.id) ? { ...r, [key]: map.get(r.id)! } : r)));
    setDirty((d) => { const nd = new Set(d); list.forEach((r) => nd.add(r.id)); return nd; });
  };

  const saveAll = async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    const nowIso = new Date().toISOString();
    const stamped = rows.map((r) =>
      dirty.has(r.id) ? { ...r, updatedAt: nowIso, updatedBy: member?.name ?? "—" } : r,
    );
    try {
      await saveResults(stamped.filter((r) => dirty.has(r.id)));
      // Ad-level actuals stay in campaign_results — they must never overwrite
      // campaigns.spend (plan-time COMMITTED allocation). Revenue entry moved
      // out of this page (Marketing Visit instead), so no ROAS rollup here —
      // resultsRoas/updateCampaignRoas remain available for a future POS sync.
      setRows(stamped);
      setDirty(new Set());
      setSaved(true);
      clearTimeout(savedRef.current);
      savedRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toastError(`บันทึก Performance ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setSaving(false); }
  };

  const requestReviseBudget = async () => {
    const campaign = campaigns.find((c) => c.id === reviseCampaignId);
    if (!campaign || !reviseReason.trim()) return;
    const brief = briefs[campaign.name];
    const amount = Number(reviseAmount) || 0;
    const requester = member?.name || "Requester";
    const approver = brief?.approver?.trim() || DEFAULT_APPROVER;
    const task: Task = {
      id: Date.now(),
      title: `Revise budget request — ${campaign.name}`,
      module: "Finance",
      moduleIcon: "฿",
      moduleColor: "#4E7A4E",
      type: "Budget",
      assignee: approver,
      brand: brandName(campaign.b),
      campaign: campaign.name,
      status: "Need Approval",
      priority: "High",
      group: "needApproval",
      due: "Today",
      dueIso: new Date().toISOString().slice(0, 10),
      blocker: null,
      pendingApprover: approver,
      isQuickWin: false,
      nextAction: [
        `${requester} requested a budget revision.`,
        amount > 0 ? `Requested revised budget: ${baht(amount)}` : "",
        `Current campaign budget: ${baht(campaign.budget)}`,
        `Reason: ${reviseReason.trim()}`,
      ].filter(Boolean).join("\n"),
      checklist: ["Review reason", "Check campaign allocation", "Approve or ask for revision"],
      relatedBrief: brief?.id ?? campaign.id,
      relatedCampaignId: campaign.id,
      approvalKind: "budgetRevision",
      requestedBudget: amount > 0 ? amount : campaign.budget,
      comments: [{ by: requester, text: reviseReason.trim(), at: new Date().toISOString() }],
    };
    try {
      await createTaskDb(task);
      setReviseSent(true);
      setReviseAmount("");
      setReviseReason("");
      setTimeout(() => { setReviseOpen(false); setReviseSent(false); }, 1400);
    } catch (error) {
      toastError(`ส่ง Request Revise Budget ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const dimLabel = groupDim === "platform" ? "Platform" : "Campaign";
  // Rows for the monthly-entry grid: every ad in the selected period, campaign order.
  const entryRows = useMemo(
    () => [...filtered].sort((a, b) =>
      (nameOf[a.campaignId] ?? a.campaignId).localeCompare(nameOf[b.campaignId] ?? b.campaignId) ||
      (a.ad || "").localeCompare(b.ad || "")),
    [filtered, nameOf],
  );
  const footTarget = groups.reduce((s, g) => s + g.target, 0);
  const footActual = groups.reduce((s, g) => s + g.actual, 0);
  const footPlan = groups.reduce((s, g) => s + g.budgetPlan, 0);
  const footSpend = groups.reduce((s, g) => s + g.budgetActual, 0);

  // Platform Performance is company-wide budget + actual spend with a
  // "Request revise budget" action — money data that never passes the Finance
  // module's own door. Production-side roles (KOL, creative) don't see it
  // (CMO decision 18 Jul 2026). Gate is in lib/roleGates, unit-tested.
  if (!canSeePlatformPerformance(role)) {
    return (
      <div className="py-24 flex flex-col items-center gap-3 text-center">
        <div className="text-[15px] font-bold text-ink">No access to Platform Performance</div>
        <div className="text-[13px] text-faint max-w-[420px]">หน้านี้แสดงงบประมาณและยอดใช้จ่ายจริงของทุกแบรนด์ — เปิดให้เฉพาะสายวางแผน/บริหาร ติดต่อ CMO หากต้องการเข้าถึง</div>
        <Link href="/" className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">← กลับหน้าหลัก</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Platform Performance"
        subtitle="สรุปผลข้ามแคมเปญ — สลับดูราย Platform หรือราย Campaign, อัพเดต actual แล้ว sync กลับแคมเปญ (งบแผน fix ที่แคมเปญ)"
        right={
          <div className="flex items-center gap-3">
            {dirty.size > 0 && <span className="text-[12px] text-status-orange font-bold">แก้ไข {dirty.size} แถว</span>}
            <button onClick={saveAll} disabled={saving || dirty.size === 0}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-white rounded-[10px] px-4 py-[8px] disabled:opacity-40"
              style={{ background: ACCENT }}>
              {saved ? <><Check size={15} /> บันทึกแล้ว</> : <><Save size={15} /> {saving ? "กำลังบันทึก…" : "บันทึก"}</>}
            </button>
            <button onClick={() => { setReviseCampaignId(reviseCampaignId || campaigns[0]?.id || ""); setReviseOpen(true); }}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold rounded-[10px] px-4 py-[8px] border"
              style={{ color: ACCENT, borderColor: "#BCEBE6", background: "#E3F7F5" }}>
              Request revise budget
            </button>
          </div>
        }
      />

      {/* Command + filters — compact */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented value={dim} onChange={(v) => {
          setDim(v as GroupDim | "entry");
          setOpen({});
          // เข้าโหมดลงผลรายเดือน: ถ้ายังไม่ได้เลือกช่วงเป็นเดือน สลับให้เป็นเดือนปัจจุบัน
          if (v === "entry" && date.mode !== "month") setDate(DEFAULT_DATE_FILTER);
        }}
          options={[{ value: "platform", label: "🗂 Platform" }, { value: "campaign", label: "🎯 Campaign" }, { value: "entry", label: "📝 ลงผลรายเดือน" }]} />
        <div className="ml-auto flex items-center gap-2">
          <BrandFilter value={brand} onChange={setBrand} label="" />
          {dim !== "entry" && (
            <select value={alertOnly ? "over" : "all"} onChange={(e) => setAlertOnly(e.target.value === "over")}
              className="text-[12.5px] font-semibold px-[10px] py-[8px] rounded-[10px] border border-line2 bg-white text-ink outline-none">
              <option value="all">ทุก{dimLabel === "Platform" ? " platform" : "แคมเปญ"}</option>
              <option value="over">⚠️ เกินงบเท่านั้น</option>
            </select>
          )}
        </div>
      </div>
      <div className="mt-2"><DateFilterBar value={date} onChange={setDate} /></div>

      {/* Monthly marketing target — org-wide for the selected month, no per-campaign entry */}
      {monthKey && !loading && (
        <div className="mt-3 bg-surface border border-line rounded-cardLg p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="text-[12.5px] font-bold text-ink">
              🎯 Target Marketing — {MONTHS[date.month]} {date.year}
              <span className="text-[10.5px] text-faint font-normal"> · เป้ารวมทั้งเดือน (ทุกแคมเปญ) เทียบกับผลจริงในหน้านี้</span>
            </div>
            <button type="button" onClick={() => setPickOpen((o) => !o)}
              className="rounded-[8px] border px-2.5 py-1 text-[11px] font-bold"
              style={{ borderColor: "#CFE4C2", background: pickOpen ? "#DFF0D8" : "#EEF4EE", color: "#4E7A4E" }}>
              📌 ดึงเป้าจากแคมเปญ{pickOpen ? " ▴" : " ▾"}
            </button>
          </div>
          {pickOpen && (
            <div className="mb-3 rounded-[12px] border border-line2 bg-ivory p-3">
              <div className="text-[11px] font-bold text-muted mb-2">
                เลือกแคมเปญที่จะนับรวมเป็นเป้าเดือนนี้ — Reach/Visit จาก Success Metrics · งบจาก Monthly Budget Plan ของแคมเปญ
              </div>
              {monthCampaigns.map((c) => {
                const t = campaignTargetOf(c);
                const on = picked.has(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 py-[4px] text-[12px] cursor-pointer border-b border-line4 last:border-0">
                    <input type="checkbox" checked={on}
                      onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                    <span className="font-semibold text-ink flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] text-faint whitespace-nowrap">
                      Reach {num(t.reach)} · Visit {num(t.visits)} · งบ {baht(t.budget, { compact: true })}
                    </span>
                  </label>
                );
              })}
              {monthCampaigns.length === 0 && (
                <div className="text-[11.5px] text-faint py-2">ไม่มีแคมเปญ active ในเดือนนี้</div>
              )}
              {monthCampaigns.length > 0 && (
                <button type="button" onClick={applyFromCampaigns} disabled={picked.size === 0}
                  className="mt-2 text-[11.5px] font-bold text-white rounded-[8px] px-3 py-[6px] disabled:opacity-40"
                  style={{ background: "#4E7A4E" }}>
                  ใช้ยอดรวมจาก {picked.size} แคมเปญ → ตั้งเป้า Reach / Visit / Budget
                </button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ["Reach", "reach", filtered.reduce((s, r) => s + (r.reachActual || 0), 0), (v: number) => num(v)],
              ["Marketing Visit", "visits", totalVisits, (v: number) => num(v)],
              ["Conversions", "conversions", filtered.reduce((s, r) => s + (r.conversions || 0), 0), (v: number) => num(v)],
              ["Budget (฿)", "budget", filtered.reduce((s, r) => s + (r.budgetActual || 0), 0), (v: number) => baht(v, { compact: true })],
            ] as [string, keyof MonthTarget, number, (v: number) => string][]).map(([labelText, key, actual, fmtVal]) => {
              const t = target[key] || 0;
              const pctDone = t > 0 ? Math.min(999, Math.round((actual / t) * 100)) : null;
              return (
                <div key={key} className="rounded-[12px] border border-line2 bg-ivory p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-faint mb-1">{labelText}</div>
                  <input
                    type="number" min={0} value={t || ""} placeholder="ตั้งเป้า…"
                    onChange={(e) => patchTarget({ [key]: Number(e.target.value) || 0 })}
                    onBlur={saveTargets}
                    className="w-full rounded-[8px] border border-line2 bg-white px-2 py-[5px] text-[13px] font-bold text-ink outline-none focus:border-accent"
                  />
                  <div className="mt-2 text-[11px] font-semibold" style={{ color: pctDone == null ? "#9A9387" : pctDone >= 100 ? "#4E7A4E" : "#6b6258" }}>
                    ทำได้ {fmtVal(actual)}{pctDone != null && <> · <b>{pctDone}%</b> ของเป้า</>}
                  </div>
                  <div className="mt-1 h-[5px] rounded-full bg-line overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctDone ?? 0)}%`, background: (pctDone ?? 0) >= 100 ? "#4E7A4E" : ACCENT }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-faint py-10 text-center">กำลังโหลดผล…</div>
      ) : groupsAll.length === 0 ? (
        <div className="mt-4 bg-surface border border-line rounded-cardLg p-10 text-center">
          <div className="text-[30px] mb-1">📊</div>
          <div className="text-[14px] font-bold text-ink">ไม่มีข้อมูลในช่วงที่เลือก</div>
          <div className="text-[12px] text-faint mt-1">ลองปรับช่วงวัน / แบรนด์ หรือเพิ่มแถวผลในแท็บ Result ของแคมเปญก่อน</div>
        </div>
      ) : (
        <>
          {/* Summary chips — compact one row */}
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => {
              const t = CHIP_TONE[c.tone] ?? CHIP_TONE.neutral;
              return (
                <div key={c.label} className="flex items-center gap-2 rounded-[12px] px-3 py-[9px]" style={{ background: t.bg }}>
                  <span className="text-[15px] leading-none" aria-hidden>{c.emoji}</span>
                  <span className="text-[17px] font-extrabold letter-tightest" style={{ color: t.fg }}>{c.value}</span>
                  <span className="text-[11.5px] font-semibold" style={{ color: t.fg, opacity: 0.85 }}>{c.label}</span>
                </div>
              );
            })}
          </div>

          {dim === "entry" ? (
            /* ── โหมดลงผลรายเดือน: ทุก ad ของเดือนที่เลือกในตารางเดียว กดบันทึกครั้งเดียว ── */
            <div className="mt-3">
              <div className="flex items-center gap-2 rounded-[12px] px-3 py-[9px] mb-2"
                style={{ background: "#E3F7F5", color: ACCENT }}>
                <span className="text-[15px] leading-none" aria-hidden>📝</span>
                <span className="text-[12px] font-semibold">
                  เลือกเดือนจากแถบด้านบน แล้วกรอก Budget actual / Reach / Marketing Visit ของทุก ad ได้ในตารางเดียว
                  — หรือกรอกยอดรวมครั้งเดียวที่แถว Σ Grand Total ด้านล่าง ระบบกระจายให้ · เสร็จแล้วกด &quot;บันทึก&quot; ครั้งเดียวมุมขวาบน ({entryRows.length} ads)
                </span>
              </div>
              <AdEditor rows={entryRows} nameOf={nameOf} datesOf={datesOf} showCampaign onPatch={patchRow} onPatchStatus={patchRowStatus}
                onSpreadTotal={(key, total) => spreadTotal(entryRows, key, total)} />
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-3 bg-surface border border-line rounded-cardLg p-8 text-center text-[12.5px] text-faint">
              ไม่มีรายการที่เกินงบ 🎉
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto border border-line rounded-cardLg bg-surface">
              <table className="w-full text-[12px] whitespace-nowrap border-collapse">
                <thead>
                  <tr className="text-faint">
                    {[dimLabel, ...tableHeaders].map((h, i) => (
                      <th key={i} className={`font-bold px-[10px] py-2 border-b border-line bg-ivory ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const isOpen = !!open[g.key];
                    const alert = budgetAlert(g.budgetPlan, g.budgetActual);
                    const gRows = rowsByGroup[g.key] ?? [];
                    const gm = groupMetric(gRows);
                    const status = dominantStatus(gRows);
                    return (
                      <FragmentRow key={g.key}>
                        <tr
                          className="border-b border-line4 last:border-0 cursor-pointer hover:bg-ivory"
                          onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                        >
                          <td className="px-[10px] py-[8px] text-left">
                            <span className="inline-flex items-center gap-2">
                              {isOpen ? <ChevronDown size={14} className="text-faint" /> : <ChevronRight size={14} className="text-faint" />}
                              {dim === "platform"
                                ? <Badge code={platformMeta(g.key).code} color={platformMeta(g.key).color} />
                                : <BrandDot brand={brandOf[g.key] ?? "teppen"} size={9} />}
                              <span className="min-w-0">
                                <span className="block font-bold text-ink max-w-[220px] truncate">{g.label}</span>
                                {groupDim === "campaign" && (
                                  <span className="block text-[10.5px] font-semibold text-faint mt-[2px]">{periodLabel(datesOf[g.key])}</span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{baht(gm.budget, { compact: true })}</td>
                          <td className="px-[10px] py-[8px] text-right text-ink font-bold">{baht(gm.spent, { compact: true })}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{gm.budgetPct}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{num(gm.reachGoal)}</td>
                          <td className="px-[10px] py-[8px] text-right text-ink font-bold">{num(gm.reachActual)}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{gm.reachPct}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{num(gm.mktGoal)}</td>
                          <td className="px-[10px] py-[8px] text-right text-ink font-bold">{num(gm.mktActual)}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{gm.mktPct}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{gm.cv}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{gm.cpr}</td>
                          <td className="px-[10px] py-[8px] text-right text-muted">{gm.cpc}</td>
                          <td className="px-[10px] py-[8px] text-right"><StatusBadge tone={alert.tone}>{alert.label}</StatusBadge></td>
                          <td className="px-[10px] py-[8px] text-right" onClick={(e) => e.stopPropagation()}>
                            <StatusSelect value={status} onChange={(next) => patchGroupStatus(gRows, next)} />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={15} className="bg-white p-0 border-b border-line4">
                              <AdEditor rows={gRows} nameOf={nameOf} datesOf={datesOf} onPatch={patchRow} onPatchStatus={patchRowStatus} />
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-ivory font-bold text-ink border-t border-line">
                    <td className="px-[10px] py-[9px] text-left">รวม (Total)</td>
                    <td className="px-[10px] py-[9px] text-right">{baht(footPlan, { compact: true })}</td>
                    <td className="px-[10px] py-[9px] text-right">{baht(footSpend, { compact: true })}</td>
                    <td className="px-[10px] py-[9px] text-right text-muted">{footPlan ? pct((footSpend / footPlan) * 100) : "—"}</td>
                    <td className="px-[10px] py-[9px] text-right text-muted">{num(footTarget)}</td>
                    <td className="px-[10px] py-[9px] text-right">{num(footActual)}</td>
                    <td className="px-[10px] py-[9px] text-right text-muted">{footTarget ? pct((footActual / footTarget) * 100) : "—"}</td>
                    <td /><td /><td /><td /><td /><td /><td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="mt-3 text-[11px] text-faint px-1">
            {dim === "entry"
              ? "กรอก actual ได้ทุกแถวโดยไม่ต้องเปิดทีละแคมเปญ · CV% คำนวณอัตโนมัติจาก Marketing Visit ÷ Reach · งบแผน fix ที่แคมเปญ · กด \"บันทึก\" ครั้งเดียวเมื่อกรอกครบ"
              : "คลิกแถวเพื่อขยาย/อัพเดต actual ราย ad · งบแผน fix ที่แคมเปญ · CPR ต่างหน่วยตาม KPI ไม่นำมารวมกัน"}
          </div>
        </>
      )}

      {reviseOpen && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center px-4" onClick={() => setReviseOpen(false)}>
          <div className="w-full max-w-lg bg-surface rounded-[22px] border border-line shadow-soft p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-extrabold text-ink">Request revise budget</div>
                <div className="text-[12.5px] text-faint mt-1">ส่งคำขอแก้งบไปหา CMO พร้อมเหตุผลก่อนเปลี่ยน budget จริง</div>
              </div>
              <button onClick={() => setReviseOpen(false)} className="text-faint hover:text-ink text-[20px] leading-none">×</button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1">
                <span className="text-[11.5px] font-bold text-faint uppercase tracking-[0.08em]">Campaign</span>
                <select value={reviseCampaignId} onChange={(e) => setReviseCampaignId(e.target.value)}
                  className="text-[13px] font-semibold px-3 py-[10px] rounded-[12px] border border-line2 bg-white outline-none">
                  <option value="">Select campaign…</option>
                  {campaigns.filter((c) => visibleBrands.includes(c.b)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {brandName(c.b)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11.5px] font-bold text-faint uppercase tracking-[0.08em]">Requested revised budget</span>
                <input value={reviseAmount} onChange={(e) => setReviseAmount(e.target.value)} inputMode="numeric" placeholder="฿"
                  className="text-[13px] font-semibold px-3 py-[10px] rounded-[12px] border border-line2 bg-white outline-none" />
              </label>
              <label className="grid gap-1">
                <span className="text-[11.5px] font-bold text-faint uppercase tracking-[0.08em]">Reason *</span>
                <textarea value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} rows={4}
                  placeholder="เช่น KOL quote สูงกว่าแผน / ต้องเพิ่มงบยิง Ads เพราะ reach ไม่ถึง target"
                  className="text-[13px] font-semibold px-3 py-[10px] rounded-[12px] border border-line2 bg-white outline-none resize-none" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReviseOpen(false)} className="text-[12.5px] font-bold px-4 py-[9px] rounded-[10px] border border-line2 text-muted bg-white">Cancel</button>
              <button onClick={requestReviseBudget} disabled={!reviseCampaignId || !reviseReason.trim()}
                className="text-[12.5px] font-bold px-4 py-[9px] rounded-[10px] text-white disabled:opacity-45"
                style={{ background: ACCENT }}>
                {reviseSent ? "Sent ✓" : "Send to CMO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Keyed wrapper that lets a map emit a main row plus its expanded row. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Editable ad-level drill-down under a group. Only actuals are editable.
 *  With `onSpreadTotal` (monthly-entry mode) a Grand Total row is appended —
 *  typing a total there spreads it across every row at once. */
function AdEditor({ rows, nameOf, datesOf, showCampaign = false, onPatch, onPatchStatus, onSpreadTotal }: {
  rows: CampaignResultRow[];
  nameOf: Record<string, string>;
  datesOf: Record<string, string>;
  // Campaign column only in the flat monthly-entry list; inside a campaign
  // group it's redundant, so it's hidden there.
  showCampaign?: boolean;
  onPatch: (id: string, key: keyof CampaignResultRow, value: number) => void;
  onPatchStatus: (id: string, status: ResultStatusKey) => void;
  onSpreadTotal?: (key: "reachActual" | "budgetActual" | "conversions" | "marketingVisits", total: number) => void;
}) {
  const sum = (f: (r: CampaignResultRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tReach = sum((r) => r.reachActual || 0);
  const tBudgetAct = sum((r) => r.budgetActual || 0);
  const tVisit = sum((r) => r.marketingVisits || 0);
  const tBudget = sum((r) => r.budget || 0);
  const tVisitGoal = sum(visitGoal);
  return (
    <div className="bg-white overflow-x-auto">
      <table className="w-full text-[11.5px] whitespace-nowrap border-collapse">
        <thead>
          <tr className="text-faint bg-[#FBFAF6]">
            {[showCampaign ? "Campaign / Ad" : "Ad", ...tableHeaders].map((h, i) => (
              <th key={i} className={`font-bold px-[9px] py-[6px] border border-line4 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = deriveResultRow(r);
            const alert = budgetAlert(r.budget, r.budgetActual);
            const vGoal = visitGoal(r);
            const vActual = r.marketingVisits || 0;
            return (
              <tr key={r.id} className="hover:bg-[#FBFAF6]">
                <td className="px-[9px] py-[6px] text-left border border-line4">
                  {showCampaign ? (
                    <span className="block">
                      <span className="block font-bold text-ink max-w-[220px] truncate">{nameOf[r.campaignId] ?? r.campaignId}</span>
                      <span className="block text-[10px] font-semibold text-faint mt-[1px]">{periodLabel(datesOf[r.campaignId])}</span>
                      <span className="block text-[10.5px] text-muted mt-[2px] max-w-[220px] truncate">{r.ad || "—"}</span>
                    </span>
                  ) : (
                    <span className="font-bold text-ink max-w-[240px] truncate block">{r.ad || "—"}</span>
                  )}
                </td>
                <td className="px-[9px] py-[6px] text-right text-muted border border-line4">{baht(r.budget, { compact: true })}</td>
                <EditCell value={r.budgetActual} onChange={(v) => onPatch(r.id, "budgetActual", v)} />
                <td className="px-[9px] py-[6px] text-right text-muted border border-line4">{percentOf(r.budgetActual, r.budget)}</td>
                <td className="px-[9px] py-[6px] text-right text-muted border border-line4">{num(r.target)}</td>
                <EditCell value={r.reachActual} onChange={(v) => onPatch(r.id, "reachActual", v)} />
                <td className="px-[9px] py-[6px] text-right text-muted border border-line4">{d.pctReach != null ? pct(d.pctReach * 100) : "—"}</td>
                <td className="px-[9px] py-[6px] text-right text-muted border border-line4">{num(vGoal)}</td>
                <EditCell value={r.marketingVisits || 0} onChange={(v) => onPatch(r.id, "marketingVisits", v)} />
                <td className="px-[9px] py-[6px] text-right text-muted border border-line4">{percentOf(vActual, vGoal)}</td>
                {/* CV% (auto) = Marketing Visit ÷ Reach actual */}
                <td className="px-[9px] py-[6px] text-right font-bold text-ink border border-line4">
                  {d.cvActual != null ? pct(d.cvActual * 100) : "—"}
                </td>
                <td className="px-[9px] py-[6px] text-right text-ink font-bold border border-line4">{cpr(d.cprActual)}</td>
                <td className="px-[9px] py-[6px] text-right font-bold text-ink border border-line4">
                  {cpr(vActual && r.budgetActual ? r.budgetActual / vActual : null)}
                </td>
                <td className="px-[9px] py-[6px] text-right border border-line4"><StatusBadge tone={alert.tone}>{alert.label}</StatusBadge></td>
                <td className="px-[9px] py-[6px] text-right border border-line4">
                  <StatusSelect value={deriveResultRow(r).status} onChange={(next) => onPatchStatus(r.id, next)} />
                </td>
              </tr>
            );
          })}
        </tbody>
        {onSpreadTotal && rows.length > 0 && (
          <tfoot>
            <tr className="bg-[#FFFBEF] font-bold text-ink">
              <td className="px-[9px] py-[8px] text-left border border-line4">
                Σ Grand Total — กรอกยอดรวมทั้งเดือนที่นี่ ระบบกระจายลงราย ad ให้
              </td>
              <td className="px-[9px] py-[8px] text-right text-muted border border-line4">{baht(tBudget, { compact: true })}</td>
              <EditCell value={tBudgetAct} onChange={(v) => onSpreadTotal("budgetActual", v)} />
              <td className="px-[9px] py-[8px] text-right border border-line4">{percentOf(tBudgetAct, tBudget)}</td>
              <td className="px-[9px] py-[8px] text-right text-muted border border-line4">{num(sum((r) => r.target || 0))}</td>
              <EditCell value={tReach} onChange={(v) => onSpreadTotal("reachActual", v)} />
              <td className="px-[9px] py-[8px] text-right border border-line4">{percentOf(tReach, sum((r) => r.target || 0))}</td>
              <td className="px-[9px] py-[8px] text-right text-muted border border-line4">{num(tVisitGoal)}</td>
              <EditCell value={tVisit} onChange={(v) => onSpreadTotal("marketingVisits", v)} />
              <td className="px-[9px] py-[8px] text-right border border-line4">{percentOf(tVisit, tVisitGoal)}</td>
              <td className="px-[9px] py-[8px] text-right border border-line4">{tReach > 0 && tVisit > 0 ? pct((tVisit / tReach) * 100) : "—"}</td>
              <td className="px-[9px] py-[8px] text-right border border-line4">{cpr(tReach > 0 && tBudgetAct > 0 ? tBudgetAct / tReach : null)}</td>
              <td className="px-[9px] py-[8px] text-right border border-line4">{cpr(tVisit > 0 && tBudgetAct > 0 ? tBudgetAct / tVisit : null)}</td>
              <td className="border border-line4" /><td className="border border-line4" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: ResultStatusKey; onChange: (v: ResultStatusKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ResultStatusKey)}
      className="min-w-[112px] bg-transparent text-right text-[11px] font-bold text-ink outline-none cursor-pointer"
      aria-label="Performance status"
    >
      {(Object.keys(RESULT_STATUS_META) as ResultStatusKey[]).map((key) => (
        <option key={key} value={key}>{RESULT_STATUS_META[key].label}</option>
      ))}
    </select>
  );
}

function EditCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="px-[9px] py-[6px] text-right border border-line4">
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? "" : num(value)}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.-]/g, "")) || 0)}
        className="w-[72px] text-right bg-transparent outline-none px-0 py-[2px] text-ink placeholder:text-faint focus:bg-[#FFFBEF]"
      />
    </td>
  );
}

function Badge({ code, color }: { code: string; color: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[7px] font-extrabold text-white w-6 h-6 text-[10px]"
      style={{ background: color }}
    >{code}</span>
  );
}
