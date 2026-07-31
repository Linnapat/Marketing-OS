"use client";

import { toastError, toastSuccess } from "@/lib/toast";
import { useEffect, useState } from "react";
import { fetchMembers } from "@/lib/db/settings";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { campaignLabel, WorkCode } from "@/components/ui/CampaignCode";
import { campaignReleasedForWork } from "@/lib/data/campaigns";
import { X } from "lucide-react";
import { GRAPHIC_OPEN_PARAM,
  Graphic, GraphicDeliverable, FEEDBACK, stageTone, PRIORITY_TONE, briefFields,
  deliverableProgress, stageFromDeliverables, deriveDeliverables, creativeBriefDetails, artworkUnits,
  isAccepted, unseenNotices, productionBlockers, productionSteps, needsStoryboard, workingMonth,
  withNotice, pickBriefPatch, RequesterBriefField, shootingDecision,
  canEditBriefNow, briefEditBlockedReason, briefUnlockState, canReleaseBriefEdit,
  ReviewLens, REVIEW_LENSES, LENS_META, reviewProgress, applyLensVerdict,
  canGiveLensVerdict, canPassLens,
  requestBriefEdit, decideBriefEdit,
} from "@/lib/data/graphic";
import { brandName, brandColor } from "@/lib/brands";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { updateGraphic, patchGraphicBrief, syncApprovedAssetsToContent } from "@/lib/db/graphic";
import { useAuth } from "@/lib/auth";
import { isCreativeSideRole, canApproveRushBrief } from "@/lib/roleGates";
import { rushBlocksProduction } from "@/lib/data/briefDeadline";
import { stageAgeDays, ageLevel, AGE_META, isUnowned } from "@/lib/data/ageing";
import { notify } from "@/lib/notify";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { useDeadlines } from "@/lib/useDeadlines";
import { monthServedByFinalAw } from "@/lib/data/deadlinePolicy";
import { createTaskDb, createRevisionTask } from "@/lib/db/tasks";
import { Task } from "@/lib/data/tasks";
import { fetchGraphicFeedback, resolveGraphicFeedback, addGraphicFeedback } from "@/lib/db/feedback";

const TABS = [["overview", "Overview"], ["brief", "Brief"], ["assets", "Assets"], ["feedback", "Feedback"], ["approval", "Approval"], ["delivery", "Delivery"]] as const;
export type GTab = (typeof TABS)[number][0];

export function GraphicDrawer({ g: initialGraphic, initialTab = "overview", hideTabs, onClose, onUpdate }: {
  g: Graphic;
  initialTab?: GTab;
  /** Tabs to leave out for this caller. Opened from My Tasks the Overview tab
   *  is noise — the task card already carries the brand, campaign, due date and
   *  designer, and the person who opened it came for the brief or the files.
   *  An opt-OUT list rather than an allow-list so a tab added later shows up
   *  everywhere by default instead of silently missing from callers that never
   *  heard of it. */
  hideTabs?: readonly GTab[];
  onClose: () => void;
  onUpdate?: (g: Graphic) => void;
}) {
  const [g, setGraphic] = useState(initialGraphic);
  const visibleTabs = TABS.filter(([id]) => !hideTabs?.includes(id));
  // Never open on a tab this caller hid — landing on an empty panel would look
  // like the drawer failed to load.
  const [tab, setTab] = useState<GTab>(() =>
    hideTabs?.includes(initialTab) ? (visibleTabs[0]?.[0] ?? initialTab) : initialTab);
  const [feedback, setFeedback] = useState(() => FEEDBACK.filter((f) => f.gid === g.id));
  // Load persisted feedback (audit P2-5) — resolves survive a refresh now. The
  // mock filter above is the demo-mode fallback and the initial paint.
  useEffect(() => {
    let alive = true;
    fetchGraphicFeedback(g.id).then((rows) => { if (alive) setFeedback(rows); }).catch(() => {});
    return () => { alive = false; };
  }, [g.id]);
  // The campaign's own status decides whether Creative may start. Fetched here
  // rather than passed in, so every entry point into the drawer (board, list,
  // ?open= deep link, My Tasks) gets the gate rather than only the ones that
  // remembered to thread a prop through.
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  // Same lookup also yields the campaign's running code for the Linked Modules
  // row — one fetch, since the drawer already needed the row anyway.
  const [campaignCode, setCampaignCode] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    fetchCampaigns()
      .then((rows) => {
        if (!alive) return;
        const hit = g.campaignId
          ? rows.find((c) => c.id === g.campaignId)
          : rows.find((c) => c.name.trim().toLowerCase() === (g.campaign ?? "").trim().toLowerCase());
        setCampaignStatus(hit?.status ?? "");
        setCampaignCode(hit?.code);
      })
      .catch(() => { if (alive) setCampaignStatus(null); });
    return () => { alive = false; };
  }, [g.campaignId, g.campaign]);
  // null = still loading; don't claim "not approved" before we know.
  const campaignReleased = campaignStatus === null ? true : campaignReleasedForWork(campaignStatus);

  const resolveFeedback = async (id: number) => {
    const prev = feedback;
    setFeedback((fs) => fs.map((x) => (x.id === id ? { ...x, status: "Resolved" } : x)));
    try { await resolveGraphicFeedback(id); } catch (e) { setFeedback(prev); toastError(`Resolve ไม่สำเร็จ: ${e instanceof Error ? e.message : "Unknown error"}`); }
  };
  const [feedbackTarget, setFeedbackTarget] = useState(0);
  const [feedbackReason, setFeedbackReason] = useState("");
  const { member, user, role } = useAuth();
  const currentUser = member?.name ?? user?.email ?? g.designer;
  // The brief sign-off belongs to the RECEIVING side (content leader /
  // designer). The requester wrote the brief — approving it themselves would
  // make the check meaningless, so the sign-off controls hide for them.
  const requesterKey = (g.requester || "").trim().toLowerCase();
  const isRequester = !!requesterKey &&
    [member?.name, member?.email, user?.email].some((v) => (v ?? "").trim().toLowerCase() === requesterKey);
  // Sign-off belongs to the CONTENT side: only creative-team roles (Creative
  // Leader, designers, VDO, Content Creator) — or the CMO — may approve a
  // brief, and never the person who requested it. A planner approving briefs
  // for the team they are briefing defeats the check the same way
  // self-approval did.
  const canSignOffBrief = !isRequester && (role === "CMO" || isCreativeSideRole(role));

  // Rush sign-off: Creative Leader owns the queue's capacity, CMO covers.
  const canApproveRush = canApproveRushBrief(role);
  const stageAge = stageAgeDays(g, new Date().toISOString().slice(0, 10));
  const stageLevel = ageLevel(stageAge);
  const [rushBusy, setRushBusy] = useState(false);
  const decideRush = async (decision: "Approved" | "Rejected") => {
    setRushBusy(true);
    const at = new Date().toISOString();
    const next: Graphic = {
      ...g,
      rushStatus: decision,
      rushDecidedBy: currentUser,
      rushDecidedAt: at,
      nextAction: decision === "Approved"
        ? (g.designer === "Unassigned" ? "Creative leader to assign designer" : `${g.designer} to start production`)
        : `${g.requester} to move the due date into the normal round`,
      history: [...(g.history ?? []), { type: decision === "Approved" ? "brief_approved" : "brief_revision_requested", at, by: currentUser, note: `rush ${decision.toLowerCase()}` }],
    };
    try {
      await updateGraphic(next);
      updateCurrentGraphic(next);
      notify(decision === "Approved" ? "approved" : "rejected",
        decision === "Approved" ? `⚡ อนุมัติงานเร่งด่วน: ${g.title}` : `⚡ ไม่อนุมัติงานเร่งด่วน: ${g.title}`,
        `${brandName(g.b)} · ${g.campaign} · โดย ${currentUser}`, `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
    } catch (error) {
      toastError(`บันทึกผลอนุมัติงานเร่งด่วนไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setRushBusy(false); }
  };
  // Real Marketing Manager / BGL from Settings for the approval chain — no more
  // hardcoded "Mei T." Shows "—" when the role has no member yet.
  const [bglApprover, setBglApprover] = useState("—");
  useEffect(() => {
    let alive = true;
    fetchMembers().then((ms) => {
      if (!alive) return;
      const m = ms.find((x) => /marketing manager|bgl|brand lead/i.test(x.role));
      if (m) setBglApprover(m.name);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const openFb = feedback.filter((f) => f.status === "Open").length;
  const brief = briefFields(g);
  const briefDetails = creativeBriefDetails(g);
  const briefPct = Math.round((brief.filter((b) => b.ok).length / brief.length) * 100);
  const canDeliver = g.stage === "Approved";
  const deliverables = g.deliverables?.length ? g.deliverables : deriveDeliverables(g);
  const reviewableDeliverables = deliverables.filter((d) => d.status === "Waiting review");
  const targetDeliverable = deliverables[feedbackTarget];

  const updateCurrentGraphic = (next: Graphic) => {
    setGraphic(next);
    onUpdate?.(next);
  };

  // Filling in your own brief. Allowed until Creative accepts — the rule
  // contentEditLock already stated and the UI never offered anywhere to act on,
  // which is how a request reaches 38% complete with the app itself printing
  // "รอ requester เติม key message" at someone with no field to type in.
  // Completing a brief is not signing it off: canSignOffBrief still refuses the
  // requester, so the Content/Creative side still decides it is good enough.
  //
  // Once Creative HAS accepted, a top-up is a request: ask the Creative
  // Leader, wait to be released, then edit. See lib/data/graphic's
  // canEditBriefNow — the rule lives there so this drawer and the Agency
  // Portal ask it the same way.
  const [briefEditing, setBriefEditing] = useState(false);
  const [askingUnlock, setAskingUnlock] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const isCmo = role === "CMO";
  const canEditBrief = canEditBriefNow(g, { isRequester, isCmo });
  const briefBlockedReason = briefEditBlockedReason(g, { isRequester, isCmo });
  const unlockState = briefUnlockState(g);
  // Creative Leader only — narrower than accepting work on purpose (see
  // canReleaseBriefEdit). Nobody else sees the decision buttons.
  const canReleaseBrief = canReleaseBriefEdit(role);

  const requestBriefUnlock = async () => {
    if (!unlockReason.trim()) return;
    setAskingUnlock(true);
    try {
      const asked = requestBriefEdit(g, currentUser, unlockReason);
      const next = withNotice(asked, currentUser, `${currentUser} ขอเติมบรีฟเพิ่มเติม: ${unlockReason.trim()} — รอ Creative Leader ปล่อยงานให้แก้`);
      await updateGraphic(next);
      updateCurrentGraphic(next);
      notify("approval", `✋ ขอเติมบรีฟ: ${g.title}`,
        `โดย ${currentUser} → Creative Leader · ${unlockReason.trim()}`,
        `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
      toastSuccess("ส่งคำขอให้ Creative Leader แล้ว — รอปล่อยงานก่อนถึงจะเติมบรีฟได้");
      setUnlockReason("");
    } catch (error) {
      toastError(`ส่งคำขอไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setAskingUnlock(false); }
  };

  const decideUnlock = async (grant: boolean) => {
    setAskingUnlock(true);
    try {
      const decided = decideBriefEdit(g, currentUser, grant);
      const next = withNotice(decided, currentUser,
        grant ? `${currentUser} ปล่อยให้เติมบรีฟได้ 1 ครั้ง` : `${currentUser} ยังไม่ปล่อยให้เติมบรีฟรอบนี้`);
      await updateGraphic(next);
      updateCurrentGraphic(next);
      notify(grant ? "approved" : "rejected",
        grant ? `✅ ปล่อยให้เติมบรีฟ: ${g.title}` : `⛔ ยังไม่ปล่อยให้เติมบรีฟ: ${g.title}`,
        `โดย ${currentUser} → ${g.briefUnlock?.requestedBy || g.requester}`,
        `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
      toastSuccess(grant ? "ปล่อยให้เติมบรีฟแล้ว" : "ไม่ปล่อยให้เติมบรีฟรอบนี้");
    } catch (error) {
      toastError(`บันทึกผลไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setAskingUnlock(false); }
  };

  // ── รับงาน / ปล่อยงานคืน ────────────────────────────────────────────
  // The producing side owns this: creative-team roles (or the CMO covering for
  // them). Deliberately NOT the requester — a planner who could accept on
  // Creative's behalf could lock their own post against everyone else.
  // Producing side owns this, AND the campaign must be cleared first — the CMO
  // approval step in the team's flow, which until now existed only as a
  // convention.
  const canAcceptWork = !isRequester && (role === "CMO" || isCreativeSideRole(role)) && campaignReleased;

  const saveGraphic = (next: Graphic, failMessage: string) => {
    updateGraphic(next)
      .then(() => updateCurrentGraphic(next))
      .catch((error) => toastError(`${failMessage}: ${error?.message || "Unknown error"}`));
  };

  const acceptWork = () => {
    const next: Graphic = {
      ...g,
      acceptedBy: currentUser,
      acceptedAt: new Date().toISOString(),
      // Taking the job on IS starting it — a request that sits in "New Request"
      // after someone accepted it reads as unclaimed on the board.
      stage: g.stage === "New Request" ? "In Progress" : g.stage,
      nextAction: `${currentUser} กำลังผลิตงาน`,
      history: [...(g.history ?? []), { type: "assigned", at: new Date().toISOString(), by: currentUser, note: `รับงาน (${currentUser})` }],
    };
    saveGraphic(next, "บันทึกการรับงานไม่สำเร็จ");
    toastSuccess(`รับงาน “${g.title}” แล้ว — Marketing จะแก้โพสต์นี้ไม่ได้จนกว่าจะปล่อยคืน`);
  };

  const releaseWork = () => {
    if (!window.confirm(`ปล่อยงาน “${g.title}” คืน?\n\nMarketing จะกลับมาแก้ไข/ย้ายโพสต์นี้ได้อีกครั้ง`)) return;
    const next: Graphic = { ...g, acceptedBy: undefined, acceptedAt: undefined };
    saveGraphic(next, "ปล่อยงานคืนไม่สำเร็จ");
    toastSuccess(`ปล่อยงาน “${g.title}” คืนแล้ว`);
  };

  // ── Production pipeline: storyboard → ถ่าย → asset ────────────────────
  // Which month's work this request serves — derived from its Final AW date, so
  // the storyboard deadline resolves against the same month the artwork does.
  const deadlines = useDeadlines();
  const servedMonth = monthServedByFinalAw(g.dueIso);
  const sbDeadline = servedMonth ? deadlines.milestone("storyboard", servedMonth) : null;

  const [sbLink, setSbLink] = useState(g.storyboardLink ?? "");
  const [sbNote, setSbNote] = useState("");
  const [footage, setFootage] = useState(g.footageLink ?? "");
  useEffect(() => { setSbLink(g.storyboardLink ?? ""); setFootage(g.footageLink ?? ""); }, [g.storyboardLink, g.footageLink]);

  /** Who may set up the shoot / storyboard assignment: the creative side runs
   *  its own pipeline, and the CMO covers. */
  const canRunPipeline = role === "CMO" || isCreativeSideRole(role);
  /** The storyboard is accepted by the person who asked for the work — the same
   *  rule the artwork itself follows. Never the person who drew it. */
  const canDecideStoryboard = isRequester || role === "CMO";

  const setShooting = (patch: Partial<Graphic>) => saveGraphic({ ...g, ...patch }, "บันทึกไม่สำเร็จ");

  const submitStoryboard = () => {
    if (!sbLink.trim()) return;
    const at = new Date().toISOString();
    saveGraphic({
      ...g, storyboardLink: sbLink.trim(), storyboardStatus: "Submitted",
      storyboardSubmittedBy: currentUser, storyboardSubmittedAt: at, storyboardNote: "",
      nextAction: `รอ ${g.requester} อนุมัติ storyboard`,
    }, "ส่ง storyboard ไม่สำเร็จ");
    toastSuccess("ส่ง storyboard แล้ว — รอเจ้าของงานอนุมัติ");
    notify("feedback", `🎬 ส่ง storyboard: ${g.title}`, `โดย ${currentUser} → รอ ${g.requester} อนุมัติ`, `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
  };

  const decideStoryboard = (approved: boolean) => {
    if (!approved && sbNote.trim().length < 5) { toastError("เขียนเหตุผลที่ส่งกลับแก้อย่างน้อย 5 ตัวอักษร"); return; }
    const at = new Date().toISOString();
    saveGraphic({
      ...g,
      storyboardStatus: approved ? "Approved" : "Revision",
      storyboardDecidedBy: currentUser, storyboardDecidedAt: at,
      storyboardNote: approved ? "" : sbNote.trim(),
      nextAction: approved ? "storyboard ผ่านแล้ว — เริ่มถ่าย/ผลิตงานได้" : "Creative Content แก้ storyboard แล้วส่งใหม่",
    }, "บันทึกผล storyboard ไม่สำเร็จ");
    setSbNote("");
    toastSuccess(approved ? "อนุมัติ storyboard แล้ว" : "ส่ง storyboard กลับไปแก้แล้ว");
    notify(approved ? "approved" : "rejected", `${approved ? "✅ อนุมัติ" : "✏️ ส่งกลับแก้"} storyboard: ${g.title}`, `โดย ${currentUser}`, `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
  };

  const submitFootage = () => {
    if (!footage.trim()) return;
    const at = new Date().toISOString();
    saveGraphic({
      ...g, footageLink: footage.trim(), footageSubmittedBy: currentUser, footageSubmittedAt: at,
      nextAction: `${g.designer && g.designer !== "Unassigned" ? g.designer : "Designer"} ตัดต่อ/ทำ artwork ต่อ`,
    }, "ส่ง footage ไม่สำเร็จ");
    toastSuccess("ส่ง footage แล้ว — ส่งต่อให้ designer/editor ทำงานต่อได้");
    notify("feedback", `📷 ส่ง footage แล้ว: ${g.title}`, `โดย ${currentUser} → ${g.designer || "Designer"} ทำต่อ`, `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
  };

  /** Moving a shoot is a normal event, not a failure — it just has to be
   *  recorded, because the day the work lands on moves with it (workDayIso). */
  const moveShoot = (next: string) => {
    const from = g.shootDate || "—";
    saveGraphic({
      ...g, shootDate: next,
      history: [...(g.history ?? []), { type: "assigned", at: new Date().toISOString(), by: currentUser, note: `เลื่อนวันถ่าย ${from} → ${next || "—"}` }],
    }, "เลื่อนวันถ่ายไม่สำเร็จ");
    if (next) toastSuccess(`เลื่อนวันถ่ายเป็น ${next} — งานจะไปนับในเดือน ${next.slice(0, 7)}`);
  };

  /** Creative has read the planner's change notices. Marked seen, not deleted —
   *  the trail of what changed mid-production is worth keeping. */
  const dismissNotices = () => {
    const next: Graphic = { ...g, notices: (g.notices ?? []).map((n) => ({ ...n, seen: true })) };
    saveGraphic(next, "บันทึกไม่สำเร็จ");
  };

  const markDelivered = () => {
    if (!canDeliver) return;
    const next: Graphic = {
      ...g,
      stage: "Delivered",
      nextAction: "Delivered to campaign / content team",
      history: [...(g.history ?? []), { type: "delivered", at: new Date().toISOString(), by: currentUser }],
    };
    updateGraphic(next)
      .then(() => updateCurrentGraphic(next))
      .catch((error) => toastError(`บันทึกสถานะ Delivered ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };

  // ── Brief sign-off (content leader) ────────────────────────────────
  // Approve = brief is complete enough to start production. Revise = the
  // comment goes back to the requester AND lands in their My Tasks.
  const [briefComment, setBriefComment] = useState("");
  const [briefBusy, setBriefBusy] = useState(false);

  const approveBrief = async () => {
    setBriefBusy(true);
    const at = new Date().toISOString();
    const next: Graphic = {
      ...g,
      briefComplete: true,
      briefApprovedBy: currentUser,
      briefApprovedAt: at,
      blocker: g.blocker === "Brief incomplete" || g.blocker === "Brief revision requested" ? null : g.blocker,
      nextAction: g.designer === "Unassigned" ? "Creative leader to assign designer" : `${g.designer} to start production`,
      history: [...(g.history ?? []), { type: "brief_approved", at, by: currentUser }],
    };
    try {
      await updateGraphic(next);
      updateCurrentGraphic(next);
      notify("approved", `✅ Brief อนุมัติแล้ว: ${g.title}`, `${brandName(g.b)} · ${g.campaign} · โดย ${currentUser}`, `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
    } catch (error) {
      toastError(`อนุมัติ Brief ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBriefBusy(false); }
  };

  const reviseBrief = async () => {
    const comment = briefComment.trim();
    if (!comment) return;
    setBriefBusy(true);
    const at = new Date().toISOString();
    const next: Graphic = {
      ...g,
      briefComplete: false,
      briefApprovedBy: undefined,
      briefApprovedAt: undefined,
      blocker: "Brief revision requested",
      nextAction: `${g.requester} to revise brief — ${comment}`,
      history: [...(g.history ?? []), { type: "brief_revision_requested", at, by: currentUser, note: comment }],
    };
    // The comment becomes a task in the requester's My Tasks, due in 2 days.
    const due = new Date(); due.setDate(due.getDate() + 2);
    const task: Task = {
      id: Date.now(), title: `Revise graphic brief — ${g.title}`,
      module: "Graphic", moduleIcon: "🎨", moduleColor: "#C2691E", type: "Graphic",
      assignee: g.requester, brand: brandName(g.b), campaign: g.campaign,
      status: "Todo", priority: "High", group: "doFirst",
      due: due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      dueIso: due.toISOString().slice(0, 10),
      blocker: null, pendingApprover: null, isQuickWin: false,
      nextAction: `Comment จาก ${currentUser}: ${comment}`,
      checklist: ["แก้ brief ตาม comment", "แจ้ง Creative leader"],
      relatedGraphicId: String(g.id),
    };
    try {
      await updateGraphic(next);
      await createTaskDb(task);
      updateCurrentGraphic(next);
      notify("rejected", `↩ Brief ถูกส่งกลับแก้: ${g.title}`, `ถึง ${g.requester} — ${comment} · โดย ${currentUser}`, "/my-tasks");
      setBriefComment("");
    } catch (error) {
      toastError(`ส่ง Brief กลับแก้ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBriefBusy(false); }
  };

  const requestFeedbackRevision = () => {
    const reason = feedbackReason.trim();
    const d = targetDeliverable;
    if (!reason || !d || d.status !== "Waiting review") return;
    const at = new Date().toISOString();
    const nextDeliverables = deliverables.map((x, i) => i === feedbackTarget
      ? { ...x, status: "Revision" as const, feedback: [...x.feedback, { reason, by: currentUser, at }] }
      : x);
    const next: Graphic = {
      ...g,
      deliverables: nextDeliverables,
      stage: stageFromDeliverables({ ...g, deliverables: nextDeliverables }),
      openFb: (g.openFb ?? 0) + 1,
      fb: (g.fb ?? 0) + 1,
      blocker: "Design revision needed",
      nextAction: `${g.designer} to revise ${d.platform} per feedback`,
      history: [...(g.history ?? []), { type: "revision_requested", at, by: currentUser, deliverableKey: `${d.platform}::${d.size}`, note: reason }],
    };
    updateGraphic(next)
      .then(() => updateCurrentGraphic(next))
      .catch((error) => toastError(`บันทึก Feedback ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    // Persist the feedback entry so the Feedback tab keeps it across refreshes
    // (audit P2-5). Fall back to a local-only row in demo mode.
    const localEntry = {
      id: Date.now(), gid: g.id, owner: currentUser, team: "Requester / Approver", ownerColor: "#B5577E",
      type: "Design revision", text: reason, version: `V${d.version || 1}`, status: "Open",
      assignedTo: g.designer, due: g.due, createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    setFeedback((fs) => [localEntry, ...fs]);
    addGraphicFeedback(g.id, {
      owner: currentUser, team: "Requester / Approver", ownerColor: "#B5577E", type: "Design revision",
      text: reason, version: `V${d.version || 1}`, assignedTo: g.designer, due: g.due,
    })
      .then((saved) => { if (saved) setFeedback((fs) => fs.map((x) => (x === localEntry ? saved : x))); })
      .catch(() => {});
    // Bounce the revision into the designer's My Tasks.
    if (g.designer && g.designer !== "Unassigned") {
      createRevisionTask({
        module: "Graphic", title: `แก้งานกราฟฟิก — ${g.title} (${d.platform})`, assignee: g.designer,
        brand: brandName(g.b), campaign: g.campaign, reason, by: currentUser, relatedGraphicId: String(g.id),
      }).catch((error) => toastError(`สร้าง task แก้ Graphic ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    notify("rejected", `✏️ งานกราฟฟิกถูกส่งกลับแก้: ${g.title}`, `${d.platform} — ${reason} · ถึง ${g.designer} · โดย ${currentUser}`, "/my-tasks");
    setFeedbackReason("");
    setTab("feedback");
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[540px] bg-surface flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2 flex-shrink-0" style={{ background: "#FBF9F4" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-[5px] flex-wrap">
              <span className="text-[15px] font-extrabold">{g.title}</span>
              {/* Full code: the artwork number carries its post's number inside
                  it, so this one line answers "which post is this for". */}
              <WorkCode code={g.code} full />
              <StatusBadge tone={PRIORITY_TONE[g.priority]}>{g.priority}</StatusBadge>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted">
              <span className="flex items-center gap-[5px]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: brandColor(g.b) }} />{brandName(g.b)}</span>
              <span className="text-faint">·</span><span>{g.type}</span>
              <span className="text-faint">·</span><span>Due {g.due}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="flex border-b border-line flex-shrink-0 overflow-x-auto bg-surface">
          {visibleTabs.map(([id, label]) => {
            const active = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)} className="text-[12.5px] font-semibold px-[13px] py-[11px] whitespace-nowrap border-b-2 -mb-[1px] flex items-center gap-[6px]"
                style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
                {label}
                {id === "feedback" && openFb > 0 && <span className="text-[9.5px] font-bold px-[6px] rounded-pill bg-status-red text-white">{openFb}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-[18px]">
          {tab === "overview" && (
            <div className="flex flex-col gap-4">
              {/* Rush sign-off. Sits above everything because until it is
                  cleared, nothing else on this request should be started. */}
              {g.rushStatus === "Pending" && (
                <div className="rounded-[14px] border px-4 py-3" style={{ background: "#FFF7ED", borderColor: "#F0C89B" }}>
                  <div className="text-[12.5px] font-extrabold" style={{ color: "#B3641E" }}>⚡ งานเร่งด่วน — รออนุมัติ</div>
                  <ul className="mt-2 list-disc pl-5 text-[11.5px]" style={{ color: "#8A5418" }}>
                    {(g.rushBreaches ?? []).map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                  {g.rushReason && (
                    <div className="mt-2 rounded-[10px] bg-white px-3 py-2 text-[12px]" style={{ color: "#6b6258" }}>
                      <span className="font-bold">เหตุผลจาก {g.requester}: </span>{g.rushReason}
                    </div>
                  )}
                  {canApproveRush ? (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <button onClick={() => decideRush("Approved")} disabled={rushBusy}
                        className="text-[12px] font-bold text-white rounded-[9px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>
                        ✓ อนุมัติให้เร่ง
                      </button>
                      <button onClick={() => decideRush("Rejected")} disabled={rushBusy}
                        className="text-[12px] font-bold rounded-[9px] px-3 py-[7px] border disabled:opacity-40" style={{ borderColor: "#F0C89B", color: "#B3641E", background: "#fff" }}>
                        ✕ ไม่อนุมัติ — ให้เข้ารอบปกติ
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 text-[11.5px] font-semibold" style={{ color: "#8A5418" }}>
                      รอ Creative Leader หรือ CMO ตัดสิน — ระหว่างนี้ยังไม่เริ่มงาน
                    </div>
                  )}
                </div>
              )}
              {g.rushStatus === "Rejected" && (
                <div className="rounded-[14px] border px-4 py-3" style={{ background: "#FFF5F4", borderColor: "#F5C8C4" }}>
                  <div className="text-[12.5px] font-extrabold text-status-red">✕ ไม่อนุมัติให้เร่ง{g.rushDecidedBy ? ` — โดย ${g.rushDecidedBy}` : ""}</div>
                  <div className="mt-1 text-[11.5px] text-status-red">ปรับวันส่งงานให้เข้ารอบปกติ แล้วส่งใหม่{g.rushDecisionNote ? ` · ${g.rushDecisionNote}` : ""}</div>
                </div>
              )}
              {g.rushStatus === "Approved" && (
                <div className="rounded-[12px] border px-4 py-2 text-[11.5px] font-semibold" style={{ background: "#EEF4EE", borderColor: "#CFE4C2", color: "#4E7A4E" }}>
                  ⚡ งานเร่งด่วน · อนุมัติแล้ว{g.rushDecidedBy ? ` โดย ${g.rushDecidedBy}` : ""}
                </div>
              )}
              {/* How long it has sat where it is. The stage alone never said
                  whether that was two days or three weeks. */}
              {stageAge !== null && (
                <div className="rounded-[12px] border px-4 py-2 flex items-center gap-2"
                  style={{ background: AGE_META[stageLevel].bg, borderColor: stageLevel === "fresh" ? "#CFE4C2" : stageLevel === "slow" ? "#F0C89B" : "#F5C8C4" }}>
                  <span className="text-[11.5px] font-bold" style={{ color: AGE_META[stageLevel].fg }}>
                    ⏱ อยู่สถานะ &ldquo;{g.stage}&rdquo; มา {stageAge} วัน
                  </span>
                  {stageLevel !== "fresh" && (
                    <span className="text-[11px] font-semibold" style={{ color: AGE_META[stageLevel].fg }}>· {AGE_META[stageLevel].label}</span>
                  )}
                  {isUnowned(g.designer) && (
                    <span className="ml-auto text-[11px] font-bold" style={{ color: AGE_META[stageLevel].fg }}>ยังไม่มี designer</span>
                  )}
                </div>
              )}

              {/* Notices from the planning side — the post this request serves
                  was moved or rescheduled. Shown here, on the work itself,
                  because a message in a channel gets missed. */}
              {unseenNotices(g).length > 0 && (
                <div className="rounded-[14px] border px-4 py-3" style={{ background: "#FFF7ED", borderColor: "#F0C89B" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-extrabold" style={{ color: "#B3641E" }}>📌 Marketing แก้ไขงานนี้</span>
                    <button onClick={dismissNotices} className="ml-auto text-[11px] font-bold" style={{ color: "#8A5418" }}>รับทราบ</button>
                  </div>
                  <ul className="mt-2 list-disc pl-5 text-[11.5px]" style={{ color: "#8A5418" }}>
                    {unseenNotices(g).map((n, i) => (
                      <li key={`${n.at}-${i}`}>{n.text} <span className="opacity-70">— {n.by} · {new Date(n.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {/* รับงาน — the explicit hand-off. Until Creative presses this the
                  planner may still rewrite the post; after it, the brief is
                  frozen (see contentEditLock). */}
              <div className="rounded-[14px] border px-4 py-3" style={{ background: isAccepted(g) ? "#EEF4EE" : "#FBF9F4", borderColor: isAccepted(g) ? "#CFE4C2" : "#E5DECF" }}>
                {isAccepted(g) ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12.5px] font-extrabold" style={{ color: "#4E7A4E" }}>✓ รับงานแล้ว</span>
                    <span className="text-[11.5px] font-semibold" style={{ color: "#4E7A4E" }}>
                      โดย {g.acceptedBy || "—"} · {g.acceptedAt ? new Date(g.acceptedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : ""}
                    </span>
                    {canAcceptWork && (
                      <button onClick={releaseWork} className="ml-auto text-[11.5px] font-bold rounded-[9px] px-3 py-[6px] border border-line2 bg-surface text-muted">
                        ปล่อยงานคืน
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold text-ink">ยังไม่มีใครรับงานนี้</div>
                      {/* Say WHY the button is unavailable. A control that just
                          isn't there is the failure that kept four people locked
                          out of their own logins for twelve days. */}
                      {!campaignReleased ? (
                        <div className="text-[11px] font-semibold" style={{ color: "#B33A2E" }}>
                          ⛔ แคมเปญนี้สถานะ &ldquo;{campaignStatus || "ไม่ทราบ"}&rdquo; — CMO ยังไม่อนุมัติ
                          จึงยังรับงานไม่ได้ · วางแผน/แก้บรีฟล่วงหน้าได้ตามปกติ
                        </div>
                      ) : (
                        <div className="text-[11px] text-faint">กด &ldquo;รับงาน&rdquo; เมื่อเริ่มทำ — หลังจากนั้น Marketing จะแก้ไข/ย้ายโพสต์นี้ไม่ได้</div>
                      )}
                    </div>
                    {canAcceptWork && (
                      <button onClick={acceptWork} className="ml-auto text-[12px] font-bold rounded-[10px] px-4 py-[8px] text-white bg-panel">
                        รับงาน
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Production pipeline ────────────────────────────────
                  A reel is not one job: someone storyboards it, someone shoots
                  it, someone cuts it. Only the last step existed here, so the
                  first two happened in chat and the designer looked late for
                  footage nobody had sent. */}
              <div className="rounded-[14px] border border-line2 bg-ivory p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11.5px] font-bold text-muted">🧭 ขั้นตอนงาน</span>
                  {workingMonth(g) && (
                    <span className="ml-auto text-[11px] font-bold rounded-pill px-2.5 py-[3px]" style={{ background: "#F2EEFF", color: "#6C5CE7" }}
                      title="เดือนที่งานนี้ลงจริง — ย้ายตามวันถ่ายเมื่อมีการเลื่อน (ไม่ใช่เดือนที่ออกบิล ซึ่งนับตอนอนุมัติงาน)">
                      เดือนที่ทำงานจริง {workingMonth(g)}
                    </span>
                  )}
                </div>

                <ol className="flex flex-col gap-[6px] mb-3">
                  {productionSteps(g).map((step) => {
                    const mark = step.state === "done" ? "✓" : step.state === "active" ? "▶" : "•";
                    const color = step.state === "done" ? "#4E7A4E" : step.state === "active" ? "#B3641E" : "#9A9387";
                    return (
                      <li key={step.key} className="flex items-start gap-2 text-[11.5px]">
                        <span style={{ color }} className="font-bold w-[12px]">{mark}</span>
                        <span className="font-bold" style={{ color }}>{step.label}</span>
                        <span className="text-faint">· {step.owner}</span>
                        <span className="text-faint ml-auto text-right">{step.detail}</span>
                      </li>
                    );
                  })}
                </ol>

                {/* Storyboard — only for reel / video work */}
                {needsStoryboard(g) && (
                  <div className="rounded-[10px] border border-line3 bg-surface p-3 mb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11.5px] font-bold text-ink">🎬 Storyboard</span>
                      <StatusBadge tone={g.storyboardStatus === "Approved" ? "green" : g.storyboardStatus === "Revision" ? "orange" : g.storyboardStatus === "Submitted" ? "gold" : "neutral"}>
                        {g.storyboardStatus || "ยังไม่ส่ง"}
                      </StatusBadge>
                      {/* From the Team Calendar, not a constant here. */}
                      {sbDeadline && (
                        <span className="ml-auto text-[11px] font-bold rounded-pill px-2.5 py-[3px]"
                          style={{ background: "#F7F2FF", color: "#6C5CE7" }}
                          title={`ปฏิทินทีม · ${sbDeadline.governs} · งานของเดือน ${sbDeadline.forMonth}`}>
                          กำหนดส่ง {sbDeadline.iso}
                        </span>
                      )}
                    </div>
                    {canRunPipeline && (
                      <div className="mb-2">
                        <div className="text-[10.5px] font-bold text-faint mb-[4px]">คนทำ storyboard (Creative Content)</div>
                        <OwnerSelect value={g.storyboardOwner ?? ""} onChange={(name) => setShooting({ storyboardOwner: name })} team="Creative" placeholder="ยังไม่ระบุ" />
                      </div>
                    )}
                    {g.storyboardStatus === "Revision" && g.storyboardNote && (
                      <div className="mb-2 rounded-[8px] px-2.5 py-[6px] text-[11px] font-semibold" style={{ background: "#FFF5F4", color: "#B33A2E" }}>
                        ส่งกลับแก้: {g.storyboardNote}
                      </div>
                    )}
                    {g.storyboardStatus !== "Approved" && canRunPipeline && (
                      <div className="flex gap-2 mb-2">
                        <input value={sbLink} onChange={(e) => setSbLink(e.target.value)} placeholder="ลิงก์ storyboard (Drive / Figma / Canva)"
                          className="flex-1 text-[12px] px-[10px] py-[7px] rounded-[8px] border border-line2 bg-ivory outline-none" />
                        <button onClick={submitStoryboard} disabled={!sbLink.trim()}
                          className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] bg-panel disabled:opacity-40 whitespace-nowrap">
                          {g.storyboardStatus === "Revision" ? "ส่งใหม่" : "ส่ง storyboard"}
                        </button>
                      </div>
                    )}
                    {g.storyboardLink && (
                      <a href={g.storyboardLink} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-accent">เปิด storyboard ↗</a>
                    )}
                    {/* Accepted by the person who asked for the work — same rule
                        the artwork follows, never the person who drew it. */}
                    {g.storyboardStatus === "Submitted" && canDecideStoryboard && (
                      <div className="mt-2 flex flex-col gap-2">
                        <input value={sbNote} onChange={(e) => setSbNote(e.target.value)} placeholder="เหตุผลถ้าส่งกลับแก้…"
                          className="text-[12px] px-[10px] py-[7px] rounded-[8px] border border-line2 bg-ivory outline-none" />
                        <div className="flex gap-2">
                          <button onClick={() => decideStoryboard(true)} className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px]" style={{ background: "#4E7A4E" }}>อนุมัติ storyboard</button>
                          <button onClick={() => decideStoryboard(false)} className="text-[12px] font-bold rounded-[8px] px-3 py-[7px] border border-line2 bg-surface text-status-red">ส่งกลับแก้</button>
                        </div>
                      </div>
                    )}
                    {g.storyboardStatus === "Approved" && (
                      <div className="mt-1 text-[11px] font-semibold" style={{ color: "#4E7A4E" }}>
                        ✓ อนุมัติโดย {g.storyboardDecidedBy || "—"}
                      </div>
                    )}
                  </div>
                )}

                {/* Shooting */}
                <div className="rounded-[10px] border border-line3 bg-surface p-3">
                  {/* Three buttons, not a checkbox. Unticked used to mean both
                      "nobody has decided" and "decided: no shoot", so a designer
                      could not tell whether photos were still coming or whether
                      it was already on them to start. */}
                  <div className="text-[11.5px] font-bold text-ink mb-2">📷 งานนี้ต้องถ่ายก่อนไหม</div>
                  <div className="flex items-center gap-[6px] flex-wrap mb-2">
                    {([
                      { v: true as const, label: "ต้องถ่าย", on: { background: "#F5EEE2", color: "#8A5A1E", borderColor: "#E4C79B" } },
                      { v: false as const, label: "ไม่ต้องถ่าย", on: { background: "#EEF4EE", color: "#4E7A4E", borderColor: "#CFE4C2" } },
                    ]).map((opt) => {
                      const active = g.requiresShooting === opt.v;
                      return (
                        <button key={String(opt.v)} disabled={!canRunPipeline}
                          onClick={() => setShooting({ requiresShooting: active ? undefined : opt.v })}
                          className="text-[11.5px] font-bold rounded-pill px-3 py-[5px] border disabled:opacity-40"
                          style={active ? opt.on : { background: "#fff", color: "#7D7789", borderColor: "#E5DECF" }}>
                          {active ? "✓ " : ""}{opt.label}
                        </button>
                      );
                    })}
                    {shootingDecision(g) === "undecided" && (
                      <span className="text-[11px] font-semibold" style={{ color: "#C68A1E" }}>
                        ยังไม่ระบุ — Designer ไม่รู้ว่าต้องรอรูปหรือเริ่มได้เลย
                      </span>
                    )}
                  </div>

                  {/* Photos the designer works from when there is no shoot. Also
                      useful alongside one: reference shots, product cuts, logos. */}
                  {shootingDecision(g) !== "required" && (
                    <div className="mb-2">
                      <div className="text-[10.5px] font-bold text-faint mb-[4px]">
                        ลิงก์รูป / ไฟล์ให้ Designer{shootingDecision(g) === "not_required" ? " · ใช้แทนการถ่าย" : ""}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          defaultValue={g.designerPhotosLink ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (g.designerPhotosLink ?? "").trim()) setShooting({ designerPhotosLink: v });
                          }}
                          disabled={!canRunPipeline}
                          placeholder="https://… Drive / Canva / โฟลเดอร์รูปที่มีอยู่แล้ว"
                          aria-label="ลิงก์รูปให้ Designer"
                          className="flex-1 min-w-0 text-[12px] px-[10px] py-[6px] rounded-[9px] border border-line2 bg-white outline-none disabled:opacity-40"
                        />
                        {g.designerPhotosLink?.trim() && (
                          <a href={g.designerPhotosLink} target="_blank" rel="noreferrer"
                            className="text-[11.5px] font-bold text-accent whitespace-nowrap">เปิด ↗</a>
                        )}
                      </div>
                      {shootingDecision(g) === "not_required" && !g.designerPhotosLink?.trim() && (
                        <div className="text-[10.5px] mt-[4px]" style={{ color: "#C68A1E" }}>
                          ไม่ต้องถ่าย แต่ยังไม่มีลิงก์รูป — ถ้างานนี้ต้องใช้ภาพ ใส่ลิงก์ให้ Designer ด้วย
                        </div>
                      )}
                    </div>
                  )}
                  {g.requiresShooting && (
                    <div className="flex flex-col gap-2">
                      <div className="grid md:grid-cols-2 gap-2">
                        <div>
                          <div className="text-[10.5px] font-bold text-faint mb-[4px]">คนถ่าย</div>
                          <OwnerSelect value={g.shooter ?? ""} onChange={(name) => setShooting({ shooter: name })} team="Creative" placeholder="ยังไม่ระบุ" disabled={!canRunPipeline} />
                        </div>
                        <div>
                          <div className="text-[10.5px] font-bold text-faint mb-[4px]">วันถ่าย · เลื่อนได้</div>
                          <DatePicker value={g.shootDate || null} onChange={(v) => canRunPipeline && moveShoot(v || "")} />
                        </div>
                      </div>
                      {g.footageSubmittedAt ? (
                        <div className="rounded-[8px] px-2.5 py-[7px] text-[11.5px] font-semibold flex items-center gap-2 flex-wrap" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
                          ✓ ส่ง footage แล้ว โดย {g.footageSubmittedBy || "—"}
                          {g.footageLink && <a href={g.footageLink} target="_blank" rel="noreferrer" className="underline">เปิดไฟล์ ↗</a>}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input value={footage} onChange={(e) => setFootage(e.target.value)} placeholder="ลิงก์ footage / ภาพถ่าย (Drive)"
                            className="flex-1 text-[12px] px-[10px] py-[7px] rounded-[8px] border border-line2 bg-ivory outline-none" />
                          <button onClick={submitFootage} disabled={!footage.trim()}
                            className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] bg-panel disabled:opacity-40 whitespace-nowrap">ส่ง footage</button>
                        </div>
                      )}
                      <div className="text-[11px] text-faint">
                        คนถ่ายส่ง footage ก่อน แล้ว designer / editor ถึงจะส่งงานในช่อง asset ได้
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[5px]">Assigned Designer</div>
                <OwnerSelect
                  value={g.designer === "Unassigned" ? "" : g.designer}
                  onChange={(name) => {
                    const assigned = name || "Unassigned";
                    const ng: Graphic = {
                      ...g,
                      designer: assigned,
                      nextAction: assigned === "Unassigned" ? "Assign designer to start work" : `${assigned} to start design`,
                      history: [...(g.history ?? []), { type: "assigned", at: new Date().toISOString(), by: currentUser, note: assigned }],
                    };
                    updateGraphic(ng)
                      .then(() => updateCurrentGraphic(ng))
                      .catch((error) => toastError(`บันทึก Designer ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
                  }}
                  team="Creative"
                  placeholder="Unassigned"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[["Stage", <StatusBadge key="s" tone={stageTone(g.stage)}>{g.stage}</StatusBadge>],
                  ["Requester", g.requester], ["Approver", g.approver],
                  ["Platform", g.platform], ["Size", g.size]].map(([l, v], i) => (
                  <div key={i}>
                    <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[3px]">{l as string}</div>
                    {typeof v === "string" ? <div className="text-[13px] text-ink">{v}</div> : v}
                  </div>
                ))}
              </div>
              {g.blocker && (
                <div className="rounded-card px-4 py-3" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
                  <div className="text-[11px] font-bold text-status-red mb-1">Current blocker · waiting since {g.waitingSince}</div>
                  <div className="text-[12.5px] text-status-red font-semibold">{g.blocker}</div>
                </div>
              )}
              <div className="rounded-card px-4 py-3 bg-accent-soft border border-accent-border">
                <div className="text-[11px] font-bold text-status-gold mb-1">Next action</div>
                <div className="text-[12.5px] text-muted font-semibold">{g.nextAction}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold mb-2">Linked Modules</div>
                <div className="flex flex-col gap-2">
                  {[{ icon: "📣", label: "Campaign", sub: campaignLabel(campaignCode, g.campaign), tone: "green" as const, status: "Active" },
                    { icon: "📝", label: "Content Calendar", sub: g.contentItem !== "—" ? g.contentItem : "Not linked", tone: g.contentItem !== "—" ? "green" as const : "neutral" as const, status: g.contentItem !== "—" ? "Linked" : "—" },
                    { icon: "💰", label: "Finance / Budget", sub: "Budget request linked", tone: "green" as const, status: "Approved" }].map((m) => (
                    <div key={m.label} className="flex items-center gap-3 p-3 rounded-card bg-ivory border border-line3">
                      <span className="text-[14px]">{m.icon}</span>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-bold">{m.label}</div><div className="text-[11px] text-faint truncate">{m.sub}</div></div>
                      <StatusBadge tone={m.tone}>{m.status}</StatusBadge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "brief" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[13px] font-extrabold text-ink">Creative Brief Pack</div>
                    <div className="text-[11.5px] text-faint mt-1">รายละเอียดที่ Creative ใช้เช็คก่อนเริ่มงาน</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditBrief && !briefEditing && (
                      <button onClick={() => setBriefEditing(true)}
                        className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[5px] bg-surface">
                        ✏️ เติมบรีฟ
                      </button>
                    )}
                    <StatusBadge tone={g.briefComplete ? "green" : "gold"}>{g.briefComplete ? "Ready" : "Needs detail"}</StatusBadge>
                  </div>
                </div>

                {briefEditing ? (
                  <BriefEditor g={g} onCancel={() => setBriefEditing(false)}
                    onSaved={(next) => { setBriefEditing(false); updateCurrentGraphic(next); }} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {briefDetails.map((item) => (
                      <div key={item.label} className="rounded-[12px] border border-line3 bg-ivory px-3 py-[10px]">
                        <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{item.label}</div>
                        {item.href ? (
                          <a href={item.href} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-accent leading-[1.45] break-words">
                            {item.value} ↗
                          </a>
                        ) : (
                          <div className="text-[12.5px] text-muted leading-[1.45] break-words">{item.value}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Accepted: the brief is what somebody is working to. A top-up
                    goes through the Creative Leader — ask, wait, then edit. */}
                {isAccepted(g) && !briefEditing && (isRequester || isCmo) && unlockState !== "granted" && (
                  <div className="mt-3 rounded-[12px] px-3 py-[10px]" style={{ background: "#FBF9F4", border: "1px solid #E5DECF" }}>
                    <div className="text-[11.5px] text-muted leading-[1.5]">{briefBlockedReason}</div>
                    {unlockState === "pending" ? (
                      <div className="mt-2 text-[11.5px] font-bold" style={{ color: "#8A6D1E" }}>
                        ⏳ ขอไว้เมื่อ {new Date(g.briefUnlock!.requestedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                        {g.briefUnlock?.reason ? ` · “${g.briefUnlock.reason}”` : ""}
                      </div>
                    ) : (
                      <>
                        <input value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)}
                          placeholder="อยากเติมอะไรในบรีฟ… (จำเป็น)"
                          className="mt-2 w-full text-[12px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-white outline-none" />
                        <button onClick={requestBriefUnlock} disabled={askingUnlock || !unlockReason.trim()}
                          className="mt-2 text-[11.5px] font-bold rounded-[8px] px-3 py-[5px] border border-line2 bg-surface text-ink disabled:opacity-40">
                          {askingUnlock ? "กำลังส่ง…" : "✋ ขอเติมบรีฟกับ Creative Leader"}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Creative Leader's decision — only they see these buttons. */}
                {unlockState === "pending" && canReleaseBrief && (
                  <div className="mt-3 rounded-[12px] px-3 py-[10px]" style={{ background: "#FFF7ED", border: "1px solid #F0C89B" }}>
                    <div className="text-[12px] font-extrabold" style={{ color: "#B3641E" }}>✋ คำขอเติมบรีฟ</div>
                    <div className="text-[11.5px] mt-1" style={{ color: "#8A5418" }}>
                      {g.briefUnlock?.requestedBy} ขอเติมบรีฟ{g.briefUnlock?.reason ? `: “${g.briefUnlock.reason}”` : ""}
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <button onClick={() => decideUnlock(true)} disabled={askingUnlock}
                        className="text-[12px] font-bold text-white rounded-[9px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>
                        ✓ ปล่อยให้เติมบรีฟ
                      </button>
                      <button onClick={() => decideUnlock(false)} disabled={askingUnlock}
                        className="text-[12px] font-bold rounded-[9px] px-3 py-[7px] border disabled:opacity-40" style={{ borderColor: "#F0C89B", color: "#B3641E", background: "#fff" }}>
                        ✕ ยังไม่ปล่อย
                      </button>
                    </div>
                  </div>
                )}

                {/* Granted: one top-up, then it asks again. */}
                {unlockState === "granted" && !briefEditing && (
                  <div className="mt-3 rounded-[12px] px-3 py-[10px]" style={{ background: "#EEF4EE", border: "1px solid #CFE4C2" }}>
                    <div className="text-[11.5px] font-bold" style={{ color: "#4E7A4E" }}>
                      ✓ {g.briefUnlock?.decidedBy || "Creative Leader"} ปล่อยให้เติมบรีฟได้แล้ว — แก้ได้ 1 ครั้ง ถ้าจะแก้อีกต้องขอใหม่
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-card p-4" style={{ background: "#F7F4EE" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold">Brief completeness</span>
                  <StatusBadge tone={briefPct === 100 ? "green" : briefPct >= 60 ? "gold" : "red"}>{briefPct}%</StatusBadge>
                </div>
                <Progress value={briefPct} color={briefPct === 100 ? "#4E7A4E" : "#C68A1E"} />
              </div>
              <div className="flex flex-col gap-2">
                {brief.map((b) => (
                  <div key={b.label} className="flex items-center justify-between px-4 py-[10px] rounded-card bg-surface border border-line3">
                    <span className="text-[13px] text-ink">{b.label}</span>
                    <span className="text-[14px] font-bold" style={{ color: b.ok ? "#4E7A4E" : "#9A9387" }}>{b.ok ? "✓" : "—"}</span>
                  </div>
                ))}
              </div>

              {/* Content-leader sign-off: Approve, or Revise with a comment
                  that returns to the requester's My Tasks. */}
              {g.briefApprovedBy ? (
                <div className="rounded-card px-4 py-3" style={{ background: "#EEF4EE", border: "1px solid #CFE4C2" }}>
                  <div className="text-[12.5px] font-bold" style={{ color: "#4E7A4E" }}>
                    ✓ Brief approved by {g.briefApprovedBy}
                    {g.briefApprovedAt ? ` · ${new Date(g.briefApprovedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                  </div>
                </div>
              ) : !canSignOffBrief ? (
                <div className="rounded-card px-4 py-3" style={{ background: "#FBF8EE", border: "1px solid #EAD9A8" }}>
                  <div className="text-[12.5px] font-bold" style={{ color: "#8A6D1E" }}>รอสาย Content sign-off brief</div>
                  <div className="text-[11.5px] text-muted mt-1">
                    {isRequester
                      ? "คุณเป็นผู้ส่งบรีฟนี้ — คนอนุมัติต้องเป็นสาย Content/Creative เพื่อยืนยันว่าบรีฟครบพอเริ่มงานได้จริง"
                      : "การอนุมัติบรีฟเป็นของสาย Content/Creative (Content leader / Designer / VDO) เท่านั้น"}
                  </div>
                </div>
              ) : (
                <div className="rounded-card border border-line bg-surface p-4">
                  <div className="text-[12.5px] font-bold text-ink mb-1">Content leader sign-off</div>
                  <div className="text-[11.5px] text-faint mb-3">อนุมัติ brief เพื่อเริ่มงาน หรือส่งกลับให้ {g.requester} แก้พร้อม comment</div>
                  <button onClick={approveBrief} disabled={briefBusy}
                    className="w-full text-[13px] font-bold text-white rounded-[10px] py-[10px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>
                    {briefBusy ? "Saving…" : "✓ Approve Brief"}
                  </button>
                  <div className="mt-3 pt-3 border-t border-line4">
                    <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Revise — comment ถึง requester <span className="text-status-red">*</span></label>
                    <textarea value={briefComment} onChange={(e) => setBriefComment(e.target.value)} rows={3}
                      placeholder="บอกให้ชัดว่า brief ขาดอะไร / ต้องแก้ตรงไหน…"
                      className="w-full text-[13px] px-[12px] py-[9px] rounded-[10px] border border-line2 bg-ivory outline-none resize-none" />
                    <button onClick={reviseBrief} disabled={briefBusy || !briefComment.trim()}
                      className="mt-2 w-full text-[13px] font-bold rounded-[10px] py-[10px] disabled:opacity-40"
                      style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
                      ↩ Revise & ส่งกลับเข้า Task ของ {g.requester}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "assets" && <DeliverablesEditor g={g} me={currentUser} role={role} isRequester={isRequester} onUpdate={updateCurrentGraphic} />}

          {tab === "feedback" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-card border border-line bg-ivory p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[13px] font-extrabold text-ink">Give feedback / Request revision</div>
                    <div className="text-[11.5px] text-faint mt-1">
                      ใช้เมื่อ Designer หรือ Agency ส่ง asset มาแล้ว สถานะเป็น Waiting review
                    </div>
                  </div>
                  <StatusBadge tone={reviewableDeliverables.length ? "gold" : "neutral"}>
                    {reviewableDeliverables.length ? `${reviewableDeliverables.length} waiting review` : "No asset to review"}
                  </StatusBadge>
                </div>
                <div className="flex flex-col gap-2">
                  <select
                    value={feedbackTarget}
                    onChange={(e) => setFeedbackTarget(Number(e.target.value))}
                    className="w-full text-[12.5px] px-[10px] py-[9px] rounded-[9px] border border-line2 bg-surface outline-none"
                  >
                    {deliverables.map((d, i) => (
                      <option key={`${d.platform}-${d.size}`} value={i}>
                        {d.platform} · {d.size} — {d.status}
                      </option>
                    ))}
                  </select>
                  {targetDeliverable?.status !== "Waiting review" && (
                    <div className="text-[11.5px] rounded-[8px] px-3 py-2 bg-accent-soft text-faint border border-accent-border">
                      Asset นี้ยัง feedback ไม่ได้ เพราะยังไม่ได้ส่งมาให้ review — ให้ Designer/Agency ใส่ลิงก์แล้วกด Submit for Review ก่อน
                    </div>
                  )}
                  <textarea
                    value={feedbackReason}
                    onChange={(e) => setFeedbackReason(e.target.value)}
                    rows={3}
                    placeholder="พิมพ์ feedback / จุดที่ต้องแก้ เช่น logo ใหญ่ขึ้น, เปลี่ยนรูป, copy ไม่ตรง brief..."
                    className="w-full text-[12.5px] px-[10px] py-[9px] rounded-[9px] border border-line2 bg-surface outline-none resize-none"
                  />
                  <button
                    onClick={requestFeedbackRevision}
                    disabled={!feedbackReason.trim() || targetDeliverable?.status !== "Waiting review"}
                    className="self-start text-[12px] font-bold text-white rounded-[9px] px-4 py-[8px] disabled:opacity-40"
                    style={{ background: "#C67A28" }}
                  >
                    ↩ Send Feedback / Request Revision
                  </button>
                </div>
              </div>
              {feedback.length === 0 && <div className="text-[13px] text-faint text-center py-6">No feedback history yet.</div>}
              {feedback.map((f) => (
                <div key={f.id} className="bg-surface border border-line rounded-card p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: f.ownerColor }}>{f.owner.slice(0, 1)}</span>
                    <span className="text-[12.5px] font-bold">{f.owner}</span>
                    <span className="text-[10.5px] text-faint">{f.team} · {f.createdAt}</span>
                    <StatusBadge tone={stageTone(f.status)} className="ml-auto">{f.status}</StatusBadge>
                  </div>
                  <div className="text-[12.5px] text-muted leading-[1.5]">{f.text}</div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-faint">
                    <span className="px-[7px] py-[1px] rounded-pill bg-ivory border border-line3">{f.type}</span>
                    <span>{f.version}</span><span>→ {f.assignedTo}</span>
                    {f.status === "Open" && <button onClick={() => resolveFeedback(f.id)} className="ml-auto text-[11px] font-bold text-status-green">Resolve ✓</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "approval" && (
            <div className="flex flex-col gap-3">
              {[["Designer submitted", "green", g.designer], ["Requester reviewed", g.openFb > 0 ? "gold" : "green", g.requester], ["Marketing Manager / BGL approval", g.stage === "Approved" || g.stage === "Delivered" ? "green" : "neutral", bglApprover], // The CMO step was gated on `g.pendingApprover === g.approver`, which is always
              // true — both are set from the same value when the request is created and
              // neither ever moves — so the "neutral" branch was unreachable. Kept the
              // behaviour, dropped the comparison that pretended to decide it.
              ["CMO approval", g.stage === "Delivered" ? "green" : "gold", g.approver]].map(([role, tone, person], i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-line4 last:border-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: tone === "green" ? "#4E7A4E" : tone === "gold" ? "#C68A1E" : "#C0B8AD" }}>{i + 1}</div>
                  <div className="flex-1"><div className="text-[13px] font-bold">{role as string}</div><div className="text-[11.5px] text-faint">{person as string}</div></div>
                  <StatusBadge tone={tone as "green" | "gold" | "neutral"}>{tone === "green" ? "Done" : tone === "gold" ? "Pending" : "—"}</StatusBadge>
                </div>
              ))}
            </div>
          )}

          {tab === "delivery" && (
            <div className="flex flex-col gap-2">
              {canDeliver && (
                <button onClick={markDelivered} className="self-start text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[8px] mb-2">
                  Mark Delivered
                </button>
              )}
              {["Final artwork approved", "Correct size exported", "Source file attached", "Final asset link added", "Content Calendar updated", "Campaign status updated", "Delivered date set"].map((label) => {
                const done = g.stage === "Delivered";
                return (
                  <div key={label} className="flex items-center gap-[9px] px-4 py-[10px] rounded-card" style={{ background: "#F7F4EE" }}>
                    <span className="text-[13px]">{done ? "✅" : "⬜"}</span>
                    <span className="text-[12.5px] font-medium" style={{ color: done ? "#4E7A4E" : "#9A9387" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEL_TONE: Record<string, "neutral" | "gold" | "green" | "red"> = {
  "Not submitted": "neutral", "Waiting review": "gold", Revision: "red", Approved: "green",
};

// Deliverable-level board: one row per Platform × Asset Size from the content
// brief. The graphic team pastes a link + source per row and submits it; the
// requester approves or sends it back — each row moves independently.
/** The brief fields a requester may fill in, before Creative accepts.
 *
 *  Only the eight in REQUESTER_EDITABLE_BRIEF_FIELDS. platform/size are absent
 *  on purpose: the deliverable rows Creative submits against are built from
 *  them, so changing one later reshapes work already under way.
 *
 *  Saving sends only what actually changed, through the graphic_brief_patch
 *  RPC. The whole-blob write that updateGraphic does would let whoever saves
 *  second wipe the other's edits with no error at all — fine when one person
 *  edited a request at a time, not fine now that two sides can. */
const BRIEF_FIELDS: { key: RequesterBriefField; label: string; placeholder: string; area?: boolean }[] = [
  // ONE link box. Three of them sat here (brief / reference / Drive) and nobody
  // could say which one the designer would open, so a link went in one and the
  // Brief tab reported "ยังไม่มี link" from another.
  { key: "briefLink", label: "ลิงก์บรีฟ (Drive / Slides)", placeholder: "https://… บรีฟหลัก ไฟล์ดิบ หรือ reference — ใส่ที่เดียวพอ" },
  { key: "objective", label: "Objective", placeholder: "งานนี้ทำไปเพื่ออะไร", area: true },
  { key: "keyMessage", label: "Key message", placeholder: "สารหลักที่ต้องสื่อ", area: true },
  { key: "moodDirection", label: "CI / mood direction", placeholder: "โทน อารมณ์ ทิศทางภาพ", area: true },
  { key: "captionCopy", label: "Caption / copy", placeholder: "แคปชั่นหรือข้อความที่ต้องใส่", area: true },
  { key: "extraDetails", label: "Additional details", placeholder: "อย่างอื่นที่ Creative ควรรู้", area: true },
];

function BriefEditor({ g, onSaved, onCancel }: {
  g: Graphic; onSaved: (g: Graphic) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(BRIEF_FIELDS.map((f) => [f.key, g[f.key] ?? ""])));
  const [saving, setSaving] = useState(false);

  const patch = pickBriefPatch(draft as Partial<Record<RequesterBriefField, string>>, g);
  const changed = Object.keys(patch).length;

  const save = async () => {
    if (!changed) { onCancel(); return; }
    setSaving(true);
    try {
      const next = await patchGraphicBrief(g, patch);
      toastSuccess(`บันทึกบรีฟแล้ว · แก้ ${changed} ช่อง`);
      onSaved(next);
    } catch (error) {
      // Includes the two server-side refusals worth reading in full: Creative
      // accepted while this form was open, and the migration is not applied.
      toastError(`บันทึกบรีฟไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setSaving(false); }
  };

  const field = "w-full text-[12.5px] px-[10px] py-[7px] rounded-[9px] border border-line2 bg-white outline-none";
  return (
    <div className="flex flex-col gap-[10px]">
      {BRIEF_FIELDS.map((f) => (
        <div key={f.key}>
          <label className="block text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]" htmlFor={`brief-${f.key}`}>
            {f.label}
          </label>
          {f.area ? (
            <textarea id={`brief-${f.key}`} rows={2} value={draft[f.key] ?? ""} placeholder={f.placeholder}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} className={`${field} resize-y`} />
          ) : (
            <input id={`brief-${f.key}`} type="url" value={draft[f.key] ?? ""} placeholder={f.placeholder}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} className={field} />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving || !changed}
          className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-4 py-[7px] disabled:opacity-40">
          {saving ? "กำลังบันทึก…" : changed ? `บันทึก (${changed})` : "ยังไม่มีการแก้"}
        </button>
        <button onClick={onCancel} disabled={saving} className="text-[12px] font-bold text-muted px-3 py-[7px]">ยกเลิก</button>
        <span className="text-[10.5px] text-faint ml-auto">บันทึกเฉพาะช่องที่แก้ · ไม่ทับงานคนอื่น</span>
      </div>
    </div>
  );
}

function DeliverablesEditor({ g, me, role, isRequester, onUpdate }: {
  g: Graphic; me: string; role: string; isRequester: boolean; onUpdate?: (g: Graphic) => void;
}) {
  // Sign-off is now two checks, asked per lens inside each row — see
  // canGiveLensVerdict. Everyone else sees the artwork and who it waits on.
  // Production is on hold while an urgent brief is unresolved (or refused).
  const rushHold = rushBlocksProduction(g.rushStatus);
  // …and while the steps IN FRONT of the artwork are outstanding: a reel with
  // no signed-off storyboard, or a shoot whose footage has not arrived. The
  // designer was previously the one who looked late for work that had never
  // been handed to them.
  const preSteps = productionBlockers(g);
  const preHold = preSteps.length > 0;
  const [dels, setDels] = useState<GraphicDeliverable[]>(() =>
    g.deliverables?.length ? g.deliverables.map((d) => ({ ...d })) : deriveDeliverables(g));
  const [revising, setRevising] = useState<{ i: number; lens: ReviewLens } | null>(null);
  const [reason, setReason] = useState("");
  const prog = deliverableProgress({ ...g, deliverables: dels });

  const persist = (next: GraphicDeliverable[], event?: NonNullable<Graphic["history"]>[number]) => {
    setDels(next);
    persistGraphic({ ...g, deliverables: next, history: event ? [...(g.history ?? []), event] : g.history });
  };
  const persistGraphic = (base: Graphic) => {
    const ng: Graphic = { ...base };
    const ready = deliverableProgress(ng).ready;
    ng.stage = stageFromDeliverables(ng);
    ng.blocker = ready ? null : g.blocker;
    ng.nextAction = ready ? "Ready to deploy — attached to Content Calendar" : g.nextAction;
    updateGraphic(ng)
      .then(() => onUpdate?.(ng))
      .catch((error) => toastError(`บันทึกงาน Graphic ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    // Fully approved → push approved asset links onto the linked content post.
    if (ready) {
      syncApprovedAssetsToContent(ng).catch((error) => toastError(`อนุมัติครบแล้ว แต่ sync asset เข้า Content Calendar ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      notify("approved", `✅ งานกราฟฟิกอนุมัติครบทุกชิ้น: ${g.title}`, "แนบ asset เข้า Content Calendar ให้แล้ว — พร้อม publish", "/content");
    }
  };
  const patch = (i: number, p: Partial<GraphicDeliverable>) => setDels((ds) => ds.map((d, j) => j === i ? { ...d, ...p } : d));
  const submit = (i: number) => {
    const d = dels[i];
    if (!d.assetLink.trim()) return;
    const at = new Date().toISOString();
    persist(
      dels.map((x, j) => j === i ? { ...x, status: "Waiting review", version: x.version + 1, submittedBy: me, submittedAt: at } : x),
      { type: "submitted", at, by: me, deliverableKey: `${d.platform}::${d.size}` },
    );
    notify("feedback", `🎨 ส่งงานกราฟฟิกรอรีวิว: ${g.title}`, `${d.platform} · ${d.size} · โดย ${me} → รอ ${g.requester} รีวิว`, `/graphic?${GRAPHIC_OPEN_PARAM}=${g.id}`);
  };
  /** One lens's verdict. The rule — both checks in, by two different people,
   *  before anything is Approved — lives in applyLensVerdict so this drawer and
   *  the Agency Portal cannot answer it differently. */
  const giveVerdict = (i: number, lens: ReviewLens, verdict: "pass" | "revise", note?: string) => {
    const before = dels[i];
    const ng = applyLensVerdict({ ...g, deliverables: dels }, i, lens, verdict, me, note);
    if (!ng) return;
    const after = ng.deliverables![i];
    setDels(ng.deliverables!);
    persistGraphic(ng);
    setReason(""); setRevising(null);

    // Told only when the round actually ends, not on each verdict: half a
    // review is not news the designer can act on, and pinging them twice per
    // piece is how people start ignoring the channel.
    if (after.status === "Revision" && before.status !== "Revision") {
      // review is cleared once the round settles, so the notes are read back
      // out of feedback — every entry stamped in this round, both lenses.
      const lastAt = after.feedback.at(-1)?.at;
      const said = after.feedback.filter((f) => f.at === lastAt).map((f) => `[${LENS_META[f.lens ?? "info"].short}] ${f.reason}`).join(" · ");
      if (g.designer && g.designer !== "Unassigned") {
        createRevisionTask({
          module: "Graphic", title: `แก้งานกราฟฟิก — ${g.title} (${before.platform})`, assignee: g.designer,
          brand: brandName(g.b), campaign: g.campaign, reason: said, by: me, relatedGraphicId: String(g.id),
        }).catch((error) => toastError(`สร้าง task แก้ Graphic ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      }
      notify("rejected", `✏️ งานกราฟฟิกถูกส่งกลับแก้: ${g.title}`, `${before.platform} — ${said} · ถึง ${g.designer} · โดย ${me}`, "/my-tasks");
    }
  };

  const inp = "w-full text-[12.5px] px-[10px] py-[8px] rounded-[8px] border border-line2 bg-ivory outline-none";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-bold text-muted">Deliverables · {dels.length} asset · <span className="text-accent">{artworkUnits({ ...g, deliverables: dels })} artwork</span></div>
        <StatusBadge tone={prog.ready ? "green" : "gold"}>{prog.ready ? "Ready to deploy" : `${prog.approved}/${prog.total} approved`}</StatusBadge>
      </div>
      <div className="text-[10.5px] text-faint -mt-1">
        นับ artwork อัตโนมัติจากไซซ์ที่เลือกตอน request: ไซซ์เดียวกันหลาย platform = ชิ้นเดียว (ไฟล์มาสเตอร์เดียว) · คนละไซซ์ = คนละชิ้น
      </div>

      {/* Asking for permission means nothing if the work can start while the
          answer is pending — submitting is closed until the rush is decided. */}
      {rushHold && (
        <div className="rounded-[10px] border px-3 py-2 text-[11.5px] font-semibold"
          style={g.rushStatus === "Rejected"
            ? { background: "#FFF5F4", borderColor: "#F5C8C4", color: "#B33A2E" }
            : { background: "#FFF7ED", borderColor: "#F0C89B", color: "#B3641E" }}>
          {g.rushStatus === "Rejected"
            ? "✕ งานเร่งด่วนไม่ได้รับอนุมัติ — ปรับวันส่งงานให้เข้ารอบปกติแล้วส่งบรีฟใหม่ ยังส่งงานไม่ได้"
            : "⚡ รอ Creative Leader อนุมัติงานเร่งด่วน — ยังส่งงานเข้ารีวิวไม่ได้"}
        </div>
      )}

      {preHold && (
        <div className="rounded-[10px] border px-3 py-2" style={{ background: "#FFF7ED", borderColor: "#F0C89B" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "#B3641E" }}>⏳ ยังส่ง asset ไม่ได้ — งานขั้นก่อนหน้ายังไม่เสร็จ</div>
          <ul className="mt-1 list-disc pl-5 text-[11.5px]" style={{ color: "#8A5418" }}>
            {preSteps.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {dels.map((d, i) => {
        const editable = d.status === "Not submitted" || d.status === "Revision";
        const inReview = d.status === "Waiting review";
        const prog2 = reviewProgress(d);
        return (
          <div key={i} className="bg-surface border border-line rounded-card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div><span className="text-[13.5px] font-bold">{d.platform}</span> <span className="text-[12px] text-faint">· {d.size}</span></div>
              <div className="flex items-center gap-2">
                {/* เลขชิ้นงานกำหนดอัตโนมัติจากไซซ์ตั้งแต่ตอนสร้าง request — แถวที่
                    เลขเดียวกันคือไฟล์มาสเตอร์เดียวกัน แสดงอย่างเดียว ไม่ให้แก้มือ */}
                {d.artworkNo && (
                  <span className="text-[10.5px] font-bold rounded-pill px-2 py-[2px]" style={{ background: "#F2EEFF", color: "#6C5CE7" }}
                    title="เลขชิ้นงาน — แถวที่เลขเดียวกันนับเป็น artwork ชิ้นเดียว (ไฟล์มาสเตอร์เดียว)">
                    Art {d.artworkNo}
                  </span>
                )}
                {d.version > 0 && <span className="text-[10.5px] font-bold text-faint">v{d.version}</span>}
                <StatusBadge tone={DEL_TONE[d.status] ?? "neutral"}>{d.status}</StatusBadge>
              </div>
            </div>
            {d.refLink && <a href={d.refLink} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Reference brief ↗</a>}

            {editable ? (
              <div className="flex flex-col gap-2 mt-2">
                {d.status === "Revision" && d.feedback.length > 0 && (
                  <div className="text-[12px] rounded-[8px] px-3 py-2" style={{ background: "#FBECEA", color: "#B33A2E" }}>↩ {d.feedback[d.feedback.length - 1].reason}</div>
                )}
                <input value={d.assetLink} onChange={(e) => patch(i, { assetLink: e.target.value })} className={inp} placeholder="Artwork link (Drive / Figma / PNG) *" />
                <input value={d.sourceLink} onChange={(e) => patch(i, { sourceLink: e.target.value })} className={inp} placeholder="Source file link" />
                <button onClick={() => submit(i)} disabled={!d.assetLink.trim() || rushHold || preHold} className="self-start text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#211F1C" }}>{d.status === "Revision" ? "Re-submit for Review" : "Submit for Review"}</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-3 text-[11.5px]">
                  <a href={d.assetLink} target="_blank" rel="noreferrer" className="text-accent font-semibold">Open artwork ↗</a>
                  {d.sourceLink && <a href={d.sourceLink} target="_blank" rel="noreferrer" className="text-accent font-semibold">Source ↗</a>}
                  <span className="text-faint">by {d.submittedBy}</span>
                </div>
                {inReview && (
                  <div className="rounded-[10px] px-3 py-[10px]" style={{ background: "#FBF9F4", border: "1px solid #E5DECF" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-bold tracking-[0.05em] uppercase text-faint">ตรวจ 2 ด้าน</span>
                      <span className="text-[11px] font-bold" style={{ color: prog2.given === 2 ? "#4E7A4E" : "#C68A1E" }}>
                        {prog2.given}/2 ตรวจแล้ว
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {REVIEW_LENSES.map((lens) => {
                        const v = d.review?.[lens];
                        const meta = LENS_META[lens];
                        const ctx = { role, isRequester, me, deliverable: d };
                        const mayAct = canGiveLensVerdict(lens, ctx);
                        const mayPass = canPassLens(lens, ctx);
                        const open = revising?.i === i && revising.lens === lens;
                        return (
                          <div key={lens} className="rounded-[8px] px-[10px] py-[8px]" style={{ background: "#fff", border: "1px solid #ECE6DA" }}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="min-w-0">
                                <span className="text-[12px] font-bold text-ink">{meta.label}</span>
                                <span className="text-[10.5px] text-faint"> · {meta.owner}</span>
                                <div className="text-[10.5px] text-faint">{meta.checks}</div>
                              </div>
                              {v ? (
                                <span className="text-[11px] font-bold flex-shrink-0" style={{ color: v.verdict === "pass" ? "#4E7A4E" : "#C2691E" }}>
                                  {v.verdict === "pass" ? "✓ ผ่าน" : "↩ ให้แก้"} · {v.by}
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#C68A1E" }}>รอตรวจ</span>
                              )}
                            </div>
                            {v?.note && <div className="text-[11.5px] mt-1" style={{ color: "#B33A2E" }}>“{v.note}”</div>}

                            {!v && mayAct && (open ? (
                              <div className="flex flex-col gap-2 mt-2">
                                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus
                                  placeholder={lens === "info" ? "ข้อมูลไหนไม่ถูก… (จำเป็น)" : "CI ตรงไหนต้องแก้… (จำเป็น)"}
                                  className="w-full text-[12.5px] px-[10px] py-[8px] rounded-[8px] border border-line2 bg-ivory outline-none resize-none" />
                                <div className="flex gap-2">
                                  <button onClick={() => giveVerdict(i, lens, "revise", reason)} disabled={!reason.trim()}
                                    className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px] disabled:opacity-40" style={{ background: "#C67A28" }}>ส่งกลับแก้</button>
                                  <button onClick={() => { setRevising(null); setReason(""); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[7px]">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 flex-wrap mt-2">
                                {mayPass && (
                                  <button onClick={() => giveVerdict(i, lens, "pass")}
                                    className="text-[12px] font-bold text-white rounded-[8px] px-3 py-[7px]" style={{ background: "#4E7A4E" }}>✓ ผ่าน</button>
                                )}
                                <button onClick={() => { setRevising({ i, lens }); setReason(""); }}
                                  className="text-[12px] font-bold text-status-orange border-[1.5px] border-line2 rounded-[8px] px-3 py-[7px]">↩ ให้แก้</button>
                                {!mayPass && (
                                  <span className="self-center text-[11px] text-faint">
                                    งานที่คุณส่งเอง — กดผ่านไม่ได้ แต่ตีกลับได้
                                  </span>
                                )}
                              </div>
                            ))}
                            {!v && !mayAct && (
                              <div className="text-[11px] text-faint mt-1">
                                {/* Naming who it is on beats a bare "no permission" — the
                                    point of the row is to show who to chase. */}
                                รอ {lens === "info" ? `${g.requester || "ผู้ขอเปิดงาน"} / Marketing Manager` : "Creative Leader"} ตรวจ
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {prog2.given === 1 && (
                      <div className="text-[10.5px] text-faint mt-2">
                        ชิ้นนี้ยังไม่ขยับจนกว่าจะครบทั้งสองด้าน — ดีไซเนอร์จะได้ลิสต์แก้รวมทีเดียว ไม่ต้อง export สองรอบ
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
