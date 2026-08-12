"use client";

import { toastError } from "@/lib/toast";
import { OPEN_PARAM, resolveOpenTarget } from "@/lib/deepLink";
import { CSSProperties, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { ContentDrawer } from "@/components/content/ContentDrawer";
import { DeadlineStrip } from "@/components/ui/DeadlineStrip";
import { BrandFilterValue, brandName, BRANDS, BrandId } from "@/lib/brands";
import {
  CONTENT, ContentItem, contentTone, platIcon, itemPlatforms, contentDateIso, bySchedule, isPostFinished, captionOwner } from "@/lib/data/content";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { fetchContent, createContent, updateContent } from "@/lib/db/content";
import { useRole } from "@/lib/role";
import { useStickyView } from "@/lib/useStickyView";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignCode, WorkCode } from "@/components/ui/CampaignCode";
import { FinishedFold } from "@/components/ui/FinishedFold";
import { useCampaignCodes } from "@/lib/useCampaignCodes";
import { appendBriefItem } from "@/lib/db/brief";
import Link from "next/link";
import { fetchKolCalendarPosts, KolCalendarPost } from "@/lib/db/kolScorecard";
import { platformIcon } from "@/lib/platforms";
import { GRAPHIC_BRIEF_FOR_PARAM } from "@/lib/data/graphic";
import { CampaignRow } from "@/lib/data/campaigns";
import { assignmentQueue, queueSummary, AGE_META, ASSIGN_STUCK_DAYS } from "@/lib/data/ageing";
import { canAssignCaption } from "@/lib/roleGates";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { Combobox } from "@/components/ui/Combobox";
import { AssetThumb } from "@/components/content/AssetLinkList";
import { assetLinkView } from "@/lib/data/assetLinks";
import { emptyContentItem, BriefContentItem } from "@/lib/data/brief";
import { useAuth } from "@/lib/auth";
import { useBrandVisibility } from "@/lib/brandVisibility";

/** Row of platform badges (one per selected channel). */
/** One visual identity for the KOL layer, shared by the toggle and the chips so
 *  a KOL entry never reads as a brand post you can edit here. */
const KOL_LAYER = { bg: "#FFF3E5", border: "#F0D3AE", fg: "#B4622A" };

/** A KOL post on the calendar. Links out to the creator rather than opening the
 *  content drawer — it is not a content row and cannot be edited from here. */
function KolChip({ k }: { k: KolCalendarPost }) {
  return (
    <Link
      href={`/kol/${k.kol_id}`}
      title={`KOL · ${k.display_name}${k.campaign_name ? ` · ${k.campaign_name}` : ""}${k.planned ? " · ยังไม่ได้โพสต์ (วันที่นัดไว้)" : ""}`}
      className="w-full text-left flex items-center gap-[5px] rounded-[6px] px-[5px] py-[3px] border-l-[4px] transition hover:brightness-95"
      style={{
        background: KOL_LAYER.bg,
        borderColor: KOL_LAYER.border,
        borderLeftColor: KOL_LAYER.fg,
        borderStyle: k.planned ? "dashed" : "solid",
        borderLeftStyle: "solid",
      }}>
      <span className="w-[13px] h-[13px] rounded-[4px] flex items-center justify-center text-[8px] font-extrabold flex-shrink-0"
        style={{ background: KOL_LAYER.fg, color: "#fff" }}>K</span>
      {k.platforms.slice(0, 2).map((p) => {
        const ic = platformIcon(p);
        return (
          <span key={p} className="w-[13px] h-[13px] rounded-[4px] flex items-center justify-center text-[7.5px] font-bold flex-shrink-0"
            style={{ background: ic.bg, color: ic.fg }}>{ic.icon}</span>
        );
      })}
      <span className="text-[10.5px] font-semibold truncate flex-1" style={{ color: KOL_LAYER.fg }}>{k.display_name}</span>
    </Link>
  );
}

function PlatBadges({ item, size = 15 }: { item: ContentItem; size?: number }) {
  return (
    <span className="flex items-center gap-[2px] flex-shrink-0">
      {itemPlatforms(item).map((p, i) => {
        const pi = platIcon(p);
        return (
          <span key={i} className="rounded-[4px] flex items-center justify-center font-bold flex-shrink-0"
            style={{ width: size, height: size, background: pi.bg, color: pi.fg, fontSize: size <= 15 ? 7 : 8 }}>
            {pi.icon}
          </span>
        );
      })}
    </span>
  );
}

/** Everything the search box reads. Title and campaign are what people look for
 *  first, but a post is also findable by its caption text, the people on it, its
 *  channel or its status — so "ยังไม่อนุมัติ" style hunting works too.
 *
 *  `code` is the job number on screen (OMD_2609_001-C01). It is the one thing
 *  people copy out of a chat message to go looking for, and its campaign prefix
 *  means typing the campaign code alone pulls up every post under it. */
const searchText = (c: ContentItem) => [
  c.title, c.campaign, c.code, c.caption, c.hashtags, c.cta,
  c.subHead, c.mainMessage, c.productHighlight,
  c.owner, c.requester, c.designer, c.approver,
  // Both the stored channel name and the two-letter badge the row actually
  // shows: the calendar prints FB / IG / TK, so that is what gets typed, and
  // matching only "Facebook" made the visible label the one thing unsearchable.
  brandName(c.b), itemPlatforms(c).flatMap((p) => [p, platIcon(p).icon]).join(" "),
  c.status, c.captionStatus, c.assetStatus, c.approvalStatus, c.publishStatus,
  contentDateIso(c),
].filter(Boolean).join(" ").toLowerCase();

/** Every word must match somewhere — "ocean ig" finds the Ocean Don post on IG. */
const matchesQuery = (c: ContentItem, terms: string[]) =>
  terms.length === 0 || (() => { const hay = searchText(c); return terms.every((t) => hay.includes(t)); })();

/** Same rule for the KOL chips overlaid on the calendar — matched on the
 *  creator's name, the campaign and the channel, which is all a chip shows. */
const matchesKolQuery = (k: KolCalendarPost, terms: string[]) =>
  terms.length === 0 || (() => {
    const hay = [k.display_name, k.campaign_name, k.brand, k.platforms.join(" "), k.date]
      .filter(Boolean).join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  })();

type View = "month" | "week" | "list" | "queue" | "campaign";
type SavedContentView = { name: string; view: View; brand: BrandFilterValue; date: DateFilter };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const labelDate = (iso: string) => { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : ""; };
const uniqueNewPostId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isTemplateContentId = (id?: string) => !id || /^ci-\d+$/.test(id);
const CAMPAIGN_COLORS = ["#6C5CE7", "#4BA06B", "#F59E0B", "#D85C9A", "#35A7FF", "#B33A2E", "#8B5CF6", "#14B8A6"];
const hashText = (value: string) => value.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
const campaignAccent = (campaign?: string) => CAMPAIGN_COLORS[Math.abs(hashText(campaign || "default")) % CAMPAIGN_COLORS.length];
const savedViewKey = (userKey: string) => `mos-content-saved-views:${userKey || "guest"}`;

/** useSearchParams (for ?post=) opts the tree into client rendering, which
 *  Next requires a Suspense boundary around. */
export default function ContentPage() {
  return (
    <Suspense fallback={<div className="px-5 py-10 text-[13px] text-faint">Loading…</div>}>
      <ContentPageInner />
    </Suspense>
  );
}

function ContentPageInner() {
  const router = useRouter();
  const brandVisibility = useBrandVisibility();
  // Filters stick per tab so leaving the page and coming back keeps the view.
  const [sticky, setSticky] = useStickyView<{ view: View; brand: BrandFilterValue; date: typeof DEFAULT_DATE_FILTER; showKol?: boolean }>(
    "content", "", { view: "campaign", brand: "all", date: DEFAULT_DATE_FILTER, showKol: true },
  );
  const { view, brand, date } = sticky;
  // KOL posts are a layer over the calendar, not content rows: they are not
  // ours to edit here, and someone planning brand posts should be able to hide
  // them again. Default on — the collisions they reveal are the point.
  const showKol = sticky.showKol !== false;
  const setShowKol = (v: boolean) => setSticky({ ...sticky, showKol: v });
  const setView = (v: View) => setSticky({ ...sticky, view: v });
  const setBrand = (b: BrandFilterValue) => setSticky({ ...sticky, brand: b });
  const setDate = (d: typeof DEFAULT_DATE_FILTER) => setSticky({ ...sticky, date: d });
  const [open, setOpen] = useState<ContentItem | null>(null);
  // /content?post=<id> — arriving from the notification about this one post.
  // postsLoaded, not posts.length: the list starts as the bundled demo seed, so
  // a non-empty list says nothing about whether the real rows are in yet.
  const searchParams = useSearchParams();
  const openPostId = searchParams.get(OPEN_PARAM.post);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const openedRef = useRef<string | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>(CONTENT);
  const [savedViews, setSavedViews] = useState<SavedContentView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [kolPosts, setKolPosts] = useState<KolCalendarPost[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newIso, setNewIso] = useState<string | null>(null);
  // Deliberately not part of the sticky view: a saved filter set that silently
  // still holds a search would explain away an empty calendar days later.
  const [query, setQuery] = useState("");
  const { member, user } = useAuth();
  const me = member?.name || user?.email?.split("@")[0] || "You";
  // Only the creative team (Content Creator / Creative Leader; CMO as admin)
  // may change Approval / Publish status inline from the list.
  const { role } = useRole();
  const canEditStatus = ["Content Creator", "Creative Leader", "CMO"].includes(role);
  // Inline status update — persist + patch local state, no drawer needed.
  const setStatus = (c: ContentItem, patch: Partial<ContentItem>) => {
    const next = { ...c, ...patch };
    setPosts((ps) => ps.map((p) => (p.id === c.id ? next : p)));
    updateContent(next).catch((error) => toastError(`อัปเดตสถานะไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`));
  };

  useEffect(() => {
    let alive = true;
    fetchContent().then((c) => { if (alive) { setPosts(c); setPostsLoaded(true); } })
      .catch(() => { if (alive) setPostsLoaded(true); });
    fetchKolCalendarPosts().then((k) => { if (alive) setKolPosts(k); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Open the post the notification named, once the real list is in. The param
  // is dropped afterwards so closing the drawer does not reopen it, and a post
  // that is gone says so rather than leaving a calendar that looks fine.
  useEffect(() => {
    if (!openPostId) { openedRef.current = null; return; }
    const { action, item } = resolveOpenTarget(openPostId, posts, postsLoaded, openedRef.current);
    if (action === "idle" || action === "wait") return;
    openedRef.current = openPostId;
    if (action === "open" && item) setOpen(item);
    else toastError(`ไม่พบโพสต์นี้ — อาจถูกลบไปแล้ว หรืออยู่ในแบรนด์ที่คุณไม่มีสิทธิ์เห็น`);
    router.replace("/content");
  }, [openPostId, posts, postsLoaded, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const parsed = JSON.parse(localStorage.getItem(savedViewKey(me)) || "[]") as SavedContentView[];
      setSavedViews(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedViews([]);
    }
  }, [me]);
  const persistSavedViews = (next: SavedContentView[]) => {
    setSavedViews(next);
    if (typeof window !== "undefined") localStorage.setItem(savedViewKey(me), JSON.stringify(next));
  };
  const saveCurrentView = () => {
    const name = savedViewName.trim() || `${view} · ${brand === "all" ? "All Brands" : brandName(brand)} · ${date.mode}`;
    persistSavedViews([...savedViews.filter((v) => v.name !== name), { name, view, brand, date }]);
    setSavedViewName("");
  };
  const applySavedView = (saved: SavedContentView) => {
    setView(saved.view);
    setBrand(saved.brand);
    setDate(saved.date);
  };

  // The month the grid shows: the filter month, or the range's starting month.
  // Fallback to today (never a hardcoded year) when a range has no start date.
  const todayIso = new Date().toISOString().slice(0, 10);
  const gy = date.mode === "month" ? date.year : Number((date.start || todayIso).slice(0, 4));
  const gm = date.mode === "month" ? date.month : Number((date.start || todayIso).slice(5, 7)) - 1;
  const ymKey = `${gy}-${String(gm + 1).padStart(2, "0")}`;

  const openNew = (day?: number) => { setNewIso(day ? `${ymKey}-${String(day).padStart(2, "0")}` : null); setNewOpen(true); };

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const scoped = useMemo(
    () => posts.filter((c) => brandVisibility.visibleBrands.includes(c.b) && (brand === "all" || c.b === brand)),
    [posts, brand, brandVisibility],
  );
  const items = useMemo(
    () => scoped.filter((c) => inDateFilter(date, contentDateIso(c)) && matchesQuery(c, terms)),
    [scoped, date, terms],
  );
  // Hits the period filter hides. A calendar can only draw one month, so instead
  // of letting the post look non-existent, offer to widen the window.
  const hiddenByDate = useMemo(
    () => (terms.length === 0 ? 0 : scoped.filter((c) => matchesQuery(c, terms) && !inDateFilter(date, contentDateIso(c))).length),
    [scoped, date, terms],
  );
  // Widening the window is only half the answer: a month grid draws one month
  // whatever the filter says, so "ค้นทุกช่วงเวลา" pressed from Month left the
  // count reading "พบ 3 โพสต์" above a calendar with nothing on it. Land on the
  // one view that can actually show every hit.
  const searchEverywhere = () => {
    setDate({ ...date, mode: "range", start: "", end: "" });
    if (view === "month") setView("list");
  };
  // The KOL layer obeys the same brand scope and date filter as the content it
  // sits beside — a hidden brand must not leak in through a different module.
  // The search box is the same argument: a KOL chip left on the calendar while
  // the posts around it were filtered away reads as a hit for a word it does
  // not contain.
  const kolLayer = useMemo(
    () => (showKol
      ? kolPosts.filter((k) => (!k.brand || brandVisibility.visibleBrands.includes(k.brand as BrandId))
          && (brand === "all" || k.brand === brand)
          && inDateFilter(date, k.date)
          && matchesKolQuery(k, terms))
      : []),
    [kolPosts, showKol, brand, date, brandVisibility, terms],
  );
  // Captions with nobody's name on them. Deliberately computed from `posts`,
  // not `items`: the month filter is exactly what hid this work. Opening the
  // app in July showed "0 posts in view" while 25 captions waited in September,
  // so a queue that also filtered by month would repeat the bug it exists to
  // fix. It is a separate banner rather than a fifth summary card for the same
  // reason — the cards all count "in view", and mixing denominators in one row
  // is how a screen ends up lying quietly.
  const captionQueue = useMemo(
    () => assignmentQueue(
      posts.filter((p) => p.captionStatus !== "Approved" && p.publishStatus !== "Published"),
      // The planner holds the caption until Creative takes it — a post nobody
      // has been assigned is their queue, not an ownerless pile.
      (p) => captionOwner(p),
      todayIso,
    ),
    [posts, todayIso],
  );
  const captionStats = useMemo(() => queueSummary(captionQueue), [captionQueue]);
  const [queueOpen, setQueueOpen] = useState(false);
  const canAssign = canAssignCaption(role);

  const summary = useMemo(() => ({
    posts: items.length,
    waitingApproval: items.filter((c) => c.approvalStatus === "Waiting Approval").length,
    waitingAsset: items.filter((c) => c.assetStatus === "Waiting Design" || c.assetStatus === "Missing").length,
    scheduled: items.filter((c) => ["Scheduled in OS", "Queued", "Scheduled to Meta", "Publishing"].includes(c.publishStatus)).length,
  }), [items]);

  // Planning a post no longer raises a graphic request as a side effect. The
  // two are separate records linked by campaign + post id: what the artwork is,
  // which sizes, and when Creative must deliver it are decisions the requester
  // often does not have while filling in a publish date, and print work (POSM,
  // menus) had to be faked as a post just to reach the Creative queue.
  // `askGraphic` carries the intent onward — the post is saved first so the
  // brief can point at a real post id.
  const addPost = async (p: ContentItem, briefItem: BriefContentItem, campaign: string, campaignId: string | undefined, askGraphic: boolean) => {
    const requester = briefItem.requester?.trim() || me;
    const designer = briefItem.designer || "Unassigned";
    const approver = briefItem.approver?.trim() || requester;
    const normalizedBriefItem: BriefContentItem = { ...briefItem, requester, designer, approver };
    const sourceContentItemId = isTemplateContentId(briefItem.id) ? uniqueNewPostId("ci-cal") : briefItem.id;
    const post: ContentItem = {
      ...p,
      requester,
      designer,
      approver,
      campaignId,
      sourceContentItemId,
      // "Waiting Design" is earned by an actual brief, not by intending to
      // raise one — abandoning the form on /graphic would otherwise leave the
      // post waiting forever on work nobody requested. Submitting the brief
      // flips it (see addGraphic).
      assetStatus: "No Asset",
    };
    const created = await createContent(post);
    setPosts((ps) => [created, ...ps]);
    setNewOpen(false);
    // Two-way sync: write the full content-item back into its campaign's Content Plan.
    if (campaign && campaign !== "—") {
      appendBriefItem(campaign, { ...normalizedBriefItem, id: sourceContentItemId })
        .catch((error) => toastError(`บันทึก Post แล้ว แต่ sync กลับ Campaign Plan ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    if (askGraphic) router.push(`/graphic?${GRAPHIC_BRIEF_FOR_PARAM}=${encodeURIComponent(created.id)}`);
  };

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="CONTENT PLAN"
        title="Content Plan"
        description="Plan, caption, approve, schedule, and publish every post from one shared calendar."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={() => openNew()} className="text-[13px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Plan Post</button>}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[12px] text-faint pointer-events-none">🔍</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ค้นหา content / campaign…"
                    className="w-[230px] text-[12px] rounded-pill border border-line2 bg-white pl-[30px] pr-[28px] py-[8px] outline-none focus:border-[#6C5CE7]"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      title="ล้างคำค้น"
                      className="absolute right-[9px] top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <BrandFilter value={brand} onChange={setBrand} label="" />
                <select
                  value=""
                  onChange={(e) => {
                    const picked = savedViews.find((v) => v.name === e.target.value);
                    if (picked) applySavedView(picked);
                  }}
                  className="text-[12px] font-bold rounded-pill border border-line2 bg-white px-3 py-[8px] text-muted outline-none"
                  title="Apply saved view"
                >
                  <option value="">Saved views</option>
                  {savedViews.map((saved) => <option key={saved.name} value={saved.name}>{saved.name}</option>)}
                </select>
                <input
                  value={savedViewName}
                  onChange={(e) => setSavedViewName(e.target.value)}
                  placeholder="name this view"
                  className="w-[140px] text-[12px] rounded-pill border border-line2 bg-white px-3 py-[8px] outline-none"
                />
                <button
                  onClick={saveCurrentView}
                  className="text-[12px] font-bold rounded-pill bg-[#F2EEFF] px-3 py-[8px] text-[#6C5CE7]"
                >
                  Save view
                </button>
                <span className="text-[12px] font-semibold text-faint">
                  {terms.length > 0 ? `พบ ${items.length} โพสต์` : `${items.length} posts in view`}
                </span>
                {hiddenByDate > 0 && (
                  <button
                    onClick={searchEverywhere}
                    className="text-[11.5px] font-bold rounded-pill px-3 py-[7px]"
                    style={{ background: "#FBF8EE", color: "#C68A1E", border: "1px solid #EFE2C4" }}
                  >
                    อีก {hiddenByDate} โพสต์อยู่นอกช่วงวันที่ · ค้นทุกช่วงเวลา →
                  </button>
                )}
                {(view === "month" || view === "week") && (
                  <button
                    onClick={() => setShowKol(!showKol)}
                    aria-pressed={showKol}
                    title="แสดง/ซ่อนโพสต์ KOL บนปฏิทิน — ช่วยให้เห็นว่าวันไหนคอนเทนต์ชนกัน"
                    className="flex items-center gap-[6px] rounded-[10px] border px-[10px] py-[6px] text-[12px] font-bold transition"
                    style={showKol
                      ? { background: KOL_LAYER.bg, borderColor: KOL_LAYER.border, color: KOL_LAYER.fg }
                      : { background: "#fff", borderColor: "#E3DED4", color: "#9A9387" }}>
                    <span className="w-[14px] h-[14px] rounded-[4px] flex items-center justify-center text-[9px] font-extrabold"
                      style={{ background: showKol ? KOL_LAYER.fg : "#D7D2C8", color: "#fff" }}>
                      {showKol ? "✓" : ""}
                    </span>
                    โพสต์ KOL{kolLayer.length > 0 ? ` (${kolLayer.length})` : ""}
                  </button>
                )}
              </div>
              <div className="flex items-center rounded-[16px] border border-[#E4DEFA] bg-[#F4F1FF] p-[4px] shadow-[0_8px_22px_rgba(108,92,231,0.08)]">
                {[
                  { value: "month", label: "Month" },
                  { value: "week", label: "Week" },
                  { value: "list", label: "List" },
                  { value: "queue", label: "🚀 Queue" },
                  { value: "campaign", label: "🎯 Campaign" },
                ].map((option) => {
                  const active = view === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setView(option.value as View)}
                      className="min-w-[88px] rounded-[12px] px-4 py-[10px] text-[12px] font-extrabold whitespace-nowrap transition"
                      style={{
                        background: active ? "linear-gradient(135deg, #7C6CF6, #5B4FD8)" : "transparent",
                        color: active ? "#FFFFFF" : "#8A879A",
                        boxShadow: active ? "0 8px 18px rgba(108,92,231,.18)" : undefined,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard
          title="Content Plan Summary"
          titleClassName="text-[#5A4FB2]"
          style={{
            background: "linear-gradient(180deg, #F3EEFF 0%, #ECE5FF 100%)",
            border: "1px solid #DDD1FF",
            boxShadow: "0 18px 44px rgba(108, 92, 231, 0.12)",
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Posts in view", value: summary.posts, note: "Current brand + date filters" },
              { label: "Waiting approval", value: summary.waitingApproval, note: "Needs approver action" },
              { label: "Waiting asset", value: summary.waitingAsset, note: "Graphic or asset still missing" },
              { label: "Scheduled / queued", value: summary.scheduled, note: "Ready in the publish line" },
            ].map((item) => (
              <div key={item.label} className="rounded-[20px] border px-4 py-4 bg-white/60" style={{ borderColor: "#DDD1FF" }}>
                <div className="text-[11px] uppercase tracking-[0.08em] text-[#766D98] font-bold">{item.label}</div>
                <div className="mt-3 text-[28px] leading-none font-extrabold text-[#2C2553]">{item.value}</div>
                <div className="mt-2 text-[11px] text-[#7D778F]">{item.note}</div>
              </div>
            ))}
          </div>
        </ModuleSummaryCard>

      </div>

      {/* Unassigned captions. Same shape as the Graphic page's 🙋 banner so the
          team reads one pattern for "work nobody has picked up", and equally
          NOT month-filtered — see captionQueue. */}
      {captionQueue.length > 0 && (
        <div className="mt-4 rounded-cardLg border overflow-hidden"
          style={captionStats.stuck > 0
            ? { background: AGE_META.stuck.bg, borderColor: "#F5C8C4" }
            : { background: AGE_META.slow.bg, borderColor: "#F0C89B" }}>
          <button onClick={() => setQueueOpen((o) => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
            <span className="text-[11px] w-3" style={{ color: captionStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>{queueOpen ? "▾" : "▸"}</span>
            <span className="text-[13px] font-extrabold" style={{ color: captionStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>
              ✍️ แคปชั่นรอมอบหมาย {captionStats.total} งาน
            </span>
            <span className="text-[11.5px] font-semibold" style={{ color: captionStats.stuck > 0 ? AGE_META.stuck.fg : AGE_META.slow.fg }}>
              {captionStats.stuck > 0
                ? `· ${captionStats.stuck} งานรอเกิน ${ASSIGN_STUCK_DAYS} วัน (นานสุด ${captionStats.oldest} วัน)`
                : captionStats.oldest !== null ? `· รอนานสุด ${captionStats.oldest} วัน` : ""}
            </span>
            <span className="ml-auto text-[11px] font-semibold text-muted">
              {canAssign ? "Creative Leader มอบหมาย" : "ทุกเดือน ไม่ใช่แค่เดือนที่เลือก"}
            </span>
          </button>
          {queueOpen && (
            <div className="bg-surface border-t" style={{ borderColor: "#EFE7DA" }}>
              {captionQueue.slice(0, 30).map(({ item, days, level }) => (
                <button key={item.id} onClick={() => setOpen(item)}
                  className="w-full px-4 py-2 border-b border-line4 last:border-0 flex items-center gap-3 text-left hover:bg-ivory/60">
                  <span className="text-[11px] font-bold rounded-pill px-2 py-[2px] whitespace-nowrap"
                    style={{ background: AGE_META[level].bg, color: AGE_META[level].fg }}>
                    {days === null ? "ไม่ทราบ" : `รอ ${days} วัน`}
                  </span>
                  <span className="text-[12.5px] font-semibold truncate min-w-0">{item.title}</span>
                  <span className="ml-auto text-[11px] text-faint whitespace-nowrap">{item.campaign} · {item.captionStatus}</span>
                </button>
              ))}
              {captionQueue.length > 30 && (
                <div className="px-4 py-2 text-[11px] text-faint">แสดง 30 จาก {captionQueue.length} — เปิดโพสต์เพื่อมอบหมายทีละใบ</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* What the Team Calendar says is due for the month on screen. */}
      <div className="mt-4">
        <DeadlineStrip forMonth={ymKey} />
      </div>

      {/* A search with no hits replaces the views outright — an empty calendar
          under an empty table reads as two different problems. */}
      {terms.length > 0 && items.length === 0 ? (
        <div className="mt-5 border-2 border-dashed border-line2 rounded-cardLg p-10 text-center">
          <div className="text-[14px] font-bold text-ink">ไม่พบ content หรือ campaign ที่ตรงกับ “{query.trim()}”</div>
          <div className="text-[12px] text-faint mt-1">
            {hiddenByDate > 0
              ? `มี ${hiddenByDate} โพสต์ที่ตรงกันอยู่นอกช่วงวันที่ที่เลือก — กด “ค้นทุกช่วงเวลา” ด้านบน`
              : "ลองคำสั้นลง หรือเช็คตัวกรองแบรนด์ / ช่วงวันที่"}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          {/* The KOL layer is filtered by the same words — leaving it unfiltered
              put unrelated KOL posts on a calendar the search had just emptied,
              which reads as a hit. */}
          {view === "month" && <MonthView items={items} year={gy} month={gm} onOpen={setOpen} onNew={openNew} kolPosts={kolLayer} />}
          {view === "week" && <WeekView items={items} monthName={MON[gm]} onOpen={setOpen} kolPosts={kolLayer} />}
          {view === "list" && <ListView items={items} onOpen={setOpen} onNew={openNew} canEditStatus={canEditStatus} onStatus={setStatus} />}
          {view === "queue" && <QueueView items={items} onOpen={setOpen} />}
          {view === "campaign" && <CampaignView items={items} onOpen={setOpen} onNew={openNew} canEditStatus={canEditStatus} onStatus={setStatus} />}
        </div>
      )}

      {open && (
        // Keyed by post id: the drawer seeds caption/hashtags/CTA/footer into
        // useState from `item`, which only runs on mount. Clicking a second post
        // in the list while the drawer is open swaps `item` without remounting,
        // so those fields kept the previous post's text and "Save Caption" wrote
        // it onto the wrong post. Editing a post keeps its id, so this only
        // remounts when the drawer actually changes posts.
        <ContentDrawer
          key={open.id}
          item={open}
          // Every post the drawer can compare against — used to flag another
          // post of the same brand already planned for the same day.
          allPosts={posts}
          onClose={() => setOpen(null)}
          onUpdate={(next) => {
            setOpen(next);
            setPosts((ps) => ps.map((p) => (p.id === next.id ? next : p)));
          }}
          onDelete={(deleted) => {
            setPosts((ps) => ps.filter((p) => p.id !== deleted.id));
            setOpen(null);
          }}
        />
      )}
      {newOpen && <NewPostModal onClose={() => setNewOpen(false)} onCreate={addPost} count={posts.length} initialIso={newIso} />}
    </>
  );
}

function NewPostModal({ onClose, onCreate, count: _count, initialIso }: { onClose: () => void; onCreate: (p: ContentItem, briefItem: BriefContentItem, campaign: string, campaignId: string | undefined, askGraphic: boolean) => Promise<void>; count: number; initialIso?: string | null }) {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [b, setB] = useState<BrandId>(brandOptions[0] ?? "teppen");
  const [campaign, setCampaign] = useState("");
  const [time, setTime] = useState("10:00");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  // Campaigns arrive async. Without this flag an empty list reads the same
  // while loading as when there genuinely are none, and the picker told users
  // "No campaigns for this brand" for a brand that has eight.
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Off by default: a post that needs no new artwork is the common case once
  // artwork stops being implied by planning a post.
  const [askGraphic, setAskGraphic] = useState(false);
  const { member, user } = useAuth();
  const me = member?.name || user?.email?.split("@")[0] || "You";
  const requestDate = new Date().toISOString().slice(0, 10);
  // Same content-item "template" as the Campaign Builder's Content Plan.
  const [item, setItem] = useState<BriefContentItem>(() => {
    const it = emptyContentItem(1);
    const seeded = { ...it, id: uniqueNewPostId("ci-cal"), requester: me, approver: me };
    return initialIso ? { ...seeded, publishDate: initialIso } : seeded;
  });
  const onChange = (patch: Partial<BriefContentItem>) => setItem((it) => ({ ...it, ...patch }));

  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {}).finally(() => { if (alive) setCampaignsLoaded(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!brandOptions.includes(b)) setB(brandOptions[0] ?? "teppen"); }, [b, brandOptions]);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === b), [campaigns, b]);
  // Two campaigns can share a name; the picker lists each name once so the
  // dropdown does not show an unpickable duplicate row.
  const brandCampaignNames = useMemo(() => Array.from(new Set(brandCampaigns.map((c) => c.name))), [brandCampaigns]);
  const selectedCampaign = useMemo(() => brandCampaigns.find((c) => c.name === campaign), [brandCampaigns, campaign]);
  useEffect(() => {
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign]);

  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  // Graphic due date / asset sizes moved to the brief form, so nothing about
  // artwork is validated here any more — only what makes a post a post.
  const canCreate = !!item.title.trim() && item.platforms.length > 0 && !!selectedCampaign;
  const missing = [
    !campaign.trim() ? "campaign" : null,
    campaign.trim() && !selectedCampaign ? "campaign from the list" : null,
    !item.title.trim() ? "post title" : null,
    !item.platforms.length ? "platform" : null,
  ].filter(Boolean) as string[];
  const create = async () => {
    if (!canCreate || saving) return;
    setSaving(true);
    setSaveError("");
    const iso = item.publishDate || initialIso || new Date().toISOString().slice(0, 10);
    const day = Math.max(1, Math.min(31, Number(iso.split("-")[2]) || 1));
    const postId = uniqueNewPostId("c-cal");
    const post: ContentItem = {
      id: postId,
      day, dateIso: iso, time, title: item.title.trim(), b, plat: item.platforms[0] ?? "Instagram", platforms: item.platforms,
      status: "Draft", campaign: campaign.trim(), owner: me,
      caption: "", hashtags: "", cta: "",
      captionStatus: "Missing", assetStatus: "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    };
    try {
      await onCreate(post, { ...item, requiredGraphic: askGraphic }, campaign.trim(), selectedCampaign?.id, askGraphic);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="mb-4 flex items-start justify-between gap-8 pr-8">
          <div>
            <div className="text-[16px] font-extrabold mb-1">Plan New Post</div>
            <div className="text-[12px] text-faint">ฟอร์มเดียวกับ Content Plan — บันทึกแล้ว sync กลับเข้า Campaign อัตโนมัติ</div>
          </div>
          <div className="rounded-[12px] border border-[#DDD1FF] bg-[#F7F2FF] px-3 py-2 text-right">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#7D70CC]">Request date</div>
            <div className="text-[12px] font-extrabold text-[#2C2553]">{requestDate}</div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
              <select value={b} onChange={(e) => setB(e.target.value as BrandId)} className={field}>
                {brandOptions.map((id) => <option key={id} value={id}>{brandVisibility.brandNames[id] ?? BRANDS[id].name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign <span style={{ color: "#B33A2E" }}>*</span></label>
              {/* Type-to-search over this brand's campaigns. Only a real campaign
                  is accepted (the post has to sync back to one), so the box never
                  keeps free text. */}
              <Combobox
                value={campaign}
                onChange={setCampaign}
                options={brandCampaignNames}
                disabled={brandCampaigns.length === 0}
                inputClassName={field}
                placeholder={!campaignsLoaded ? "กำลังโหลดแคมเปญ…" : brandCampaigns.length ? "พิมพ์เพื่อค้นหา campaign…" : "แบรนด์นี้ยังไม่มีแคมเปญ"}
                emptyLabel="ไม่พบ campaign ที่ตรงกับที่พิมพ์"
              />
              {campaign.trim() && !selectedCampaign && <div className="mt-1 text-[11px] font-semibold text-status-red">เลือก Campaign จากรายการที่มีอยู่ เพื่อให้ sync กลับ Campaign ได้ถูกต้อง</div>}
            </div>
          </div>
          {/* Shared content-item template — post fields only; artwork lives in
              the graphic brief now. */}
          <ContentItemForm item={item} onChange={onChange} requesterFallback={me} requestDate={requestDate} publishTime={time} onPublishTimeChange={setTime} showGraphicFields={false} />

          {/* Hand-off to Creative. Ticked, saving continues straight into the
              brief form with this post already linked. */}
          <label className="flex items-start gap-[10px] rounded-[14px] border border-[#DDD1FF] bg-[#F7F2FF] px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={askGraphic} onChange={(e) => setAskGraphic(e.target.checked)} className="mt-[2px]" />
            <span>
              <span className="block text-[12.5px] font-bold text-[#2C2553]">🎨 โพสต์นี้ต้องใช้งานกราฟฟิกใหม่</span>
              <span className="block text-[11px] text-[#7D70CC] mt-[2px]">
                บันทึกแล้วจะพาไปเปิดฟอร์ม Graphic Brief ต่อ โดยผูกกับโพสต์นี้ให้อัตโนมัติ — ไซซ์ artwork และวันส่งงานกรอกที่นั่น
              </span>
            </span>
          </label>
        </div>
        <div className="mt-5 rounded-[16px] border px-4 py-3" style={{ background: canCreate ? "#EEF8E8" : "#FBF6EC", borderColor: canCreate ? "#CFE4C2" : "#EADBC1" }}>
          <div className="text-[12px] font-bold" style={{ color: canCreate ? "#3F6A34" : "#8A6D1E" }}>
            {canCreate ? (askGraphic ? "Ready — บันทึกแล้วไปต่อที่ Graphic Brief" : "Ready to save into Content Plan") : `Before saving, add ${missing.join(", ")}`}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: canCreate ? "#5A7A4D" : "#9A8460" }}>
            Publish date / time stays editable later, and Campaign sync will start as soon as this post is saved.
          </div>
        </div>
        {saveError && (
          <div className="mt-3 rounded-[12px] border border-status-red/30 bg-[#FBF3F1] px-4 py-3 text-[12px] font-semibold text-status-red">
            บันทึกไม่สำเร็จ: {saveError}
          </div>
        )}
        <button onClick={create} disabled={!canCreate || saving} className="w-full mt-4 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">{saving ? "Saving…" : "Save to Content Plan"}</button>
      </div>
    </div>
  );
}

function MonthView({ items, year, month, onOpen, onNew, kolPosts = [] }: { items: ContentItem[]; year: number; month: number; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void; kolPosts?: KolCalendarPost[] }) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ymKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line4">
        {DOW.map((d) => <div key={d} className="text-[10.5px] font-bold text-faint uppercase tracking-[0.05em] px-2 py-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const dayIso = day ? `${ymKey}-${String(day).padStart(2, "0")}` : "";
          const dayItems = day ? items.filter((c) => contentDateIso(c) === dayIso) : [];
          const dayKols = day ? kolPosts.filter((k) => k.date === dayIso) : [];
          return (
            <div key={i} className="group min-h-[104px] border-r border-b border-line4 p-[6px] last:border-r-0 relative" style={{ background: day ? "#fff" : "#FBF9F4" }}>
              {day && (
                <div className="flex items-center justify-between mb-1 px-1">
                  <span className="text-[11px] font-bold text-faint">{day}</span>
                  <button onClick={() => onNew(day)} title="New post" className="opacity-0 group-hover:opacity-100 transition text-[13px] leading-none text-accent font-bold w-4 h-4 flex items-center justify-center">+</button>
                </div>
              )}
              <div className="flex flex-col gap-[3px]">
                {dayItems.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onOpen(c)}
                    className="w-full text-left flex items-center gap-[5px] rounded-[6px] px-[5px] py-[3px] hover:bg-ivory transition border-l-[4px]"
                    style={{ background: "#FAF8F4", borderColor: "#F0EBE0", borderLeftColor: campaignAccent(c.campaign) }}
                    title={`${c.campaign} · ${c.title}`}
                  >
                    <PlatBadges item={c} />
                    <span className="text-[10.5px] font-semibold truncate flex-1">{c.title}</span>
                  </button>
                ))}
                {dayKols.map((k) => <KolChip key={k.collab_id} k={k} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ items, monthName, onOpen, kolPosts = [] }: { items: ContentItem[]; monthName: string; onOpen: (c: ContentItem) => void; kolPosts?: KolCalendarPost[] }) {
  // Days come from both layers, so a day with only KOL activity still shows up.
  const byDate = [...new Set([...items.map((c) => contentDateIso(c)), ...kolPosts.map((k) => k.date)])].filter(Boolean).sort();
  return (
    <div className="flex flex-col gap-3">
      {byDate.map((iso) => (
        <div key={iso} className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-2 text-[12px] font-bold border-b border-line4">{labelDate(iso) || `${monthName} ${Number(iso.slice(8, 10))}`}</div>
          {items.filter((c) => contentDateIso(c) === iso).sort((a, b) => a.time.localeCompare(b.time)).map((c) => <Row key={c.id} c={c} onOpen={onOpen} />)}
          {kolPosts.filter((k) => k.date === iso).map((k) => (
            <div key={k.collab_id} className="px-5 py-2 border-b border-line4 last:border-b-0"><KolChip k={k} /></div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Row({ c, onOpen }: { c: ContentItem; onOpen: (c: ContentItem) => void }) {
  const codeOf = useCampaignCodes();
  // last:border-b-0, not last:border-0: border-0 would also drop the 5px
  // campaign colour bar on the left, shifting the last row's columns 5px out of
  // line with the rows above it.
  return (
    <button onClick={() => onOpen(c)} className="w-full grid grid-cols-[52px_1fr_auto] gap-3 items-center px-5 py-[11px] text-left border-b border-line4 last:border-b-0 hover:bg-ivory/60 border-l-[5px]" style={{ borderLeftColor: campaignAccent(c.campaign) }}>
      <span className="text-[11px] font-bold text-faint">{c.time}</span>
      <div className="flex items-center gap-2 min-w-0">
        <PlatBadges item={c} size={18} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate flex items-center gap-[6px]">
            <span className="truncate">{c.title}</span>
            <WorkCode code={c.code} />
          </div>
          <div className="text-[11px] text-faint flex items-center gap-[5px]">
            <BrandDot brand={c.b} size={6} />{brandName(c.b)} · {c.campaign}
            <CampaignCode code={codeOf(c.campaignId, c.campaign)} />
          </div>
        </div>
      </div>
      <StatusBadge tone={contentTone(c.status)}>{c.status}</StatusBadge>
    </button>
  );
}


/** Campaign view — Platform-Performance-style collapsible groups: one row per
 *  campaign with summary stats, expandable to the post list inside. */
function CampaignView({ items, onOpen, onNew, canEditStatus = false, onStatus }: { items: ContentItem[]; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void; canEditStatus?: boolean; onStatus?: (c: ContentItem, patch: Partial<ContentItem>) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const codeOf = useCampaignCodes();
  const groups = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const c of items) { const k = c.campaign || "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
    // Campaigns run in calendar order, not alphabetical — the team reads this
    // view as a schedule, and A-Z put next quarter above this week. Each
    // campaign sorts by its earliest post; posts inside sort by schedule.
    for (const list of m.values()) list.sort(bySchedule);
    return Array.from(m.entries())
      .sort((a, b) => (a[1][0] ? contentDateIso(a[1][0]) : "").localeCompare(b[1][0] ? contentDateIso(b[1][0]) : "")
        || a[0].localeCompare(b[0]));
  }, [items]);
  if (groups.length === 0) return <ListView items={items} onOpen={onOpen} onNew={onNew} canEditStatus={canEditStatus} onStatus={onStatus} />;
  const chip = (label: string, value: number, fg: string, bg: string) => value > 0 && (
    <span key={label} className="rounded-pill px-2.5 py-[3px] text-[10.5px] font-bold" style={{ color: fg, background: bg }}>{value} {label}</span>
  );
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([campaign, list]) => {
        const isOpen = openGroups[campaign] ?? true;
        const waitingApproval = list.filter((c) => c.approvalStatus === "Waiting Approval").length;
        const waitingAsset = list.filter((c) => c.assetStatus === "Waiting Design" || c.assetStatus === "Missing").length;
        const scheduled = list.filter((c) => ["Scheduled in OS", "Queued", "Scheduled to Meta", "Publishing"].includes(c.publishStatus)).length;
        const published = list.filter((c) => c.publishStatus === "Published").length;
        return (
          <div key={campaign} className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <button onClick={() => setOpenGroups((o) => ({ ...o, [campaign]: !(o[campaign] ?? true) }))}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-ivory/60">
              {isOpen ? <span className="text-faint text-[13px]">▾</span> : <span className="text-faint text-[13px]">▸</span>}
              <span className="text-[13px] font-extrabold text-ink">🎯 {campaign}</span>
              {/* Grouping is by name, but the posts inside carry the campaign id —
                  so the code comes from the row, not from matching the name. */}
              <CampaignCode code={codeOf(list[0]?.campaignId, campaign)} />
              <span className="text-[11.5px] text-faint font-semibold">{list.length} post{list.length > 1 ? "s" : ""}</span>
              <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                {chip("waiting approval", waitingApproval, "#C68A1E", "#FBF8EE")}
                {chip("waiting asset", waitingAsset, "#B33A2E", "#FFF5F4")}
                {chip("scheduled", scheduled, "#3E5C9A", "#EEF1F8")}
                {chip("published", published, "#4E7A4E", "#EEF4EE")}
              </span>
            </button>
            {isOpen && <div className="border-t border-line4"><ListView items={list} onOpen={onOpen} onNew={onNew} canEditStatus={canEditStatus} onStatus={onStatus} /></div>}
          </div>
        );
      })}
    </div>
  );
}

const PUBLISH_OPTS = ["Draft", "Scheduled in OS", "Queued", "Published"];

/** Inline status cell: an editable dropdown for the creative team, a read-only
 *  badge for everyone else. Stops row-click so editing never opens the drawer. */
function StatusCell({ value, opts, canEdit, onChange }: { value: string; opts: string[]; canEdit: boolean; onChange: (v: string) => void }) {
  if (!canEdit) return <StatusBadge tone={contentTone(value)}>{value}</StatusBadge>;
  const options = opts.includes(value) ? opts : [value, ...opts];
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
      className="text-[11.5px] font-bold rounded-[9px] px-2 py-[5px] border border-line2 bg-white text-ink outline-none cursor-pointer max-w-[130px]"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** The single downloadable asset of a post, or null when it has none — or more
 *  than one, where picking for the user would be guessing. */
function assetDownload(c: ContentItem): string | null {
  const links = (c.assets ?? []).map((a) => assetLinkView(a.link).downloadUrl).filter(Boolean) as string[];
  const unique = Array.from(new Set(links));
  return unique.length === 1 ? unique[0] : null;
}

/** One literal for the header and the rows. minmax(0, …) rather than a bare
 *  `2fr`: a bare fr is minmax(auto, 2fr), so a long post title or a work-code
 *  pill sets a min-content floor that widens that row's column only — and since
 *  every row is its own grid, the row then sits out of step with the header. */
const CONTENT_LIST_COLS = "70px minmax(0,2fr) minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)";

function ListView({ items, onOpen, onNew, canEditStatus = false, onStatus }: { items: ContentItem[]; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void; canEditStatus?: boolean; onStatus?: (c: ContentItem, patch: Partial<ContentItem>) => void }) {
  const active = items.filter((c) => !isPostFinished(c));
  const finished = items.filter(isPostFinished);
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-[10px] border-b border-line4" style={{ background: "#FBF9F4" }}>
        <span className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold">Content schedule{canEditStatus && <span className="ml-2 normal-case font-semibold text-[10px] text-accent">· แก้ Publish ในแถวได้</span>}</span>
        <button onClick={() => onNew()} className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[6px]">+ Plan Post</button>
      </div>
      {/* The same 5px left border the rows carry, transparent here: without it
          the header sits 5px left of every cell it labels. */}
      <div className="hidden md:grid gap-x-2 px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4 border-l-[5px] border-l-transparent"
        style={{ gridTemplateColumns: CONTENT_LIST_COLS }}>
        <div>Post date</div><div>Content</div><div>Content ID</div><div>Caption status</div><div>Asset</div><div>Publish</div>
      </div>
      {active.sort(bySchedule).map((c) => <ContentListRow key={c.id} c={c} onOpen={onOpen} canEditStatus={canEditStatus} onStatus={onStatus} />)}
      {/* Posts that already went out, folded under the work that hasn't. */}
      <FinishedFold count={finished.length} storageKey="mos-content-list-finished" label="โพสต์แล้ว">
        {finished.sort(bySchedule).map((c) => <ContentListRow key={c.id} c={c} onOpen={onOpen} canEditStatus={canEditStatus} onStatus={onStatus} />)}
      </FinishedFold>
      {items.length === 0 && (
        <div className="px-5 py-10 text-center">
          <div className="inline-flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[#DDD1FF] bg-[#F7F2FF] px-6 py-5">
            <div className="text-[13px] font-bold text-[#5A4FB2]">No posts in this view yet</div>
            <div className="text-[11.5px] text-[#7D778F]">Try another brand or date range, or start by planning the first post.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContentListRow({ c, onOpen, canEditStatus = false, onStatus }: { c: ContentItem; onOpen: (c: ContentItem) => void; canEditStatus?: boolean; onStatus?: (c: ContentItem, patch: Partial<ContentItem>) => void }) {
  return (
          <div onClick={() => onOpen(c)} className="w-full grid grid-cols-1 md:[grid-template-columns:var(--content-cols)] gap-x-2 gap-y-1 items-center px-5 py-3 text-left border-b border-line4 last:border-b-0 hover:bg-ivory/60 border-l-[5px] cursor-pointer" style={{ borderLeftColor: campaignAccent(c.campaign), "--content-cols": CONTENT_LIST_COLS } as CSSProperties}>
            {/* Real publish date from dateIso — never a hardcoded month. */}
            <span className="text-[11px] font-bold text-faint">{labelDate(contentDateIso(c))}</span>
            <div className="flex items-center gap-2 min-w-0">
              {/* Delivered artwork, right in the plan — no need to open the post
                  to check which asset is attached. */}
              <AssetThumb assets={c.assets} mediaLink={c.mediaLink} />
              <PlatBadges item={c} size={18} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">{c.title}</div>
                <div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={c.b} size={6} />{captionOwner(c) || "ยังไม่มอบหมาย"}</div>
              </div>
            </div>
            {/* Content ID: the post's job number, in FULL. The campaign column is
                gone from this view, so a bare "C01" would name nothing — the full
                code carries its campaign inside it and stays unique on its own. */}
            <span className="min-w-0"><WorkCode code={c.code} full /></span>
            <StatusBadge tone={contentTone(c.captionStatus)}>{c.captionStatus}</StatusBadge>
            <div className="flex items-center gap-[6px] min-w-0">
              <StatusBadge tone={contentTone(c.assetStatus)}>{c.assetStatus}</StatusBadge>
              {/* Grab the delivered file without opening the post. Multi-asset
                  posts open the drawer instead — that is where the whole set,
                  with previews, lives. */}
              {assetDownload(c) && (
                <a href={assetDownload(c)!} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  title="ดาวน์โหลด asset" className="text-[11.5px] font-bold text-status-green flex-shrink-0">⬇</a>
              )}
            </div>
            <StatusCell value={c.publishStatus} opts={PUBLISH_OPTS} canEdit={canEditStatus} onChange={(v) => onStatus?.(c, { publishStatus: v })} />
          </div>
  );
}

function QueueView({ items, onOpen }: { items: ContentItem[]; onOpen: (c: ContentItem) => void }) {
  const queue = items.filter((c) => ["Scheduled in OS", "Queued", "Scheduled to Meta", "Publishing", "Published", "Failed"].includes(c.publishStatus)).sort(bySchedule);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-cardLg px-4 py-3 text-[12px]" style={{ background: "#EEF3FF", border: "1px solid #C5D4F8", color: "#1E3A8A" }}>
        🚀 <b>Publish Queue</b> — scheduled posts appear here. Auto-publish activates once Meta is connected; until then posts are marked <b>Manual post required</b>.
      </div>
      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        {queue.map((c) => {
          return (
            <div key={c.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-5 py-3 border-b border-line4 last:border-0">
              <PlatBadges item={c} size={18} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">{c.title}</div>
                <div className="text-[11px] text-faint">{brandName(c.b)} · {labelDate(contentDateIso(c))}, {c.time}</div>
              </div>
              <StatusBadge tone={contentTone(c.publishStatus)}>{c.publishStatus}</StatusBadge>
              <button onClick={() => onOpen(c)} className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[5px]">Review post ↗</button>
            </div>
          );
        })}
        {queue.length === 0 && (
          <div className="px-5 py-10 text-center">
            <div className="inline-flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[#C5D4F8] bg-[#F5F8FF] px-6 py-5">
              <div className="text-[13px] font-bold text-[#3150A6]">Nothing in the publish queue yet</div>
              <div className="text-[11.5px] text-[#6C7AA6]">Once a post is scheduled or queued, it will appear here for final review.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
