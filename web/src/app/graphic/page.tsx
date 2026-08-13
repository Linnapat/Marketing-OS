"use client";

import { toastError } from "@/lib/toast";
import { workLink } from "@/lib/deepLink";
import Link from "next/link";
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import { BrandFilterValue, BrandId, brandCode, brandColor, brandName, BRANDS, BRAND_ORDER } from "@/lib/brands";
import { FinishedFold } from "@/components/ui/FinishedFold";
import {
  GRAPHICS, STAGE_ORDER, Graphic, stageTone, PRIORITY_TONE, DESIGNER_COLOR,
  graphicKpis, emptyDeliverable, passAllWaiting, REVIEW_LENSES, LENS_META, canPassLens, type ReviewLens,
  DAILY_WORK_CAP, WORK_KIND_LABEL, workKind, countWorkOnDay, artworkUnitsOf, needsStoryboard,
  GRAPHIC_BRIEF_FOR_PARAM,
  GRAPHIC_OPEN_PARAM,
  resolveOpenTarget, isGraphicFinished,
  assignedShoots, withShootMoved, withShooterAssigned, type AssignedShoot,
} from "@/lib/data/graphic";
import { rushBreaches, DEFAULT_BRIEF_CUTOFF_DAY, BRIEF_CUTOFF_SETTING_KEY } from "@/lib/data/briefDeadline";
import { getAppSetting, setAppSetting } from "@/lib/db/appSettings";
import { Combobox } from "@/components/ui/Combobox";
import { assignmentQueue, queueSummary, AGE_META, ASSIGN_STUCK_DAYS } from "@/lib/data/ageing";
import { fetchGraphics, createGraphic, buildGraphic, updateGraphic, syncApprovedAssetsToContent } from "@/lib/db/graphic";
import { fileApprovedAsset } from "@/lib/db/assets";
import { notify } from "@/lib/notify";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { FilterSummary, filterWithReasons, ALL_TIME_FILTER } from "@/components/ui/FilterSummary";
import { SavedViewsBar } from "@/components/ui/SavedViews";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignCode, WorkCode } from "@/components/ui/CampaignCode";
import { useCampaignCodes } from "@/lib/useCampaignCodes";
import { createContent, updateContent, fetchContent } from "@/lib/db/content";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchBrandConfigs, fetchMembers } from "@/lib/db/settings";
import { fetchJsonSetting, saveJsonSetting } from "@/lib/db/settings";
import { appendBriefItem } from "@/lib/db/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { ContentItem } from "@/lib/data/content";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { emptyContentItem, BriefContentItem, CampaignBrief, CONTENT_PLATFORMS, graphicDueRangeImpossible, minGraphicDueDate, todayIso, contentBriefLink } from "@/lib/data/brief";
import { OwnerSelect, memberTeam } from "@/components/ui/OwnerSelect";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { useAuth } from "@/lib/auth";
import { canApproveRushBrief, canSendGraphicBrief, worksOwnQueueOnly } from "@/lib/roleGates";
import { useBrandVisibility } from "@/lib/brandVisibility";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelDate(iso: string): string { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : ""; }


type GraphicView = "board" | "list" | "campaign" | "shoot";
interface GraphicSavedView { view: GraphicView; brand: BrandFilterValue; designer: string; date: DateFilter }

/** useSearchParams (for ?briefFor=) opts the tree into client rendering, which
 *  Next requires a Suspense boundary around. */
export default function GraphicPage() {
  return (
    <Suspense fallback={<div className="px-5 py-10 text-[13px] text-faint">Loading…</div>}>
      <GraphicPageInner />
    </Suspense>
  );
}

function GraphicPageInner() {
  const router = useRouter();
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [view, setView] = useState<GraphicView>("campaign");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [designer, setDesigner] = useState<string>("all");
  const [drawer, setDrawer] = useState<{ g: Graphic; tab: "overview" | "feedback" } | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  // Monthly brief cutoff — read by everyone, moved by the people who also
  // clear the rush briefs it creates (Creative Leader, CMO). Read from auth,
  // not the "viewing as" switcher, so the gate cannot be flipped from the rail.
  const { role: authRole, member: authMember, user: authUser } = useAuth();
  const canEditCutoff = canApproveRushBrief(authRole);
  // Read from auth, not the "viewing as" switcher, for the same reason as the
  // cutoff: a gate that the rail can flip is not a gate.
  const canBrief = canSendGraphicBrief(authRole);
  const ownQueueOnly = worksOwnQueueOnly(authRole);
  const myName = (authMember?.name || authUser?.email?.split("@")[0] || "").trim().toLowerCase();
  const [cutoffDay, setCutoffDay] = useState(DEFAULT_BRIEF_CUTOFF_DAY);
  const [cutoffDirty, setCutoffDirty] = useState(false);
  const [cutoffBusy, setCutoffBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    getAppSetting(BRIEF_CUTOFF_SETTING_KEY)
      .then((v) => { if (alive && v !== null && v !== "") setCutoffDay(Number(v) || 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const saveCutoff = async () => {
    setCutoffBusy(true);
    try {
      await setAppSetting(BRIEF_CUTOFF_SETTING_KEY, String(cutoffDay));
      setCutoffDirty(false);
    } catch (error) {
      toastError(`บันทึกเดดไลน์ส่งบรีฟไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setCutoffBusy(false); }
  };
  // /graphic?briefFor=<post id> — the hand-off from Content Plan's "โพสต์นี้
  // ต้องใช้งานกราฟฟิกใหม่". Resolved to the real post before the form opens so
  // it can prefill from it; a stale id opens the form unlinked rather than
  // silently pretending the link worked.
  const searchParams = useSearchParams();
  const briefForId = searchParams.get(GRAPHIC_BRIEF_FOR_PARAM);
  const [briefForPost, setBriefForPost] = useState<ContentItem | null>(null);
  useEffect(() => {
    // ?briefFor= is the second way into this form (Content Plan links here), so
    // it needs the same gate — otherwise hiding the button is decoration.
    if (!briefForId || !canBrief) return;
    let alive = true;
    fetchContent()
      .then((posts) => {
        if (!alive) return;
        const found = posts.find((p) => p.id === briefForId) ?? null;
        if (!found) toastError("ไม่พบโพสต์ที่ขอกราฟฟิก — เปิดฟอร์มให้แบบยังไม่ผูกโพสต์");
        setBriefForPost(found);
        setReqOpen(true);
      })
      .catch(() => { if (alive) setReqOpen(true); });
    return () => { alive = false; };
  }, [briefForId, canBrief]);
  // Drop the param on close so reopening the form by hand starts clean.
  const closeRequestModal = () => {
    setReqOpen(false);
    setBriefForPost(null);
    if (briefForId) router.replace("/graphic");
  };
  // /graphic?open=<request id> — arriving from Content Plan's "ผูกกับ Graphic
  // Request #N ↗". Opened once, after the requests have loaded, then the param
  // is dropped so closing the drawer does not reopen it on the next render.
  const openId = searchParams.get(GRAPHIC_OPEN_PARAM);
  const openedRef = useRef<string | null>(null);
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [graphics, setGraphics] = useState<Graphic[]>(GRAPHICS);
  // Whether fetchGraphics has come back. Needed because the state above starts
  // as the mock seed, so "graphics is non-empty" says nothing about whether the
  // real list has arrived — see the ?open= effect below.
  const [graphicsLoaded, setGraphicsLoaded] = useState(false);
  /** Swap one request in local state. The caller persists — this only keeps the
   *  board and the shoot sheet showing the same thing in the same tick. */
  const patchGraphicRow = (ng: Graphic) => setGraphics((gs) => gs.map((x) => (x.id === ng.id ? ng : x)));
  // Work with nobody's name on it. Not a status — an owner problem: somebody
  // has to hand it out, and until they do it ages silently. 43 of 46 live
  // requests sat here, 28 of them a week or more.
  const [queueOpen, setQueueOpen] = useState(false);
  const assignQueue = useMemo(
    () => assignmentQueue(
      graphics.filter((g) => g.stage !== "Delivered" && g.stage !== "Approved"),
      (g) => g.designer,
      new Date().toISOString().slice(0, 10),
    ),
    [graphics],
  );
  const queueStats = useMemo(() => queueSummary(assignQueue), [assignQueue]);

  // The Designer filter lists the people who can actually hold a request: the
  // active Creative-team members (in-house designers, video editors, and any
  // external studio), read from the Team Member master — the same source the
  // drawer's assign control uses. It used to be a hardcoded ["Boss","Aom","New"]
  // left over from the mock, so filtering by a real designer was impossible and
  // every option found nothing.
  const [designerOpts, setDesignerOpts] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchGraphics()
      .then((g) => { if (alive) { setGraphics(g); setGraphicsLoaded(true); } })
      .catch(() => { if (alive) setGraphicsLoaded(true); });
    fetchMembers().then((ms) => {
      if (!alive) return;
      setDesignerOpts(
        ms.filter((m) => (m.status || "").toLowerCase() === "active" && memberTeam(m.role || "") === "Creative")
          .map((m) => m.name)
          .sort(),
      );
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Open the requested drawer once the real list is in. The decision itself is
  // resolveOpenTarget (pure, unit-tested) — the timing is the whole bug here,
  // so it lives somewhere it can be replayed in order rather than inline.
  useEffect(() => {
    if (!openId) { openedRef.current = null; return; }
    const { action, graphic } = resolveOpenTarget(openId, graphics, graphicsLoaded, openedRef.current);
    if (action === "idle" || action === "wait") return;
    openedRef.current = openId;
    if (action === "open" && graphic) setDrawer({ g: graphic, tab: "overview" });
    else toastError(`ไม่พบใบงาน #${openId} — อาจถูกลบไปแล้ว หรืออยู่ในแบรนด์ที่คุณไม่มีสิทธิ์เห็น`);
    router.replace("/graphic");
  }, [openId, graphics, graphicsLoaded, router]);

  useEffect(() => {
    const next = brandVisibility.normalize(brand);
    if (next !== brand) setBrand(next);
  }, [brand, brandVisibility]);

  // Creating a graphic request now goes through the shared Content Plan template:
  // it spawns the graphic (with per-asset deliverables), a real content post, and
  // writes the item back into the campaign's Content Plan — one source of truth.
  const addGraphic = async (g: Graphic, post: ContentItem | null, briefItem: BriefContentItem | null, campaign: string, linkedPost: ContentItem | null) => {
    try {
      // Post first: the artwork's job number nests under its post's, so the post
      // has to exist (and be numbered) before the request asks for a number.
      if (post) await createContent(post);
      await createGraphic(g);
      // Linking to a post that already exists: stamp the back-reference and
      // flip it off "No Asset", so the Content Plan shows work is on the way.
      if (linkedPost) {
        await updateContent({ ...linkedPost, graphicRequestId: String(g.id), assetStatus: "Waiting Design" });
      }
      if (briefItem && campaign && campaign !== "—") await appendBriefItem(campaign, briefItem);
      setGraphics((gs) => [g, ...gs]);
      setReqOpen(false);
    } catch (error) {
      toastError(`บันทึก Graphic Request ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  };

  // One-click approve from any view — same effects as approving each
  // deliverable in the drawer (history, stage, asset sync, notify).
  const { member, user, role } = useAuth();
  const me = member?.name || user?.email?.split("@")[0] || "Approver";
  const quickApprove = (g: Graphic, lens: ReviewLens) => {
    const requesterKey = (g.requester || "").trim().toLowerCase();
    const isRequester = !!requesterKey &&
      [member?.name, member?.email, user?.email].some((v) => (v ?? "").trim().toLowerCase() === requesterKey);
    const ng = passAllWaiting(g, me, lens, { role, isRequester });
    // Null here also covers "every waiting piece is one you submitted yourself",
    // which would otherwise look like a dead button.
    if (!ng) {
      if (hasWaitingReview(g)) toastError("กดผ่านงานที่คุณส่งเองไม่ได้ — ต้องให้คนอื่นตรวจ");
      return;
    }
    setGraphics((gs) => gs.map((x) => (x.id === ng.id ? ng : x)));
    updateGraphic(ng)
      .then(() => {
        if (ng.stage === "Approved") {
          syncApprovedAssetsToContent(ng).catch((error) => toastError(`อนุมัติแล้ว แต่ sync asset เข้า Content ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
          void fileApprovedAsset(ng);
          notify("approved", `✅ งานกราฟฟิกอนุมัติครบทุกชิ้น: ${ng.title}`, // The message is about the asset landing on its post, so open that post
          // when the request is linked to one; the request's own drawer otherwise.
          `โดย ${me} — แนบ asset เข้า Content Calendar ให้แล้ว`,
            ng.contentPostId ? workLink.post(ng.contentPostId) : workLink.graphic(ng.id),
            { team: workKind(ng.type, ng.requiredVideo).startsWith("vdo") ? "vdo" : "graphic" });
        }
      })
      .catch((error) => toastError(`Approve ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };

  // "Own" scope: your jobs, plus whatever nobody has picked up yet. The
  // unclaimed pool has to stay — รับงาน is how this role gets work at all.
  //
  // Fails CLOSED. This shipped as `!myName → show everything`, which is the
  // wrong way round for a scope that now covers an outside studio: the name
  // resolves a beat after the session does, so the whole board — every brand,
  // every supplier — flashed up before the filter engaged, and an account with
  // no member row would have kept it. Unknown identity sees nothing.
  const inMyQueue = (g: Graphic) => {
    if (!ownQueueOnly) return true;
    if (!myName) return false;
    const holder = (g.designer ?? "").trim().toLowerCase();
    const sb = (g.storyboardOwner ?? "").trim().toLowerCase();
    return holder === myName || sb === myName || !holder || holder === "unassigned";
  };
  // Outside the counted filters: brand scope and the own-queue rule are both
  // fixed by the viewer's role, and no button on this page can undo either — a
  // "ล้างตัวกรอง" that promised to bring those rows back would be lying.
  const outcome = filterWithReasons(
    graphics.filter((g) => brandVisibility.visibleBrands.includes(g.b) && inMyQueue(g)),
    [
      { label: "นอกช่วงเวลา", pass: (g) => inDateFilter(date, g.due) },
      { label: "คนละแบรนด์", pass: (g) => brand === "all" || g.b === brand },
      { label: "คนละดีไซเนอร์", pass: (g) => designer === "all" || g.designer === designer },
    ],
  );
  const items = outcome.rows;
  const clearFilters = () => { setDate({ ...ALL_TIME_FILTER }); setBrand("all"); setDesigner("all"); };
  const kpi = graphicKpis(items);

  const KPIS: { label: string; value: number; tone?: string; dark?: boolean }[] = [
    { label: "Total", value: kpi.total },
    { label: "In Progress", value: kpi.inProgress },
    { label: "Waiting Feedback", value: kpi.waiting, tone: "gold" },
    { label: "Revisions", value: kpi.revisions, tone: "orange" },
    { label: "Approved", value: kpi.approvedCount, tone: "green" },
    { label: "Delivered", value: kpi.deliveredCount, tone: kpi.deliveredCount ? "green" : undefined },
    { label: "Revision Count", value: kpi.revisionRequests, tone: kpi.revisionRequests ? "orange" : undefined },
    { label: "Late Submit", value: kpi.lateSubmissions, tone: kpi.lateSubmissions ? "red" : undefined },
    { label: "Open Feedback", value: kpi.feedback, tone: kpi.feedback ? "red" : undefined, dark: true },
  ];

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="GRAPHIC REQUEST"
        title="Graphic Request"
        description="Brief, assign, review, approve, and deliver every creative request in one workspace."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={
            <div className="flex items-center gap-2">
              <Link href="/graphic/artwork" className="text-[12.5px] font-semibold text-muted border border-line2 rounded-[12px] px-4 py-[10px] bg-surface">
                📊 Artwork Count
              </Link>
              {canBrief && (
                <button onClick={() => setReqOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Send Brief</button>
              )}
            </div>
          }
        >
          {/* Filters, period and view toggle share one wrapping row. Three
              stacked rows plus the summary card below were pushing the first
              request past 70% of the screen, and the caps labels were most of
              the height — a select already reading "All Brands" says "Brand". */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={brand} onChange={(e) => setBrand(e.target.value as BrandFilterValue)} style={SELECT_STYLE}>
              <option value="all">{brandVisibility.allowAll ? "All Brands" : "ทุกแบรนด์ที่ดูแล"}</option>
              {brandOptions.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
            </select>
            <select value={designer} onChange={(e) => setDesigner(e.target.value)} style={SELECT_STYLE} aria-label="Designer">
              <option value="all">ดีไซเนอร์ทุกคน</option>
              {designerOpts.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="Unassigned">Unassigned</option>
            </select>
            <DateFilterBar value={date} onChange={setDate} />
            {/* The brief cutoff lives here, not in Settings: Creative
                Leader owns the queue's capacity but has no Settings access
                at all (Permissions matrix: Settings = none), so putting it
                there would have left the control reachable by nobody but
                the CMO. Everyone sees the date — it is the deadline they
                are working to — and only the people who clear rush briefs
                can move it. Kept visually apart from the filters beside it:
                it changes the queue for everyone, it does not filter a view. */}
            <label className="flex items-center gap-[6px] rounded-[11px] border border-line2 bg-ivory px-2.5 py-[5px]"
              title="งานที่ส่งมอบเดือนถัดไป ต้องบรีฟเข้ามาภายในวันที่นี้ของเดือนก่อนหน้า">
              <span className="text-[11px] font-bold text-faint">ปิดรับบรีฟ</span>
              {canEditCutoff ? (
                <>
                  <input
                    type="number" min={0} max={28} value={cutoffDay}
                    onChange={(e) => { setCutoffDay(Math.max(0, Math.min(28, Number(e.target.value) || 0))); setCutoffDirty(true); }}
                    className="w-[46px] text-[12px] px-[7px] py-[3px] rounded-[8px] border border-line2 bg-white outline-none"
                  />
                  <span className="text-[11px] text-faint">ของทุกเดือน</span>
                  {cutoffDirty && (
                    <button onClick={saveCutoff} disabled={cutoffBusy}
                      className="text-[11px] font-bold text-white bg-panel rounded-[8px] px-[9px] py-[4px] disabled:opacity-40">
                      {cutoffBusy ? "…" : "Save"}
                    </button>
                  )}
                </>
              ) : (
                <span className="text-[11.5px] font-semibold text-muted">
                  {cutoffDay === 0 ? "ไม่กำหนด" : `วันที่ ${cutoffDay} ของทุกเดือน`}
                </span>
              )}
            </label>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <span className="text-[11.5px] font-semibold text-faint">{items.length} requests in view</span>
              <SavedViewsBar<GraphicSavedView>
                pageKey="graphic"
                current={{ view, brand, designer, date }}
                onApply={(v) => { setView(v.view); setBrand(v.brand); setDesigner(v.designer); setDate(v.date); }}
              />
              <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }, { value: "campaign", label: "By Campaign" }, { value: "shoot", label: "🎬 Shoot Schedule" }]} />
            </div>
          </div>
        </CampaignCommandBar>

        <FilterSummary outcome={outcome} onClear={clearFilters} noun="ใบงาน" />

        <ModuleSummaryCard
          // Two counts sit 60px apart on this page — this one follows the
          // filters above, the assignment queue below counts every month. Both
          // were unlabelled, so the page appeared to contradict itself.
          title="Graphic Request Summary ✨ · ตามตัวกรองด้านบน"
          titleClassName="text-[#7A5710]"
          style={{
            background: "linear-gradient(180deg, #F4D48D 0%, #E7BE67 100%)",
            border: "1px solid #D5A94D",
            boxShadow: "0 18px 44px rgba(180, 132, 33, 0.20)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {[
              { ...KPIS[0], emoji: "🎨" },
              { ...KPIS[1], emoji: "🛠️" },
              { ...KPIS[2], emoji: "💬" },
              { ...KPIS[3], emoji: "🔁" },
              { ...KPIS[4], emoji: "✅" },
            ].map((k) => (
              <span key={k.label} className="inline-flex items-center gap-2 rounded-pill border px-3 py-[6px] bg-white/55" style={{ borderColor: "#D9B86A" }}>
                <span className="text-[10.5px] uppercase tracking-[0.06em] text-[#8A6930] font-extrabold">{k.emoji} {k.label}</span>
                <span className="text-[15px] leading-none font-extrabold text-[#2F2413]">{k.value}</span>
              </span>
            ))}
            {/* On-plan KPI: % finished on/before due + live overdue count */}
            <span className="inline-flex items-center gap-2 rounded-pill border px-3 py-[6px]" style={{ borderColor: "#CFE4C2", background: "#EEF4EE" }}>
              <span className="text-[10.5px] uppercase tracking-[0.06em] font-extrabold" style={{ color: "#4E7A4E" }}>🎯 On-time</span>
              <span className="text-[15px] leading-none font-extrabold" style={{ color: "#2F4A2F" }}>
                {kpi.onTimeRate != null ? `${kpi.onTimeRate}% (${kpi.onTimeDone}/${kpi.onTimeJudged})` : "—"}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-pill border px-3 py-[6px]" style={{ borderColor: kpi.overdueItems ? "#F5C8C4" : "#D9B86A", background: kpi.overdueItems ? "#FFF5F4" : "rgba(255,255,255,0.55)" }}>
              <span className="text-[10.5px] uppercase tracking-[0.06em] font-extrabold" style={{ color: kpi.overdueItems ? "#B33A2E" : "#8A6930" }}>⏰ Overdue</span>
              <span className="text-[15px] leading-none font-extrabold" style={{ color: kpi.overdueItems ? "#B33A2E" : "#2F2413" }}>{kpi.overdueItems}</span>
            </span>
          </div>
        </ModuleSummaryCard>
      </div>

      {/* The assignment queue. Deliberately loud and above the board: a request
          with no designer is not "in progress", it is waiting on a person, and
          the only way it ever got noticed before was somebody scrolling past it. */}
      {assignQueue.length > 0 && (
        <div className="mt-4 rounded-cardLg border overflow-hidden"
          style={queueStats.stuck > 0
            ? { background: AGE_META.stuck.bg, borderColor: "#F5C8C4" }
            : { background: AGE_META.slow.bg, borderColor: "#F0C89B" }}>
          <button onClick={() => setQueueOpen((o) => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
            <span className="text-[11px] w-3" style={{ color: queueStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>{queueOpen ? "▾" : "▸"}</span>
            <span className="text-[13px] font-extrabold" style={{ color: queueStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>
              🙋 รอมอบหมาย {queueStats.total} งาน
            </span>
            <span className="text-[10.5px] font-semibold px-[7px] py-[1px] rounded-pill bg-white/70"
              style={{ color: queueStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>
              ทุกเดือน · ไม่ตามตัวกรอง
            </span>
            <span className="text-[11.5px] font-semibold" style={{ color: queueStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>
              {queueStats.stuck > 0
                ? `· ${queueStats.stuck} งานรอเกิน ${ASSIGN_STUCK_DAYS} วัน (นานสุด ${queueStats.oldest} วัน)`
                : queueStats.oldest !== null ? `· รอนานสุด ${queueStats.oldest} วัน` : ""}
            </span>
            <span className="ml-auto text-[11px] font-semibold text-muted">Creative Leader มอบหมาย</span>
          </button>
          {queueOpen && (
            <div className="bg-surface border-t" style={{ borderColor: "#EFE7DA" }}>
              {assignQueue.map(({ item, days, level }) => (
                <button key={item.id} onClick={() => setDrawer({ g: item, tab: "overview" })}
                  className="w-full px-4 py-2 border-b border-line4 last:border-0 flex items-center gap-3 text-left hover:bg-ivory/60">
                  <span className="text-[11px] font-bold rounded-pill px-2 py-[2px] whitespace-nowrap"
                    style={{ background: AGE_META[level].bg, color: AGE_META[level].fg }}>
                    {days === null ? "ไม่ทราบ" : `รอ ${days} วัน`}
                  </span>
                  <span className="text-[12.5px] font-semibold truncate min-w-0">{item.title}</span>
                  <span className="ml-auto text-[11px] text-faint whitespace-nowrap">{item.campaign} · {item.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        {view === "board" && <BoardView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} onQuickApprove={quickApprove} />}
        {view === "list" && <ListView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} onQuickApprove={quickApprove} />}
        {view === "campaign" && <CampaignGroupView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} onQuickApprove={quickApprove} />}
        {/* Brand-visible requests, NOT `items`: the call sheet is not filtered by
            the board's designer/date controls — hiding a booked shoot because the
            board is showing August would be a way to miss it. */}
        {view === "shoot" && <ShootCalendar me={me} requests={graphics.filter((g) => brandVisibility.isVisible(g.b))} onPatchRequest={patchGraphicRow} onOpenRequest={(g) => setDrawer({ g, tab: "overview" })} />}
      </div>

      {drawer && (
        <GraphicDrawer
          g={drawer.g}
          initialTab={drawer.tab}
          onClose={() => setDrawer(null)}
          onUpdate={(ng) => {
            setDrawer((d) => (d ? { ...d, g: ng } : d));
            setGraphics((gs) => gs.map((x) => (x.id === ng.id ? ng : x)));
          }}
        />
      )}
      {reqOpen && (
        <RequestModal
          nextId={Math.max(0, ...graphics.map((g) => g.id)) + 1}
          graphics={graphics}
          prefillPost={briefForPost}
          onClose={closeRequestModal}
          onCreate={addGraphic}
        />
      )}
    </>
  );
}

/* ── Shoot Schedule — ตารางถ่ายงานของทีม Creative ─────────────────────────
   Manual shoot events live in one shared JSON setting; Content Plan items of
   type "Photo shoot"/"VDO shooting" appear automatically on their publish date. */
// Shoot Schedule as a Promotion-style editable + printable template. Every
// field is editable by the creative leader; rows are shared via org_settings.
// Columns mirror the team's shoot Google Sheet: Date · Time · Brand · Content
// · Location · Menu · Cast (no "request date" — dropped per the sheet).
// `brand` holds a BrandId, `cast` a comma-separated list of member names.
interface ShootRow { id: string; date: string; time: string; brand: BrandId; content: string; location: string; menu: string; cast: string; note?: string; source?: "manual" | "content" | "request" }

// Rows saved before brand became data-driven stored the display NAME ("Omakase
// Don"); match it back to its id so brand-scoped filtering works on old rows. An
// unrecognised value is kept verbatim rather than dropped.
const toBrandId = (v: string): BrandId => {
  if (!v || BRANDS[v]) return v;
  return BRAND_ORDER.find((id) => brandName(id).toLowerCase() === v.toLowerCase()) ?? v;
};

// Short tag so the Content dropdown reads at a glance instead of a wall of
// similar-sounding titles — brand code + 2-digit publish month + work type,
// e.g. "OMD09_vdo" for a September Omakase video piece. Shown as the option's
// label only; the title itself (what actually gets stored) is untouched.
function contentDatalistTag(b: BrandId, ci: BriefContentItem): string {
  const mm = (ci.publishDate || "").slice(5, 7);
  const kind = ci.requiredVideo ? "vdo" : "photo";
  return mm ? `${brandCode(b)}${mm}_${kind}` : `${brandCode(b)}_${kind}`;
}

// Back-compat: earlier rows used campaign/shootDate/owner/requestDate. Map the
// old fields onto the new shape so existing shoots aren't lost.
type LegacyShootRow = Partial<ShootRow> & { campaign?: string; shootDate?: string; owner?: string; requestDate?: string };
const normalizeShoot = (r: LegacyShootRow): ShootRow => ({
  id: r.id || `shoot-${Date.now()}`,
  date: r.date ?? r.shootDate ?? "",
  time: r.time ?? "",
  brand: toBrandId(r.brand ?? ""),
  content: r.content ?? r.campaign ?? "",
  location: r.location ?? "",
  menu: r.menu ?? "",
  cast: r.cast ?? r.owner ?? "",
  note: r.note ?? "",
  source: r.source ?? "manual",
});

const castList = (v: string): string[] => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Cast picker — tick several people per shoot; stored as "A, B, C".
 *  The panel is portalled and fixed-positioned: the shoot table scrolls inside
 *  `overflow-x-auto`, which would clip a normally-positioned dropdown. */
function CastPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const [customName, setCustomName] = useState("");
  const picked = castList(value);
  // Someone typed in before, or a member who has since left — keep them tickable.
  const all = Array.from(new Set([...options, ...picked]));
  const toggle = (name: string) =>
    onChange((picked.includes(name) ? picked.filter((p) => p !== name) : [...picked, name]).join(", "));
  // For cast who aren't in the team member list (models, guests) — typed once,
  // then tickable like anyone else since `all` always unions in `picked`.
  const addCustom = () => {
    const name = customName.trim();
    if (!name || picked.includes(name)) { setCustomName(""); return; }
    onChange([...picked, name].join(", "));
    setCustomName("");
  };

  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (at ? setAt(null) : open())}
        className={`cast-btn ${cellBase} text-left truncate ${picked.length ? "text-ink" : "text-faint"}`}
      >
        {picked.length ? picked.join(", ") : "เลือกทีม / cast"}
      </button>
      {at && createPortal(
        <>
          <div className="fixed inset-0 z-[60] no-print" onClick={() => setAt(null)} />
          <div
            className="fixed z-[61] bg-white border border-line2 rounded-[9px] shadow-soft no-print flex flex-col"
            style={{ top: at.top, left: at.left, minWidth: Math.max(at.width, 170) }}
          >
            <div className="max-h-[200px] overflow-y-auto p-1">
              {all.length === 0 && <div className="px-2 py-2 text-[11.5px] text-faint">ไม่มีรายชื่อทีม</div>}
              {all.map((name) => (
                <label key={name} className="flex items-center gap-2 px-2 py-[5px] rounded-[6px] text-[12px] text-muted hover:bg-ivory cursor-pointer">
                  <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)} className="accent-accent" />
                  <span className="truncate">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-1 p-1 border-t border-line3">
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                placeholder="พิมพ์ชื่อแคส…"
                className="flex-1 min-w-0 text-[12px] px-2 py-[5px] rounded-[6px] border border-line2 bg-ivory outline-none"
              />
              <button type="button" onClick={addCustom} className="text-[11px] font-bold px-2 py-[5px] rounded-[6px] border border-[#DDD1FF] text-[#6C5CE7] bg-[#F7F2FF] flex-shrink-0">
                + เพิ่ม
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

const cellBase = "w-full text-[12px] px-2 py-[5px] rounded-[7px] border border-line2 bg-white outline-none";

/** Brand colour at low opacity — row tints and chips. */
const tint = (hex: string, alpha: number): string => {
  const n = parseInt((hex || "").replace("#", ""), 16);
  if (Number.isNaN(n)) return `rgba(154, 147, 135, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const fmtDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const fmtTime = (t: string) => (t ? t.split("-").filter(Boolean).join(" – ") : "—");

/** Brand chip — the colour cue that carries through the table and the print sheet. */
function BrandChip({ brand }: { brand: BrandId }) {
  if (!brand) return <span className="text-[11.5px] text-faint">—</span>;
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full px-[7px] py-[2px] text-[11px] font-bold whitespace-nowrap"
      style={{ background: tint(brandColor(brand), 0.14), color: brandColor(brand) }}
    >
      <BrandDot brand={brand} size={6} />
      {brandName(brand)}
    </span>
  );
}

/** Print preview — the shoot sheet exactly as it will print (A4 landscape).
 *  `window.print()` alone gave no in-app preview, so the leader could not see
 *  what the crew would get before hitting print. */
function ShootSheetPreview({ rows, brandLabel, printedAt, onClose }: {
  rows: ShootRow[]; brandLabel?: string; printedAt: string; onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const sorted = [...rows].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const sh = "text-left text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-white px-[8px] py-[6px]";
  const sd = "px-[8px] py-[7px] text-[11px] text-ink align-top border-b border-line4";

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/45 overflow-y-auto p-6 flex flex-col items-center">
      <div className="w-full max-w-[1100px] flex items-center justify-between gap-2 mb-3 no-print">
        <div className="text-[13px] font-bold text-white">🖨 ตัวอย่างก่อนปริ้น · A4 แนวนอน</div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="text-[12px] font-bold text-white bg-accent rounded-[9px] px-4 py-[8px]">ปริ้นเลย</button>
          <button onClick={onClose} className="text-[12px] font-bold text-muted bg-white rounded-[9px] px-4 py-[8px]">ปิด</button>
        </div>
      </div>

      <div className="shoot-sheet w-full max-w-[1100px] bg-white rounded-[10px] p-6 shadow-soft">
        <div className="flex items-end justify-between border-b-[2px] border-ink pb-2 mb-3">
          <div>
            {/* The brand goes in the title, not just the filter: a printed
                sheet leaves the screen behind, and a one-brand sheet that does
                not say so reads as "these are all the shoots". */}
            <div className="text-[19px] font-extrabold text-ink">🎬 Shoot Schedule — Creative{brandLabel ? ` · ${brandLabel}` : ""}</div>
            <div className="text-[11px] text-faint">ใบนัดถ่าย · {sorted.length} คิว{brandLabel ? ` · เฉพาะแบรนด์ ${brandLabel}` : ""}</div>
          </div>
          <div className="text-[11px] text-faint">พิมพ์เมื่อ {printedAt}</div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "#17172A" }}>
              <th className={sh}>Date</th><th className={sh}>Time</th><th className={sh}>Brand</th>
              <th className={sh}>Content</th><th className={sh}>Location</th><th className={sh}>Menu</th>
              <th className={sh}>Cast</th><th className={sh}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[11.5px] text-faint">ยังไม่มีคิวถ่าย</td></tr>
            )}
            {sorted.map((r) => (
              <tr key={r.id} style={{ background: r.brand ? tint(brandColor(r.brand), 0.05) : undefined }}>
                <td className={`${sd} font-bold whitespace-nowrap`} style={{ borderLeft: `3px solid ${r.brand ? brandColor(r.brand) : "transparent"}` }}>{fmtDate(r.date)}</td>
                <td className={`${sd} whitespace-nowrap text-muted`}>{fmtTime(r.time)}</td>
                <td className={sd}><BrandChip brand={r.brand} /></td>
                <td className={`${sd} font-semibold`}>{r.content || "—"}</td>
                <td className={sd}>{r.location || "—"}</td>
                <td className={sd}>{r.menu || "—"}</td>
                <td className={sd}>
                  {castList(r.cast).length === 0 ? "—" : (
                    <span className="flex flex-wrap gap-[3px]">
                      {castList(r.cast).map((c) => (
                        <span key={c} className="rounded-full bg-ivory border border-line2 px-[6px] py-[1px] text-[10.5px] font-semibold text-muted">{c}</span>
                      ))}
                    </span>
                  )}
                </td>
                <td className={sd}>{r.note?.trim() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 pt-2 border-t border-line4 text-[10px] text-faint">
          Marketing OS · Graphic Request — ตารางนี้แก้ได้ที่หน้า Graphic Request → Shoot Schedule
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Rows the schedule owns vs rows it only decorates.
 *
 *  A shoot assigned on a request is not this table's data — the request is, and
 *  it moves when the shoot moves. So date / brand / content / cast are read
 *  from the request every time, and only the fields the request has no opinion
 *  about (call time, location, menu) are stored here, under the request's id.
 *  Storing the whole row instead would have frozen a copy that quietly
 *  disagreed with the request the first time anyone moved a shoot day. */
const REQ_ROW_PREFIX = "req-";
const reqRowId = (graphicId: number) => `${REQ_ROW_PREFIX}${graphicId}`;
const isReqRow = (r: { id: string }) => r.id.startsWith(REQ_ROW_PREFIX);

function ShootCalendar({ me, requests, onPatchRequest, onOpenRequest }: {
  me: string; requests: Graphic[]; onPatchRequest: (g: Graphic) => void; onOpenRequest: (g: Graphic) => void;
}) {
  const [rows, setRows] = useState<ShootRow[]>([]);
  const [autoRows, setAutoRows] = useState<ShootRow[]>([]);
  // Derived, not fetched: the page already holds these rows, so moving a
  // shoot date in the drawer moves this row on the next render instead of on
  // the next reload.
  const assigned = useMemo<AssignedShoot[]>(() => assignedShoots(requests), [requests]);
  // Dropdown option sources, both keyed by brand id so a row that picked a brand
  // only offers that brand's branches (Location) and Content Plan items.
  const [branchesByBrand, setBranchesByBrand] = useState<Record<BrandId, string[]>>({});
  const [contentByBrand, setContentByBrand] = useState<Record<BrandId, { title: string; label: string }[]>>({});
  const [castOpts, setCastOpts] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  // One brand's shoots at a time, when asked for. The crew that turns up for a
  // Mainichi day should not be handed four brands' worth of queue to read past
  // — "ขอเพิ่มฟิลเตอร์แบรนด์ก่อนสั่งปริ้นด้วย" (3/8/26). Empty = every brand.
  const [brandFilter, setBrandFilter] = useState<BrandId | "">("");

  useEffect(() => {
    let alive = true;
    fetchJsonSetting<LegacyShootRow[]>("creative_shoots_v2").then((v) => { if (alive && v) setRows(v.map(normalizeShoot)); }).catch(() => {});
    fetchBrandConfigs().then((cfgs) => {
      if (!alive) return;
      setBranchesByBrand(Object.fromEntries(cfgs.map((c) => [c.key, [...c.branchList].sort()])));
    }).catch(() => {});
    fetchMembers().then((ms) => {
      if (!alive) return;
      setCastOpts(ms.filter((m) => (m.status || "").toLowerCase() === "active").map((m) => m.name).sort());
    }).catch(() => {});
    // Photo shoot / VDO shooting items from Content Plan appear as read-only
    // reference rows so the leader can see what the briefs already asked for.
    fetchAllBriefs().then((briefs) => {
      if (!alive) return;
      const all = Object.values(briefs);
      // Every Content Plan item title → the Content dropdown, grouped by brand,
      // tagged with brand/month/type so lookalike titles are tellable apart.
      const byBrand: Record<BrandId, { title: string; label: string }[]> = {};
      for (const b of all) {
        for (const c of b.content ?? []) {
          if (!c.title) continue;
          const list = byBrand[b.b] ?? (byBrand[b.b] = []);
          if (!list.some((o) => o.title === c.title)) list.push({ title: c.title, label: `${contentDatalistTag(b.b, c)} ${c.title}` });
        }
      }
      for (const key of Object.keys(byBrand)) byBrand[key].sort((a, b) => a.title.localeCompare(b.title));
      setContentByBrand(byBrand);
      setAutoRows(all.flatMap((b) =>
        (b.content ?? [])
          .filter((c) => /photo shoot|vdo shooting/i.test(c.type || ""))
          .map((c) => normalizeShoot({
            id: `auto-${b.id}-${c.id}`, content: c.title || c.type, brand: b.b,
            date: (c.publishDate || "").slice(0, 10), menu: "", location: "", cast: "จาก Content Plan", source: "content",
          }))));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Datalists are shared by id, so emit one per brand (plus an unscoped list for
  // rows with no brand yet) and point each row at the list matching its brand.
  const brandKeys = useMemo(
    () => Array.from(new Set([...BRAND_ORDER, ...Object.keys(branchesByBrand), ...Object.keys(contentByBrand)])),
    [branchesByBrand, contentByBrand],
  );
  const allBranches = useMemo(() => Array.from(new Set(Object.values(branchesByBrand).flat())).sort(), [branchesByBrand]);
  const allContent = useMemo(() => {
    const byTitle = new Map<string, { title: string; label: string }>();
    for (const o of Object.values(contentByBrand).flat()) if (!byTitle.has(o.title)) byTitle.set(o.title, o);
    return Array.from(byTitle.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [contentByBrand]);
  const listId = (kind: "content" | "location", brand: BrandId) => `shoot-${kind}-opts-${brand || "all"}`;

  const persist = (next: ShootRow[]) => {
    setRows(next);
    saveJsonSetting("creative_shoots_v2", "Creative shoot schedule", next)
      .catch((error) => toastError(`บันทึกตารางถ่ายงานไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };
  const addRow = () => persist([...rows, { id: `shoot-${Date.now()}`, date: "", time: "", brand: "", content: "", location: "", menu: "", cast: me, note: "", source: "manual" }]);
  /** Editing a request-backed row writes an override, creating it on first
   *  touch — the row exists on screen before it exists in storage. */
  const editRow = (id: string, patch: Partial<ShootRow>) => {
    if (rows.some((r) => r.id === id)) { persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r))); return; }
    const seed = merged.find((r) => r.id === id);
    if (!seed) return;
    persist([...rows, { ...seed, ...patch, source: "request" }]);
  };
  const removeRow = (id: string) => persist(rows.filter((r) => r.id !== id));

  /** Shoot day and shooter are the REQUEST's fields, not this table's — the
   *  sheet is simply where they get juggled. Writing them back rather than
   *  keeping a local copy is what stops the sheet and the request disagreeing
   *  about when a shoot is, which is the disagreement that actually costs a
   *  shoot day. The history note comes with them (withShootMoved). */
  const patchRequest = (graphicId: number, change: (g: Graphic) => Graphic, failMsg: string) => {
    const current = requests.find((g) => g.id === graphicId);
    if (!current) return;
    const next = change(current);
    if (next === current) return;
    onPatchRequest(next);
    updateGraphic(next).catch((error) => toastError(`${failMsg}: ${error?.message || "Unknown error"}`));
  };
  const moveShoot = (graphicId: number, date: string) =>
    patchRequest(graphicId, (g) => withShootMoved(g, date, me), "เลื่อนวันถ่ายไม่สำเร็จ");
  const setShooter = (graphicId: number, name: string) =>
    patchRequest(graphicId, (g) => withShooterAssigned(g, name, me), "บันทึกคนถ่ายไม่สำเร็จ");
  const reqIdOf = (rowId: string) => Number(rowId.slice(REQ_ROW_PREFIX.length));

  // What the table (and the printed sheet) shows: rows typed here, plus one per
  // assigned shoot, ordered by day so it reads as a schedule.
  const manualRows = useMemo(() => rows.filter((r) => !isReqRow(r)), [rows]);
  const overrides = useMemo(() => new Map(rows.filter(isReqRow).map((r) => [r.id, r])), [rows]);
  const merged = useMemo(() => {
    const fromRequests: ShootRow[] = assigned.map((a) => {
      const saved = overrides.get(reqRowId(a.graphicId));
      return {
        id: reqRowId(a.graphicId),
        // From the request, always — a moved shoot moves this row with it.
        date: a.date, brand: a.brand, content: a.content, cast: a.cast,
        // Only the schedule's own columns survive from what was typed here.
        time: saved?.time ?? "", location: saved?.location ?? "", menu: saved?.menu ?? "", note: saved?.note ?? "",
        source: "request" as const,
      };
    });
    return [...fromRequests, ...manualRows].sort((x, y) => (x.date || "9999").localeCompare(y.date || "9999"));
  }, [assigned, overrides, manualRows]);
  const kindOf = useMemo(
    () => new Map(assigned.map((a) => [reqRowId(a.graphicId), a.kind])),
    [assigned],
  );
  // What to read before turning up, per row. A shoot list of eight lines
  // reading "Cocktail Hour" tells a photographer nothing about what to bring.
  const prepOf = useMemo(
    () => new Map(assigned.map((a) => [reqRowId(a.graphicId), { storyboard: a.storyboardLink, brief: a.briefLink }])),
    [assigned],
  );
  // What the table and the printed sheet actually show. Filtering here, not in
  // `merged`, keeps editRow's seed lookup able to find a row the filter hides.
  const visible = useMemo(
    () => (brandFilter ? merged.filter((r) => r.brand === brandFilter) : merged),
    [merged, brandFilter],
  );
  // Only offer brands that have a shoot — a filter listing brands with nothing
  // behind them is a menu of dead ends.
  const brandsWithShoots = useMemo(
    () => BRAND_ORDER.filter((id) => merged.some((r) => r.brand === id)),
    [merged],
  );
  // A brand deleted from Settings, or filtered then emptied, must not strand the
  // sheet on a selection it can no longer offer.
  useEffect(() => {
    if (brandFilter && !brandsWithShoots.includes(brandFilter)) setBrandFilter("");
  }, [brandFilter, brandsWithShoots]);

  const importAuto = (a: ShootRow) => persist([...rows, { ...a, id: `shoot-${Date.now()}`, cast: me, source: "manual" }]);

  // Brand is what scopes Location + Content, so drop values that don't belong to
  // the newly picked brand instead of leaving a wrong branch behind.
  const setBrand = (r: ShootRow, brand: BrandId) => {
    const branches = branchesByBrand[brand] ?? [];
    const contents = contentByBrand[brand] ?? [];
    editRow(r.id, {
      brand,
      location: branches.includes(r.location) ? r.location : "",
      content: contents.some((o) => o.title === r.content) ? r.content : "",
    });
  };

  const cell = `${cellBase} text-ink placeholder:text-faint`;
  const th = "text-left text-[10px] font-extrabold uppercase tracking-[0.05em] text-muted px-[10px] py-2 border-b border-line";
  const printedAt = new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div>
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: #fff !important; }
          /* Print ONLY the preview sheet: hide the whole app, then reveal just
             that subtree and pin it to the top of the page. What you see in the
             preview modal is exactly what comes out of the printer. */
          body * { visibility: hidden !important; }
          .shoot-sheet, .shoot-sheet * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .shoot-sheet {
            position: absolute; left: 0; top: 0; width: 100%;
            margin: 0 !important; padding: 0 !important;
            max-height: none !important; overflow: visible !important;
            border: 0 !important; box-shadow: none !important; border-radius: 0 !important;
          }
          .no-print, .no-print * { display: none !important; }
        }
      `}</style>

      {preview && (
        <ShootSheetPreview
          rows={visible}
          brandLabel={brandFilter ? brandName(brandFilter) : ""}
          printedAt={printedAt}
          onClose={() => setPreview(false)}
        />
      )}

      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 no-print">
          <div className="text-[13px] font-bold text-ink">🎬 Shoot Schedule <span className="text-[10.5px] text-faint font-normal">· ตารางขอถ่ายงาน — Creative Leader แก้ได้ทุกช่อง · ปริ้นเป็นใบนัดถ่ายได้</span></div>
          <div className="flex items-center gap-2">
            {/* Sits next to the print button on purpose: what you filter is
                exactly what prints, so the crew gets their brand's day only. */}
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="text-[12px] font-semibold text-ink border border-line2 rounded-[9px] px-3 py-[7px] bg-white outline-none"
              style={brandFilter ? { color: brandColor(brandFilter) } : undefined}
              aria-label="กรองตามแบรนด์"
            >
              <option value="">ทุกแบรนด์ ({merged.length})</option>
              {brandsWithShoots.map((id) => (
                <option key={id} value={id}>{brandName(id)} ({merged.filter((r) => r.brand === id).length})</option>
              ))}
            </select>
            <button onClick={addRow} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-3 py-[7px]">+ เพิ่มคิวถ่าย</button>
            <button onClick={() => setPreview(true)} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white">🖨 Preview & ปริ้น</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead><tr className="bg-ivory">
              <th className={th}>Date</th><th className={th}>Time</th><th className={th}>Brand</th>
              <th className={th}>Content</th><th className={th}>Location</th><th className={th}>Menu</th>
              <th className={th}>Cast</th><th className={th}>หมายเหตุ</th><th className={`${th} no-print`}></th>
            </tr></thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-[12px] text-faint">
                  {brandFilter
                    ? `ยังไม่มีคิวถ่ายของ ${brandName(brandFilter)} — เลือก "ทุกแบรนด์" เพื่อดูคิวที่เหลือ`
                    : "ยังไม่มีคิวถ่าย — มอบหมายคนถ่าย + วันถ่ายในใบงาน แล้วจะขึ้นที่นี่เอง · หรือกด \"เพิ่มคิวถ่าย\""}
                </td></tr>
              )}
              {visible.map((r) => {
                // A request-backed row is a view of the request, not a copy of
                // it: the columns the request owns are shown, not edited, so
                // the sheet and the request can never say different things
                // about who is shooting what and when. Move the shoot on the
                // request and this row moves with it.
                const fromReq = isReqRow(r);
                return (
                // Tinted by brand — the row reads as "whose shoot this is" at a glance.
                <tr key={r.id} className="border-b border-line4 last:border-0" style={{ background: r.brand ? tint(brandColor(r.brand), 0.05) : undefined }}>
                  <td className="px-[10px] py-[5px]" style={{ borderLeft: `3px solid ${r.brand ? brandColor(r.brand) : "transparent"}` }}>
                    {/* Editable on both kinds of row — this is the sheet where
                        shoot days get moved. A request-backed row writes the
                        new day back to the request instead of keeping it here. */}
                    <input type="date" value={r.date}
                      onChange={(e) => (fromReq ? moveShoot(reqIdOf(r.id), e.target.value) : editRow(r.id, { date: e.target.value }))}
                      className={cell} />
                  </td>
                  <td className="px-[10px] py-[5px]">
                    {/* Two time pickers → stored as "start-end" */}
                    {(() => {
                      const [ts, te] = (r.time || "").split("-");
                      const setTime = (start: string, end: string) => editRow(r.id, { time: end ? `${start}-${end}` : start });
                      return (
                        <span className="flex items-center gap-1">
                          <input type="time" value={ts || ""} onChange={(e) => setTime(e.target.value, te || "")} className={`${cell} min-w-[92px]`} />
                          <span className="text-faint text-[11px]">–</span>
                          <input type="time" value={te || ""} onChange={(e) => setTime(ts || "", e.target.value)} className={`${cell} min-w-[92px]`} />
                        </span>
                      );
                    })()}
                  </td>
                  {/* Wide enough for the full brand name — the select was clipping it to "Om…". */}
                  <td className="px-[10px] py-[5px]">
                    <span className="flex items-center gap-[6px]">
                      {r.brand && <BrandDot brand={r.brand} />}
                      {fromReq ? (
                        <span className="text-[12px] font-semibold min-w-[135px]" style={r.brand ? { color: brandColor(r.brand) } : undefined}>{r.brand ? brandName(r.brand) : "—"}</span>
                      ) : (
                      <select
                        value={r.brand}
                        onChange={(e) => setBrand(r, e.target.value)}
                        className={`${cell} min-w-[135px] font-semibold`}
                        style={r.brand ? { color: brandColor(r.brand) } : undefined}
                      >
                        <option value="">—</option>
                        {BRAND_ORDER.map((id) => <option key={id} value={id}>{brandName(id)}</option>)}
                        {/* A brand since removed from Settings — keep the row readable. */}
                        {r.brand && !BRAND_ORDER.includes(r.brand) && <option value={r.brand}>{brandName(r.brand)}</option>}
                      </select>
                      )}
                    </span>
                  </td>
                  <td className="px-[10px] py-[5px]">
                    {fromReq ? (
                      <span className="flex flex-col gap-[3px] min-w-[200px]">
                        <span className="flex items-center gap-[6px]">
                          <span className="text-[12px] font-semibold text-ink truncate">{r.content}</span>
                          <span className="text-[10px] font-bold rounded-pill px-[7px] py-[2px] flex-shrink-0" style={{ background: "#F2EEFF", color: "#6C5CE7" }}>
                            {WORK_KIND_LABEL[kindOf.get(r.id) ?? "photo_shoot"]}
                          </span>
                        </span>
                        {/* Prep for whoever is shooting. Hidden on the printed
                            sheet — a URL on paper is not a link, it is noise. */}
                        {(() => {
                          const prep = prepOf.get(r.id);
                          if (!prep?.storyboard && !prep?.brief) return null;
                          return (
                            <span className="flex items-center gap-[10px] no-print">
                              {prep.storyboard && (
                                <a href={prep.storyboard} target="_blank" rel="noreferrer" className="text-[10.5px] font-bold text-accent">🎬 storyboard ↗</a>
                              )}
                              {prep.brief && (
                                <a href={prep.brief} target="_blank" rel="noreferrer" className="text-[10.5px] font-bold text-accent">📋 บรีฟงาน ↗</a>
                              )}
                            </span>
                          );
                        })()}
                      </span>
                    ) : (
                      <input value={r.content} onChange={(e) => editRow(r.id, { content: e.target.value })} list={listId("content", r.brand)} placeholder="เลือก/พิมพ์จาก Content Plan" className={`${cell} min-w-[180px]`} />
                    )}
                  </td>
                  <td className="px-[10px] py-[5px]"><input value={r.location} onChange={(e) => editRow(r.id, { location: e.target.value })} list={listId("location", r.brand)} placeholder="เลือกสาขา" className={`${cell} min-w-[130px]`} /></td>
                  <td className="px-[10px] py-[5px]"><input value={r.menu} onChange={(e) => editRow(r.id, { menu: e.target.value })} placeholder="เมนู / งานที่ถ่าย" className={`${cell} min-w-[150px]`} /></td>
                  <td className="px-[10px] py-[5px] min-w-[150px]">
                    <CastPicker value={r.cast} options={castOpts}
                      onChange={(v) => (fromReq ? setShooter(reqIdOf(r.id), v) : editRow(r.id, { cast: v }))} />
                  </td>
                  <td className="px-[10px] py-[5px]">
                    <input value={r.note ?? ""} onChange={(e) => editRow(r.id, { note: e.target.value })}
                      placeholder="เช่น ขอ 2 มุม / เตรียมพร็อพ" className={`${cell} min-w-[160px]`} />
                  </td>
                  <td className="px-[10px] py-[5px] text-right no-print">
                    {fromReq ? (
                      // Not deletable here on purpose: this row exists because a
                      // request says a shoot is happening. Removing it from the
                      // sheet without touching the request would hide a shoot
                      // that is still booked.
                      // Opens the drawer directly rather than through
                      // ?open=<id>: that route latches after the first use
                      // (openedRef), so a link back to the request worked once
                      // per page load and then silently did nothing — which is
                      // no way to build a sheet you click up and down all day.
                      <button onClick={() => { const g = requests.find((x) => x.id === reqIdOf(r.id)); if (g) onOpenRequest(g); }}
                        className="text-[11.5px] font-bold text-accent whitespace-nowrap" title="เปิดใบงานนี้">
                        ใบงาน ↗
                      </button>
                    ) : (
                      <button onClick={() => removeRow(r.id)} className="text-[12px] text-status-red font-bold" aria-label="ลบ">✕</button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {/* Option sources per brand: Content (Content Plan titles) + Location (branches).
              The "all" pair serves rows that haven't picked a brand yet. */}
          <datalist id={listId("content", "")}>{allContent.map((o) => <option key={o.title} value={o.title} label={o.label} />)}</datalist>
          <datalist id={listId("location", "")}>{allBranches.map((o) => <option key={o} value={o} />)}</datalist>
          {brandKeys.map((b) => (
            <Fragment key={b}>
              <datalist id={listId("content", b)}>{(contentByBrand[b] ?? []).map((o) => <option key={o.title} value={o.title} label={o.label} />)}</datalist>
              <datalist id={listId("location", b)}>{(branchesByBrand[b] ?? []).map((o) => <option key={o} value={o} />)}</datalist>
            </Fragment>
          ))}
        </div>
      </div>

      {autoRows.length > 0 && (
        <div className="mt-3 bg-surface border border-line rounded-cardLg p-4 no-print">
          <div className="text-[12px] font-bold text-muted mb-2">📎 จาก Content Plan (Photo shoot / VDO shooting) — กด &quot;＋&quot; เพื่อดึงเข้าตารางแล้วแก้ต่อได้</div>
          <div className="flex flex-col gap-1">
            {autoRows.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[12px] border-b border-line4 last:border-0 py-[5px]">
                <span className="font-semibold text-ink flex-1 truncate">{a.content}</span>
                <BrandChip brand={a.brand} />
                <span className="text-faint">{a.date || "—"}</span>
                <button onClick={() => importAuto(a)} className="text-[11.5px] font-bold text-accent">＋ ดึงเข้า</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether the request has work sitting in review — the quick-approve target. */
const hasWaitingReview = (g: Graphic) =>
  (g.deliverables ?? []).some((d) => d.status === "Waiting review") || g.stage === "Waiting Feedback";

/** Reads the gate itself rather than taking it as a prop: this is the one place
 *  the bulk-approve button is rendered, and three views pass through here — a
 *  prop any of them could forget is a hole in the same rule the drawer enforces. */
function QuickApproveBtn({ g, onQuickApprove }: { g: Graphic; onQuickApprove?: (g: Graphic, lens: ReviewLens) => void }) {
  const { member, user, role } = useAuth();
  const requesterKey = (g.requester || "").trim().toLowerCase();
  const isRequester = !!requesterKey &&
    [member?.name, member?.email, user?.email].some((v) => (v ?? "").trim().toLowerCase() === requesterKey);
  const me = member?.name || user?.email?.split("@")[0] || "";
  if (!onQuickApprove || !hasWaitingReview(g)) return null;
  // One button per lens the viewer owns, labelled with the lens. A single
  // "✓ Approve" would have to mean "both", which is exactly the shortcut the
  // two-check split exists to remove — and it would silently do the other
  // reviewer's job from a list row.
  const waiting = (g.deliverables ?? []).filter((d) => d.status === "Waiting review");
  const mine = REVIEW_LENSES.filter((lens) =>
    waiting.some((d) => !d.review?.[lens] && canPassLens(lens, { role, isRequester, me, deliverable: d })));
  if (!mine.length) return null;
  return (
    <>
      {mine.map((lens) => (
        <span
          key={lens}
          role="button" tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onQuickApprove(g, lens); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onQuickApprove(g, lens); } }}
          title={`ผ่านด้าน${LENS_META[lens].short}ให้ทุกชิ้นที่รอรีวิวของงานนี้ — อีกด้านยังต้องมีคนตรวจ`}
          className="inline-flex items-center text-[11px] font-bold text-white rounded-[8px] px-2.5 py-[4px] cursor-pointer whitespace-nowrap"
          style={{ background: lens === "ci" ? "#6C5CE7" : "#4E7A4E" }}
        >✓ {LENS_META[lens].short}</span>
      ))}
    </>
  );
}

const BOARD_OPEN_KEY = "mos-graphic-board-open-stages";

function BoardView({ items, onOpen, onQuickApprove }: { items: Graphic[]; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic, lens: ReviewLens) => void }) {
  // Which finished columns the user has opened. Remembered, so someone who
  // works out of the Delivered column doesn't reopen it every morning.
  const [openStages, setOpenStages] = useState<string[]>([]);
  useEffect(() => {
    try {
      setOpenStages(JSON.parse(localStorage.getItem(BOARD_OPEN_KEY) || "[]") as string[]);
    } catch { /* no-op */ }
  }, []);
  const toggleStage = (stage: string) => {
    setOpenStages((current) => {
      const next = current.includes(stage) ? current.filter((s) => s !== stage) : [...current, stage];
      try { localStorage.setItem(BOARD_OPEN_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGE_ORDER.map((stage) => {
        const cards = items.filter((g) => g.stage === stage);
        // Finished columns start rolled up: they are the widest part of the
        // board and the least often acted on, so they pushed live work off the
        // right-hand edge. The count stays visible, and clicking opens them.
        const done = isGraphicFinished({ stage });
        const rolled = done && !openStages.includes(stage);
        return (
          <div key={stage} className={`flex-shrink-0 ${rolled ? "w-[150px]" : "w-[280px]"}`}>
            <button type="button" onClick={() => done && toggleStage(stage)} disabled={!done}
              aria-expanded={done ? !rolled : undefined}
              className={`w-full flex items-center gap-2 mb-3 px-1 text-left ${done ? "cursor-pointer" : "cursor-default"}`}>
              <StatusBadge tone={stageTone(stage)}>{stage}</StatusBadge>
              <span className="text-[12px] text-faint font-semibold">{cards.length}</span>
              {done && <span className="text-[11px] text-faint ml-auto" aria-hidden>{rolled ? "▸" : "▾"}</span>}
            </button>
            <div className="flex flex-col gap-2">
              {!rolled && cards.map((g) => (
                <button key={g.id} onClick={() => onOpen(g)} className="w-full text-left bg-surface border border-line rounded-card p-[13px] hover:border-accent transition">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[13px] font-bold text-ink leading-tight">{g.title}</span>
                    <span className="flex items-center gap-1.5">
                      <QuickApproveBtn g={g} onQuickApprove={onQuickApprove} />
                      <StatusBadge tone={PRIORITY_TONE[g.priority]}>{g.priority}</StatusBadge>
                    </span>
                  </div>
                  <div className="text-[11px] text-faint flex items-center gap-[5px] mb-2"><BrandDot brand={g.b} size={6} />{brandName(g.b)} · {g.type}</div>
                  {!g.briefComplete && <div className="text-[10.5px] font-bold text-status-red mb-2">⚠ Brief incomplete</div>}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-[6px]">
                      <span className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: DESIGNER_COLOR[g.designer] ?? "#9A9387" }}>{g.designer === "Unassigned" ? "?" : g.designer.slice(0, 1)}</span>
                      <span className="text-[11px] text-muted">{g.designer}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[11px]">
                      {g.openFb > 0 && <span className="text-status-red font-semibold">💬 {g.openFb}</span>}
                      <span style={{ color: g.isOverdue ? "#B33A2E" : "#9A9387", fontWeight: g.isOverdue ? 700 : 400 }}>{g.due}</span>
                    </span>
                  </div>
                </button>
              ))}
              {cards.length === 0 && (
                <div className="text-[11px] text-faint text-center py-4 border border-dashed border-line2 rounded-card bg-[#FCFBF8]">
                  No request in this stage yet
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Campaign view — Platform-Performance-style collapsible groups: one row per
 *  campaign with summary stats, expandable to the request list inside. */
function CampaignGroupView({ items, onOpen, onQuickApprove }: { items: Graphic[]; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic, lens: ReviewLens) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const m = new Map<string, Graphic[]>();
    for (const g of items) { const k = g.campaign || "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(g); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  if (items.length === 0) return <ListView items={items} onOpen={onOpen} onQuickApprove={onQuickApprove} />;
  const chip = (label: string, value: number, fg: string, bg: string) => value > 0 && (
    <span key={label} className="rounded-pill px-2.5 py-[3px] text-[10.5px] font-bold" style={{ color: fg, background: bg }}>{value} {label}</span>
  );
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([campaign, gs]) => {
        const isOpen = openGroups[campaign] ?? true;
        const inProgress = gs.filter((g) => /Progress|Creating/i.test(g.stage)).length;
        const waiting = gs.filter((g) => /Waiting/i.test(g.stage)).length;
        const done = gs.filter((g) => /Approved|Delivered/i.test(g.stage)).length;
        const overdue = gs.filter((g) => g.isOverdue).length;
        return (
          <div key={campaign} className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <button onClick={() => setOpenGroups((o) => ({ ...o, [campaign]: !(o[campaign] ?? true) }))}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-ivory/60">
              <span className="text-faint text-[13px]">{isOpen ? "▾" : "▸"}</span>
              <span className="text-[13px] font-extrabold text-ink">🎯 {campaign}</span>
              <span className="text-[11.5px] text-faint font-semibold">{gs.length} request{gs.length > 1 ? "s" : ""}</span>
              <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                {chip("in progress", inProgress, "#3E5C9A", "#EEF1F8")}
                {chip("waiting", waiting, "#C68A1E", "#FBF8EE")}
                {chip("approved/delivered", done, "#4E7A4E", "#EEF4EE")}
                {chip("overdue", overdue, "#B33A2E", "#FFF5F4")}
              </span>
            </button>
            {isOpen && <div className="border-t border-line4"><ListView items={gs} onOpen={onOpen} onQuickApprove={onQuickApprove} /></div>}
          </div>
        );
      })}
    </div>
  );
}

/** Column widths, named once because the header row and the data rows have to
 *  agree — they were two literals, and a column added to one drifts from the
 *  other in a way nothing type-checks.
 *
 *  Every track is minmax(0, …), never a bare `1.7fr`. A bare fr means
 *  minmax(auto, 1.7fr): a long title, a work-code pill or a full CAM-2026-…
 *  id sets a min-content floor, and since the header and each row are their own
 *  grid, that floor widens one row's column and leaves it out of step with the
 *  header and with every other row. minmax(0, …) makes the split purely
 *  proportional, so all rows resolve to the same widths whatever is in them. */
const LIST_COLS = "minmax(0,1.9fr) minmax(0,1.25fr) minmax(0,0.95fr) minmax(0,0.7fr) minmax(0,0.8fr) minmax(0,0.5fr) minmax(0,1.15fr)";

function ListView({ items, onOpen, onQuickApprove }: { items: Graphic[]; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic, lens: ReviewLens) => void }) {
  const codeOf = useCampaignCodes();
  const active = items.filter((g) => !isGraphicFinished(g));
  const finished = items.filter(isGraphicFinished);
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      {/* No "Pending" column: it printed `pendingApprover`, which is set once when
          the request is created and never moves, so it only ever repeated the
          approver's name — it never tracked who the request was actually waiting
          on. A column that looks live but isn't is worse than no column. */}
      <div className="hidden md:grid gap-x-2 px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: LIST_COLS }}>
        <div>Request</div><div>Campaign</div><div>รหัสแคมเปญ</div><div>Type task</div><div>Designer</div><div>Due</div><div>Stage</div>
      </div>
      {active.map((g) => <GraphicListRow key={g.id} g={g} codeOf={codeOf} onOpen={onOpen} onQuickApprove={onQuickApprove} />)}
      {/* Delivered and approved work, folded under what is still moving. */}
      <FinishedFold count={finished.length} storageKey="mos-graphic-list-finished" label="ส่งงานแล้ว">
        {finished.map((g) => <GraphicListRow key={g.id} g={g} codeOf={codeOf} onOpen={onOpen} onQuickApprove={onQuickApprove} />)}
      </FinishedFold>
      {items.length === 0 && (
        <div className="px-5 py-10 text-center">
          <div className="inline-flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[#D9B86A] bg-[#FFF8EA] px-6 py-5">
            <div className="text-[13px] font-bold text-[#8A6930]">No graphic requests match this view</div>
            <div className="text-[11.5px] text-[#9A7A47]">Try a wider filter, or send a new brief to start the queue.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function GraphicListRow({ g, codeOf, onOpen, onQuickApprove }: { g: Graphic; codeOf: (id?: string, name?: string) => string | undefined; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic, lens: ReviewLens) => void }) {
  return (
      <button onClick={() => onOpen(g)} className="w-full grid grid-cols-1 gap-x-2 gap-y-1 items-center px-5 py-3 text-left border-b border-line4 last:border-0 hover:bg-ivory/60 md:[grid-template-columns:var(--list-cols)]"
        style={{ "--list-cols": LIST_COLS } as React.CSSProperties}>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink flex items-center gap-[6px] min-w-0">
            <span className="truncate">{g.title}</span>
            <WorkCode code={g.code} />
          </div>
          {/* The type used to sit here; it has a column now, so this names the
              brand instead of printing the same word twice on one row. */}
          <div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={g.b} size={6} />{brandName(g.b)}</div>
        </div>
        <span className="text-[12px] text-muted truncate min-w-0">{g.campaign}</span>
        <span className="min-w-0"><CampaignCode code={codeOf(g.campaignId, g.campaign)} /></span>
        <span className="text-[12px] text-muted truncate min-w-0">{g.type}</span>
        <span className="text-[12px] text-muted truncate min-w-0">{g.designer}</span>
        <span className="text-[12px] whitespace-nowrap" style={{ color: g.isOverdue ? "#B33A2E" : "#6b6258", fontWeight: g.isOverdue ? 700 : 400 }}>{g.due}</span>
        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
          <StatusBadge tone={stageTone(g.stage)}>{g.stage}</StatusBadge>
          <QuickApproveBtn g={g} onQuickApprove={onQuickApprove} />
        </span>
      </button>
  );
}

function RequestModal({ nextId, graphics, prefillPost, onClose, onCreate }: {
  nextId: number;
  graphics: Graphic[];
  /** Post this brief was raised for (arrived via ?briefFor=<id>). */
  prefillPost?: ContentItem | null;
  onClose: () => void;
  onCreate: (g: Graphic, post: ContentItem | null, briefItem: BriefContentItem | null, campaign: string, linkedPost: ContentItem | null) => void;
}) {
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [b, setB] = useState<BrandId>(brandOptions[0] ?? "teppen");
  const [campaign, setCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  // Campaigns arrive async. Without this flag an empty list reads the same
  // while loading as when there genuinely are none, and the picker told users
  // "No campaigns for this brand" for a brand that has eight.
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [approver, setApprover] = useState("");
  const { member, user } = useAuth();
  const requester = member?.name || user?.email?.split("@")[0] || "You";
  const requestDate = todayIso();
  // Same content-item "template" as the Campaign Builder's Content Plan — a graphic
  // request is just a content item that needs a graphic, so it stays in sync.
  const [item, setItem] = useState<BriefContentItem>(() => ({ ...emptyContentItem(nextId), requiredGraphic: true }));
  const onChange = (patch: Partial<BriefContentItem>) => setItem((it) => ({ ...it, ...patch }));

  const [briefs, setBriefs] = useState<Record<string, CampaignBrief>>({});
  // Which Content Plan post does this brief serve? Three honest answers, one of
  // which ("none") the form could not express before — print, POSM and menu
  // artwork had to be filed as a social post to reach the Creative queue.
  const [rushReason, setRushReason] = useState("");
  // Monthly brief cutoff, set by the CMO in Settings; 0 turns the rule off.
  const [cutoffDay, setCutoffDay] = useState(DEFAULT_BRIEF_CUTOFF_DAY);
  useEffect(() => {
    let alive = true;
    getAppSetting(BRIEF_CUTOFF_SETTING_KEY)
      .then((v) => { if (alive && v !== null && v !== "") setCutoffDay(Number(v) || 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const [postLink, setPostLink] = useState<"existing" | "new" | "none">(prefillPost ? "existing" : "new");
  const [linkedPostId, setLinkedPostId] = useState(prefillPost?.id ?? "");
  const [posts, setPosts] = useState<ContentItem[]>([]);
  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {}).finally(() => { if (alive) setCampaignsLoaded(true); });
    fetchAllBriefs().then((b) => { if (alive) setBriefs(b); }).catch(() => {});
    fetchContent().then((c) => { if (alive) setPosts(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!brandOptions.includes(b)) setB(brandOptions[0] ?? "teppen"); }, [b, brandOptions]);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === b), [campaigns, b]);
  const selectedCampaign = useMemo(() => brandCampaigns.find((c) => c.name === campaign), [brandCampaigns, campaign]);
  // Clearing a campaign that does not belong to the chosen brand — but not
  // before the campaign list has arrived. fetchCampaigns resolves after the
  // ?briefFor= prefill has already set the post's campaign, so running this
  // against an empty list wiped it and the deep link landed on a blank
  // Campaign field with the post picker disabled behind it.
  useEffect(() => {
    if (!campaigns.length) return;
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign, campaigns.length]);

  // Posts to choose from: this campaign's, since a brief belongs to one
  // campaign and picking across them is the mistake the id scoping guards.
  const campaignPosts = useMemo(
    () => posts.filter((p) => p.b === b && (selectedCampaign?.id ? p.campaignId === selectedCampaign.id : p.campaign === campaign)),
    [posts, b, campaign, selectedCampaign],
  );
  const linkedPost = postLink === "existing" ? (posts.find((p) => p.id === linkedPostId) ?? null) : null;
  const postLabel = (p: ContentItem) => `${p.title} · ${p.dateIso ?? `day ${p.day}`}`;

  // Arriving from "โพสต์นี้ต้องใช้งานกราฟฟิกใหม่": adopt the post's brand,
  // campaign, title and channels so the brief starts where the post left off.
  useEffect(() => {
    if (!prefillPost) return;
    setB(prefillPost.b);
    setCampaign(prefillPost.campaign);
    setLinkedPostId(prefillPost.id);
    setPostLink("existing");
    onChange({
      title: prefillPost.title,
      platforms: prefillPost.platforms?.length ? prefillPost.platforms : [prefillPost.plat],
      publishDate: prefillPost.dateIso ?? "",
      requiredGraphic: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPost?.id]);

  // Match the brief's social platforms: picking a campaign pre-selects the
  // platforms the brief actually plans to post on (only if none chosen yet).
  useEffect(() => {
    const brief = campaign ? briefs[campaign] : undefined;
    if (!brief || item.platforms.length) return;
    const social = brief.channels.filter((c) => (CONTENT_PLATFORMS as readonly string[]).includes(c));
    if (social.length) onChange({ platforms: social });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, briefs]);

  // Daily capacity guard — max DAILY_WORK_CAP ARTWORK PIECES of each kind per
  // due date. This request adds its own pieces (distinct size, platform collapsed).
  const kind = workKind(item.type, item.requiredVideo);
  const dueDay = (item.graphicDueDate || "").slice(0, 10);
  const usedToday = dueDay ? countWorkOnDay(graphics, kind, dueDay) : 0;
  const newUnits = artworkUnitsOf(item.assets.length ? item.assets : item.platforms.map(() => ({ size: "" })));
  const atCap = !!dueDay && usedToday + newUnits > DAILY_WORK_CAP;

  // "Deliver before it publishes" is only a rule while it is satisfiable; when
  // the post publishes inside the lead time it becomes a trap that no date can
  // clear (see graphicDueRangeImpossible). The form warns instead of blocking.
  const dueRangeImpossible = graphicDueRangeImpossible(item.publishDate, requestDate);
  const dueOrderValid = dueRangeImpossible || !item.publishDate || !item.graphicDueDate || item.graphicDueDate <= item.publishDate;
  const postLinkValid = postLink !== "existing" || !!linkedPost;

  // Late, too soon, or over the day's ceiling: all three used to refuse the
  // form outright, which taught people to nudge the due date until it went
  // quiet. They now make the brief a RUSH — it goes in, carrying what it broke,
  // and Creative Leader decides whether the month can take it.
  const breaches = rushBreaches({
    graphicDueIso: dueDay,
    requestIso: requestDate,
    cutoffDay,
    minDueIso: minGraphicDueDate(requestDate),
    capLimit: DAILY_WORK_CAP,
    capUsed: usedToday,
    capAdding: newUnits,
    kindLabel: WORK_KIND_LABEL[kind],
  });
  const isRush = breaches.length > 0;
  // The one thing a rush brief must carry: why it could not wait.
  const rushReasonValid = !isRush || rushReason.trim().length >= 10;

  const canCreate = !!item.title.trim() && item.platforms.length > 0 && !!campaign.trim() && !!item.graphicDueDate && dueOrderValid && postLinkValid && rushReasonValid;
  const missing = [
    !campaign.trim() ? "campaign" : null,
    !postLinkValid ? "โพสต์ที่จะผูก" : null,
    !item.title.trim() ? "brief title" : null,
    !item.platforms.length ? "platform" : null,
    !item.graphicDueDate ? "graphic due date" : null,
    !dueOrderValid ? "graphic due date before publish date" : null,
    !rushReasonValid ? "เหตุผลที่ต้องเร่ง (อย่างน้อย 10 ตัวอักษร)" : null,
  ].filter(Boolean) as string[];
  const submit = () => {
    if (!canCreate) return;
    const needsStoryboardFor = needsStoryboard({ type: item.type, requiredVideo: item.requiredVideo });
    const plats = item.platforms;
    const pairs = item.assets.length ? item.assets : plats.map((p) => ({ platform: p, size: "" }));
    const deliverables = pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", contentBriefLink(item)));
    const approverName = approver.trim() || requester;
    const g: Graphic = {
      ...buildGraphic({
        id: nextId, b, campaign: campaign.trim(), title: item.title.trim(),
        type: item.type, due: labelDate(item.graphicDueDate) || "TBD", dueIso: item.graphicDueDate, designer: "Unassigned",
        requester, approver: approverName, channels: plats,
        campaignId: selectedCampaign?.id,
        sourceContentItemId: linkedPost?.sourceContentItemId,
      }),
      stage: "New Request",
      size: pairs.map((a) => a.size).filter(Boolean).join(" · ") || "—",
      deliverables,
      // Breaches are stamped, not recomputed later: the cap on a given day
      // moves as other briefs land, and the decision has to be judged against
      // what was true when it was asked for.
      rushStatus: isRush ? "Pending" : "",
      rushBreaches: isRush ? breaches.map((b) => b.label) : undefined,
      rushReason: isRush ? rushReason.trim() : undefined,
      // Video work starts at the storyboard, not the artwork. Raising a Reel
      // therefore lands on Creative Content first — "ถ้ามีการคลิกสร้าง reel ให้
      // เด้งมาที่ตำแหน่ง creative content" — and the request says so from the
      // moment it exists rather than after someone notices.
      storyboardStatus: needsStoryboardFor ? "Waiting" : undefined,
      nextAction: isRush
        ? "รอ Creative Leader อนุมัติงานเร่งด่วน"
        : needsStoryboardFor
          ? "Creative Content ทำ storyboard แล้วส่งให้เจ้าของงานอนุมัติ"
          : "Creative leader to assign in-house or outsource designer",
      contentItem: linkedPost?.title || item.title.trim() || "—",
      // The link the whole split rests on. Absent for print/POSM work, which
      // is now allowed to exist without a post rather than inventing one.
      contentPostId: linkedPost?.id,
    };
    // Only mint a post when the brief is for something that will be published
    // and no post exists yet. Linking to an existing post, or "no post at all",
    // both leave the Content Plan alone.
    let post: ContentItem | null = null;
    if (postLink === "new") {
      const iso = item.publishDate || new Date().toISOString().slice(0, 10);
      const day = Math.max(1, Math.min(31, Number(iso.split("-")[2]) || 1));
      const postId = `c${nextId}-gfx`;
      post = {
        id: postId, day, dateIso: iso, time: "10:00", title: item.title.trim(), b, plat: plats[0] ?? "Instagram", platforms: plats,
        status: "Draft", campaign: campaign.trim(), owner: requester, caption: "", hashtags: "", cta: "",
        captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft",
        campaignId: selectedCampaign?.id,
      };
      g.contentPostId = postId;
    }
    onCreate(g, post, postLink === "new" ? item : null, campaign.trim(), linkedPost ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-1">Send Graphic Brief</div>
        <div className="text-[12px] text-faint mb-4">คำขอผลิตงานกราฟฟิก · ผูกกับโพสต์ใน Content Plan ด้วย Campaign + Post ID — หรือไม่ผูกเลยก็ได้ถ้าไม่ใช่งานลงโซเชียล</div>
        <div className="flex flex-col gap-4">
          {/* Context: brand, campaign, team */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
              <select value={b} onChange={(e) => setB(e.target.value as BrandId)} className={field}>
                {brandOptions.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign <span style={{ color: "#B33A2E" }}>*</span></label>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}>
                <option value="">{!campaignsLoaded ? "กำลังโหลดแคมเปญ…" : brandCampaigns.length ? "Select campaign…" : "แบรนด์นี้ยังไม่มีแคมเปญ"}</option>
                {brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Requester</label>
              <input value={requester} readOnly aria-readonly="true" className={`${field} text-ink bg-ivory cursor-not-allowed`} />
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Designer</label>
              <input value="Creative leader will assign after brief" readOnly aria-readonly="true" className={`${field} text-faint bg-ivory cursor-not-allowed`} />
            </div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Approver</label><OwnerSelect value={approver} onChange={setApprover} placeholder="= Requester" /></div>
          </div>
          {/* The link between the two modules — the whole point of splitting
              them. Stored as contentPostId on the request. */}
          <div className="rounded-[14px] border border-[#DDD1FF] bg-[#F7F2FF] px-4 py-3">
            <div className="text-[11.5px] font-bold text-[#2C2553] mb-2">งานนี้ใช้กับโพสต์ไหน</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {([
                ["existing", "ผูกกับโพสต์ที่มีอยู่"],
                ["new", "สร้างโพสต์ใหม่ให้ด้วย"],
                ["none", "ไม่ผูกโพสต์ (POSM / ป้าย / เมนู)"],
              ] as const).map(([value, label]) => {
                const on = postLink === value;
                return (
                  <button key={value} type="button" onClick={() => setPostLink(value)}
                    className="text-[12px] font-semibold px-[11px] py-[6px] rounded-[9px] border"
                    style={on ? { background: "#2C2553", color: "#fff", borderColor: "#2C2553" } : { background: "#fff", borderColor: "#DDD1FF", color: "#6C5CE7" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            {postLink === "existing" && (
              <>
                <Combobox
                  value={linkedPost ? postLabel(linkedPost) : ""}
                  onChange={(label) => setLinkedPostId(campaignPosts.find((p) => postLabel(p) === label)?.id ?? "")}
                  options={campaignPosts.map(postLabel)}
                  disabled={!campaign.trim()}
                  inputClassName={field}
                  placeholder={!campaign.trim() ? "เลือก campaign ก่อน" : campaignPosts.length ? "พิมพ์เพื่อค้นหาโพสต์…" : "campaign นี้ยังไม่มีโพสต์"}
                  emptyLabel="ไม่พบโพสต์ที่ตรงกับที่พิมพ์"
                />
                {!!campaign.trim() && campaignPosts.length === 0 && (
                  <div className="mt-1 text-[11px] text-[#7D70CC]">ยังไม่มีโพสต์ใน campaign นี้ — เลือก &ldquo;สร้างโพสต์ใหม่ให้ด้วย&rdquo; หรือไปวางแผนโพสต์ที่ Content Plan ก่อน</div>
                )}
              </>
            )}
            {postLink === "new" && <div className="text-[11px] text-[#7D70CC]">จะสร้างโพสต์ Draft ใน Content Plan ให้ด้วย โดยใช้ชื่อและ platform จากบรีฟนี้</div>}
            {postLink === "none" && <div className="text-[11px] text-[#7D70CC]">งานที่ไม่ได้ลงโซเชียล — จะไม่ไปโผล่ในปฏิทิน Content Plan และไม่มี asset ไหลกลับไปที่โพสต์</div>}
          </div>

          {/* Shared content-item template (title, type, platform × asset size, brief) */}
          <ContentItemForm item={item} onChange={onChange} requesterFallback={requester} requestDate={requestDate} showAssignmentFields={false} />
        </div>
        {/* Daily capacity meter for the selected work kind + due date */}
        {dueDay && (
          <div className="mt-4 rounded-[12px] border px-4 py-[10px] flex items-center justify-between gap-2"
            style={atCap
              ? { background: "#FFF5F4", borderColor: "#F5C8C4", color: "#B33A2E" }
              : { background: "#EEF4EE", borderColor: "#CFE4C2", color: "#4E7A4E" }}>
            <span className="text-[12px] font-bold">
              📅 โควตา {WORK_KIND_LABEL[kind]} วันที่ {dueDay}: ใช้แล้ว {usedToday} + งานนี้ {newUnits} / {DAILY_WORK_CAP} artwork
            </span>
            <span className="text-[11px] font-semibold">
              {atCap ? "⚠ เกินโควตา — ลดไซซ์/รวม artwork หรือเลือกวันอื่น" : `เหลือ ${DAILY_WORK_CAP - usedToday - newUnits} ชิ้น`}
            </span>
          </div>
        )}

        {/* Rush panel — what was broken, and the requester's case for it. */}
        {isRush && (
          <div className="mt-3 rounded-[14px] border px-4 py-3" style={{ background: "#FFF7ED", borderColor: "#F0C89B" }}>
            <div className="text-[12.5px] font-extrabold" style={{ color: "#B3641E" }}>⚡ งานนี้นับเป็นงานเร่งด่วน — ต้องให้ Creative Leader อนุมัติก่อนเริ่มงาน</div>
            <ul className="mt-2 mb-2 list-disc pl-5 text-[11.5px]" style={{ color: "#8A5418" }}>
              {breaches.map((b) => <li key={b.code}>{b.label}</li>)}
            </ul>
            <label className="block text-[11.5px] font-bold mb-[5px]" style={{ color: "#B3641E" }}>เหตุผลที่รอรอบปกติไม่ได้ <span className="text-status-red">*</span></label>
            <textarea
              value={rushReason}
              onChange={(e) => setRushReason(e.target.value)}
              rows={2}
              placeholder="เช่น โปรโมชั่นจับมือกับพาร์ทเนอร์ ประกาศวันนี้ ต้องลงพร้อมกันทุกช่องทาง"
              className="w-full text-[13px] px-[12px] py-[9px] rounded-[10px] border border-[#F0C89B] bg-white outline-none resize-y"
            />
            <div className="mt-1 text-[11px]" style={{ color: rushReasonValid ? "#8A5418" : "#B33A2E" }}>
              {rushReasonValid ? "Creative Leader จะเห็นเหตุผลนี้ตอนพิจารณา" : "เขียนอย่างน้อย 10 ตัวอักษร — คนอนุมัติต้องรู้ว่าเร่งเพราะอะไร"}
            </div>
          </div>
        )}

        <div className="mt-3 rounded-[16px] border px-4 py-3" style={{ background: canCreate ? "#EEF8E8" : "#FBF6EC", borderColor: canCreate ? "#CFE4C2" : "#EADBC1" }}>
          <div className="text-[12px] font-bold" style={{ color: canCreate ? "#3F6A34" : "#8A6D1E" }}>
            {canCreate
              ? (isRush ? "พร้อมส่ง — จะเข้าคิวรอ Creative Leader อนุมัติ" : "Ready to send to Creative leader")
              : `Before sending, add ${missing.join(", ")}`}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: canCreate ? "#5A7A4D" : "#9A8460" }}>
            Requester stays fixed to login, and designer will be assigned after the brief comes in.
          </div>
        </div>
        <button onClick={submit} disabled={!canCreate}
          className={`w-full mt-4 text-[13px] font-bold text-white rounded-[10px] py-[11px] disabled:opacity-40 ${isRush ? "" : "bg-panel"}`}
          style={isRush ? { background: "#B3641E" } : undefined}>
          {isRush ? "⚡ ส่งบรีฟด่วน (รออนุมัติ)" : "Send Graphic Request"}
        </button>
      </div>
    </div>
  );
}
