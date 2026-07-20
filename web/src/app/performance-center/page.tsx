"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Gauge,
  LineChart,
  Megaphone,
  Sparkles,
  Star,
  Store,
  Target,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter, rangeInFilter } from "@/components/ui/DateFilterBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { BrandFilterValue, BrandId, brandColor, brandName } from "@/lib/brands";
import { CampaignRow } from "@/lib/data/campaigns";
import {
  CampaignResultRow,
  GroupAgg,
  aggregateBy,
  cpr,
  deriveResultRow,
  mergeBudgetAllocationRows,
} from "@/lib/data/campaignResult";
import { CampaignBrief } from "@/lib/data/brief";
import { KolCollabRow, kolBranchReport } from "@/lib/data/kolBranch";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchAllResults } from "@/lib/db/campaignResult";
import { fetchCollaborations } from "@/lib/db/kolCollab";
import { baht, num, pct } from "@/lib/format";

type ReportKey = "overview" | "creative" | "platform" | "campaign" | "branch" | "kol";

const REPORTS: {
  key: ReportKey;
  label: string;
  short: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}[] = [
  { key: "overview", label: "Marketing Overview", short: "Overview", icon: LineChart, color: "#0EA5A0", bg: "#E3F7F5" },
  { key: "creative", label: "Creative KPI Performance", short: "Creative KPI", icon: Sparkles, color: "#D876AA", bg: "#FDEBF3" },
  { key: "platform", label: "Platform / Ads Performance", short: "Platform / Ads", icon: BarChart3, color: "#0EA5A0", bg: "#E3F7F5" },
  { key: "campaign", label: "Campaign ROI Performance", short: "Campaign ROI", icon: Target, color: "#6C5CE7", bg: "#EEE9FF" },
  { key: "branch", label: "Branch Performance", short: "Branch", icon: Store, color: "#2E8B7A", bg: "#E3F5F0" },
  { key: "kol", label: "KOL Performance", short: "KOL", icon: Star, color: "#E08A34", bg: "#FFF3E5" },
];

const sum = <T,>(rows: T[], fn: (row: T) => number) => rows.reduce((total, row) => total + (fn(row) || 0), 0);
const safePct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);
const bar = (value: number) => `${Math.max(3, Math.min(100, value))}%`;
const compact = (value: number) => baht(value, { compact: true });
const empty = "ยังไม่มีข้อมูลในช่วงที่เลือก";

function rowRevenue(row: CampaignResultRow) {
  return row.revenue || 0;
}

function statusTone(row: CampaignResultRow): "green" | "gold" | "red" | "neutral" {
  const status = deriveResultRow(row).status;
  if (status === "on_track") return "green";
  if (status === "over_budget" || status === "under_deliver") return "gold";
  if (status === "off_track") return "red";
  return "neutral";
}

function isKolRow(row: CampaignResultRow) {
  const text = `${row.platform} ${row.role} ${row.ad} ${row.type}`.toLowerCase();
  return /kol|creator|influ/.test(text);
}

function isCreativeRow(row: CampaignResultRow) {
  const text = `${row.platform} ${row.role} ${row.ad} ${row.type}`.toLowerCase();
  return !isKolRow(row) && /creative|content|reel|album|photo|video|story|graphic|asset|own/.test(text);
}

function kpiLabel(rows: CampaignResultRow[]) {
  const reachRows = rows.filter((r) => r.kpi === "Reach");
  const otherRows = rows.filter((r) => r.kpi !== "Reach");
  return reachRows.length >= otherRows.length ? "Reach" : "Result";
}

function KpiCard({
  label,
  value,
  note,
  tone = "#6C5CE7",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-[20px] border border-line bg-white p-4 shadow-[0_10px_30px_rgba(23,23,42,.035)]">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em]" style={{ color: tone }}>{label}</div>
      <div className="mt-2 text-[26px] font-extrabold tracking-[-0.04em] text-ink">{value}</div>
      {note && <div className="mt-1 text-[12px] font-semibold text-faint">{note}</div>}
    </div>
  );
}

function MiniBar({ value, color = "#0EA5A0" }: { value: number; color?: string }) {
  return (
    <div className="mt-2 h-2 rounded-full bg-[#F0EDE6]">
      <div className="h-full rounded-full" style={{ width: bar(value), background: color }} />
    </div>
  );
}

function EmptyPanel({ children = empty }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-dashed border-line bg-[#FBFAF7] px-5 py-10 text-center text-[13px] font-bold text-faint">
      {children}
    </div>
  );
}

function ReportShell({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold tracking-[-0.035em] text-ink">{title}</h2>
          <p className="mt-1 max-w-[760px] text-[13px] font-semibold leading-relaxed text-faint">{desc}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function GroupTable({
  rows,
  color,
  label = "Name",
}: {
  rows: GroupAgg[];
  color: string;
  label?: string;
}) {
  if (!rows.length) return <EmptyPanel />;
  return (
    <div className="overflow-hidden rounded-[22px] border border-line">
      <div className="grid grid-cols-[1.5fr_.8fr_.8fr_.8fr_.7fr] gap-3 border-b border-line bg-[#FBFAF7] px-4 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
        <div>{label}</div>
        <div>Budget</div>
        <div>Actual</div>
        <div>{kpiLabel([])}</div>
        <div>CPR</div>
      </div>
      {rows.slice(0, 8).map((row) => (
        <div key={row.key} className="grid grid-cols-[1.5fr_.8fr_.8fr_.8fr_.7fr] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-extrabold text-ink">{row.label}</div>
            <MiniBar value={row.budgetPct || row.reachPct} color={color} />
          </div>
          <div className="text-[13px] font-bold text-ink">{compact(row.budgetPlan)}</div>
          <div className="text-[13px] font-bold text-muted">{compact(row.budgetActual)}</div>
          <div className="text-[13px] font-bold text-muted">{num(row.actual)}</div>
          <div className="text-[13px] font-extrabold" style={{ color }}>{cpr(row.cprActual)}</div>
        </div>
      ))}
    </div>
  );
}

export default function PerformanceCenterPage() {
  const { visibleBrands } = useBrandVisibility();
  const [active, setActive] = useState<ReportKey>("overview");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [rows, setRows] = useState<CampaignResultRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [collabs, setCollabs] = useState<KolCollabRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([fetchAllResults(), fetchCampaigns(), fetchAllBriefs(), fetchCollaborations()]).then(([resultRows, campaignRows, briefMap, collabRows]) => {
      if (!live) return;
      setCampaigns(campaignRows);
      setCollabs(collabRows);
      setRows(mergeBudgetAllocationRows(resultRows, campaignRows, briefMap as Record<string, CampaignBrief>));
      setLoading(false);
    }).catch(() => {
      if (!live) return;
      setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const brandOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.b])) as Record<string, BrandId>, [campaigns]);
  const nameOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const datesOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.dates])), [campaigns]);
  const campaignOf = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c])) as Record<string, CampaignRow>, [campaigns]);

  const filtered = useMemo(() => rows.filter((row) => {
    const b = brandOf[row.campaignId];
    return b && visibleBrands.includes(b) &&
      (brand === "all" || b === brand) &&
      rangeInFilter(date, datesOf[row.campaignId]);
  }), [rows, brandOf, visibleBrands, brand, date, datesOf]);

  const totalPlan = sum(filtered, (r) => r.budget);
  const totalActual = sum(filtered, (r) => r.budgetActual);
  const totalReach = sum(filtered, (r) => r.kpi === "Reach" ? r.reachActual : 0);
  const totalTarget = sum(filtered, (r) => r.kpi === "Reach" ? r.target : 0);
  const totalRevenue = sum(filtered, rowRevenue);
  const totalConversions = sum(filtered, (r) => r.conversions);
  const rowsFilled = filtered.filter((r) => r.reachActual > 0 || r.budgetActual > 0 || r.revenue).length;
  const health = totalPlan > 0 ? Math.max(0, Math.min(100, 100 - Math.max(0, safePct(totalActual, totalPlan) - 100))) : 0;

  const platformGroups = useMemo(() => aggregateBy(filtered, "platform"), [filtered]);
  const campaignGroups = useMemo(() => aggregateBy(filtered, "campaign", nameOf), [filtered, nameOf]);
  const kolRows = useMemo(() => filtered.filter(isKolRow), [filtered]);
  const creativeRows = useMemo(() => filtered.filter(isCreativeRow), [filtered]);
  const kolGroups = useMemo(() => aggregateBy(kolRows, "campaign", nameOf), [kolRows, nameOf]);
  const creativeTypeGroups = useMemo(() => aggregateBy(creativeRows.map((r) => ({ ...r, campaignId: r.type || "Creative" })), "campaign"), [creativeRows]);

  const brandRows = useMemo(() => visibleBrands.map((b) => {
    const brandRows = filtered.filter((r) => brandOf[r.campaignId] === b);
    const plan = sum(brandRows, (r) => r.budget);
    const actual = sum(brandRows, (r) => r.budgetActual);
    const reach = sum(brandRows, (r) => r.kpi === "Reach" ? r.reachActual : 0);
    return { brand: b, plan, actual, reach, rows: brandRows.length };
  }).filter((r) => r.rows > 0 || brand === "all"), [visibleBrands, filtered, brandOf, brand]);

  const branchGroups = useMemo(() => {
    const map = new Map<string, { branch: string; lines: number; kolLines: number; plan: number; adsSpend: number; kolSpend: number; reach: number }>();
    filtered.forEach((row) => {
      const branch = (campaignOf[row.campaignId]?.branch || "").trim() || "ไม่ระบุสาขา";
      const group = map.get(branch) ?? { branch, lines: 0, kolLines: 0, plan: 0, adsSpend: 0, kolSpend: 0, reach: 0 };
      const spend = row.budgetActual || 0;
      group.lines += 1;
      group.plan += row.budget || 0;
      group.reach += row.reachActual || 0;
      if (isKolRow(row)) {
        group.kolSpend += spend;
        group.kolLines += 1;
      } else {
        group.adsSpend += spend;
      }
      map.set(branch, group);
    });
    return Array.from(map.values())
      .map((group) => {
        const total = group.adsSpend + group.kolSpend;
        return { ...group, total, cprActual: group.reach > 0 ? total / group.reach : null };
      })
      .sort((a, b) => b.total - a.total);
  }, [filtered, campaignOf]);

  const kolBranchRows = useMemo(() => {
    const scoped = collabs
      .filter((c) => {
        const b = (c.brand || brandOf[c.campaignId]) as BrandId | undefined;
        return b && visibleBrands.includes(b) && (brand === "all" || b === brand);
      })
      .map((c) => ({ ...c, branch: c.branch || campaignOf[c.campaignId]?.branch || "" }));
    return kolBranchReport(scoped);
  }, [collabs, brandOf, campaignOf, visibleBrands, brand]);

  const activeMeta = REPORTS.find((r) => r.key === active) ?? REPORTS[0];

  return (
    <>
      <PageHeader
        eyebrow="QC"
        title="Performance Center"
        subtitle="อ่านผลลัพธ์จากข้อมูลเดียวกับ Performance Bar — เลือกแท็บเล็กด้านล่างเพื่อดูแต่ละรายงาน"
      />

      <section className="mt-4 rounded-[24px] border border-line bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {REPORTS.map((report) => {
              const Icon = report.icon;
              const on = active === report.key;
              return (
                <button
                  key={report.key}
                  onClick={() => setActive(report.key)}
                  className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-extrabold transition"
                  style={{
                    borderColor: on ? report.color : "#ECEAF2",
                    background: on ? report.bg : "#FBFAF7",
                    color: on ? report.color : "#8A879A",
                    boxShadow: on ? "0 10px 24px rgba(23,23,42,.08)" : "none",
                  }}
                >
                  <Icon size={15} />
                  {report.short}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BrandFilter value={brand} onChange={setBrand} label="" />
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-line bg-[#FBFAF7] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-[17px]"
              style={{ background: activeMeta.bg, color: activeMeta.color }}
            >
              <activeMeta.icon size={22} />
            </div>
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">Current report</div>
              <div className="text-[20px] font-extrabold tracking-[-0.03em] text-ink">{activeMeta.label}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge fg="#0B7F7A" bg="#E3F7F5">{filtered.length} performance line(s)</StatusBadge>
            <StatusBadge fg="#6C5CE7" bg="#EEE9FF">{rowsFilled}/{filtered.length} actual filled</StatusBadge>
            <Link href="/platforms" className="inline-flex items-center gap-1 rounded-full bg-[#17172A] px-3 py-2 text-[12px] font-extrabold text-white">
              Update in Performance Bar <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-4">
        {loading ? (
          <EmptyPanel>กำลังโหลด performance data…</EmptyPanel>
        ) : active === "overview" ? (
          <ReportShell
            title="Marketing Overview Performance"
            desc="ภาพรวม health ของแบรนด์จาก plan budget, actual spend, reach, conversion และ revenue ที่ถูกบันทึกใน Performance Bar"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <KpiCard label="Plan budget" value={compact(totalPlan)} note="from campaign allocation" tone="#0EA5A0" />
              <KpiCard label="Actual spend" value={compact(totalActual)} note={`${pct(safePct(totalActual, totalPlan))} of plan`} tone="#6C5CE7" />
              <KpiCard label="Reach" value={num(totalReach)} note={`${pct(safePct(totalReach, totalTarget))} of target`} tone="#7BC66D" />
              <KpiCard label="Revenue" value={compact(totalRevenue)} note="from actual report rows" tone="#D9B75F" />
              <KpiCard label="Health" value={totalPlan ? pct(health) : "—"} note="budget control score" tone="#0EA5A0" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {brandRows.length ? brandRows.map((row) => (
                <div key={row.brand} className="rounded-[20px] border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[14px] font-extrabold text-ink">
                      <BrandDot brand={row.brand} size={10} /> {brandName(row.brand)}
                    </div>
                    <div className="text-[12px] font-bold text-faint">{row.rows} line(s)</div>
                  </div>
                  <MiniBar value={safePct(row.actual, row.plan)} color={brandColor(row.brand)} />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] font-bold text-muted">
                    <div>Plan <span className="text-ink">{compact(row.plan)}</span></div>
                    <div>Actual <span className="text-ink">{compact(row.actual)}</span></div>
                    <div>Reach <span className="text-ink">{num(row.reach)}</span></div>
                  </div>
                </div>
              )) : <EmptyPanel />}
              <div className="rounded-[20px] border border-[#BCEBE6] bg-[#E3F7F5] p-4">
                <div className="flex items-center gap-2 text-[14px] font-extrabold text-[#0B7F7A]">
                  <Gauge size={18} /> Quick read
                </div>
                <div className="mt-3 space-y-2 text-[13px] font-semibold text-[#406B64]">
                  <div>• Spend pace: <b>{pct(safePct(totalActual, totalPlan))}</b> of plan</div>
                  <div>• Reach pace: <b>{pct(safePct(totalReach, totalTarget))}</b> of target</div>
                  <div>• CPR: <b>{cpr(totalReach > 0 ? totalActual / totalReach : null)}</b></div>
                  <div>• Conversion: <b>{num(totalConversions)}</b></div>
                </div>
              </div>
            </div>
          </ReportShell>
        ) : active === "creative" ? (
          <ReportShell
            title="Creative KPI Performance"
            desc="อ่าน performance ตามชนิด creative / content เพื่อดูว่า asset แบบไหนควรทำซ้ำ หรือแบบไหนควรปรับ"
            action={
              <Link href="/performance-center/creative-kpi" className="inline-flex items-center gap-2 rounded-full bg-[#FDEBF3] px-3 py-2 text-[12px] font-extrabold text-[#C65391]">
                Open detailed Creative KPI <ArrowRight size={14} />
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-4">
              <KpiCard label="Creative lines" value={num(creativeRows.length)} note="from performance rows" tone="#D876AA" />
              <KpiCard label="Spend" value={compact(sum(creativeRows, (r) => r.budgetActual))} note="actual spend" tone="#D876AA" />
              <KpiCard label="Reach" value={num(sum(creativeRows, (r) => r.reachActual))} note="creative result" tone="#7BC66D" />
              <KpiCard label="CPR" value={cpr(sum(creativeRows, (r) => r.reachActual) ? sum(creativeRows, (r) => r.budgetActual) / sum(creativeRows, (r) => r.reachActual) : null)} note="THB / reach" tone="#6C5CE7" />
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <GroupTable rows={creativeTypeGroups} color="#D876AA" label="Creative type" />
              <div className="rounded-[22px] border border-line bg-white p-4">
                <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#C65391]">Top creative rows</div>
                <div className="mt-3 space-y-2">
                  {creativeRows.slice(0, 6).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-[#FBFAF7] px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-extrabold text-ink">{row.ad || row.type}</div>
                        <div className="text-[11.5px] font-semibold text-faint">{row.type} · {row.platform}</div>
                      </div>
                      <StatusBadge tone={statusTone(row)}>{num(row.reachActual)} reach</StatusBadge>
                    </div>
                  ))}
                  {!creativeRows.length && <EmptyPanel />}
                </div>
              </div>
            </div>
          </ReportShell>
        ) : active === "platform" ? (
          <ReportShell
            title="Platform / Ads Performance"
            desc="สรุป budget, actual spend, reach/result และ CPR แยกตาม platform จากข้อมูลเดียวกับ Performance Bar"
            action={
              <Link href="/platforms" className="inline-flex items-center gap-2 rounded-full bg-[#E3F7F5] px-3 py-2 text-[12px] font-extrabold text-[#0B7F7A]">
                Open Performance Bar <ArrowRight size={14} />
              </Link>
            }
          >
            <div className="grid gap-3 md:grid-cols-4">
              <KpiCard label="Platforms" value={num(platformGroups.length)} note="active in this view" tone="#0EA5A0" />
              <KpiCard label="Actual spend" value={compact(totalActual)} note={`${pct(safePct(totalActual, totalPlan))} of plan`} tone="#6C5CE7" />
              <KpiCard label="Reach/result" value={num(sum(filtered, (r) => r.reachActual))} note="all KPI units" tone="#7BC66D" />
              <KpiCard label="Avg CPR" value={cpr(sum(filtered, (r) => r.reachActual) ? totalActual / sum(filtered, (r) => r.reachActual) : null)} note="actual spend / result" tone="#0EA5A0" />
            </div>
            <div className="mt-4">
              <GroupTable rows={platformGroups} color="#0EA5A0" label="Platform" />
            </div>
          </ReportShell>
        ) : active === "campaign" ? (
          <ReportShell
            title="Campaign ROI Performance"
            desc="อ่าน performance ราย campaign เทียบ plan budget, actual spend, revenue และ ROAS ที่บันทึกจาก result rows"
          >
            <div className="grid gap-3 md:grid-cols-4">
              <KpiCard label="Campaigns" value={num(campaignGroups.length)} note="in selected view" tone="#6C5CE7" />
              <KpiCard label="Revenue" value={compact(totalRevenue)} note="actual revenue" tone="#D9B75F" />
              <KpiCard label="Spend" value={compact(totalActual)} note="actual spend" tone="#6C5CE7" />
              <KpiCard label="ROAS" value={totalActual && totalRevenue ? `${(totalRevenue / totalActual).toFixed(1)}×` : "—"} note="revenue / spend" tone="#6C5CE7" />
            </div>
            <div className="mt-4 overflow-hidden rounded-[22px] border border-line">
              <div className="grid grid-cols-[1.4fr_.75fr_.75fr_.75fr_.55fr_.6fr] gap-3 border-b border-line bg-[#FBFAF7] px-4 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
                <div>Campaign</div><div>Budget</div><div>Spend</div><div>Revenue</div><div>ROAS</div><div>Status</div>
              </div>
              {campaignGroups.length ? campaignGroups.slice(0, 9).map((group) => {
                const campaignRows = filtered.filter((row) => row.campaignId === group.key);
                const revenue = sum(campaignRows, rowRevenue);
                const roas = group.budgetActual > 0 && revenue > 0 ? revenue / group.budgetActual : null;
                const campaign = campaignOf[group.key];
                return (
                  <div key={group.key} className="grid grid-cols-[1.4fr_.75fr_.75fr_.75fr_.55fr_.6fr] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-extrabold text-ink">{group.label}</div>
                      <div className="text-[11.5px] font-semibold text-faint">{campaign ? `${brandName(campaign.b)} · ${campaign.dates}` : `${group.rows} line(s)`}</div>
                    </div>
                    <div className="text-[13px] font-bold text-ink">{compact(group.budgetPlan)}</div>
                    <div className="text-[13px] font-bold text-muted">{compact(group.budgetActual)}</div>
                    <div className="text-[13px] font-bold text-muted">{compact(revenue)}</div>
                    <div className="text-[13px] font-extrabold text-[#6C5CE7]">{roas ? `${roas.toFixed(1)}×` : "—"}</div>
                    <StatusBadge tone={group.budgetActual > group.budgetPlan && group.budgetPlan > 0 ? "gold" : "neutral"}>
                      {group.budgetActual > group.budgetPlan && group.budgetPlan > 0 ? "Over plan" : campaign?.status ?? "Live"}
                    </StatusBadge>
                  </div>
                );
              }) : (
                <div className="p-4"><EmptyPanel /></div>
              )}
            </div>
          </ReportShell>
        ) : active === "branch" ? (
          <ReportShell
            title="Branch Performance"
            desc="รวม Ads + KOL ต่อสาขา จากผลลัพธ์ที่ผูก campaign_id เดียวกัน — สาขามาจากแคมเปญของแต่ละบรรทัด"
          >
            <div className="grid gap-3 md:grid-cols-4">
              <KpiCard label="Branches" value={num(branchGroups.length)} note="in selected view" tone="#2E8B7A" />
              <KpiCard label="Ads spend" value={compact(sum(branchGroups, (g) => g.adsSpend))} note="non-KOL lines" tone="#0EA5A0" />
              <KpiCard label="KOL spend" value={compact(sum(branchGroups, (g) => g.kolSpend))} note="creator lines" tone="#E08A34" />
              <KpiCard label="Total spend" value={compact(sum(branchGroups, (g) => g.total))} note="ads + KOL" tone="#6C5CE7" />
            </div>
            <div className="mt-4 overflow-hidden rounded-[22px] border border-line">
              <div className="grid grid-cols-[1.4fr_.8fr_.8fr_.8fr_.7fr_.6fr] gap-3 border-b border-line bg-[#FBFAF7] px-4 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
                <div>Branch</div><div>Ads ฿</div><div>KOL ฿</div><div>Total ฿</div><div>Reach</div><div>CPR</div>
              </div>
              {branchGroups.length ? branchGroups.map((group) => (
                <div key={group.branch} className="grid grid-cols-[1.4fr_.8fr_.8fr_.8fr_.7fr_.6fr] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-extrabold text-ink">{group.branch}</div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#F0EDE6]">
                      <div className="h-full" style={{ width: `${safePct(group.adsSpend, group.total)}%`, background: "#0EA5A0" }} />
                      <div className="h-full" style={{ width: `${safePct(group.kolSpend, group.total)}%`, background: "#E08A34" }} />
                    </div>
                  </div>
                  <div className="text-[13px] font-bold text-[#0B7F7A]">{compact(group.adsSpend)}</div>
                  <div className="text-[13px] font-bold text-[#B4711F]">{compact(group.kolSpend)}</div>
                  <div className="text-[13px] font-extrabold text-ink">{compact(group.total)}</div>
                  <div className="text-[13px] font-bold text-muted">{num(group.reach)}</div>
                  <div className="text-[13px] font-extrabold text-[#2E8B7A]">{cpr(group.cprActual)}</div>
                </div>
              )) : (
                <div className="p-4"><EmptyPanel /></div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] font-bold text-faint">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#0EA5A0" }} /> Ads</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#E08A34" }} /> KOL</span>
              <span className="ml-auto">Ads จาก campaign_results · KOL รายคนจาก kol_collaboration_history</span>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-extrabold text-ink">KOL รายสาขา · Monthly Branch Report</span>
                <span className="rounded-full bg-[#FFF3E5] px-2 py-0.5 text-[10.5px] font-extrabold text-[#B4711F]">from kol_collaboration_history</span>
              </div>
              <div className="overflow-x-auto rounded-[22px] border border-line">
                <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#FBFAF7] text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-faint">
                      <th className="px-3 py-2.5 text-left">Branch</th>
                      <th className="px-3 py-2.5 text-right">KOL Used</th>
                      <th className="px-3 py-2.5 text-right">Reach</th>
                      <th className="px-3 py-2.5 text-right">Engage</th>
                      <th className="px-3 py-2.5 text-right">Cost</th>
                      <th className="px-3 py-2.5 text-right">Cost/Reach</th>
                      <th className="px-3 py-2.5 text-right">Engage%</th>
                      <th className="px-3 py-2.5 text-right">Followers</th>
                      <th className="px-3 py-2.5 text-right">Reach/Follow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kolBranchRows.length ? kolBranchRows.map((b) => (
                      <tr key={b.branch} className="border-t border-line">
                        <td className="px-3 py-2.5 text-left font-extrabold text-ink">{b.branch}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-muted">{num(b.kolUsed)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-muted">{num(b.reach)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-muted">{num(b.engagement)}</td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-ink">{baht(b.cost)}</td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-[#E08A34]">{cpr(b.costPerReach)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-muted">{b.engageRate != null ? `${(b.engageRate * 100).toFixed(1)}%` : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-muted">{num(b.followers)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-muted">{b.reachPerFollow != null ? b.reachPerFollow.toFixed(2) : "—"}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={9} className="px-3 py-8 text-center text-[13px] font-bold text-faint">{empty}</td></tr>
                    )}
                  </tbody>
                  {kolBranchRows.length > 0 && (() => {
                    const kol = sum(kolBranchRows, (b) => b.kolUsed);
                    const reach = sum(kolBranchRows, (b) => b.reach);
                    const engage = sum(kolBranchRows, (b) => b.engagement);
                    const cost = sum(kolBranchRows, (b) => b.cost);
                    const foll = sum(kolBranchRows, (b) => b.followers);
                    return (
                      <tfoot>
                        <tr className="border-t-2 border-line bg-[#F3F8F6] text-[12.5px] font-extrabold text-ink">
                          <td className="px-3 py-2.5 text-left">TOTAL (all branches)</td>
                          <td className="px-3 py-2.5 text-right">{num(kol)}</td>
                          <td className="px-3 py-2.5 text-right">{num(reach)}</td>
                          <td className="px-3 py-2.5 text-right">{num(engage)}</td>
                          <td className="px-3 py-2.5 text-right">{baht(cost)}</td>
                          <td className="px-3 py-2.5 text-right text-[#B4711F]">{cpr(reach > 0 ? cost / reach : null)}</td>
                          <td className="px-3 py-2.5 text-right">{reach > 0 ? `${((engage / reach) * 100).toFixed(1)}%` : "—"}</td>
                          <td className="px-3 py-2.5 text-right">{num(foll)}</td>
                          <td className="px-3 py-2.5 text-right">{foll > 0 ? (reach / foll).toFixed(2) : "—"}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          </ReportShell>
        ) : (
          <ReportShell
            title="KOL Performance"
            desc="แยก performance ของ KOL / influencer จาก budget allocation และ actual result ที่ลงไว้ใน Performance Bar"
          >
            <div className="grid gap-3 md:grid-cols-5">
              <KpiCard label="KOL lines" value={num(kolRows.length)} note="creator result rows" tone="#E08A34" />
              <KpiCard label="KOL budget" value={compact(sum(kolRows, (r) => r.budget))} note="planned" tone="#E08A34" />
              <KpiCard label="Actual spend" value={compact(sum(kolRows, (r) => r.budgetActual))} note="spent" tone="#6C5CE7" />
              <KpiCard label="Reach" value={num(sum(kolRows, (r) => r.reachActual))} note="actual" tone="#7BC66D" />
              <KpiCard label="CPR" value={cpr(sum(kolRows, (r) => r.reachActual) ? sum(kolRows, (r) => r.budgetActual) / sum(kolRows, (r) => r.reachActual) : null)} note="THB / reach" tone="#E08A34" />
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <GroupTable rows={kolGroups} color="#E08A34" label="Campaign" />
              <div className="rounded-[22px] border border-line bg-white p-4">
                <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#E08A34]">KOL learning queue</div>
                <div className="mt-3 space-y-2">
                  {kolRows.slice(0, 6).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-[16px] bg-[#FBFAF7] px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-extrabold text-ink">{row.ad}</div>
                        <div className="text-[11.5px] font-semibold text-faint">{row.platform} · {row.type}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[12px] font-extrabold text-ink">{num(row.reachActual)} reach</div>
                        <div className="text-[11px] font-bold text-faint">{compact(row.budgetActual)} spend</div>
                      </div>
                    </div>
                  ))}
                  {!kolRows.length && <EmptyPanel />}
                </div>
              </div>
            </div>
          </ReportShell>
        )}
      </div>

      <section className="mt-4 rounded-[22px] border border-[#BCEBE6] bg-[#E3F7F5] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Megaphone size={18} className="text-[#0B7F7A]" />
          <div className="text-[13px] font-semibold text-[#4B766F]">
            ใช้ Performance Bar เพื่อกรอก actual / budget result และใช้ Performance Center เพื่ออ่าน dashboard, compare และสรุป learning ให้ทีม
          </div>
          <div className="ml-auto inline-flex items-center gap-1 text-[12px] font-extrabold text-[#0B7F7A]">
            <CheckCircle2 size={14} /> Synced source
          </div>
        </div>
      </section>
    </>
  );
}
