"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { KpiCard } from "@/components/ui/KpiCard";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { baht } from "@/lib/format";
import { dashboardFromDb } from "@/lib/data/derive";
import { CampaignRow } from "@/lib/data/campaigns";
import { Task } from "@/lib/data/tasks";
import { Kol } from "@/lib/data/kol";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchKols } from "@/lib/db/kol";
import { fetchRequests } from "@/lib/db/requests";
import { RequestRow } from "@/lib/data/requests";

// Stages that still need someone to act — what "Pending Approval" means.
const PENDING_STAGES = new Set(["Submitted", "CMO Review", "Revision"]);

export default function DashboardPage() {
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [raw, setRaw] = useState<{ c: CampaignRow[]; t: Task[]; k: Kol[] } | null>(null);
  const [pending, setPending] = useState<RequestRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCampaigns(), fetchTasks(), fetchKols()])
      .then(([c, t, k]) => { if (alive) setRaw({ c, t: t.tasks, k }); })
      .catch(() => {});
    fetchRequests()
      .then((rs) => { if (alive) setPending(rs.filter((r) => PENDING_STAGES.has(r.stage))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Brand filter narrows campaigns/KOLs; the KPIs + P&L follow.
  const dash = useMemo(() => {
    if (!raw) return null;
    const c = raw.c.filter((x) => brand === "all" || x.b === brand);
    const k = raw.k.filter((x) => brand === "all" || x.b === brand);
    return dashboardFromDb(c, raw.t, k);
  }, [raw, brand]);

  const attention = dash?.needsAttention ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Marketing Result Dashboard"
        title="Marketing Result Dashboard"
        subtitle="Track results from Campaigns, Creative, KOL, and Finance in one view."
        right={dash ? (
          <span>
            Spent <b className="text-ink">{baht(dash.spentTotal, { compact: true })}</b> of {baht(dash.budgetTotal, { compact: true })} ·{" "}
            <span className="text-accent font-bold">{dash.usedPct}%</span> used
          </span>
        ) : undefined}
      />

      <div className="mt-[14px]">
        <DateFilterBar value={date} onChange={setDate} />
      </div>
      <div className="mt-5 mb-5">
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      {/* Overall KPIs — derived from real campaigns / tasks / KOLs */}
      <div className="grid gap-[11px] mb-[22px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))" }}>
        {(dash?.kpis ?? []).map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Needs Attention + Pending Approval */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-[22px]">
        <div className="bg-surface border border-line rounded-cardLg p-[22px]">
          <div className="flex items-center justify-between mb-[14px]">
            <div className="text-[15px] font-bold">Needs Attention</div>
            <span className="text-[11px] font-bold text-white bg-status-red rounded-pill px-[9px] py-[3px]">{attention.length}</span>
          </div>
          <div className="flex flex-col gap-[10px]">
            {attention.map((t) => (
              <div key={t.id} className="rounded-[0_11px_11px_0] px-[13px] py-[10px]" style={{ borderLeft: "3px solid #B33A2E", background: "#FFF5F4" }}>
                <div className="flex items-center gap-[7px] mb-[3px] flex-wrap">
                  <span className="text-[10px] font-bold text-status-red">{t.type}</span>
                  <span className="text-[10px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: "#B33A2E22", color: "#B33A2E" }}>{t.assignee}</span>
                </div>
                <div className="text-[13px] font-semibold text-ink mb-[2px]">{t.title}</div>
                <div className="text-[11.5px] text-faint">{t.brand}{t.campaign ? ` · ${t.campaign}` : ""}{t.blocker ? ` · ${t.blocker}` : ""}</div>
              </div>
            ))}
            {attention.length === 0 && <div className="text-[12.5px] text-faint py-6 text-center">Nothing needs attention right now. 🌿</div>}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-cardLg p-[22px]">
          <div className="flex items-center justify-between mb-[14px]">
            <div className="text-[15px] font-bold">Pending Approval</div>
            <span className="text-[11px] font-bold text-white bg-status-red rounded-pill px-[9px] py-[3px]">{pending ? pending.length : 0}</span>
          </div>
          <div>
            {pending && pending.length === 0 && <div className="text-[12.5px] text-faint py-6 text-center">Nothing waiting for approval right now.</div>}
            {(pending ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-[10px] border-b border-line4 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{r.typeIcon} {r.title}</div>
                  <div className="flex items-center gap-2 mt-[2px] flex-wrap">
                    <span className="text-[11px] text-faint">{brandName(r.b)}{r.campaign !== "—" ? ` · ${r.campaign}` : ""}</span>
                    <span className="text-[10.5px] font-semibold text-status-gold">{r.stage}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
