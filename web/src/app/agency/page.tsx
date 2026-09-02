"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";
import { brandName, BrandFilterValue, BrandId } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import {
  AGENCY_TASKS, AGENCY_EDITABLE_STATUSES,
  AGENCY_TYPES, AgencyStatus, AgencyTask, portalBrandAllowed,
  portalRowKey,
} from "@/lib/data/agency";
import { fetchAgencyTasks, createAgencyTask, updateAgencyTask } from "@/lib/db/agency";
import { fetchGraphics, updateGraphic } from "@/lib/db/graphic";
import { Graphic } from "@/lib/data/graphic";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { UnreadPanel } from "@/components/shell/UnreadPanel";
import { AgencyDeliverables } from "@/components/agency/AgencyDeliverables";
import { fetchMembers, Member } from "@/lib/db/settings";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import {
  WorkItem, WorkCard, WorkListView, WorkAction, WorkGroupHeader, StatMini,
  GroupDef, chip, workDaysUntilDue,
} from "@/components/work/WorkViews";

/* Agency Portal — the My Tasks surface, filtered to this agency's own work.
 *
 * It used to be its own design over the same Graphic Requests: gold summary
 * tiles, a status dropdown per row, a collapsible brief pack. So an external
 * designer and an internal one read the same request through two different
 * lenses, and every improvement to My Tasks (the brief on the card, opening
 * the full request in place) had to be built twice or not at all. The views
 * now come from components/work/WorkViews — what stays different here is only
 * what genuinely differs: an agency submits per deliverable, cannot mark its
 * own work Approved, and sees nothing but its own rows. */

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

/** What THIS agency user may see, once we already know the row belongs to some
 *  agency. Their own name only.
 *
 *  It used to return true for any designer string containing "agency",
 *  "external", "studio" and so on, and true again when the viewer could not be
 *  identified. With one supplier on the system neither showed, but both are
 *  the same bug: one outside studio reading another's queue. Matching is on
 *  the person, and an unidentified viewer now sees nothing rather than
 *  everything. */
function isVisibleToAgencyUser(g: Graphic, member: Member | null, email: string) {
  const userKeys = [member?.name, member?.email, email].filter(Boolean).map((v) => String(v).toLowerCase());
  if (!userKeys.length) return false;
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
    // No "9" prefix: it pushed a 16-digit graphic id past MAX_SAFE_INTEGER and
    // rounded digits off, which is how sibling requests ended up sharing a row
    // identity. The raw id is inside the safe range; identity itself comes from
    // portalRowKey, which never does arithmetic on it at all.
    id: Number(g.id),
    graphicId: String(g.id),
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

/** Which My-Tasks-style group a portal row belongs in. Same idea as the
 *  internal board — what needs you now, what is out of your hands, what is
 *  finished — read off the agency status rather than a stored group. */
function agencyGroup(t: PortalTask): string {
  if (t.status === "Approved") return "done";
  if (t.status === "Submitted") return "waitingThem";
  if (t.status === "Revision") return "revision";
  return "doFirst";
}

const AGENCY_GROUPS: GroupDef[] = [
  { id: "revision", label: "ต้องแก้ตาม feedback", icon: "↩", countBg: "#FBF1E9", countColor: "#C2691E" },
  { id: "doFirst", label: "Do First", icon: "🎯", countBg: "#FFF5F4", countColor: "#B33A2E" },
  { id: "waitingThem", label: "ส่งแล้ว — รอทีมภายในรีวิว", icon: "📤", countBg: "#FBF8EE", countColor: "#C68A1E" },
  { id: "done", label: "Approved", icon: "✓", countBg: "#EEF4EE", countColor: "#4E7A4E" },
];

const SCOPE_FILTERS = [
  { id: "all", label: "All work" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "revision", label: "Revision" },
  { id: "open", label: "Not submitted" },
];

/** The row as the shared card renders it. Priority is not part of the agency
 *  model, so it is derived from the due date rather than invented: an overdue
 *  external deliverable IS the high-priority one. */
function toWorkItem(t: PortalTask): WorkItem {
  const item = { due: t.due, dueIso: t.graphic?.dueIso };
  const days = workDaysUntilDue(item);
  return {
    key: portalRowKey(t),
    title: t.title,
    moduleIcon: t.source === "graphic" ? "🎨" : "🤝",
    moduleColor: t.source === "graphic" ? "#C2691E" : "#7A6BA8",
    type: t.type,
    brand: brandName(t.b),
    campaign: t.campaign,
    status: t.status,
    priority: days === null ? "Med" : days <= 0 ? "High" : days <= 2 ? "Med" : "Low",
    group: agencyGroup(t),
    due: t.due,
    dueIso: t.graphic?.dueIso,
    nextAction: t.graphic?.nextAction || t.brief || "รอรายละเอียดจากทีมภายใน",
    blocker: t.status === "Revision" ? (t.graphic?.blocker || "มี feedback ให้แก้") : null,
    pendingApprover: t.status === "Submitted" ? (t.graphic?.requester || "ทีมภายใน") : null,
    assignee: t.graphic?.designer || "",
    graphic: t.graphic ?? null,
  };
}

/** Apply a portal edit (status / note) to the linked request.
 *
 *  Artwork links are deliberately NOT handled here: they belong to a single
 *  deliverable and go through submitDeliverable (see AgencyDeliverables). This
 *  used to accept `patch.link` and stamp it on deliverable #0, which made a
 *  three-size request look like one delivery and left the other two sizes
 *  permanently "Not submitted" — unreviewable, uncountable, unpaid. */
function applyAgencyPatchToGraphic(g: Graphic, patch: Partial<Pick<AgencyTask, "status" | "note">>, by: string): Graphic {
  const now = new Date().toISOString();
  const next: Graphic = {
    ...g,
    stage: patch.status ? agencyStatusToGraphic(patch.status, g.stage) : g.stage,
    nextAction: patch.note ?? g.nextAction,
  };

  if (patch.status === "Submitted") {
    next.submittedBy = by;
    next.submittedAt = now;
  }

  if (patch.status) {
    next.history = [
      ...(g.history ?? []),
      {
        type: patch.status === "Submitted" ? "submitted" : "assigned",
        at: now,
        by,
        note: patch.note || patch.status,
      },
    ];
  }

  return next;
}

export default function AgencyPortalPage() {
  const [manualTasks, setManualTasks] = useState<AgencyTask[]>(() => AGENCY_TASKS.map((t) => ({ ...t, source: "manual" as const })));
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [scope, setScope] = useState("all");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [type, setType] = useState("all");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [newOpen, setNewOpen] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [graphicOpenId, setGraphicOpenId] = useState<number | null>(null);
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

  const matchScope = (t: PortalTask) => {
    const days = workDaysUntilDue({ due: t.due, dueIso: t.graphic?.dueIso });
    if (scope === "today") return (days ?? 1) <= 0 || t.status === "Revision";
    if (scope === "week") return days !== null && days >= 0 && days <= 6;
    if (scope === "revision") return t.status === "Revision";
    if (scope === "open") return t.status !== "Submitted" && t.status !== "Approved";
    return true;
  };

  // Why an agency user is NOT brand-gated here: see portalBrandAllowed.
  const brandAllowed = (b: BrandId) => portalBrandAllowed(isAgency, visibility.isVisible(b));

  const rows = allTasks.filter((t) =>
    matchScope(t) &&
    (brand === "all" || t.b === brand) &&
    (type === "all" || t.type === type) &&
    brandAllowed(t.b) &&
    inDateFilter(date, t.due),
  );

  const byKey = useMemo(() => new Map(rows.map((t) => [portalRowKey(t), t])), [rows]);
  const detailTask = detailKey ? byKey.get(detailKey) ?? null : null;
  const openGraphic = graphicOpenId === null ? null : graphics.find((g) => g.id === graphicOpenId) ?? null;

  // Counters mirror My Tasks' bento: what's on you today, and the state of the
  // rest. Computed from the filtered rows so the numbers match what's below.
  const overdue = rows.filter((t) => t.status !== "Approved" && (workDaysUntilDue({ due: t.due, dueIso: t.graphic?.dueIso }) ?? 1) <= 0);
  const counts = {
    focus: rows.filter((t) => t.status !== "Approved" && t.status !== "Submitted").length,
    overdue: overdue.length,
    revision: rows.filter((t) => t.status === "Revision").length,
    submitted: rows.filter((t) => t.status === "Submitted").length,
    approved: rows.filter((t) => t.status === "Approved").length,
  };
  const doneToday = counts.approved;
  const totalToday = rows.length;

  /** Persist a linked request and reflect it locally — used by the status/note
   *  patches, the per-deliverable submits, and edits made in the full drawer. */
  const saveGraphic = (next: Graphic) => {
    setGraphics((gs) => gs.map((g) => (g.id === next.id ? next : g)));
    updateGraphic(next).catch((error) => toastError(`บันทึกงาน Agency ที่ link กับ Graphic ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };
  /** The drawer persists its own writes — only mirror them here. */
  const patchGraphic = (next: Graphic) => setGraphics((gs) => gs.map((g) => (g.id === next.id ? next : g)));

  const update = (task: PortalTask, patch: Partial<AgencyTask>) => {
    if (task.source === "graphic" && task.graphic) {
      saveGraphic(applyAgencyPatchToGraphic(task.graphic, patch, currentUser));
      return;
    }
    setManualTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    updateAgencyTask(task.id, patch).catch((error) => toastError(`บันทึก Agency Task ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
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
    try {
      const created = await createAgencyTask(draft, manualTasks);
      setManualTasks((ts) => [{ ...created, source: "manual" }, ...ts]);
    } catch (error) {
      toastError(`สร้าง Agency Task ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  /** The card's action row. Agency work is submitted, never self-approved —
   *  "Approved" is not in AGENCY_EDITABLE_STATUSES and does not appear here. */
  const actionsFor = (t: PortalTask) => {
    if (t.status === "Approved") return null;
    return (
      <>
        {t.graphic && <WorkAction label="🎨 เปิดบรีฟ / ส่งไฟล์" bg="#C2691E" onClick={() => setGraphicOpenId(t.graphic!.id)} />}
        {t.status === "To Do" && <WorkAction label="Start" bg="#3E5C9A" onClick={() => update(t, { status: "In Progress" })} />}
        {!t.graphic && t.status !== "Submitted" && (
          <WorkAction label="Submit for review" bg="#4E7A4E" onClick={() => update(t, { status: "Submitted" })} />
        )}
        <WorkAction label="Details" bg="#fff" fg="#6b6258" border="#E5DECF" onClick={() => setDetailKey(portalRowKey(t))} />
      </>
    );
  };

  return (
    <>
      {/* The bell matters more here than anywhere else: an external account gets
          no Slack DM at all (the bot cannot resolve an email outside the
          workspace — see lib/slackDirectory), so this is the only place a
          message actually reaches them. Its approvals tab is dropped for an
          agency — nothing in that queue is ever theirs to decide, and opening it
          would fire six reads RLS answers with nothing. */}
      <CampaignPageHeaderSection
        eyebrow="AGENCY PORTAL"
        title="Agency Portal"
        description="งานของคุณจาก Graphic Request — บรีฟ ไฟล์ ข้อความ และ feedback ในที่เดียว"
        right={<NotificationBell tone="light" hideApprovals={isAgency} />}
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={!isAgency ? <button onClick={() => setNewOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Manual Agency Task</button> : undefined}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-faint">
                Viewing as {currentUser} · เฉพาะงานที่มอบหมายให้คุณ
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <BrandFilter value={brand} onChange={setBrand} />
                <label className="flex items-center gap-[7px]">
                  <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Type</span>
                  <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
                    <option value="all">All Types</option>
                    {Array.from(new Set([...AGENCY_TYPES, ...allTasks.map((t) => t.type)])).map((ty) => <option key={ty}>{ty}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>
      </div>

      <div className="mt-[18px] flex flex-col gap-[18px]">
        {/* Same inbox as My Tasks, same component. Sits above the work: a piece
            sent back is a message before it is a task. */}
        <UnreadPanel />

        {/* BENTO — the same shape as My Tasks' Today's Focus. */}
        <div className="flex gap-[14px] flex-wrap">
          <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
            <div className="rounded-[18px] px-5 py-[18px] text-white" style={{ background: "#211F1C" }}>
              <div className="text-[10px] tracking-[0.08em] uppercase font-bold mb-2" style={{ color: "#B8945A" }}>Today&apos;s Focus 🍱</div>
              <div className="text-[40px] font-extrabold leading-none mb-1">{counts.focus}</div>
              <div className="text-[12px] italic mb-3" style={{ color: "#C0B8AD" }}>
                {counts.overdue > 0 ? `เลยกำหนด ${counts.overdue} ชิ้น — เริ่มจากตรงนี้` : "งานที่ยังอยู่ในมือคุณ"}
              </div>
              <div className="h-[5px] rounded-[3px] overflow-hidden" style={{ background: "#3A3630" }}>
                <div className="h-[5px] rounded-[3px]" style={{ background: "#B8945A", width: `${totalToday ? Math.round((doneToday / totalToday) * 100) : 0}%` }} />
              </div>
              <div className="text-[11px] mt-[5px]" style={{ color: "#9A9387" }}>{doneToday} / {totalToday} approved</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatMini label="Revision ↩" val={counts.revision} fg="#C2691E" bg="#FBF1E9" />
              <StatMini label="เลยกำหนด ⚠" val={counts.overdue} fg="#B33A2E" bg="#FFF5F4" />
              <StatMini label="ส่งแล้ว 📤" val={counts.submitted} fg="#C68A1E" bg="#FBF8EE" />
              <StatMini label="Approved ✓" val={counts.approved} fg="#4E7A4E" bg="#EEF4EE" />
            </div>
          </div>
        </div>

        {/* FILTER + VIEW */}
        <div className="flex items-center justify-between flex-wrap gap-[10px]">
          <div className="flex gap-[7px] flex-wrap">
            {SCOPE_FILTERS.map((f) => (
              <span key={f.id} onClick={() => setScope(f.id)} style={chip(scope === f.id)}>{f.label}</span>
            ))}
          </div>
          <div className="flex gap-[6px]">
            <span onClick={() => setViewMode("cards")} style={chip(viewMode === "cards")}>⊞ Cards</span>
            <span onClick={() => setViewMode("list")} style={chip(viewMode === "list")}>≡ List</span>
          </div>
        </div>

        {viewMode === "cards" ? (
          <div className="flex flex-col gap-[26px]">
            {AGENCY_GROUPS.map((grp) => {
              const groupRows = rows.filter((t) => agencyGroup(t) === grp.id);
              if (groupRows.length === 0) return null;
              return (
                <div key={grp.id}>
                  <WorkGroupHeader g={grp} count={groupRows.length} />
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}>
                    {groupRows.map((t) => (
                      <WorkCard
                        key={`${t.source}-${t.id}`}
                        item={toWorkItem(t)}
                        viewer={currentUser}
                        onOpen={() => setDetailKey(portalRowKey(t))}
                        onOpenGraphic={setGraphicOpenId}
                        actions={actionsFor(t)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && <EmptyState />}
          </div>
        ) : (
          <WorkListView
            items={rows.map(toWorkItem)}
            assigneeHeader="Designer"
            onOpen={(item) => setDetailKey(item.key)}
            onOpenGraphic={setGraphicOpenId}
          />
        )}
      </div>

      {detailTask && (
        <AgencyDetailDrawer
          t={detailTask}
          me={currentUser}
          onClose={() => setDetailKey(null)}
          onUpdate={update}
          onGraphicChange={saveGraphic}
          onOpenGraphic={setGraphicOpenId}
        />
      )}

      {/* The full Graphic Request, over the portal — same as My Tasks. Its own
          stacking context so it clears the detail drawer (z-[200]). */}
      {openGraphic && (
        <div className="relative z-[260]">
          <GraphicDrawer g={openGraphic} onClose={() => setGraphicOpenId(null)} onUpdate={patchGraphic} />
        </div>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNewOpen(false)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-md p-6">
            <button onClick={() => setNewOpen(false)} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
            <div className="text-[16px] font-extrabold mb-1">Manual agency task</div>
            <div className="text-[12px] text-faint mb-4">ใช้เฉพาะงาน external ที่ไม่ได้เริ่มจาก Graphic Request</div>
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

function EmptyState() {
  return (
    <div className="px-5 py-10 text-center bg-surface border border-line rounded-cardLg">
      <div className="inline-flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[#D9B86A] bg-[#FFF8EA] px-6 py-5">
        <div className="text-[13px] font-bold text-[#8A6930]">ไม่มีงานในมุมมองนี้</div>
        <div className="text-[11.5px] text-[#9A7A47]">งานจะขึ้นที่นี่อัตโนมัติเมื่อ Graphic Request ถูกมอบหมายให้คุณ</div>
      </div>
    </div>
  );
}

/** The row's own drawer — the portal counterpart of My Tasks' TaskDrawer:
 *  status, the per-size deliverables, and a note back to the team. The brief
 *  itself is read in the Graphic Request drawer, one button away, so there is
 *  exactly one place it is rendered and edited. */
function AgencyDetailDrawer({ t, me, onClose, onUpdate, onGraphicChange, onOpenGraphic }: {
  t: PortalTask; me: string;
  onClose: () => void;
  onUpdate: (task: PortalTask, patch: Partial<AgencyTask>) => void;
  onGraphicChange: (next: Graphic) => void;
  onOpenGraphic: (id: number) => void;
}) {
  const locked = t.status === "Approved";
  const [note, setNote] = useState(t.note);
  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex justify-end" style={{ background: "rgba(33,31,28,.42)" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white h-full overflow-y-auto" style={{ width: 460, maxWidth: "100vw", boxShadow: "-8px 0 40px rgba(0,0,0,.14)" }}>
        <div className="sticky top-0 bg-white z-[1]" style={{ padding: "22px 24px 18px", borderBottom: "1px solid #ECE6DA" }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-extrabold leading-[1.3] mb-[5px]">{t.title}</div>
              <div className="text-[12px] text-faint">{brandName(t.b)} · {t.campaign} · due {t.due}</div>
            </div>
            <span onClick={onClose} className="text-[18px] text-faint cursor-pointer p-1 leading-none flex-shrink-0">✕</span>
          </div>
        </div>

        <div style={{ padding: "18px 24px" }}>
          {t.graphic && (
            <button onClick={() => onOpenGraphic(t.graphic!.id)}
              className="block w-full text-center text-[12.5px] font-bold text-white rounded-[10px] py-[10px] mb-4" style={{ background: "#C2691E" }}>
              🎨 เปิด Graphic Request เต็ม · บรีฟ / ส่งไฟล์ / feedback
            </button>
          )}

          {!locked && (
            <>
              <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[10px]">Status</div>
              <select value={t.status} onChange={(e) => onUpdate(t, { status: e.target.value as AgencyStatus })}
                className="w-full text-[13px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none mb-4">
                {AGENCY_EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}

          {t.graphic ? (
            <AgencyDeliverables g={t.graphic} by={me} onChange={onGraphicChange} />
          ) : (
            !locked && (
              <div className="mb-4">
                <label className="block text-[11px] font-bold text-faint mb-[5px]">Deliverable link</label>
                <input value={t.link} onChange={(e) => onUpdate(t, { link: e.target.value })} placeholder="Paste Drive / Canva link…" className={field} />
              </div>
            )
          )}

          <div className="mt-4">
            <label className="block text-[11px] font-bold text-faint mb-[5px]">Message to team</label>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} disabled={locked}
                onBlur={() => { if (note !== t.note) onUpdate(t, { note }); }}
                placeholder="Add a note…" className={field} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
