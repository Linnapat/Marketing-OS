"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { KpiCard } from "@/components/ui/KpiCard";
import { BrandFilterValue } from "@/lib/brands";
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

interface RawData { c: CampaignRow[]; t: Task[]; k: Kol[]; ct: ContentItem[]; g: Graphic[] }

export default function DashboardPage() {
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [raw, setRaw] = useState<RawData | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCampaigns(), fetchTasks(), fetchKols(), fetchContent(), fetchGraphics()])
      .then(([c, t, k, ct, g]) => { if (alive) setRaw({ c, t: t.tasks, k, ct, g }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const inBrand = <T extends { b: BrandFilterValue }>(x: T) => brand === "all" || x.b === brand;

  // Brand filter narrows every module; KPIs + the pending/attention feed follow.
  const dash = useMemo(() => (raw ? dashboardFromDb(raw.c.filter(inBrand), raw.t, raw.k.filter(inBrand)) : null), [raw, brand]);
  const feed = useMemo(
    () => (raw ? dashboardFeed(raw.c.filter(inBrand), raw.ct.filter(inBrand), raw.g.filter(inBrand), raw.t) : null),
    [raw, brand],
  );

  const attention = feed?.needsAttention ?? [];
  const pending = feed?.pendingApproval ?? null;

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
              <Link key={t.id} href={t.href} className="block rounded-[0_11px_11px_0] px-[13px] py-[10px] hover:opacity-90" style={{ borderLeft: "3px solid #B33A2E", background: "#FFF5F4" }}>
                <div className="flex items-center gap-[7px] mb-[3px] flex-wrap">
                  <span className="text-[10px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: "#B33A2E22", color: "#B33A2E" }}>{t.module}</span>
                </div>
                <div className="text-[13px] font-semibold text-ink mb-[2px]">{t.title}</div>
                <div className="text-[11.5px] text-faint">{t.meta}</div>
              </Link>
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
              <Link key={r.id} href={r.href} className="flex items-center gap-3 py-[10px] border-b border-line4 last:border-0 hover:opacity-90">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{r.title}</div>
                  <div className="flex items-center gap-2 mt-[2px] flex-wrap">
                    <span className="text-[11px] text-faint">{r.meta}</span>
                    <span className="text-[10.5px] font-semibold text-status-gold">{r.module}</span>
                  </div>
                </div>
                <span className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-[11px] py-[5px] whitespace-nowrap">Review →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
