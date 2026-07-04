"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionLabel } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { BrandFilterValue } from "@/lib/brands";
import { TONES } from "@/lib/status";
import {
  OVERALL_KPIS, TEAM_RESULTS, TEAM_HEALTH, HEALTH_TONE,
  DASH_ALERTS, DASH_APPROVALS, TEAM_PULSE,
} from "@/lib/data/dashboard";
import { brandName } from "@/lib/brands";
import { fetchRequests } from "@/lib/db/requests";
import { RequestRow } from "@/lib/data/requests";

// Stages that still need someone to act — what "Pending Approval" means.
const PENDING_STAGES = new Set(["Submitted", "CMO Review", "Revision"]);

export default function DashboardPage() {
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [pending, setPending] = useState<RequestRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRequests()
      .then((rs) => { if (alive) setPending(rs.filter((r) => PENDING_STAGES.has(r.stage))); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Wednesday · July 2, 2026"
        title="Marketing Result Dashboard"
        subtitle="Track results from CRM, Marketing, Creative, and KOL in one view."
        right={
          <span>
            Spent <b className="text-ink">฿2.84M</b> of ฿4.50M ·{" "}
            <span className="text-accent font-bold">63%</span> used
          </span>
        }
      />

      <div className="mt-[14px]">
        <DateFilterBar value={date} onChange={setDate} />
      </div>
      <div className="mt-5 mb-5">
        <BrandFilter value={brand} onChange={setBrand} />
      </div>

      {/* Overall KPIs */}
      <div className="grid gap-[11px] mb-[22px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(155px,1fr))" }}>
        {OVERALL_KPIS.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Team Result rows */}
      <SectionLabel className="mb-[13px]">Team Results</SectionLabel>
      <div className="flex flex-col gap-3 mb-6">
        {TEAM_RESULTS.map((tr) => {
          const health = HEALTH_TONE[tr.health];
          const barColor = health.bar;
          return (
            <div key={tr.id} className="bg-surface border border-line rounded-cardLg px-5 py-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-[10px]" style={{ flex: "0 0 220px" }}>
                  <span className="text-[22px]">{tr.icon}</span>
                  <div>
                    <div className="text-[14.5px] font-extrabold mb-[3px]">{tr.label}</div>
                    <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                  </div>
                </div>
                <div style={{ flex: "0 0 140px" }}>
                  <div className="flex items-baseline gap-[6px] mb-[5px]">
                    <span className="text-[20px] font-extrabold" style={{ color: barColor }}>{tr.achievement}%</span>
                    <span className="text-[10.5px] text-faint">{tr.achieveTarget}</span>
                  </div>
                  <Progress value={tr.achievement} color={barColor} height={6} />
                </div>
                <div className="flex gap-2 flex-1 flex-wrap min-w-0">
                  {tr.kpis.map((kpi) => (
                    <div key={kpi.label} className="bg-ivory border border-line3 rounded-[11px] px-[14px] py-[9px] min-w-[90px]">
                      <div className="text-[9.5px] text-faint font-bold uppercase tracking-[0.04em] mb-[3px]">{kpi.label}</div>
                      <div className="text-[16px] font-bold" style={{ color: kpi.color }}>{kpi.val}</div>
                      <div className="text-[10px] text-faint mt-[1px]">{kpi.sub}</div>
                    </div>
                  ))}
                </div>
                <Link href={tr.href} className="text-[12px] text-accent font-bold whitespace-nowrap flex-shrink-0">View →</Link>
              </div>
              <div className="flex gap-6 mt-3 pt-[11px] border-t border-line4 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: "#4E7A4E" }}>✓ Best result · </span>
                  <span className="text-[12px] text-ink font-semibold">{tr.bestResult}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.04em]" style={{ color: "#B8945A" }}>✦ Next action · </span>
                  <span className="text-[12px] text-muted font-semibold">{tr.nextAction}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Team Health */}
      <SectionLabel className="mb-[13px]">Team Health</SectionLabel>
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        {TEAM_HEALTH.map((th) => {
          const health = HEALTH_TONE[th.health];
          return (
            <div key={th.team} className="bg-surface border border-line rounded-card p-[18px]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[18px]">{th.icon}</span>
                <div className="text-[14.5px] font-bold">{th.team}</div>
                <StatusBadge tone={health.tone} className="ml-auto">{health.label}</StatusBadge>
              </div>
              <div className="mb-[10px]">
                <div className="text-[10px] text-faint font-semibold mb-[2px]">{th.kpiLabel}</div>
                <div className="flex items-baseline gap-[6px]">
                  <span className="text-[22px] font-extrabold" style={{ color: th.valColor }}>{th.result}</span>
                  <span className="text-[12px] text-faint">vs {th.target} target</span>
                </div>
              </div>
              <Progress value={th.bar} color={health.bar} track="#F0EBE0" />
              <div className="text-[11.5px] text-muted italic leading-[1.4] mt-[6px]">{th.insight}</div>
            </div>
          );
        })}
      </div>

      {/* Needs Attention + Approvals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-[22px]">
        <div className="bg-surface border border-line rounded-cardLg p-[22px]">
          <div className="flex items-center justify-between mb-[14px]">
            <div className="text-[15px] font-bold">Needs Attention</div>
            <StatusBadge tone="red">{DASH_ALERTS.length} items</StatusBadge>
          </div>
          <div className="flex flex-col gap-[10px]">
            {DASH_ALERTS.map((al, i) => {
              const t = TONES[al.tone];
              return (
                <div key={i} className="rounded-[0_11px_11px_0] px-[13px] py-[10px]" style={{ borderLeft: `3px solid ${t.fg}`, background: t.bg }}>
                  <div className="flex items-center gap-[7px] mb-[3px] flex-wrap">
                    <span className="text-[10px] font-bold" style={{ color: t.fg }}>{al.type}</span>
                    <span className="text-[10px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: `${t.fg}22`, color: t.fg }}>{al.team}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-ink mb-[2px]">{al.title}</div>
                  <div className="text-[11.5px] text-faint">{al.meta}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-cardLg p-[22px]">
          <div className="flex items-center justify-between mb-[14px]">
            <div className="text-[15px] font-bold">Pending Approval</div>
            <span className="text-[11px] font-bold text-white bg-status-red rounded-pill px-[9px] py-[3px]">{pending ? pending.length : DASH_APPROVALS.length}</span>
          </div>
          <div>
            {pending ? (
              pending.length === 0 ? (
                <div className="text-[12.5px] text-faint py-6 text-center">Nothing waiting for approval right now.</div>
              ) : (
                pending.map((r) => (
                  <Link key={r.id} href="/approvals" className="flex items-center gap-3 py-[10px] border-b border-line4 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{r.typeIcon} {r.title}</div>
                      <div className="flex items-center gap-2 mt-[2px] flex-wrap">
                        <span className="text-[11px] text-faint">{brandName(r.b)}{r.campaign !== "—" ? ` · ${r.campaign}` : ""}</span>
                        <span className="text-[10.5px] font-semibold text-status-gold">{r.stage}</span>
                      </div>
                    </div>
                    <span className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-[11px] py-[5px] cursor-pointer whitespace-nowrap">Review</span>
                  </Link>
                ))
              )
            ) : (
              DASH_APPROVALS.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-[10px] border-b border-line4 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{a.title}</div>
                    <div className="flex items-center gap-2 mt-[2px] flex-wrap">
                      <span className="text-[11px] text-faint">{a.meta}</span>
                      <span className="text-[10.5px] font-semibold text-status-gold">{a.waiting}</span>
                    </div>
                  </div>
                  <span className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-[11px] py-[5px] cursor-pointer whitespace-nowrap">Review</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Team Pulse */}
      <div className="bg-surface border border-line rounded-card px-[22px] py-4 flex items-center gap-[10px] flex-wrap">
        <span className="text-[13px] font-bold text-ink mr-[6px]">Team Pulse</span>
        {TEAM_PULSE.map((tp, i) => (
          <div key={i} className="flex items-center gap-[7px] px-[14px] py-[7px] rounded-pill" style={{ background: tp.bg, border: `1px solid ${tp.border}` }}>
            <span className="text-[14px]">{tp.icon}</span>
            <span className="text-[12px] font-bold" style={{ color: tp.fg }}>{tp.val}</span>
            <span className="text-[11px] opacity-80" style={{ color: tp.fg }}>{tp.label}</span>
          </div>
        ))}
        <Link href="/team" className="text-[12px] text-accent font-bold ml-auto">View Team Workload →</Link>
      </div>
    </>
  );
}
