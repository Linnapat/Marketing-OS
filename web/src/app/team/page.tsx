"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { CAPACITY_META, initials } from "@/lib/data/workload";
import { teamFromDb, TeamView, TeamMemberView } from "@/lib/data/derive";
import { fetchMembers, Member } from "@/lib/db/settings";
import { fetchTasks } from "@/lib/db/tasks";
import { Task } from "@/lib/data/tasks";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";

function Avatar({ name, color, avatarUrl, size = 40 }: { name: string; color: string; avatarUrl?: string; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} className="rounded-full object-cover border border-line3" style={{ width: size, height: size }} />;
  return <span className="rounded-full flex items-center justify-center text-[13px] font-extrabold text-white" style={{ background: color, width: size, height: size }}>{initials(name)}</span>;
}

export default function TeamWorkloadPage() {
  const [drawer, setDrawer] = useState<TeamMemberView | null>(null);
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [raw, setRaw] = useState<{ m: Member[]; t: { tasks: Task[]; doneIds: number[] } } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchMembers(), fetchTasks()])
      .then(([m, t]) => { if (alive) setRaw({ m, t }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Workload for the selected period only (by task due date; undated stay in).
  const team: TeamView | null = useMemo(
    () => (raw ? teamFromDb(raw.m, raw.t.tasks.filter((t) => inDateFilter(date, t.dueIso || t.due)), raw.t.doneIds) : null),
    [raw, date],
  );

  const members = team?.members ?? [];
  const p = team?.pulse;
  const needSupport = members.filter((m) => m.load === "needsSupport");

  const h = CAPACITY_META.healthy, bu = CAPACITY_META.busy, ns = CAPACITY_META.needsSupport;
  const PULSE = p ? [
    { icon: "🌿", val: p.healthy, label: "Healthy", note: "manageable load", fg: h.fg, bg: h.bg, border: h.border },
    { icon: "🔥", val: p.busy, label: "Busy", note: "high but ok", fg: bu.fg, bg: bu.bg, border: bu.border },
    { icon: "🛟", val: p.needsSupport, label: "Need support", note: "consider rebalancing", fg: ns.fg, bg: ns.bg, border: ns.border },
    { icon: "🧱", val: p.stuckTasks, label: "Stuck tasks", note: "blocked items", fg: "#C2691E", bg: "#FBF1E9", border: "#F0D5BC" },
    { icon: "⏰", val: p.overdue, label: "Overdue", note: "past due date", fg: "#C68A1E", bg: "#FBF8EE", border: "#E8CCA0" },
    { icon: "✅", val: p.done, label: "Completed", note: "nice progress", fg: "#4E7A4E", bg: "#EEF4EE", border: "#C8E0C8" },
  ] : [];

  return (
    <>
      <PageHeader
        eyebrow="Team Pulse"
        title="Team Workload & Support"
        subtitle="See who is busy, who is stuck, and where the team needs support today."
      />

      {/* Period filter — workload for the selected period (by due date) */}
      <div className="mt-4">
        <DateFilterBar value={date} onChange={setDate} />
      </div>

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
              <button key={m.name} onClick={() => setDrawer(m)} className="text-left bg-surface rounded-card p-4 hover:border-accent border border-line3 transition">
                <div className="flex items-center gap-2 mb-1">
                  <Avatar name={m.name} color={m.color} avatarUrl={m.avatarUrl} size={32} />
                  <div>
                    <div className="text-[13.5px] font-bold">{m.name}</div>
                    <div className="text-[11px] text-faint">{m.role}</div>
                    {m.presence && <div className="text-[10.5px] text-faint">{m.presence}{m.statusNote ? ` · ${m.statusNote}` : ""}</div>}
                  </div>
                  <span className="ml-auto text-[11px] font-bold text-status-red">{m.open} open</span>
                </div>
                <div className="text-[11.5px] text-muted mt-1">🧱 {m.stuck} stuck · ⏰ {m.overdue} overdue</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Team member cards */}
      <SectionLabel className="mt-6 mb-3">Team</SectionLabel>
      {members.length === 0 && team && (
        <div className="text-[12.5px] text-faint text-center py-10 bg-surface border border-line rounded-cardLg">No team members yet — add them in Settings → Users &amp; Roles.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {members.map((m) => {
          const cap = CAPACITY_META[m.load];
          return (
            <button key={m.name} onClick={() => setDrawer(m)} className="text-left bg-surface border border-line rounded-cardLg p-5 hover:border-accent transition">
              <div className="flex items-center gap-3 mb-4">
                <Avatar name={m.name} color={m.color} avatarUrl={m.avatarUrl} />
                <div className="min-w-0"><div className="text-[14px] font-bold">{m.name}</div><div className="text-[11px] text-faint">{m.role}</div></div>
                <span className="ml-auto text-[11px] font-bold px-[9px] py-[3px] rounded-pill whitespace-nowrap" style={{ background: cap.bg, color: cap.fg }}>{cap.emoji} {cap.label}</span>
              </div>
              {m.presence && <div className="text-[11.5px] text-muted mb-3">{m.presence}{m.statusNote ? ` · ${m.statusNote}` : ""}</div>}
              <div className="flex items-center justify-between mb-[6px]">
                <span className="text-[11.5px] text-muted">{m.open} open task{m.open === 1 ? "" : "s"}</span>
                <span className="text-[11.5px] font-bold" style={{ color: cap.fg }}>{m.done} done</span>
              </div>
              <Progress value={Math.min(100, m.open * 12.5)} color={cap.fg} track="#F0EBE0" height={7} />
              <div className="grid grid-cols-4 gap-2 mt-4">
                {([["Open", m.open], ["Done", m.done], ["Stuck", m.stuck], ["Overdue", m.overdue]] as const).map(([l, v]) => (
                  <div key={l} className="text-center bg-ivory border border-line3 rounded-card py-2">
                    <div className="text-[15px] font-extrabold" style={{ color: (l === "Stuck" || l === "Overdue") && v > 0 ? "#B33A2E" : "#211F1C" }}>{v}</div>
                    <div className="text-[9px] text-faint font-bold uppercase tracking-[0.03em]">{l}</div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {drawer && <PersonDrawer m={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}

function PersonDrawer({ m, onClose }: { m: TeamMemberView; onClose: () => void }) {
  const cap = CAPACITY_META[m.load];
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[480px] bg-surface flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2" style={{ background: "#FBF9F4" }}>
          <div className="flex items-center gap-3">
            <Avatar name={m.name} color={m.color} avatarUrl={m.avatarUrl} size={44} />
            <div>
              <div className="text-[16px] font-extrabold">{m.name}</div>
              <div className="text-[12px] text-faint">{m.role} · <span style={{ color: cap.fg, fontWeight: 700 }}>{cap.emoji} {cap.label}</span></div>
              {m.presence && <div className="text-[11px] text-faint mt-1">{m.presence}{m.statusNote ? ` · ${m.statusNote}` : ""}</div>}
            </div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-2">Workload breakdown</div>
            <div className="grid grid-cols-3 gap-2">
              {([["Open", m.open], ["In progress", m.inProgress], ["Done", m.done], ["Waiting", m.waiting], ["Stuck", m.stuck], ["Overdue", m.overdue]] as const).map(([l, v]) => (
                <div key={l} className="bg-ivory border border-line3 rounded-card p-2 text-center">
                  <div className="text-[15px] font-extrabold text-ink">{v}</div>
                  <div className="text-[9px] text-faint font-bold uppercase tracking-[0.03em]">{l}</div>
                </div>
              ))}
            </div>
          </div>
          {(m.stuck > 0 || m.overdue > 0) && (
            <div className="rounded-card px-4 py-3" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
              <div className="text-[11px] font-bold text-status-red mb-1">Needs a look</div>
              <div className="text-[13px] text-status-red font-semibold">🧱 {m.stuck} stuck · ⏰ {m.overdue} overdue</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
