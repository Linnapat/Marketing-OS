"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Progress } from "@/components/ui/Progress";
import { BrandFilterValue, BrandId } from "@/lib/brands";
import { baht } from "@/lib/format";
import { campaignTone } from "@/lib/status";
import {
  CAMPAIGNS, STATUS_ORDER, READINESS_META, monthlySummary,
} from "@/lib/data/campaigns";

export default function CampaignsPage() {
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [status, setStatus] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Completed: true, Draft: true, Cancelled: true,
  });

  const summary = monthlySummary(brand);

  const filtered = CAMPAIGNS.filter(
    (c) => (brand === "all" || c.b === brand) && (status === "all" || c.status === status),
  );
  const groups = STATUS_ORDER
    .map((s) => ({ status: s, rows: filtered.filter((c) => c.status === s) }))
    .filter((g) => g.rows.length > 0);

  const statusChips = ["all", ...STATUS_ORDER];

  return (
    <>
      <PageHeader
        eyebrow="Campaign Command Center"
        title="Campaigns"
        subtitle={`${filtered.length} campaigns · plan, track, and profit from every activation`}
      />

      {/* Monthly budget summary — dark card */}
      <div className="mt-[14px] bg-panel text-white rounded-cardLg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="text-[13px] font-bold text-white/90">Monthly Budget → Result Summary</div>
          <div className="flex items-center gap-[7px] flex-wrap">
            {(["all", "teppen", "omakase", "mainichi", "touka"] as BrandFilterValue[]).map((k) => {
              const label = k === "all" ? "All" : summary.bars.find((b) => b.id === k)?.name ?? k;
              const active = k === brand;
              return (
                <button
                  key={k}
                  onClick={() => setBrand(k)}
                  className="text-[12px] px-3 py-[5px] rounded-pill whitespace-nowrap transition"
                  style={active
                    ? { fontWeight: 700, background: "#fff", color: "#211F1C" }
                    : { fontWeight: 500, border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.7)" }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))" }}>
          {[
            { label: "Total Budget", value: summary.budget, sub: `${summary.count} campaigns` },
            { label: "Spent", value: summary.spend, sub: `${summary.spendPct}% utilized` },
            { label: "Expected Revenue", value: summary.revenue, sub: "projected" },
            { label: "Expected GP", value: summary.gp, sub: "38% margin" },
            { label: "Blended ROAS", value: summary.roas, sub: "avg across", color: summary.roasColor },
            { label: "Active", value: String(summary.activeCount), sub: "in flight" },
          ].map((c) => (
            <div key={c.label}>
              <div className="text-[10px] uppercase tracking-[0.06em] text-white/45 font-bold mb-[6px]">{c.label}</div>
              <div className="text-[20px] font-extrabold letter-tightest" style={{ color: c.color ?? "#fff" }}>{c.value}</div>
              <div className="text-[10.5px] text-white/40 mt-[2px]">{c.sub}</div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-white/10">
          <div className="text-[10px] uppercase tracking-[0.06em] text-white/40 font-bold mb-[10px]">Budget by Brand</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
            {summary.bars.map((b) => (
              <div key={b.id}>
                <div className="flex items-center justify-between mb-[5px]">
                  <span className="flex items-center gap-[6px] text-[11.5px] text-white/70"><BrandDot brand={b.id as BrandId} size={7} />{b.name}</span>
                  <span className="text-[11.5px] font-bold text-white/85">{b.budgetF}</span>
                </div>
                <Progress value={b.barW} color={b.color} track="rgba(255,255,255,.1)" height={5} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4">
        <DateFilterBar value={date} onChange={setDate} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <BrandFilter value={brand} onChange={setBrand} />
        <div className="flex items-center gap-[9px]">
          <span className="text-[11px] font-bold text-faint tracking-[0.05em] uppercase">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-[13px] font-semibold text-ink bg-white border border-line2 rounded-[10px] px-3 py-[8px] cursor-pointer outline-none"
          >
            {statusChips.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All Statuses" : s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status-grouped collapsible list */}
      <div className="mt-5 flex flex-col gap-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.status];
          return (
            <div key={g.status} className="bg-surface border border-line rounded-cardLg overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g.status]: !c[g.status] }))}
                className="w-full flex items-center gap-2 px-5 py-[13px] hover:bg-ivory/60 transition"
              >
                {isCollapsed ? <ChevronRight size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
                <StatusBadge tone={campaignTone(g.status)}>{g.status}</StatusBadge>
                <span className="text-[12px] text-faint font-semibold">{g.rows.length}</span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-line4">
                  {/* header row (desktop) */}
                  <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
                    style={{ gridTemplateColumns: "2.4fr 1.3fr 1fr 1fr 0.9fr 1.2fr" }}>
                    <div>Campaign</div><div>Brand · Branch</div><div>Owner</div><div>Budget</div><div>ROI</div><div>Readiness</div>
                  </div>
                  {g.rows.map((c) => (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="grid grid-cols-1 md:grid-cols-[2.4fr_1.3fr_1fr_1fr_0.9fr_1.2fr] gap-y-1 px-5 py-[13px] items-center border-b border-line4 last:border-0 hover:bg-ivory/60 transition"
                    >
                      <div>
                        <div className="text-[13.5px] font-bold text-ink">{c.name}</div>
                        <div className="text-[11px] text-faint mt-[1px]">{c.campType} · {c.dates}</div>
                      </div>
                      <div className="flex items-center gap-[6px] text-[12px] text-muted">
                        <BrandDot brand={c.b} size={7} />{c.branch}
                      </div>
                      <div className="text-[12.5px] text-muted">{c.owner}</div>
                      <div className="text-[13px] font-semibold text-ink">{baht(c.budget, { compact: true })}</div>
                      <div className="text-[13px] font-bold" style={{ color: !c.roi ? "#9A9387" : c.roi < 2 ? "#C68A1E" : "#4E7A4E" }}>
                        {c.roi ? `${c.roi}×` : "—"}
                      </div>
                      <div>
                        <StatusBadge tone={READINESS_META[c.readiness].tone}>{READINESS_META[c.readiness].label}</StatusBadge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
