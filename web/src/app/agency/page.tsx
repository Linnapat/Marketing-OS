"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { BrandDot } from "@/components/ui/BrandDot";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  FilterBar,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";
import { brandName, BrandFilterValue, BrandId } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import {
  AGENCY_TASKS, AGENCY_STATUSES, AGENCY_EDITABLE_STATUSES, AGENCY_STATUS_TONE,
  AGENCY_TYPES, AgencyStatus, AgencyTask,
} from "@/lib/data/agency";
import { fetchAgencyTasks, createAgencyTask, updateAgencyTask } from "@/lib/db/agency";
import { fetchGraphics, updateGraphic } from "@/lib/db/graphic";
import { deriveDeliverables, Graphic, GraphicDeliverable } from "@/lib/data/graphic";
import { fetchMembers, Member } from "@/lib/db/settings";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";

type PortalTask = AgencyTask & { source: "manual" | "graphic"; graphic?: Graphic };

const field = "w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";

const agencyText = (value?: string | null) => /agency|external|outsource|freelance|vendor/i.test(value ?? "");

function isAgencyMember(m: Member) {
  return agencyText(m.role) || m.brandAccess === "External only";
}

function isAssignedToAgency(g: Graphic, members: Member[]) {
  if (agencyText(g.designer)) return true;
  return members.some((m) => isAgencyMember(m) && m.name === g.designer);
}

function isVisibleToAgencyUser(g: Graphic, member: Member | null, email: string) {
  if (!member && !email) return true;
  if (agencyText(g.designer)) return true;
  const userKeys = [member?.name, member?.email, email].filter(Boolean).map((v) => String(v).toLowerCase());
  return userKeys.some((key) => g.designer.toLowerCase() === key);
}

function graphicStatusToAgency(stage: string): AgencyStatus {
  if (stage === "Delivered" || stage === "Approved") return "Approved";
  if (stage === "Revision Requested") return "Revision";
  if (stage === "Waiting Feedback" || stage === "Waiting Approval") return "Submitted";
  if (stage === "In Progress") return "In Progress";
  return "To Do";
}

function agencyStatusToGraphic(status: AgencyStatus, current: string): string {
  if (status === "Submitted") return "Waiting Feedback";
  if (status === "Revision") return "Revision Requested";
  if (status === "In Progress") return "In Progress";
  if (status === "To Do") return current === "Approved" || current === "Delivered" ? current : "New Request";
  return current;
}

function firstDeliverableLink(g: Graphic) {
  return g.deliverableLink || (g.deliverables ?? []).find((d) => d.assetLink)?.assetLink || "";
}

function graphicToTask(g: Graphic): PortalTask {
  return {
    id: Number(`9${g.id}`),
    graphicId: g.id,
    source: "graphic",
    graphic: g,
    title: g.title,
    b: g.b,
    campaign: g.campaign,
    type: g.type || "Graphic",
    status: graphicStatusToAgency(g.stage),
    due: g.due || "TBD",
    brief: [
      g.contentItem && g.contentItem !== "—" ? `Content: ${g.contentItem}` : "",
      g.platform && g.platform !== "—" ? `Platform: ${g.platform}` : "",
      g.size && g.size !== "—" ? `Size: ${g.size}` : "",
      g.nextAction ? `Next: ${g.nextAction}` : "",
    ].filter(Boolean).join(" · "),
    link: firstDeliverableLink(g),
    note: g.blocker || "",
  };
}

function applyAgencyPatchToGraphic(g: Graphic, patch: Partial<AgencyTask>, by: string): Graphic {
  const now = new Date().toISOString();
  const next: Graphic = {
    ...g,
    stage: patch.status ? agencyStatusToGraphic(patch.status, g.stage) : g.stage,
    nextAction: patch.note ?? g.nextAction,
  };

  if (patch.link !== undefined) {
    const deliverables = (g.deliverables?.length ? g.deliverables : deriveDeliverables(g)).map((d, i): GraphicDeliverable => (
      i === 0
        ? {
          ...d,
          assetLink: patch.link || d.assetLink,
          status: patch.link ? (patch.status === "Revision" ? "Revision" : "Waiting review") : d.status,
          version: patch.link && !d.assetLink ? d.version + 1 : d.version,
          submittedBy: patch.link ? by : d.submittedBy,
          submittedAt: patch.link ? now : d.submittedAt,
        }
        : d
    ));
    next.deliverables = deliverables;
    next.deliverableLink = patch.link || g.deliverableLink;
  }

  if (patch.status === "Submitted") {
    next.submittedBy = by;
    next.submittedAt = now;
  }

  if (patch.status || patch.link) {
    next.history = [
      ...(g.history ?? []),
      {
        type: patch.status === "Submitted" ? "submitted" : "assigned",
        at: now,
        by,
        note: patch.note || patch.link || patch.status,
      },
    ];
  }

  return next;
}

export default function AgencyPortalPage() {
  const [manualTasks, setManualTasks] = useState<AgencyTask[]>(() => AGENCY_TASKS.map((t) => ({ ...t, source: "manual" as const })));
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<"all" | AgencyStatus>("all");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [type, setType] = useState("all");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [newOpen, setNewOpen] = useState(false);
  const empty = { title: "", b: "teppen" as BrandId, campaign: "", type: "Graphic", due: "", agencyEmail: "" };
  const [nt, setNt] = useState(empty);
  const { member, user } = useAuth();
  const { role } = useRole();
  const visibility = useBrandVisibility();
  const isAgency = role === "Agency (External)";
  const myEmail = member?.email ?? user?.email ?? "";
  const currentUser = member?.name || user?.email?.split("@")[0] || "Agency";

  useEffect(() => {
    let alive = true;
    fetchMembers().then((m) => { if (alive) setMembers(m); }).catch(() => {});
    fetchGraphics().then((g) => { if (alive) setGraphics(g); }).catch(() => {});
    fetchAgencyTasks(isAgency ? myEmail : undefined).then((t) => { if (alive) setManualTasks(t.map((x) => ({ ...x, source: "manual" }))); }).catch(() => {});
    return () => { alive = false; };
  }, [isAgency, myEmail]);

  const graphicTasks = useMemo(() => graphics
    .filter((g) => isAssignedToAgency(g, members))
    .filter((g) => !isAgency || isVisibleToAgencyUser(g, member, myEmail))
    .map(graphicToTask), [graphics, members, isAgency, member, myEmail]);

  const allTasks: PortalTask[] = useMemo(() => [
    ...graphicTasks,
    ...manualTasks.map((t) => ({ ...t, source: "manual" as const })),
  ], [graphicTasks, manualTasks]);

  const rows = allTasks.filter((t) =>
    (filter === "all" || t.status === filter) &&
    (brand === "all" || t.b === brand) &&
    (type === "all" || t.type === type) &&
    visibility.isVisible(t.b) &&
    inDateFilter(date, t.due),
  );

  const counts = useMemo(() => ({
    total: rows.length,
    linked: rows.filter((t) => t.source === "graphic").length,
    open: rows.filter((t) => t.status !== "Approved").length,
    submitted: rows.filter((t) => t.status === "Submitted").length,
    approved: rows.filter((t) => t.status === "Approved").length,
  }), [rows]);

  const update = (task: PortalTask, patch: Partial<AgencyTask>) => {
    if (task.source === "graphic" && task.graphic) {
      const next = applyAgencyPatchToGraphic(task.graphic, patch, currentUser);
      setGraphics((gs) => gs.map((g) => (g.id === next.id ? next : g)));
      updateGraphic(next);
      return;
    }
    setManualTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    updateAgencyTask(task.id, patch);
  };

  const addTask = async () => {
    if (!nt.title.trim() || !nt.campaign.trim()) return;
    const draft: Omit<AgencyTask, "id"> = {
      title: nt.title.trim(), b: nt.b, campaign: nt.campaign.trim(), type: nt.type,
      status: "To Do", due: nt.due.trim() || "TBD", brief: "", link: "", note: "",
      agencyEmail: (isAgency ? myEmail : nt.agencyEmail.trim()) || undefined,
      source: "manual",
    };
    setNewOpen(false);
    setNt(empty);
    const created = await createAgencyTask(draft, manualTasks);
    setManualTasks((ts) => [{ ...created, source: "manual" }, ...ts]);
  };

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="EXTERNAL CREATIVE KITCHEN"
        title="Agency Portal"
        description="External creative workspace linked directly to Creative Kitchen assignments."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={!isAgency ? <button onClick={() => setNewOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Manual Agency Task</button> : undefined}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-faint">
                {counts.linked} linked from Creative Kitchen · {counts.open} open external deliverables
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-pill bg-[#F2EEFF] px-3 py-[7px] font-bold text-[#6C5CE7]">Auto-sync from assigned designer</span>
                <span className="rounded-pill bg-[#FFF6E8] px-3 py-[7px] font-bold text-[#C68A1E]">External-only workspace</span>
              </div>
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard
          title="Agency Portal Summary ✨"
          titleClassName="text-[#7A5710]"
          style={{
            background: "linear-gradient(180deg, #F4D48D 0%, #E7BE67 100%)",
            border: "1px solid #D5A94D",
            boxShadow: "0 18px 44px rgba(180, 132, 33, 0.20)",
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Assigned", value: counts.total, emoji: "🤝", note: "External deliverables in view" },
              { label: "Linked", value: counts.linked, emoji: "🎨", note: "Pulled from Creative Kitchen" },
              { label: "Open", value: counts.open, emoji: "🛠️", note: "Still being worked on" },
              { label: "Submitted", value: counts.submitted, emoji: "📤", note: "Waiting internal review" },
              { label: "Approved", value: counts.approved, emoji: "✅", note: "Signed off by internal team" },
            ].map((k) => (
              <div key={k.label} className="rounded-[20px] border px-4 py-4 bg-white/55" style={{ borderColor: "#D9B86A" }}>
                <div className="text-[11px] uppercase tracking-[0.08em] text-[#8A6930] font-extrabold">{k.emoji} {k.label}</div>
                <div className="mt-3 text-[28px] leading-none font-extrabold text-[#2F2413]">{k.value}</div>
                <div className="mt-2 text-[11px] font-semibold text-[#70552B]">{k.note}</div>
              </div>
            ))}
          </div>
        </ModuleSummaryCard>

        <FilterBar>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <BrandFilter value={brand} onChange={setBrand} />
              <label className="flex items-center gap-[7px]">
                <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Status</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | AgencyStatus)} className={field}>
                  <option value="all">All Statuses</option>
                  {AGENCY_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-[7px]">
                <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Type</span>
                <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
                  <option value="all">All Types</option>
                  {Array.from(new Set([...AGENCY_TYPES, ...allTasks.map((t) => t.type)])).map((ty) => <option key={ty}>{ty}</option>)}
                </select>
              </label>
            </div>
          </div>
        </FilterBar>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {rows.map((t) => (
          <AgencyCard key={`${t.source}-${t.id}`} t={t} onUpdate={update} />
        ))}
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center bg-surface border border-line rounded-cardLg">
            <div className="inline-flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[#D9B86A] bg-[#FFF8EA] px-6 py-5">
              <div className="text-[13px] font-bold text-[#8A6930]">No agency deliverables in this view</div>
              <div className="text-[11.5px] text-[#9A7A47]">Assign a Creative Kitchen request to an Agency / External member and it will appear here automatically.</div>
            </div>
          </div>
        )}
      </div>

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNewOpen(false)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-md p-6">
            <button onClick={() => setNewOpen(false)} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
            <div className="text-[16px] font-extrabold mb-1">Manual agency task</div>
            <div className="text-[12px] text-faint mb-4">ใช้เฉพาะงาน external ที่ไม่ได้เริ่มจาก Creative Kitchen</div>
            <div className="flex flex-col gap-4">
              <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Task title <span className="text-status-red">*</span></label><input value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} placeholder="e.g. Story pack for launch" className={field} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={nt.b} onChange={(e) => setNt({ ...nt, b: e.target.value as BrandId })} className={field}>{visibility.visibleBrands.map((b) => <option key={b} value={b}>{brandName(b)}</option>)}</select></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Type</label><select value={nt.type} onChange={(e) => setNt({ ...nt, type: e.target.value })} className={field}>{AGENCY_TYPES.map((ty) => <option key={ty}>{ty}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign <span style={{ color: "#B33A2E" }}>*</span></label><input value={nt.campaign} onChange={(e) => setNt({ ...nt, campaign: e.target.value })} placeholder="Campaign name" className={field} /></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Due</label><input value={nt.due} onChange={(e) => setNt({ ...nt, due: e.target.value })} placeholder="Jul 15" className={field} /></div>
              </div>
              <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Agency user (email)</label><input value={nt.agencyEmail} onChange={(e) => setNt({ ...nt, agencyEmail: e.target.value })} placeholder="เว้นว่าง = ทุก agency เห็นงานนี้" className={field} /></div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={addTask} disabled={!nt.title.trim() || !nt.campaign.trim()} className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40 disabled:cursor-default">Add task</button>
              <button onClick={() => setNewOpen(false)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AgencyCard({ t, onUpdate }: { t: PortalTask; onUpdate: (task: PortalTask, patch: Partial<AgencyTask>) => void }) {
  const tone = AGENCY_STATUS_TONE[t.status];
  const locked = t.status === "Approved";
  return (
    <div className="bg-surface border border-line rounded-cardLg p-5" style={locked ? { opacity: 0.88 } : undefined}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14.5px] font-bold text-ink">{t.title}</span>
            <span className="text-[10.5px] font-bold px-[7px] py-[2px] rounded-[6px]" style={{ background: "#F2F0EB", color: "#6b6258" }}>{t.type}</span>
            {t.source === "graphic" && <span className="text-[10.5px] font-bold px-[7px] py-[2px] rounded-[6px]" style={{ background: "#FFF6E8", color: "#C68A1E" }}>Linked Creative</span>}
          </div>
          <div className="text-[12px] text-faint flex items-center gap-[6px] mt-[3px] flex-wrap">
            <BrandDot brand={t.b} size={7} />{brandName(t.b)} · {t.campaign} · due <b className="text-muted">{t.due}</b>
          </div>
        </div>
        {locked ? (
          <StatusBadge tone="green">✓ Approved</StatusBadge>
        ) : (
          <select value={t.status} onChange={(e) => onUpdate(t, { status: e.target.value as AgencyStatus })}
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
              <input value={t.link} onChange={(e) => onUpdate(t, { link: e.target.value })} placeholder="Paste Drive / Canva link…" className={field} />
              {t.link && <a href={t.link} target="_blank" rel="noreferrer" className="text-[11.5px] font-bold text-accent whitespace-nowrap">Open ↗</a>}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-faint mb-[5px]">Message to team</label>
            <input value={t.note} onChange={(e) => onUpdate(t, { note: e.target.value })} placeholder="Add a note…" className={field} />
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
          <button onClick={() => onUpdate(t, { status: "Submitted" })} disabled={t.status === "Submitted"}
            className="text-[12px] font-bold text-white bg-status-blue rounded-[8px] px-4 py-[7px] disabled:opacity-40 disabled:cursor-default">
            {t.status === "Submitted" ? "Submitted ✓" : "Submit for review"}
          </button>
        </div>
      )}
    </div>
  );
}
