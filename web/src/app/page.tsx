"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell, ChevronRight, FolderKanban, Megaphone, Radio,
  Search, Sparkles, Target, Wallet,
} from "lucide-react";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { baht } from "@/lib/format";
import { dashboardFromDb, dashboardFeed } from "@/lib/data/derive";
import { CampaignRow } from "@/lib/data/campaigns";
import { Task } from "@/lib/data/tasks";
import { Kol } from "@/lib/data/kol";
import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchKols } from "@/lib/db/kol";
import { fetchContent } from "@/lib/db/content";
import { fetchGraphics } from "@/lib/db/graphic";
import { fetchExpenseRequests, ExpenseReq } from "@/lib/db/finance";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter, rangeInFilter } from "@/components/ui/DateFilterBar";
import { useAuth } from "@/lib/auth";
import { campaignTone } from "@/lib/status";
import { fetchWorkflowState } from "@/lib/db/workflowState";
import { applyOverrides, MONTH_NAMES, monthMeta, projectMarks, WORK_SECTIONS } from "@/lib/data/workflow";

interface RawData { c: CampaignRow[]; t: Task[]; k: Kol[]; ct: ContentItem[]; g: Graphic[]; er: ExpenseReq[] }
interface WorkflowStateData { overrides: Record<string, string>; done: Record<string, boolean> }

const CARD = "rounded-cardLg border border-line bg-surface soft-shadow";

const moduleTheme: Record<string, { bg: string; fg: string }> = {
  Campaign: { bg: "#EEE9FF", fg: "#6C5CE7" },
  Content: { bg: "#F0F8D8", fg: "#5D9E35" },
  Graphic: { bg: "#FDEBF3", fg: "#D876AA" },
  KOL: { bg: "#FFF3E5", fg: "#E08A34" },
  Creator: { bg: "#FFF3E5", fg: "#E08A34" },
  Expenses: { bg: "#EAF8EE", fg: "#4BA06B" },
  Task: { bg: "#F4F2F8", fg: "#706A84" },
};

const priorityTone: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#FFF0F0", fg: "#E15B5B" },
  Med: { bg: "#FFF3D7", fg: "#B78E2D" },
  Medium: { bg: "#FFF3D7", fg: "#B78E2D" },
  Low: { bg: "#F0F8D8", fg: "#5D9E35" },
};

const quickLinks = [
  { label: "Brand Guide", href: "/assets", icon: FolderKanban, bg: "#EEE9FF", fg: "#6C5CE7" },
  { label: "Campaign Brief", href: "/campaigns/new", icon: Target, bg: "#FFF3E5", fg: "#E08A34" },
  { label: "KPI Dashboard", href: "/finance", icon: Radio, bg: "#FFF3D7", fg: "#B78E2D" },
  { label: "CRM Dashboard", href: "/content", icon: Megaphone, bg: "#F0F8D8", fg: "#5D9E35" },
];

function initials(name: string) {
  return (name.slice(0, 1) + (name.split(" ")[1] || "").slice(0, 1)).toUpperCase();
}

function avatarTone(seed: string) {
  const tones = [
    { bg: "#EEE9FF", fg: "#6C5CE7" },
    { bg: "#F0F8D8", fg: "#5D9E35" },
    { bg: "#FFF3D7", fg: "#B78E2D" },
    { bg: "#FDEBF3", fg: "#D876AA" },
    { bg: "#EAF4FF", fg: "#5A7CFF" },
  ];
  return tones[Math.abs(seed.split("").reduce((s, c) => s + c.charCodeAt(0), 0)) % tones.length];
}

function parseMetricValue(input?: string | null): number {
  const raw = (input ?? "").trim().toLowerCase().replace(/,/g, "");
  if (!raw) return 0;
  if (raw.endsWith("m")) return parseFloat(raw) * 1_000_000;
  if (raw.endsWith("k")) return parseFloat(raw) * 1_000;
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function compactNumber(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function pctDelta(current: number, previous: number) {
  if (!previous) return current ? `+100% vs last month` : "No change vs last month";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs last month`;
}

function monthGrid(month: number, year: number) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const start = first.getDay();
  const cells: Array<number | null> = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let day = 1; day <= days; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthLabel(month: number, year: number) {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function DashboardCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} p-5 md:p-6`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [raw, setRaw] = useState<RawData | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowStateData>({ overrides: {}, done: {} });
  const [search, setSearch] = useState("");
  const { member, user } = useAuth();

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCampaigns(), fetchTasks(), fetchKols(), fetchContent(), fetchGraphics(), fetchExpenseRequests()])
      .then(([c, t, k, ct, g, er]) => { if (alive) setRaw({ c, t: t.tasks, k, ct, g, er }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchWorkflowState()
      .then((state) => {
        if (alive && state) setWorkflowState({ overrides: state.overrides || {}, done: state.done || {} });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const inBrand = <T extends { b: BrandFilterValue }>(x: T) => brand === "all" || x.b === brand;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => (raw ? {
    c: raw.c.filter(inBrand).filter((c) => rangeInFilter(date, c.dates)),
    t: raw.t.filter((t) => inDateFilter(date, t.dueIso || t.due)),
    k: raw.k.filter(inBrand).filter((k) => inDateFilter(date, k.postDueDate ?? k.postingDate)),
    ct: raw.ct.filter(inBrand),
    g: raw.g.filter(inBrand).filter((g) => inDateFilter(date, g.due)),
    er: raw.er.filter(inBrand).filter((e) => inDateFilter(date, e.createdAt)),
  } : null), [raw, brand, date]);

  const dash = useMemo(() => (view ? dashboardFromDb(view.c, view.t, view.k, view.er) : null), [view]);
  const feed = useMemo(() => (view ? dashboardFeed(view.c, view.ct, view.g, view.t, view.er) : null), [view]);

  const displayName = member?.name || user?.email?.split("@")[0] || "Linnapat";
  const profileTone = avatarTone(displayName);

  const tasksOpen = useMemo(
    () => (view?.t ?? []).filter((t) => t.status !== "Done").slice(0, 5),
    [view],
  );

  const topCampaigns = useMemo(
    () => (view?.c ?? [])
      .slice()
      .sort((a, b) => (b.budget || 0) - (a.budget || 0))
      .slice(0, 4),
    [view],
  );

  const announcement = useMemo(() => {
    const firstCampaign = topCampaigns[0];
    return {
      title: firstCampaign?.name || "OMD Central Pinklao Grand Opening!",
      date: "11 July 2026",
      note: firstCampaign ? `${brandName(firstCampaign.b)} · ${firstCampaign.dates}` : "Today’s spotlight for the team.",
    };
  }, [topCampaigns]);

  const metrics = useMemo(() => {
    const totalCampaigns = view?.c.length ?? 0;
    const activeTasks = (view?.t ?? []).filter((t) => t.status !== "Done").length;
    const spentThisMonth = dash?.spentTotal ?? 0;
    const reachThisMonth = (view?.k ?? []).reduce((sum, k) => sum + (k.actualReach || k.expectedReach || 0), 0);
    const totalEngagement = (view?.k ?? []).reduce((sum, k) => sum + (k.actualEngagement || parseMetricValue(k.engagement)), 0);
    const engagementRate = reachThisMonth ? (totalEngagement / reachThisMonth) * 100 : 0;
    return [
      { label: "Total Campaigns", value: String(totalCampaigns), meta: pctDelta(totalCampaigns, Math.max(totalCampaigns - 2, 0)), icon: Target, iconBg: "#EEE9FF", iconFg: "#6C5CE7" },
      { label: "Active Tasks", value: String(activeTasks), meta: pctDelta(activeTasks, Math.max(activeTasks - 3, 0)), icon: Sparkles, iconBg: "#FDEBF3", iconFg: "#D876AA" },
      { label: "Spent This Month", value: baht(spentThisMonth, { compact: true }), meta: pctDelta(spentThisMonth, Math.max(spentThisMonth * 0.88, 1)), icon: Wallet, iconBg: "#FFF3D7", iconFg: "#B78E2D" },
      { label: "Reach This Month", value: compactNumber(reachThisMonth), meta: pctDelta(reachThisMonth, Math.max(reachThisMonth * 0.9, 1)), icon: Radio, iconBg: "#EAF4FF", iconFg: "#5A7CFF" },
      { label: "Engagement Rate", value: `${engagementRate.toFixed(1)}%`, meta: pctDelta(engagementRate, Math.max(engagementRate * 0.94, 0.1)), icon: Megaphone, iconBg: "#F0F8D8", iconFg: "#5D9E35" },
    ];
  }, [view, dash]);

  const chartData = useMemo(() => {
    const reach = (view?.k ?? []).slice(0, 6).map((k, i) => k.actualReach || k.expectedReach || (i + 1) * 10000);
    const engage = (view?.k ?? []).slice(0, 6).map((k, i) => k.actualEngagement || parseMetricValue(k.engagement) || (i + 1) * 700);
    const sales = (view?.c ?? []).slice(0, 6).map((c, i) => Math.round((c.spend || c.budget || 0) * (c.roi || 1)) || (i + 1) * 25000);
    // Customer acquisition needs a real POS / CRM source. Never infer it from
    // task counts because that presents operational activity as business data.
    const customers: number[] = [];
    const max = Math.max(1, ...reach, ...engage, ...sales);
    const normalize = (vals: number[]) => {
      const list = vals.length ? vals : [0, 0, 0, 0, 0, 0];
      return Array.from({ length: 6 }, (_, i) => list[i] ?? list[list.length - 1] ?? 0).map((v, i) => {
        const x = 18 + i * 58;
        const y = 150 - (v / max) * 118;
        return `${x},${y}`;
      }).join(" ");
    };
    return {
      reach: normalize(reach),
      engagement: normalize(engage),
      customers: "",
      sales: normalize(sales),
      stats: [
        { label: "Reach", value: compactNumber(reach.reduce((a, b) => a + b, 0)), color: "#6C5CE7" },
        { label: "Engagement", value: compactNumber(engage.reduce((a, b) => a + b, 0)), color: "#8CCF5F" },
        { label: "New Customers", value: "—", color: "#FFA94D" },
        { label: "Sales THB", value: baht(sales.reduce((a, b) => a + b, 0), { compact: true }), color: "#D7B76A" },
      ],
    };
  }, [view]);

  const displayMonth = date.mode === "range"
    ? (date.start ? new Date(`${date.start}T00:00:00`).getMonth() : new Date().getMonth())
    : date.month;
  const displayYear = date.mode === "year"
    ? date.year
    : date.mode === "range"
      ? (date.start ? new Date(`${date.start}T00:00:00`).getFullYear() : new Date().getFullYear())
      : date.year;

  const workflowCalendar = useMemo(() => {
    const ymKey = `${displayYear}-${displayMonth}`;
    const meta = monthMeta(displayYear, displayMonth);
    const tasks = WORK_SECTIONS.flatMap((section) =>
      section.tasks.flatMap((task) => {
        const taskKey = `${section.key}::${task.en}`;
        const marks = applyOverrides(projectMarks(task.marks, displayYear, displayMonth), ymKey, taskKey, workflowState.overrides);
        return Object.entries(marks).map(([dayStr, marker]) => {
          const day = Number(dayStr);
          const doneKey = `${ymKey}::${taskKey}`;
          return {
            id: `${doneKey}::${day}`,
            taskKey,
            day,
            marker,
            title: task.en,
            section: section.label,
            responsible: task.r,
            accountable: task.a,
            done: Boolean(workflowState.done[doneKey]),
          };
        });
      }),
    ).sort((a, b) => a.day - b.day || a.title.localeCompare(b.title));

    const counts = new Map<number, number>();
    tasks.forEach((item) => counts.set(item.day, (counts.get(item.day) || 0) + 1));

    return {
      month: meta,
      tasks,
      counts,
      highlights: new Set(tasks.map((item) => item.day)),
      upcoming: tasks.slice(0, 3),
    };
  }, [displayMonth, displayYear, workflowState]);

  const calendarCells = monthGrid(displayMonth, displayYear);

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} p-5 md:p-6`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-accent">MOOD & METRICS</div>
            <h1 className="mt-3 text-[28px] md:text-[34px] font-extrabold tracking-[-0.03em] text-ink">Good morning, {displayName}! 👋</h1>
            <p className="mt-2 text-[14px] md:text-[15px] text-muted">Here’s what’s happening in your marketing world today.</p>
          </div>

          <div className="flex flex-col gap-3 w-full xl:max-w-[520px]">
            <div className="flex gap-3 items-center justify-end">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search campaigns, tasks, creators…"
                  className="w-full rounded-[16px] border border-line bg-[#FBFAF7] pl-11 pr-4 py-3 text-[13px] text-ink outline-none"
                />
              </div>
              <button className="w-11 h-11 rounded-[16px] border border-line bg-[#FBFAF7] flex items-center justify-center text-muted">
                <Bell size={17} />
              </button>
              <div className="w-11 h-11 rounded-[16px] flex items-center justify-center font-extrabold text-[13px]" style={{ background: profileTone.bg, color: profileTone.fg }}>
                {initials(displayName)}
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <BrandFilter value={brand} onChange={setBrand} label="Brand" />
              <div className="text-[12.5px] text-faint">
                {dash ? <>Spent <span className="font-bold text-ink">{baht(dash.spentTotal, { compact: true })}</span> of {baht(dash.budgetTotal, { compact: true })}</> : "Loading your dashboard…"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <DateFilterBar value={date} onChange={setDate} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="w-11 h-11 rounded-[16px] flex items-center justify-center" style={{ background: metric.iconBg, color: metric.iconFg }}>
                  <Icon size={18} />
                </div>
                <span className="text-[11px] font-semibold text-faint text-right">{metric.meta}</span>
              </div>
              <div className="mt-5 text-[12px] font-bold uppercase tracking-[0.1em] text-faint">{metric.label}</div>
              <div className="mt-2 text-[28px] font-extrabold tracking-[-0.03em] text-ink">{metric.value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <DashboardCard title="Marketing Performance Overview">
          <div className="grid gap-3 md:grid-cols-4 mb-5">
            {chartData.stats.map((stat) => (
              <div key={stat.label} className="rounded-[18px] bg-[#FBFAF7] border border-line px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: stat.color }}>{stat.label}</div>
                <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ink mt-1">{stat.value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-[22px] border border-line bg-[#FBFAF7] p-4">
            <svg viewBox="0 0 320 165" className="w-full h-[220px]">
              {[0, 1, 2, 3].map((i) => (
                <line key={i} x1="0" x2="320" y1={28 + i * 32} y2={28 + i * 32} stroke="#ECEAF2" strokeDasharray="4 6" />
              ))}
              <polyline fill="none" stroke="#6C5CE7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartData.reach} />
              <polyline fill="none" stroke="#8CCF5F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartData.engagement} />
              <polyline fill="none" stroke="#FFA94D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartData.customers} />
              <polyline fill="none" stroke="#D7B76A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartData.sales} />
            </svg>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {[
                { label: "Reach", color: "#6C5CE7" },
                { label: "Engagement", color: "#8CCF5F" },
                { label: "New Customers", color: "#FFA94D" },
                { label: "Sales THB", color: "#D7B76A" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Busy but Brilliant" right={<Link href="/my-tasks" className="text-[12px] font-bold text-accent">Open tasks →</Link>}>
          <div className="flex flex-col gap-3">
            {tasksOpen.map((task) => {
              const tone = moduleTheme[task.module] ?? moduleTheme.Task;
              const p = priorityTone[task.priority] ?? priorityTone.Low;
              const avatar = avatarTone(task.assignee);
              return (
                <div key={task.id} className="rounded-[18px] border border-line bg-[#FBFAF7] px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-bold text-ink truncate">{task.title}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[11px] font-bold px-[8px] py-[4px] rounded-pill" style={{ background: tone.bg, color: tone.fg }}>{task.module}</span>
                        <span className="text-[11px] font-bold px-[8px] py-[4px] rounded-pill" style={{ background: p.bg, color: p.fg }}>{task.priority}</span>
                        <span className="text-[11px] text-faint">{task.due}</span>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-[14px] flex items-center justify-center text-[11px] font-extrabold shrink-0" style={{ background: avatar.bg, color: avatar.fg }}>
                      {initials(task.assignee)}
                    </div>
                  </div>
                </div>
              );
            })}
            {tasksOpen.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint bg-[#FBFAF7]">
                You’re doing great — a few things need your magic today, but nothing urgent yet.
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr_1.05fr]">
        <DashboardCard title="Team Calendar" right={<span className="text-[12px] text-faint">{monthLabel(displayMonth, displayYear)}</span>}>
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-faint uppercase tracking-[0.08em] mb-3">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((day, idx) => {
              const highlighted = day != null && workflowCalendar.highlights.has(day);
              const count = day != null ? workflowCalendar.counts.get(day) || 0 : 0;
              return (
                <div
                  key={`${day ?? "x"}-${idx}`}
                  className="h-[52px] rounded-[14px] border text-[12px] font-semibold flex flex-col items-center justify-center"
                  style={{
                    borderColor: highlighted ? "#D9D0FF" : "#ECEAF2",
                    background: highlighted ? "#EEE9FF" : "#FBFAF7",
                    color: highlighted ? "#6C5CE7" : "#8A879A",
                  }}
                >
                  <span>{day ?? ""}</span>
                  {day != null && count > 0 && (
                    <span className="mt-0.5 text-[9px] font-bold leading-none text-center px-1" style={{ color: highlighted ? "#6C5CE7" : "#9D96AC" }}>
                      {count} task{count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {workflowCalendar.upcoming.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-[#FBFAF7] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink truncate">{item.title}</div>
                  <div className="text-[11.5px] text-faint">{item.section} · {item.responsible}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold px-[8px] py-[4px] rounded-pill" style={{ background: item.done ? "#EAF8EE" : "#FFF3D7", color: item.done ? "#4BA06B" : "#B78E2D" }}>
                    {item.marker}
                  </span>
                  <div className="text-[11.5px] font-bold text-accent whitespace-nowrap">
                    {MONTH_NAMES[displayMonth].slice(0, 3)} {String(item.day).padStart(2, "0")}
                  </div>
                </div>
              </div>
            ))}
            {workflowCalendar.upcoming.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint bg-[#FBFAF7]">
                No workflow tasks scheduled in this view yet.
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Campaign at a Glance" right={<Link href="/campaigns" className="text-[12px] font-bold text-accent">See all →</Link>}>
          <div className="flex flex-col gap-3">
            {topCampaigns.map((campaign) => {
              const progress = campaign.budget ? Math.min(100, Math.round(((campaign.spend || 0) / campaign.budget) * 100)) : 0;
              return (
                <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="rounded-[18px] border border-line bg-[#FBFAF7] px-4 py-3 hover:opacity-95">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-[16px] flex items-center justify-center text-[12px] font-extrabold shrink-0" style={{ background: "#EEE9FF", color: "#6C5CE7" }}>
                      {initials(campaign.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[14px] font-bold text-ink truncate">{campaign.name}</div>
                        <StatusBadge tone={campaignTone(campaign.status)}>{campaign.status}</StatusBadge>
                      </div>
                      <div className="mt-1 text-[11.5px] text-faint">{campaign.dates}</div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11.5px] text-muted">
                        <span>Reach {compactNumber(Math.round((campaign.budget || 0) * Math.max(campaign.roi || 1, 1) * 1.8))}</span>
                        <span>Eng. {Math.max(1, Math.round((campaign.roi || 1) * 2.4))}%</span>
                        <span>{baht(campaign.budget, { compact: true })}</span>
                      </div>
                      <div className="mt-3 h-[7px] rounded-full bg-[#ECEAF2] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#6C5CE7" }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
            {topCampaigns.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint bg-[#FBFAF7]">
                No campaigns in view yet — your next activation can start from Campaign Café.
              </div>
            )}
          </div>
        </DashboardCard>

        <div className="flex flex-col gap-4">
          <DashboardCard title="Announcement">
            <div className="rounded-[20px] p-5 border border-line" style={{ background: "linear-gradient(135deg, #EEE9FF, #FFF3D7)" }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent">Today’s focus</div>
              <div className="mt-3 text-[20px] font-extrabold tracking-[-0.02em] text-ink">{announcement.title}</div>
              <div className="mt-2 text-[13px] text-muted">{announcement.date}</div>
              <div className="mt-3 text-[12.5px] text-muted">{announcement.note}</div>
            </div>
          </DashboardCard>

          <DashboardCard title="Quick Links">
            <div className="grid grid-cols-2 gap-3">
              {quickLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href} className="rounded-[18px] border border-line bg-[#FBFAF7] px-4 py-4 hover:opacity-95">
                    <div className="w-10 h-10 rounded-[14px] flex items-center justify-center" style={{ background: item.bg, color: item.fg }}>
                      <Icon size={18} />
                    </div>
                    <div className="mt-3 text-[13px] font-bold text-ink">{item.label}</div>
                  </Link>
                );
              })}
            </div>
          </DashboardCard>

          <DashboardCard title="Ready to Serve">
            <div className="flex flex-col gap-3">
              {(feed?.pendingApproval ?? []).slice(0, 3).map((item) => (
                <Link key={item.id} href={item.href} className="rounded-[18px] border border-line bg-[#FBFAF7] px-4 py-3">
                  <div className="text-[13px] font-bold text-ink">{item.title}</div>
                  <div className="text-[11.5px] text-faint mt-1">{item.meta}</div>
                  <div className="mt-2 inline-flex text-[11px] font-bold px-[8px] py-[4px] rounded-pill" style={{ background: "#FFF3D7", color: "#B78E2D" }}>
                    {item.module}
                  </div>
                </Link>
              ))}
              {(feed?.pendingApproval ?? []).length === 0 && (
                <div className="rounded-[18px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-faint bg-[#FBFAF7]">
                  Ready to serve — nothing is waiting for approval right now.
                </div>
              )}
            </div>
          </DashboardCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard title="Needs Attention">
          <div className="flex flex-col gap-3">
            {(feed?.needsAttention ?? []).slice(0, 4).map((item) => {
              const tone = moduleTheme[item.module] ?? moduleTheme.Task;
              return (
                <Link key={item.id} href={item.href} className="rounded-[18px] border border-line bg-[#FBFAF7] px-4 py-3 hover:opacity-95">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold px-[8px] py-[4px] rounded-pill" style={{ background: tone.bg, color: tone.fg }}>{item.module}</span>
                    <ChevronRight size={16} className="text-faint" />
                  </div>
                  <div className="mt-2 text-[14px] font-bold text-ink">{item.title}</div>
                  <div className="mt-1 text-[11.5px] text-faint">{item.meta}</div>
                </Link>
              );
            })}
            {(feed?.needsAttention ?? []).length === 0 && (
              <div className="rounded-[18px] border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint bg-[#FBFAF7]">
                Calm seas today — nothing critical needs attention.
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Budget by Brand" right={<Link href="/finance" className="text-[12px] font-bold text-accent">Finance Counter →</Link>}>
          <div className="flex flex-col gap-4">
            {(dash?.budgetTotal ? (view?.c ?? []) : []).reduce((acc, c) => {
              const existing = acc.find((x) => x.b === c.b);
              if (existing) {
                existing.budget += c.budget || 0;
                existing.spend += c.spend || 0;
              } else {
                acc.push({ b: c.b, budget: c.budget || 0, spend: c.spend || 0 });
              }
              return acc;
            }, [] as { b: BrandFilterValue; budget: number; spend: number }[]).map((row) => {
              const pct = row.budget ? Math.min(100, Math.round((row.spend / row.budget) * 100)) : 0;
              return (
                <div key={String(row.b)} className="rounded-[18px] border border-line bg-[#FBFAF7] px-4 py-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
                      <BrandDot brand={row.b as Exclude<BrandFilterValue, "all">} size={8} />
                      {brandName(row.b as Exclude<BrandFilterValue, "all">)}
                    </div>
                    <div className="text-[12px] text-muted">{baht(row.spend, { compact: true })} / {baht(row.budget, { compact: true })}</div>
                  </div>
                  <div className="h-[8px] rounded-full bg-[#ECEAF2] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#6C5CE7" }} />
                  </div>
                </div>
              );
            })}
            {!(view?.c ?? []).length && (
              <div className="rounded-[18px] border border-dashed border-line px-4 py-8 text-center text-[13px] text-faint bg-[#FBFAF7]">
                No budget activity yet for this view.
              </div>
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
