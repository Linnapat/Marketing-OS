"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";
import { BrandFilterValue } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { baht } from "@/lib/format";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchContent } from "@/lib/db/content";
import { fetchGraphics } from "@/lib/db/graphic";
import { fetchKols } from "@/lib/db/kol";
import { fetchExpenseRequests, fetchExpenses } from "@/lib/db/finance";
import { fetchTasks } from "@/lib/db/tasks";
import {
  buildPlatformPerformance,
  platformBrandNames,
  platformDisplay,
  PlatformPerformanceRow,
  PlatformPerformanceSummary,
} from "@/lib/data/performance";

const emptySummary: PlatformPerformanceSummary = {
  totalBudget: 0,
  totalSpend: 0,
  totalContent: 0,
  totalCreatives: 0,
  totalReach: 0,
  openTasks: 0,
  avgSyncScore: 0,
};

const pct = (value: number) => `${Math.round(value)}%`;
const num = (value: number) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value));

export default function PerformanceBarPage() {
  const [rows, setRows] = useState<PlatformPerformanceRow[]>([]);
  const [summary, setSummary] = useState<PlatformPerformanceSummary>(emptySummary);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");
  const visibility = useBrandVisibility();

  const load = async () => {
    setLoading(true);
    try {
      const [campaigns, briefs, content, graphics, kols, expenseRequests, expenses, taskPack] = await Promise.all([
        fetchCampaigns(),
        fetchAllBriefs(),
        fetchContent(),
        fetchGraphics(),
        fetchKols(),
        fetchExpenseRequests(),
        fetchExpenses(),
        fetchTasks(),
      ]);
      const built = buildPlatformPerformance({
        campaigns,
        briefs,
        content,
        graphics,
        kols,
        expenseRequests,
        expenses,
        tasks: taskPack.tasks,
      });
      setRows(built.rows);
      setSummary(built.summary);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    r.brands.some((b) => visibility.isVisible(b)) &&
    (brand === "all" || r.brands.includes(brand)),
  ), [rows, brand, visibility]);

  const filteredSummary = useMemo<PlatformPerformanceSummary>(() => ({
    totalBudget: filtered.reduce((s, r) => s + r.plannedBudget, 0),
    totalSpend: filtered.reduce((s, r) => s + r.actualSpend, 0),
    totalContent: filtered.reduce((s, r) => s + r.contentCount, 0),
    totalCreatives: filtered.reduce((s, r) => s + r.approvedCreatives, 0),
    totalReach: filtered.reduce((s, r) => s + r.kolReach, 0),
    openTasks: filtered.reduce((s, r) => s + r.openTasks, 0),
    avgSyncScore: filtered.length ? Math.round(filtered.reduce((s, r) => s + r.syncScore, 0) / filtered.length) : 0,
  }), [filtered]);

  const connectedModules = [
    ["Campaign", "budget + campaign"],
    ["Content", "posts + publish"],
    ["Creative", "approved assets"],
    ["KOL", "reach + ROAS"],
    ["Finance", "budget + spend"],
    ["My Tasks", "ads tasks"],
  ];

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="PLATFORM PERFORMANCE CENTER"
        title="Performance Bar"
        description="Track platform budget, creative readiness, content activity, KOL results, finance spend, and action tasks in one place."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={(
            <button onClick={load} className="inline-flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">
              <RefreshCw size={14} /> Sync now
            </button>
          )}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <BrandFilter value={brand} onChange={setBrand} />
              <span className="text-[12px] font-semibold text-faint">
                {loading ? "Syncing platform data…" : `Synced ${filtered.length} platform line(s)${updatedAt ? ` · ${updatedAt}` : ""}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {connectedModules.map(([label, sub]) => (
                <span key={label} className="rounded-pill bg-[#F2EEFF] px-3 py-[7px] font-bold text-[#6C5CE7]">{label} · {sub}</span>
              ))}
            </div>
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard
          title="Performance Bar Summary 📊"
          style={{
            background: "linear-gradient(135deg, #7C6CF6 0%, #5B4FD8 100%)",
            border: "1px solid #6C5CE7",
            boxShadow: "0 18px 44px rgba(108, 92, 231, 0.20)",
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { label: "Planned", value: baht(filteredSummary.totalBudget || summary.totalBudget, { compact: true }), note: "from Campaign ads plan" },
              { label: "Actual", value: baht(filteredSummary.totalSpend || summary.totalSpend, { compact: true }), note: "from Finance spend" },
              { label: "Content", value: String(filteredSummary.totalContent), note: "posts by platform" },
              { label: "Creative", value: String(filteredSummary.totalCreatives), note: "approved assets" },
              { label: "Reach", value: num(filteredSummary.totalReach), note: "KOL / creator results" },
              { label: "Sync", value: pct(filteredSummary.avgSyncScore), note: `${filteredSummary.openTasks} open task(s)` },
            ].map((k) => (
              <div key={k.label} className="rounded-[20px] border border-white/20 bg-white/12 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/65 font-extrabold">{k.label}</div>
                <div className="mt-3 text-[26px] leading-none font-extrabold text-white">{k.value}</div>
                <div className="mt-2 text-[11px] font-semibold text-white/65">{k.note}</div>
              </div>
            ))}
          </div>
        </ModuleSummaryCard>

      </div>

      <div className="mt-5 bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="hidden xl:grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.75fr_0.75fr_0.75fr_0.75fr] gap-3 px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-faint font-extrabold border-b border-line4">
          <div>Platform</div><div>Campaign / Brand</div><div>Plan</div><div>Actual</div><div>Content</div><div>Creative</div><div>Tasks</div><div>Sync</div>
        </div>
        {filtered.map((row) => <PlatformRow key={row.platform} row={row} />)}
        {!filtered.length && (
          <div className="py-10 text-center text-[13px] text-faint">
            No platform performance data in this view yet.
          </div>
        )}
      </div>
    </>
  );
}

function PlatformRow({ row }: { row: PlatformPerformanceRow }) {
  const tone = row.syncScore >= 80 ? "green" : row.syncScore >= 50 ? "gold" : "red";
  const variance = row.plannedBudget ? row.plannedBudget - row.actualSpend : 0;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.75fr_0.75fr_0.75fr_0.75fr] gap-3 px-5 py-4 border-b border-line4 last:border-0 hover:bg-ivory/50 transition">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-[12px] flex items-center justify-center text-white" style={{ background: "#6C5CE7" }}><BarChart3 size={17} /></span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-extrabold text-ink truncate">{platformDisplay(row)}</div>
            <div className="text-[11.5px] text-faint truncate">{row.campaigns.length} campaign(s)</div>
          </div>
        </div>
      </div>
      <div>
        <div className="text-[12.5px] font-bold text-muted truncate">{platformBrandNames(row)}</div>
        <div className="text-[11px] text-faint truncate">{row.campaigns.slice(0, 2).join(", ")}{row.campaigns.length > 2 ? ` +${row.campaigns.length - 2}` : ""}</div>
      </div>
      <Metric label="Plan" value={baht(row.plannedBudget || row.committed, { compact: true })} sub={`${row.committed ? baht(row.committed, { compact: true }) : "—"} committed`} />
      <Metric label="Actual" value={baht(row.actualSpend, { compact: true })} sub={row.plannedBudget ? `${variance >= 0 ? "+" : ""}${baht(variance, { compact: true })} remaining` : "spend log"} />
      <Metric label="Content" value={`${row.publishedContent}/${row.contentCount}`} sub="published / total" />
      <Metric label="Creative" value={String(row.approvedCreatives)} sub="approved assets" />
      <Metric label="Tasks" value={String(row.openTasks)} sub={`${row.adsTasks} ads task(s)`} />
      <div className="flex xl:justify-end items-start">
        <div className="flex flex-col gap-2 items-start xl:items-end">
          <StatusBadge tone={tone}>{pct(row.syncScore)} synced</StatusBadge>
          {row.blockers.length > 0 && <div className="text-[10.5px] text-status-red font-bold">{row.blockers.length} blocker(s)</div>}
          {row.roas > 0 && <div className="text-[10.5px] text-faint font-semibold">ROAS {row.roas.toFixed(1)}×</div>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="xl:hidden text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[2px]">{label}</div>
      <div className="text-[13px] font-extrabold text-ink">{value}</div>
      <div className="text-[10.5px] text-faint">{sub}</div>
    </div>
  );
}
