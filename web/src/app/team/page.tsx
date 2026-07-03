"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilterBar, DEFAULT_DATE_FILTER, DateFilter } from "@/components/ui/DateFilterBar";
import { SectionLabel } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import {
  MEMBERS, Member, CAPACITY_META, capacityLabel, MEMBER_COLOR,
  BOTTLENECKS, RECS, pulse, initials,
} from "@/lib/data/workload";

export default function TeamWorkloadPage() {
  const [date, setDate] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [drawer, setDrawer] = useState<Member | null>(null);
  const p = pulse();
  const needSupport = MEMBERS.filter((m) => m.capacityStatus === "needsSupport");

  const h = CAPACITY_META.healthy, bu = CAPACITY_META.busy, ns = CAPACITY_META.needsSupport;
  const PULSE = [
    { icon: "🌿", val: p.healthy, label: "Healthy", note: "manageable load", fg: h.fg, bg: h.bg, border: h.border },
    { icon: "🔥", val: p.busy, label: "Busy", note: "high but ok", fg: bu.fg, bg: bu.bg, border: bu.border },
    { icon: "🛟", val: p.needsSupport, label: "Need support", note: "consider rebalancing", fg: ns.fg, bg: ns.bg, border: ns.border },
    { icon: "🧱", val: p.stuck, label: "Stuck tasks", note: "blocked items", fg: "#C2691E", bg: "#FBF1E9", border: "#F0D5BC" },
    { icon: "⏰", val: p.needsAttention, label: "Needs attention", note: "due soon / overdue", fg: "#C68A1E", bg: "#FBF8EE", border: "#E8CCA0" },
    { icon: "✅", val: p.doneToday, label: "Completed today", note: "nice progress", fg: "#4E7A4E", bg: "#EEF4EE", border: "#C8E0C8" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Team Pulse"
        title="Team Workload & Support"
        subtitle="See who is busy, who is stuck, and where the team needs support today."
      />

      <div className="mt-[14px]"><DateFilterBar value={date} onChange={setDate} /></div>

      {/* Team Pulse */}
      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
        {PULSE.map((c) => (
          <div key={c.label} className="rounded-card p-4" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
            <div className="flex items-center gap-2 mb-2"><span className="text-[18px]">{c.icon}</span><span className="text-[24px] font-extrabold" style={{ color: c.fg }}>{c.val}</span></div>
            <div className="text-[12.5px] font-bold" style={{ color: c.fg }}>{c.label}</div>
            <div className="text-[11px] text-faint mt-[2px]">{c.note}</div>
          </div>
        ))}
      </div>

      {/* Needs support panel */}
      {needSupport.length > 0 && (
        <div className="mt-5 rounded-cardLg p-5" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
          <div className="text-[13px] font-bold text-status-red mb-1">🛟 Needs support today · {needSupport.length}</div>
          <div className="text-[12px] text-muted mb-4">
            {needSupport.length} {needSupport.length === 1 ? "person" : "people"} may need support today. A small rebalance keeps the team moving.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {needSupport.map((m) => (
              <button key={m.id} onClick={() => setDrawer(m)} className="text-left bg-surface rounded-card p-4 hover:border-accent border border-line3 transition">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white" style={{ background: MEMBER_COLOR[m.id] }}>{initials(m.name)}</span>
                  <div><div className="text-[13.5px] font-bold">{m.name}</div><div className="text-[11px] text-faint">{m.role}</div></div>
                  <span className="ml-auto text-[11px] font-bold text-status-red">{m.utilization}%</span>
                </div>
                <div className="text-[12px] text-status-red font-semibold mb-1">🧱 {m.mainBottleneck}</div>
                <div className="text-[11.5px] text-muted">✨ {m.suggestedAction}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Team member cards */}
      <SectionLabel className="mt-6 mb-3">Team</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {MEMBERS.map((m) => {
          const cap = CAPACITY_META[m.capacityStatus];
          return (
            <button key={m.id} onClick={() => setDrawer(m)} className="text-left bg-surface border border-line rounded-cardLg p-5 hover:border-accent transition">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-extrabold text-white" style={{ background: MEMBER_COLOR[m.id] }}>{initials(m.name)}</span>
                <div className="min-w-0"><div className="text-[14px] font-bold">{m.name}</div><div className="text-[11px] text-faint">{m.role}</div></div>
                <span className="ml-auto text-[11px] font-bold px-[9px] py-[3px] rounded-pill whitespace-nowrap" style={{ background: cap.bg, color: cap.fg }}>{cap.emoji} {cap.label}</span>
              </div>
              <div className="flex items-center justify-between mb-[6px]">
                <span className="text-[11.5px] text-muted">Workload {m.workloadScore} / {m.capacityTarget}</span>
                <span className="text-[11.5px] font-bold" style={{ color: cap.fg }}>{m.utilization}% · {capacityLabel(m.utilization)}</span>
              </div>
              <Progress value={m.utilization} color={cap.fg} track="#F0EBE0" height={7} />
              <div className="grid grid-cols-4 gap-2 mt-4">
                {[["Tasks", m.tasks], ["Done", m.doneToday], ["Stuck", m.stuck], ["Overdue", m.needsAttention]].map(([l, v]) => (
                  <div key={l as string} className="text-center bg-ivory border border-line3 rounded-card py-2">
                    <div className="text-[15px] font-extrabold" style={{ color: (l === "Stuck" || l === "Overdue") && (v as number) > 0 ? "#B33A2E" : "#211F1C" }}>{v as number}</div>
                    <div className="text-[9px] text-faint font-bold uppercase tracking-[0.03em]">{l as string}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11.5px]">
                <span className="text-faint">Bottleneck · </span><span className="text-ink font-semibold">{m.mainBottleneck}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Where work is stuck */}
      <SectionLabel className="mt-7 mb-3">Where work is stuck 🧱</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {BOTTLENECKS.map((b) => (
          <div key={b.module} className="bg-surface border border-line rounded-cardLg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[15px]" style={{ background: b.bg }}>{b.icon}</span>
              <div className="text-[14px] font-bold">{b.module}</div>
              <span className="ml-auto text-[16px] font-extrabold" style={{ color: b.color }}>{b.stuckCount}</span>
            </div>
            <div className="text-[12px] text-muted mb-1"><b className="text-ink">Reason:</b> {b.mainReason}</div>
            <div className="text-[11.5px] text-faint mb-1">Pending: {b.pendingApprover} · oldest {b.oldestDays}d</div>
            <div className="text-[11.5px] font-semibold" style={{ color: b.color }}>✨ {b.suggestedAction}</div>
          </div>
        ))}
      </div>

      {/* Smart Rebalance */}
      <SectionLabel className="mt-7 mb-3">Smart Rebalance ✨</SectionLabel>
      <div className="flex flex-col gap-3">
        {RECS.map((r, i) => (
          <div key={i} className="bg-surface border border-line rounded-cardLg p-4 flex items-start gap-3 flex-wrap">
            <span className="text-[20px]">{r.icon}</span>
            <div className="flex-1 min-w-[200px]">
              <div className="text-[13.5px] font-bold text-ink">{r.text}</div>
              <div className="text-[11.5px] text-faint mt-[2px]">{r.reason}</div>
            </div>
            <div className="flex gap-2">
              {r.actionLabels.map((a) => (
                <span key={a} className="text-[11.5px] font-bold text-muted border border-line2 rounded-[8px] px-3 py-[6px] cursor-pointer whitespace-nowrap">{a}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {drawer && <PersonDrawer m={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}

function PersonDrawer({ m, onClose }: { m: Member; onClose: () => void }) {
  const cap = CAPACITY_META[m.capacityStatus];
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[480px] bg-surface flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2" style={{ background: "#FBF9F4" }}>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-extrabold text-white" style={{ background: MEMBER_COLOR[m.id] }}>{initials(m.name)}</span>
            <div>
              <div className="text-[16px] font-extrabold">{m.name}</div>
              <div className="text-[12px] text-faint">{m.role} · <span style={{ color: cap.fg, fontWeight: 700 }}>{cap.emoji} {cap.label}</span></div>
            </div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {/* Workload score */}
          <div className="rounded-cardLg p-4" style={{ background: "#F7F4EE" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold">Workload score</span>
              <span className="text-[12px] font-bold" style={{ color: cap.fg }}>{m.utilization}% · {capacityLabel(m.utilization)}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[26px] font-extrabold" style={{ color: cap.fg }}>{m.workloadScore}</span>
              <span className="text-[13px] text-faint">/ {m.capacityTarget} target</span>
            </div>
            <Progress value={m.utilization} color={cap.fg} track="#EAE3D5" height={8} />
            <div className="text-[10.5px] text-faint mt-2">Score weights priority, feedback, revisions, overdue and blocked items.</div>
          </div>

          {/* Breakdown */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-2">Workload breakdown</div>
            <div className="grid grid-cols-3 gap-2">
              {[["Tasks", m.tasks], ["In progress", m.inProgress], ["Done today", m.doneToday], ["Waiting", m.waiting], ["Stuck", m.stuck], ["Urgent", m.urgent], ["Feedback", m.feedback], ["Revisions", m.revisions], ["Overdue", m.needsAttention]].map(([l, v]) => (
                <div key={l as string} className="bg-ivory border border-line3 rounded-card p-2 text-center">
                  <div className="text-[15px] font-extrabold text-ink">{v as number}</div>
                  <div className="text-[9px] text-faint font-bold uppercase tracking-[0.03em]">{l as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottleneck */}
          <div className="rounded-card px-4 py-3" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
            <div className="text-[11px] font-bold text-status-red mb-1">Main bottleneck · oldest {m.oldestWaitingDays}d</div>
            <div className="text-[13px] text-status-red font-semibold">🧱 {m.mainBottleneck}</div>
          </div>

          {/* Suggested support */}
          <div className="rounded-card px-4 py-3 bg-accent-soft border border-accent-border">
            <div className="text-[11px] font-bold text-status-gold mb-1">Suggested support</div>
            <div className="text-[13px] text-ink">✨ {m.suggestedAction}</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-line flex gap-2">
          <button className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px]">Reassign a task</button>
          <button className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4">Follow up</button>
        </div>
      </div>
    </div>
  );
}
