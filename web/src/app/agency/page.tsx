"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { brandName, BrandId, BRAND_ORDER } from "@/lib/brands";
import {
  AGENCY_TASKS, AGENCY_STATUSES, AGENCY_EDITABLE_STATUSES, AGENCY_STATUS_TONE,
  AGENCY_TYPES, AgencyStatus, AgencyTask,
} from "@/lib/data/agency";
import { fetchAgencyTasks, createAgencyTask, updateAgencyTask } from "@/lib/db/agency";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";

export default function AgencyPortalPage() {
  const [tasks, setTasks] = useState<AgencyTask[]>(() => AGENCY_TASKS.map((t) => ({ ...t })));
  const [filter, setFilter] = useState<"all" | AgencyStatus>("all");
  const [newOpen, setNewOpen] = useState(false);
  const empty = { title: "", b: "teppen" as BrandId, campaign: "", type: "Graphic", due: "", agencyEmail: "" };
  const [nt, setNt] = useState(empty);
  const { member, user } = useAuth();
  const { role } = useRole();
  // Agency users see only their own tasks (+ unassigned); internal staff see all.
  const isAgency = role === "Agency (External)";
  const myEmail = member?.email ?? user?.email ?? "";

  // Load from Supabase (falls back to the mock already in state).
  useEffect(() => {
    let alive = true;
    fetchAgencyTasks(isAgency ? myEmail : undefined).then((t) => { if (alive) setTasks(t); }).catch(() => {});
    return () => { alive = false; };
  }, [isAgency, myEmail]);

  const rows = tasks.filter((t) => filter === "all" || t.status === filter);
  const counts = useMemo(() => ({
    total: tasks.length,
    open: tasks.filter((t) => t.status !== "Approved").length,
    submitted: tasks.filter((t) => t.status === "Submitted").length,
    approved: tasks.filter((t) => t.status === "Approved").length,
  }), [tasks]);

  // Optimistic local update + persist to the database.
  const update = (id: number, patch: Partial<AgencyTask>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    updateAgencyTask(id, patch);
  };

  const addTask = async () => {
    if (!nt.title.trim()) return;
    const draft: Omit<AgencyTask, "id"> = {
      title: nt.title.trim(), b: nt.b, campaign: nt.campaign.trim() || "—", type: nt.type,
      status: "To Do", due: nt.due.trim() || "TBD", brief: "", link: "", note: "",
      // Agency-created tasks are stamped with their own email; internal staff
      // can assign a specific agency user (blank = visible to all agencies).
      agencyEmail: (isAgency ? myEmail : nt.agencyEmail.trim()) || undefined,
    };
    setNewOpen(false);
    setNt(empty);
    const created = await createAgencyTask(draft, tasks);
    setTasks((ts) => [created, ...ts]);
  };

  const field = "w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";

  return (
    <>
      <PageHeader
        eyebrow="External · Agency"
        title="Agency Portal"
        subtitle="Task list shared with external partners — view & edit your deliverables only."
        right={<button onClick={() => setNewOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">+ New Task</button>}
      />

      {/* External-scope banner */}
      <div className="mt-4 flex items-start gap-3 rounded-card px-4 py-[11px]" style={{ background: "#EEF1F8", border: "1px solid #D5DEEF" }}>
        <span className="text-[15px]">🌐</span>
        <div className="text-[12.5px]" style={{ color: "#3E5C9A" }}>
          <b>External workspace.</b> You can only see and edit the tasks shared with your agency. Internal campaigns, budgets, KOL, and reports are hidden.
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {[["Assigned", counts.total, "#211F1C", true], ["Open", counts.open, "#3E5C9A", false], ["Submitted", counts.submitted, "#C68A1E", false], ["Approved", counts.approved, "#4E7A4E", false]].map(([l, v, c, dark]) => (
          <div key={l as string} className="rounded-card p-4" style={dark ? { background: "#211F1C" } : { background: "#fff", border: "1px solid #EDE7DA" }}>
            <div className="text-[11px] tracking-[0.06em] uppercase font-bold" style={{ color: dark ? "#B8945A" : "#9A9387" }}>{l as string}</div>
            <div className="text-[24px] font-bold mt-[3px]" style={{ color: dark ? "#fff" : (c as string) }}>{v as number}</div>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="mt-5 flex items-center gap-[7px] flex-wrap">
        {(["all", ...AGENCY_STATUSES] as const).map((s) => {
          const active = s === filter;
          return (
            <button key={s} onClick={() => setFilter(s)} className="text-[12px] px-[13px] py-[6px] rounded-pill whitespace-nowrap"
              style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>
              {s === "all" ? "All" : s}
            </button>
          );
        })}
      </div>

      {/* Task list */}
      <div className="mt-4 flex flex-col gap-3">
        {rows.map((t) => (
          <AgencyCard key={t.id} t={t} onUpdate={update} field={field} />
        ))}
        {rows.length === 0 && <div className="bg-surface border border-line rounded-cardLg p-10 text-center text-[13px] text-faint">No tasks in this status.</div>}
      </div>

      {/* New task modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNewOpen(false)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="text-[16px] font-extrabold">New task</div>
              <button onClick={() => setNewOpen(false)} className="text-[18px] text-faint leading-none -mt-1">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Task title <span className="text-status-red">*</span></label>
                <input value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} placeholder="e.g. Story pack for launch" className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
                  <select value={nt.b} onChange={(e) => setNt({ ...nt, b: e.target.value as BrandId })} className={field}>
                    {BRAND_ORDER.map((b) => <option key={b} value={b}>{brandName(b)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Type</label>
                  <select value={nt.type} onChange={(e) => setNt({ ...nt, type: e.target.value })} className={field}>
                    {AGENCY_TYPES.map((ty) => <option key={ty}>{ty}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label>
                  <input value={nt.campaign} onChange={(e) => setNt({ ...nt, campaign: e.target.value })} placeholder="Campaign name" className={field} />
                </div>
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Due</label>
                  <input value={nt.due} onChange={(e) => setNt({ ...nt, due: e.target.value })} placeholder="Jul 15" className={field} />
                </div>
              </div>
              {!isAgency && (
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Agency user (email)</label>
                  <input value={nt.agencyEmail} onChange={(e) => setNt({ ...nt, agencyEmail: e.target.value })} placeholder="เว้นว่าง = ทุก agency เห็นงานนี้" className={field} />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={addTask} disabled={!nt.title.trim()} className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40 disabled:cursor-default">Add task</button>
              <button onClick={() => setNewOpen(false)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AgencyCard({ t, onUpdate, field }: { t: AgencyTask; onUpdate: (id: number, patch: Partial<AgencyTask>) => void; field: string }) {
  const tone = AGENCY_STATUS_TONE[t.status];
  const locked = t.status === "Approved"; // approved = internal-signed off, read-only
  return (
    <div className="bg-surface border border-line rounded-cardLg p-5" style={locked ? { opacity: 0.85 } : undefined}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14.5px] font-bold text-ink">{t.title}</span>
            <span className="text-[10.5px] font-bold px-[7px] py-[2px] rounded-[6px]" style={{ background: "#F2F0EB", color: "#6b6258" }}>{t.type}</span>
          </div>
          <div className="text-[12px] text-faint flex items-center gap-[6px] mt-[3px]">
            <BrandDot brand={t.b} size={7} />{brandName(t.b)} · {t.campaign} · due <b className="text-muted">{t.due}</b>
          </div>
        </div>
        {/* Status: editable unless approved */}
        {locked ? (
          <StatusBadge tone="green">✓ Approved</StatusBadge>
        ) : (
          <select value={t.status} onChange={(e) => onUpdate(t.id, { status: e.target.value as AgencyStatus })}
            className="text-[12px] font-bold px-[10px] py-[6px] rounded-[8px] outline-none border" style={{ color: tone[0], background: tone[1], borderColor: `${tone[0]}44` }}>
            {AGENCY_EDITABLE_STATUSES.map((s) => <option key={s} value={s} style={{ color: "#211F1C", background: "#fff" }}>{s}</option>)}
          </select>
        )}
      </div>

      {t.brief && (
        <div className="mt-3 text-[12px] text-muted bg-ivory border border-line3 rounded-card px-3 py-[9px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-faint">Brief</span>
          <div className="mt-[2px]">{t.brief}</div>
        </div>
      )}

      {!locked && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-faint mb-[5px]">Deliverable link</label>
            <div className="flex items-center gap-2">
              <input value={t.link} onChange={(e) => onUpdate(t.id, { link: e.target.value })} placeholder="Paste Drive / Canva link…" className={field} />
              {t.link && <a href={t.link} target="_blank" rel="noreferrer" className="text-[11.5px] font-bold text-accent whitespace-nowrap">Open ↗</a>}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-faint mb-[5px]">Message to team</label>
            <input value={t.note} onChange={(e) => onUpdate(t.id, { note: e.target.value })} placeholder="Add a note…" className={field} />
          </div>
        </div>
      )}

      {locked && (t.link || t.note) && (
        <div className="mt-3 flex items-center gap-3 text-[12px]">
          {t.link && <a href={t.link} target="_blank" rel="noreferrer" className="font-bold text-accent">Deliverable ↗</a>}
          {t.note && <span className="text-faint">{t.note}</span>}
        </div>
      )}

      {!locked && (
        <div className="mt-3 flex justify-end">
          <button onClick={() => onUpdate(t.id, { status: "Submitted" })} disabled={t.status === "Submitted"}
            className="text-[12px] font-bold text-white bg-status-blue rounded-[8px] px-4 py-[7px] disabled:opacity-40 disabled:cursor-default">
            {t.status === "Submitted" ? "Submitted ✓" : "Submit for review"}
          </button>
        </div>
      )}
    </div>
  );
}
