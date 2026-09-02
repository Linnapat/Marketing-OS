"use client";

import { toastError, toastSuccess } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { workLink } from "@/lib/deepLink";
import { ContentItem, contentTone, platIcon, itemPlatforms, contentWarnings, preflight, canPublish, contentApproveBlockers, advanceApprovalState, captionStatusAfterRevision, sameDayWarning, moveToCampaign, withChange, captionAwaitsApproval, captionApproved, captionOwner, realName, captionReviewer } from "@/lib/data/content";
import { brandName, brandColor } from "@/lib/brands";
import { stamp } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateContent, deleteContent, approveContent, publishContent, scheduleContentToMeta, publishContentToMeta } from "@/lib/db/content";
import { createRevisionTask } from "@/lib/db/tasks";
import { fetchMetaPublishingAccounts, hasMetaAccount, MetaBrandAccount } from "@/lib/db/metaPublishing";
import { useBrandMarketer } from "@/lib/useBrandMarketer";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { notify } from "@/lib/notify";
import { CAPTION_NOTIFY_TEAM, decideCaption as decideCaption_ } from "@/lib/captionDecision";
import { DatePicker } from "@/components/ui/DatePicker";
import { ExpandableTextarea } from "@/components/ui/ExpandableTextarea";
import { WorkCode } from "@/components/ui/CampaignCode";
import { issueContentCode } from "@/lib/db/workCode";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { CaptionTemplateStore, TemplateKind, forgetTemplate, rememberTemplate, templatesFor } from "@/lib/data/captionTemplates";
import { fetchCaptionTemplates, saveCaptionTemplates } from "@/lib/db/captionTemplates";
import { AssetLinkList } from "@/components/content/AssetLinkList";
import { assetLinkView, heroPreview } from "@/lib/data/assetLinks";
import { GRAPHIC_BRIEF_FOR_PARAM, GRAPHIC_OPEN_PARAM, Graphic, WORK_KIND_LABEL, workKind, contentEditLock, withNotice, creativeBriefLink } from "@/lib/data/graphic";
import { fetchGraphicsForPost, updateGraphic } from "@/lib/db/graphic";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { detachBriefContentItem } from "@/lib/db/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { canEditContentPlan, canAssignCaption, canMarkMediaReleased, canDecideCaption, CAPTION_WRITER_ROLES } from "@/lib/roleGates";
import { TRASH_RETENTION_DAYS } from "@/lib/db/trash";

const TABS = [["overview", "Overview"], ["caption", "Caption"], ["approval", "Approval"], ["publish", "Publish"]] as const;
type DTab = (typeof TABS)[number][0];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


/** The saved-set picker under a caption field. Footers carry branch details and
 *  run long, so each chip truncates and keeps the full text in its tooltip. */
function TemplateChips({ values, bg, fg, onPick, onRemove }: {
  values: string[];
  bg: string;
  fg: string;
  onPick: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  return (
    <>
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-[5px] rounded-pill px-[10px] py-1 text-[11px] font-bold" style={{ background: bg, color: fg }}>
          {/* Saved sets are multi-line now that Footer/CTA are. A newline inside
              a pill collapses to nothing visible, so the label flattens the
              breaks to " · " — picking it still restores the real text, and the
              tooltip shows it as it will actually be written. */}
          <button onClick={() => onPick(v)} title={v} className="max-w-[170px] truncate">{v.replace(/\s*\n+\s*/g, " · ")}</button>
          <button onClick={() => onRemove(v)} aria-label={`ลบชุดนี้: ${v}`} title="ลบชุดนี้" className="opacity-45 hover:opacity-100">
            <X size={11} />
          </button>
        </span>
      ))}
    </>
  );
}

/** The one strip that says WHAT this post is: the kind of work, its type, and
 *  the link to the brief itself.
 *
 *  Whoever writes the caption had only the content title to go on — nothing said
 *  whether they were writing for an artwork or a video edit, and the brief deck
 *  the words are supposed to follow was not reachable from here at all. The only
 *  way to check was to open Graphic Request and find the row by eye. Rendered
 *  wherever the caption is written, so the pop-out carries it too. */
function LinkedGraphicStrip({ graphic, extra = 0 }: { graphic: Graphic | null; extra?: number }) {
  if (!graphic) return null;
  const kind = workKind(graphic.type, graphic.requiredVideo);
  const brief = creativeBriefLink(graphic);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <StatusBadge tone={kind === "graphic" ? "orange" : "blue"}>{WORK_KIND_LABEL[kind]}</StatusBadge>
      {graphic.type && <span className="text-[11.5px] font-bold text-muted">{graphic.type}</span>}
      {brief ? (
        <a href={brief} target="_blank" rel="noreferrer" className="text-[11.5px] font-bold text-accent">📄 เปิดบรีฟ ↗</a>
      ) : (
        <span className="text-[11.5px] text-faint">ยังไม่มีลิงก์บรีฟในใบงาน</span>
      )}
      <a
        href={`/graphic?${GRAPHIC_OPEN_PARAM}=${encodeURIComponent(String(graphic.id))}`}
        className="text-[11px] text-faint hover:text-ink"
      >
        ใบงาน #{graphic.id}{graphic.code ? ` · ${graphic.code}` : ""} ↗
      </a>
      {extra > 0 && (
        <span className="text-[11px] font-bold" style={{ color: "#B3641E" }}>+ อีก {extra} ใบผูกกับโพสต์นี้</span>
      )}
    </div>
  );
}

/** The Content Plan brief, as the caption writer needs to read it.
 *
 *  Its own component because it is now rendered twice — under the field in the
 *  drawer, and beside it when the field is popped out — and two copies of this
 *  list would drift the moment a brief field is added. */
function CaptionBriefGuide({ item, graphic, extraGraphics = 0 }: { item: ContentItem; graphic?: Graphic | null; extraGraphics?: number }) {
  const guide: [string, string | undefined][] = [
    ["Main head", item.title],
    ["Sub head", item.subHead],
    ["Main message", item.mainMessage],
    ["CTA (เป้า)", item.cta],
    ["Product highlight", item.productHighlight],
    ["Caption direction", item.captionDirection],
    ["Mandatory text", item.mandatoryText],
    ["Do / Don't", item.doDont],
  ];
  const rows = guide.filter(([, v]) => (v ?? "").toString().trim());
  return (
    <div className="rounded-[14px] border p-3" style={{ background: "#F7F2FF", borderColor: "#DDD1FF" }}>
      <div className="text-[11.5px] font-extrabold text-[#5B4FB2] mb-2">📋 Brief guide · เขียน caption ตามนี้</div>
      {graphic && (
        <div className="mb-2 pb-2 border-b" style={{ borderColor: "#DDD1FF" }}>
          <LinkedGraphicStrip graphic={graphic} extra={extraGraphics} />
        </div>
      )}
      {rows.length ? (
        <div className="flex flex-col gap-[7px]">
          {rows.map(([label, v]) => (
            <div key={label} className="grid gap-1" style={{ gridTemplateColumns: "110px 1fr" }}>
              <span className="text-[11px] font-bold text-[#7D72B4]">{label}</span>
              <span className="text-[12px] text-ink">{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-faint">ยังไม่มีข้อมูลบรีฟ — โพสต์นี้อาจสร้างก่อนมีฟิลด์บรีฟ หรือกรอก brief ที่ Content Plan</div>
      )}
    </div>
  );
}

export function ContentDrawer({ item, allPosts = [], onClose, onUpdate, onDelete }: {
  item: ContentItem;
  /** Everything else on the calendar — for the same-day clash warning. */
  allPosts?: ContentItem[];
  onClose: () => void;
  onUpdate?: (next: ContentItem) => void;
  onDelete?: (deleted: ContentItem) => void;
}) {
  const [tab, setTab] = useState<DTab>("overview");
  const [caption, setCaption] = useState(item.caption);
  // Pop-out state lives here, not inside the field, so the drawer keeps it
  // across the re-renders a save triggers.
  const [captionExpanded, setCaptionExpanded] = useState(false);
  // Editable post basics (title / date / time) — saved from the Overview tab.
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDate, setEditDate] = useState<string | null>(item.dateIso ?? null);
  const [editTime, setEditTime] = useState(item.time || "10:00");
  const [hashtags, setHashtags] = useState(item.hashtags);
  const [cta, setCta] = useState(item.cta);
  const [footer, setFooter] = useState(item.footer ?? "");
  const [templateStore, setTemplateStore] = useState<CaptionTemplateStore>({});
  const [copyDone, setCopyDone] = useState(false);
  const warnings = contentWarnings(item);

  const { member, user } = useAuth();
  // Captions are addressed to the brand's marketer — the badge, the handover
  // message and the Approval Center row all have to name the same person.
  const brandMarketer = useBrandMarketer();
  const reviewer = member?.name ?? user?.email ?? "CMO";
  // Editing the schedule is planning work; producing against it is not.
  // useRole (not useAuth) to match the rest of the Content module — the same
  // source its inline status gate reads, so "Viewing as" reflects reality here.
  const { role } = useRole();
  const canEditPlan = canEditContentPlan(role);
  // Pasting the file link and confirming it is finished are two different acts,
  // held by two different people on purpose — see canMarkMediaReleased.
  const canRelease = canMarkMediaReleased(role);
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState("");
  // Which part is being sent back. Off by default, so pressing Request
  // Revision behaves exactly as it did unless the reviewer says the
  // caption is the problem.
  const [captionNeedsWork, setCaptionNeedsWork] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState(item.time || "10:00");
  const [metaAccount, setMetaAccount] = useState<MetaBrandAccount | undefined>();
  // The graphic request this post is waiting on — fetched by id so the modal can
  // say what kind of artwork it is, not just that one exists.
  const [linkedGraphic, setLinkedGraphic] = useState<Graphic | null>(null);
  // "still fetching" and "the request this post names does not exist" are
  // different answers and must not look the same. Live data has posts pointing
  // at graphic ids that were hard-deleted before Trash existed, and those sat
  // on "กำลังโหลด…" forever — a spinner that never resolves reads as a hang.
  const [graphicLookup, setGraphicLookup] = useState<"idle" | "loading" | "missing" | "found">("idle");
  // How many requests name this post, when it is somehow more than one. Shown
  // rather than dropped — a caption written against the wrong one of two is the
  // failure this whole block exists to prevent.
  const [extraGraphics, setExtraGraphics] = useState(0);
  // A planner stops once Creative has taken the job on — the brief they are
  // working to must not change under them.
  const lock = contentEditLock(linkedGraphic);
  const canChangePost = canEditPlan && !lock.locked;
  const metaChannels = useMemo(() => itemPlatforms(item).filter((p) => /facebook|instagram|reel/i.test(p)), [item]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(metaChannels);
  const metaConnected = hasMetaAccount(metaAccount);

  useEffect(() => {
    setSelectedChannels(metaChannels);
  }, [metaChannels]);
  useEffect(() => {
    let alive = true;
    fetchMetaPublishingAccounts().then((accounts) => {
      if (alive) setMetaAccount(accounts[item.b]);
    }).catch(() => {});
    return () => { alive = false; };
  }, [item.b]);
  useEffect(() => {
    let alive = true;
    setGraphicLookup("loading");
    // Looked up from BOTH ends of the link. Reading post.graphicRequestId alone
    // missed every post a brief had minted for itself — those carry the link on
    // the request instead — so this panel offered to raise a brief for work that
    // was already in production.
    fetchGraphicsForPost({ id: item.id, graphicRequestId: item.graphicRequestId })
      .then((gs) => {
        if (!alive) return;
        setLinkedGraphic(gs[0] ?? null);
        setExtraGraphics(Math.max(0, gs.length - 1));
        // "named a request that no longer exists" is a real error worth showing;
        // "never had one" is just an unbriefed post, and idle keeps the
        // ขอกราฟฟิก prompt on screen for it.
        setGraphicLookup(gs.length ? "found" : item.graphicRequestId ? "missing" : "idle");
      })
      .catch(() => { if (alive) setGraphicLookup(item.graphicRequestId ? "missing" : "idle"); });
    return () => { alive = false; };
  }, [item.id, item.graphicRequestId]);
  useEffect(() => {
    let alive = true;
    fetchCaptionTemplates()
      .then((store) => { if (alive) setTemplateStore(store); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Saved sets are per brand, so a Teppen hashtag set never shows up while
  // writing for Mainichi.
  const templates = templatesFor(templateStore, item.b);
  // The store is shared across the team now, so a failed write must not leave
  // the picker showing an entry nobody else can see.
  const persistTemplates = (next: CaptionTemplateStore) => {
    const prev = templateStore;
    setTemplateStore(next);
    saveCaptionTemplates(next).catch((error) => {
      setTemplateStore(prev);
      toastError(`บันทึกชุด caption ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
  };
  const saveTemplate = (kind: TemplateKind, value: string) =>
    persistTemplates(rememberTemplate(templateStore, item.b, kind, value));
  const removeTemplate = (kind: TemplateKind, value: string) =>
    persistTemplates(forgetTemplate(templateStore, item.b, kind, value));
  const composedCaption = [caption.trim(), cta.trim(), footer.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
  const copyCaption = async () => {
    if (!composedCaption) return;
    try {
      await navigator.clipboard.writeText(composedCaption);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1400);
    } catch {
      toastError("Copy ไม่สำเร็จ กรุณา copy จากกล่องข้อความโดยตรง");
    }
  };

  // Persist an approval action to the shared content_posts table and bubble
  // the fresh object up so the calendar reflects it without a refetch.
  // Every write goes through here, so the "Action สำเร็จ" confirmation the team
  // asked for lives here too rather than being remembered at each call site.
  // Returns whether it saved, so callers can skip follow-up work on failure.
  const persist = async (next: ContentItem, success = "บันทึกเรียบร้อย"): Promise<boolean> => {
    setBusy(true);
    try {
      await updateContent(next);
      onUpdate?.(next);
      if (success) toastSuccess(success);
      return true;
    } catch (error) {
      toastError(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    } finally { setBusy(false); }
  };

  /** Tell Creative what the planner changed, on the request itself.
   *
   *  Best-effort: a notice that fails to save must never roll back the edit the
   *  planner just made. It is a message, not part of the record. */
  const noticeCreative = (text: string) => {
    if (!linkedGraphic) return;
    const next = withNotice(linkedGraphic, reviewer, text);
    setLinkedGraphic(next);
    updateGraphic(next).catch(() => {});
  };

  // Save the post basics (title / date / time). `day` is derived from the ISO
  // date so the month calendar re-slots the post immediately.
  const saveBasics = () => {
    if (!canChangePost) return;
    const day = editDate ? Number(editDate.slice(8, 10)) || item.day : item.day;
    const dateChanged = (editDate ?? null) !== (item.dateIso ?? null) || editTime !== (item.time || "10:00");
    const titleChanged = editTitle.trim() !== item.title;
    let next: ContentItem = { ...item, title: editTitle.trim() || item.title, dateIso: editDate ?? item.dateIso, day, time: editTime || item.time };
    if (titleChanged) next = withChange(next, reviewer, "แก้ชื่อโพสต์", `${item.title} → ${editTitle.trim()}`);
    if (dateChanged) next = withChange(next, reviewer, "แก้กำหนดลง", `${item.dateIso ?? "—"} ${item.time} → ${editDate ?? "—"} ${editTime}`);
    void persist(next, "บันทึกการแก้ไขเรียบร้อย").then((ok) => {
      if (!ok) return;
      if (dateChanged) noticeCreative(`เลื่อนกำหนดลงโพสต์เป็น ${editDate ?? "—"} ${editTime}`);
      if (titleChanged) noticeCreative(`เปลี่ยนชื่อโพสต์เป็น “${editTitle.trim()}”`);
    });
  };

  // ── Move to another campaign ────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [moveTo, setMoveTo] = useState("");
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!canEditPlan) return;
    let alive = true;
    fetchCampaigns().then((cs) => { if (alive) setCampaigns(cs); }).catch(() => {});
    return () => { alive = false; };
  }, [canEditPlan]);
  // Same brand only — moving a Teppen post under a Mainichi campaign would put
  // it outside the brand scope its own row is filtered by.
  const moveOptions = useMemo(
    () => campaigns.filter((c) => c.b === item.b && c.name !== item.campaign),
    [campaigns, item.b, item.campaign],
  );
  const doMove = async () => {
    if (!canChangePost || !moveTo) return;
    const target = campaigns.find((c) => c.id === moveTo);
    if (!target) return;
    setMoving(true);
    // The job number names the campaign it belongs to, so carrying the old one
    // across would leave the post filed under a campaign it just left. Reissued
    // from the destination; if that cannot be read, drop it rather than lie —
    // an absent number is fixable, a wrong one gets written down.
    const code = await issueContentCode(target.id).catch(() => undefined);
    const next = { ...moveToCampaign(item, { id: target.id, name: target.name }, reviewer), code };
    // Where it is leaving, captured before the post is rewritten.
    const fromCampaignId = item.campaignId;
    const fromItemId = item.sourceContentItemId;
    void persist(next, `ย้ายไปแคมเปญ “${target.name}” เรียบร้อย`).then((ok) => {
      if (!ok) return;
      noticeCreative(`ย้ายโพสต์นี้ไปแคมเปญ “${target.name}” (เดิม “${item.campaign || "—"}”)`);
      // The post has moved; the campaign it left must stop listing it in its
      // plan, or the work reads as un-moved from the campaign side. Best-effort
      // — the move itself has already succeeded and must not be undone by a
      // failure to tidy up.
      if (fromCampaignId && fromItemId) {
        void detachBriefContentItem(fromCampaignId, fromItemId, reviewer, target.name).catch(() => {});
      }
      setMoveTo("");
    }).finally(() => setMoving(false));
  };

  // Media link + release status (Creative).
  const [mediaLink, setMediaLink] = useState(item.mediaLink ?? "");
  useEffect(() => { setMediaLink(item.mediaLink ?? ""); }, [item.mediaLink]);

  // Hero artwork for the Overview tab, and a one-click grab of every asset.
  const [heroBroken, setHeroBroken] = useState(false);
  const hero = useMemo(() => heroPreview(item.assets, item.mediaLink), [item.assets, item.mediaLink]);
  useEffect(() => { setHeroBroken(false); }, [hero?.previewUrl]);
  const downloadAllAssets = () => {
    const urls = (item.assets ?? []).map((a) => assetLinkView(a.link).downloadUrl).filter(Boolean) as string[];
    if (!urls.length) { toastError("asset ชุดนี้ดาวน์โหลดตรงไม่ได้ — กด Open เพื่อเปิดไฟล์แทน"); return; }
    // Staggered: browsers drop same-tick popups after the first one.
    urls.forEach((url, i) => setTimeout(() => window.open(url, "_blank", "noopener"), i * 400));
  };
  const mediaDirty = mediaLink.trim() !== (item.mediaLink ?? "").trim();
  const saveMedia = () => persist({ ...item, mediaLink: mediaLink.trim() || undefined });
  const toggleRelease = () => {
    if (!canRelease) return;
    const released = item.releaseStatus === "Released";
    persist(released
      ? { ...item, releaseStatus: "", releasedBy: undefined, releasedAt: undefined }
      : { ...item, releaseStatus: "Released", releasedBy: reviewer, releasedAt: new Date().toISOString(), mediaLink: mediaLink.trim() || item.mediaLink });
    if (!released) notify("published", `🎬 Creative ปล่อยงานแล้ว: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${reviewer}`, workLink.post(item.id));
  };
  const basicsDirty = editTitle !== item.title || (editDate ?? null) !== (item.dateIso ?? null) || editTime !== (item.time || "10:00");
  // Warn against the date being EDITED, not the saved one — the point is to
  // catch the clash while the date can still be changed.
  const clashWarning = useMemo(
    () => sameDayWarning({ ...item, dateIso: editDate ?? item.dateIso, time: editTime }, allPosts),
    [item, editDate, editTime, allPosts],
  );

  // Move the post to Trash — recoverable for TRASH_RETENTION_DAYS days.
  const [deleting, setDeleting] = useState(false);
  // Hand this post to a writer. Creative Leader's call (canAssignCaption) —
  // the same person who assigns designers, so one queue-balancer sees both.
  const canAssign = canAssignCaption(role);
  const assignOwner = (name: string) => {
    const next = (name || "").trim() || "Unassigned";
    if (next === item.owner) return;
    void persist(
      { ...item, owner: next },
      next === "Unassigned" ? "ยกเลิกการมอบหมายแล้ว" : `มอบหมายให้ ${next} เขียนแคปชั่นแล้ว`,
    );
  };

  const removePost = async () => {
    // Deleting a planned post is a scheduling decision, so it follows the same
    // gate as editing and moving one. It had none: the button sat below the
    // disabled fieldset, outside it, and a VDO Editor with Content = View could
    // bin a post — along with its graphic request — from a screen that gave
    // them no way to change so much as its title.
    if (!canEditPlan) return;
    // The confirm names the Graphic Request too. Deleting a post used to leave
    // its request behind on /graphic forever; now it goes as well, and that is
    // not something to discover afterwards.
    const alsoGraphic = item.graphicRequestId ? "\n\nคำขอกราฟิกที่ผูกกับโพสต์นี้จะถูกย้ายลงถังขยะด้วย" : "";
    if (!window.confirm(`ย้ายโพสต์ "${item.title}" ลงถังขยะ?${alsoGraphic}\n\nกู้คืนได้ภายใน ${TRASH_RETENTION_DAYS} วันที่หน้า Trash หลังจากนั้นจะถูกลบถาวร`)) return;
    setDeleting(true);
    try {
      const { graphics } = await deleteContent(item, reviewer);
      onDelete?.(item);
      toastSuccess(
        graphics > 0
          ? `ย้าย “${item.title}” และคำขอกราฟิกที่ผูกไว้ ${graphics} รายการลงถังขยะแล้ว · กู้คืนได้ภายใน ${TRASH_RETENTION_DAYS} วัน`
          : `ย้าย “${item.title}” ลงถังขยะแล้ว · กู้คืนได้ภายใน ${TRASH_RETENTION_DAYS} วัน`,
      );
      onClose();
    } catch (error) {
      toastError(`ลบโพสต์ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setDeleting(false); }
  };

  // Save caption/hashtags/cta; "Mark Ready" flips captionStatus and, if the post
  // is now fully ready, advanceApprovalState pushes it into My Approval.
  const saveCaption = () => persist(advanceApprovalState({ ...item, caption, hashtags, cta, footer }));
  // Handing the words over is a handoff like any other, and it was the one with
  // no message attached: the writer pressed Mark Ready and the person who has
  // to accept it found out by opening the drawer. Addressed to the requester of
  // the post — see captionReviewer — so it reaches the person who asked for it
  // rather than every planner in the company.
  const markCaptionReady = () => {
    void persist(advanceApprovalState({ ...item, caption, hashtags, cta, footer, captionStatus: "Ready" }));
    const owed = captionReviewer(item, brandMarketer(item.b));
    notify("approval", `📝 caption รออนุมัติ: ${item.title}`,
      `${brandName(item.b)} · ${item.campaign} · เขียนโดย ${reviewer}${owed ? ` → รอ ${owed}` : ""}`,
      workLink.post(item.id), { team: CAPTION_NOTIFY_TEAM, to: [owed] });
  };

  // ── Caption sign-off ─────────────────────────────────────────────────
  // Step 4 of the agreed flow: the words get accepted (or sent back) on their
  // own, before production, instead of riding along with the whole post.
  const [captionReason, setCaptionReason] = useState("");
  // Two different people, and the caption gate needs both. The WRITER may not
  // sign off their own words — captionOwner, not `owner`, because on a post
  // still marked "Unassigned" the planner is the writer and reading the raw
  // field let them approve themselves. The REVIEWER is who it was addressed to,
  // and they decide whatever their role.
  const writer = captionOwner(item);
  const captionOwedTo = captionReviewer(item, brandMarketer(item.b));
  const canDecideCap = canDecideCaption(role, { me: reviewer, writer, reviewer: captionOwedTo });
  // Told apart from "not on the planning side" so the reason on screen is the
  // true one — being the writer is a different refusal from being Creative.
  const isSameCaptionWriter =
    !!writer && (reviewer ?? "").trim().toLowerCase() === writer.trim().toLowerCase();
  /** The write, the revision task and the DM-only routing all live in
   *  lib/captionDecision — the same call Approval Center's list rows make, so a
   *  caption approved from a row cannot notify differently from one approved
   *  here. */
  const decideCaption = async (decision: "approve" | "revise") => {
    setBusy(true);
    try {
      const next = await decideCaption_({ item, decision, by: reviewer, reason: captionReason, onUpdate });
      if (next) setCaptionReason("");
    } finally { setBusy(false); }
  };

  const approveBlockers = contentApproveBlockers(item);
  const approve = async () => {
    setBusy(true);
    try {
      const res = await approveContent(item, reviewer);
      if (!res.ok) { toastError("ยัง Approve ไม่ได้:\n• " + res.reasons.join("\n• ")); return; }
      onUpdate?.(res.post);
      notify("approved", `✅ Content อนุมัติแล้ว: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${reviewer}`, workLink.post(item.id));
    } catch (error) {
      toastError(`อนุมัติไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusy(false); }
  };

  const requestRevision = () => {
    const r = reason.trim();
    if (!r) return;
    const round = (item.feedbackRounds ?? 0) + 1;
    persist({
      ...item, approvalStatus: "Revision Requested", feedbackRounds: round,
      // Sending a post back for its caption has to move the caption too,
      // otherwise the row keeps reading "Ready" and contentApproveBlockers goes
      // on treating it as done — the writer gets a task to fix something the
      // app says is already finished.
      ...(captionNeedsWork ? { captionStatus: captionStatusAfterRevision(item) } : {}),
      feedback: [...(item.feedback ?? []), { round, reason: r, by: reviewer, at: new Date().toISOString() }],
    });
    // Bounce it back into the fixer's My Tasks (caption owner, else the designer).
    const fixer = captionOwner(item) || realName(item.designer);
    if (fixer) {
      createRevisionTask({
        module: "Content", title: `แก้ Content — ${item.title}`, assignee: fixer,
        brand: brandName(item.b), campaign: item.campaign, reason: r, by: reviewer,
      }).catch((error) => toastError(`สร้าง task แก้ Content ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    notify("rejected", `↩ Content ถูกส่งกลับแก้: ${item.title}`, `${fixer ? `ถึง ${fixer} — ` : ""}${r} · โดย ${reviewer}`, workLink.post(item.id), { team: "content", to: [fixer] });
    setReason(""); setRevising(false); setCaptionNeedsWork(false);
  };

  const gate = canPublish(item);
  const publish = async () => {
    setBusy(true);
    try {
      const res = await publishContent(item, reviewer);
      if (!res.ok) { toastError("ยัง Publish ไม่ได้:\n• " + res.reasons.join("\n• ")); return; }
      onUpdate?.(res.post);
      notify("published", `🚀 โพสต์ถูก publish: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${reviewer}`, workLink.post(item.id));
    } catch (error) {
      toastError(`Publish ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusy(false); }
  };
  const scheduleMeta = async () => {
    // Fallback when neither a picked date nor the item's ISO date exists: use the
    // current year/month with the post's day-of-month (never a hardcoded year).
    const now = new Date();
    const fallbackDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(item.day || now.getDate()).padStart(2, "0")}`;
    const scheduledFor = `${scheduleDate || item.dateIso || fallbackDate}T${scheduleTime || item.time || "10:00"}:00+07:00`;
    setBusy(true);
    try {
      const res = await scheduleContentToMeta(item, reviewer, scheduledFor, selectedChannels);
      if (!res.ok) { toastError("ยัง Queue ไป Meta ไม่ได้:\n• " + res.reasons.join("\n• ")); return; }
      onUpdate?.(res.post);
      notify("published", `📌 Scheduled to Meta: ${item.title}`, `${brandName(item.b)} · ${selectedChannels.join(", ")}`, workLink.post(item.id));
    } catch (error) {
      toastError(`Queue ไป Meta ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusy(false); }
  };
  const publishMetaNow = async () => {
    setBusy(true);
    try {
      const res = await publishContentToMeta(item, reviewer, selectedChannels, metaAccount);
      if (!res.ok) { toastError("Meta publish ไม่สำเร็จ:\n• " + res.reasons.join("\n• ")); onUpdate?.(res.post); return; }
      onUpdate?.(res.post);
      notify("published", `🚀 Published to Meta: ${item.title}`, `${brandName(item.b)} · ${selectedChannels.join(", ")}`, workLink.post(item.id));
    } catch (error) {
      toastError(`Meta publish ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusy(false); }
  };

  const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line2 bg-ivory outline-none font-sans";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[520px] bg-surface flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2 flex-shrink-0" style={{ background: "#FBF9F4" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-[5px] flex-wrap">
              <span className="flex items-center gap-[3px]">
                {itemPlatforms(item).map((p, i) => {
                  const pi = platIcon(p);
                  return <span key={i} className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[9px] font-bold" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>;
                })}
              </span>
              <span className="text-[15px] font-extrabold leading-tight">{item.title}</span>
              {/* Full code here: the drawer is where someone copies a number to
                  paste into a chat, and the short form means nothing on its own. */}
              <WorkCode code={item.code} full />
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted">
              <span className="flex items-center gap-[5px]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: brandColor(item.b) }} />{brandName(item.b)}</span>
              <span className="text-faint">·</span><span>{item.campaign}</span>
              {/* No campaign pill here on purpose. The job number above already
                  opens with the campaign's code, so a pill beside it printed the
                  same number twice — read as two different numbers, which is the
                  exact confusion this whole scheme exists to remove. It stays on
                  the list rows, where the job number is shown short ("C04") and
                  the two are complementary rather than overlapping. */}
              {/* Real publish date from dateIso — falls back to day-of-month only when undated. */}
              <span className="text-faint">·</span><span>{item.dateIso ? `${MONTHS[Number(item.dateIso.slice(5, 7)) - 1]} ${Number(item.dateIso.slice(8, 10))}` : `Day ${item.day}`}, {item.time}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink flex-shrink-0"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line flex-shrink-0 overflow-x-auto">
          {TABS.map(([id, label]) => {
            const active = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)} className="text-[12.5px] font-semibold px-[15px] py-[11px] whitespace-nowrap border-b-2 -mb-[1px]"
                style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
                {label}{id === "publish" && !metaConnected && <span className="ml-1" title="ต้องเชื่อม Meta ก่อน">🔒</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-[18px]">
          {tab === "overview" && (
            <div className="flex flex-col gap-[14px]">
              {/* The artwork itself when there is one to show — the tile used to
                  be a permanent 🖼 placeholder even after Creative had attached
                  approved assets. */}
              {hero && !heroBroken ? (
                <a href={hero.href} target="_blank" rel="noreferrer" title="เปิดไฟล์เต็ม"
                  className="rounded-[14px] overflow-hidden block relative" style={{ background: "#F0EBE0" }}>
                  <img src={hero.previewUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer"
                    onError={() => setHeroBroken(true)} className="w-full max-h-[240px] object-contain bg-white" />
                  <span className="absolute bottom-2 right-2 text-[10.5px] font-bold px-2 py-[3px] rounded-pill bg-black/55 text-white">{item.assetStatus}</span>
                </a>
              ) : (
                <div className="rounded-[14px] h-40 flex flex-col items-center justify-center gap-2" style={{ background: "#F0EBE0" }}>
                  <span className="text-[28px]">🖼</span>
                  <span className="text-[13px] text-faint font-semibold">{item.assetStatus}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-[10px]">
                {[["Status", <StatusBadge key="s" tone={contentTone(item.status)}>{item.status}</StatusBadge>],
                  ["Owner (คนเขียนแคปชั่น)", canAssign
                    ? (
                      // The one control that turns "งานเขียนแคปชั่นไหลเข้า Content
                      // creator" into something the app actually does. Shows the
                      // content planner while nobody has been assigned — that is
                      // who owns the words until Creative takes them, not
                      // "ยังไม่มอบหมาย" — and offers the people the work may be
                      // handed on to (CAPTION_WRITER_ROLES). Scoped to "all"
                      // rather than a team on purpose: the two writer roles live
                      // in different teams, so filtering by team first would
                      // leave nobody to pick. Clearing the slot hands the post
                      // back to its planner; whoever holds it now stays listed
                      // even when their role is not a writer's.
                      <OwnerSelect
                        key="o"
                        value={captionOwner(item)}
                        onChange={assignOwner}
                        team="all"
                        roleMatch={CAPTION_WRITER_ROLES}
                        placeholder="ยังไม่มอบหมาย"
                        emptyLabel="ยังไม่มีใครถูกตั้งเป็น Content Creator / Creative Leader — ตั้ง role ที่ Settings › Members ก่อน"
                        className="text-[13px]"
                      />
                    )
                    : <span key="o" className="text-[13.5px] font-semibold">{captionOwner(item) || "ยังไม่มอบหมาย"}</span>],
                  ["Asset", <StatusBadge key="a" tone={contentTone(item.assetStatus)}>{item.assetStatus}</StatusBadge>],
                  ["Caption", <StatusBadge key="c" tone={contentTone(item.captionStatus)}>{item.captionStatus}</StatusBadge>]].map(([label, node], i) => (
                  <div key={i} className="rounded-[12px] px-[14px] py-3" style={{ background: "#F7F4EE" }}>
                    <div className="text-[10px] font-bold tracking-[0.06em] uppercase text-faint mb-1">{label as string}</div>
                    {node as React.ReactNode}
                  </div>
                ))}
              </div>
              {warnings.length > 0 && (
                <div className="rounded-[12px] px-[14px] py-3" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
                  <div className="text-[11.5px] font-bold text-status-red mb-2">Action needed</div>
                  {warnings.map((w) => (
                    <div key={w} className="text-[12.5px] text-status-red font-semibold mb-[5px] flex items-center gap-[6px]"><span>⚠</span><span>{w}</span></div>
                  ))}
                </div>
              )}

              {/* Edit post basics */}
              <div className="rounded-[14px] border border-line2 bg-ivory p-4">
                <div className="text-[11.5px] font-bold text-muted mb-3">✏️ Edit post</div>

                {/* Why the fields below are dead, when they are. Two different
                    reasons, and telling them apart matters: "not your job" is
                    permanent, "Creative is mid-way through" is a conversation. */}
                {lock.locked && (
                  <div className="mb-3 rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
                    🔒 {lock.reason}
                  </div>
                )}
                {!canEditPlan && (
                  <div className="mb-3 rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#F0EDE6", border: "1px solid #E5DECF", color: "#6b6258" }}>
                    ตารางลงโพสต์แก้ได้โดยฝั่ง Marketing — ดูได้อย่างเดียว
                  </div>
                )}

                <fieldset disabled={!canChangePost} className="flex flex-col gap-3 disabled:opacity-60">
                  <div>
                    <label className="block text-[11px] font-bold text-faint mb-[5px]">Title</label>
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={field} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-faint mb-[5px]">Publish date</label>
                      <DatePicker value={editDate} onChange={(v) => setEditDate(v)} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-faint mb-[5px]">Time</label>
                      <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className={field} />
                    </div>
                  </div>
                  {/* Same-day clash — a warning, never a block. Two posts on one
                      day is sometimes exactly what a launch wants; the team just
                      asked to be told before it happens rather than after. */}
                  {clashWarning && (
                    <div className="rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#FBF6EC", border: "1px solid #EADBC1", color: "#8A6D1E" }}>
                      ⚠ {clashWarning}
                    </div>
                  )}
                  <button onClick={saveBasics} disabled={busy || !basicsDirty || !editTitle.trim()}
                    className="text-[13px] font-bold py-[10px] rounded-[10px] bg-panel text-white disabled:opacity-40">
                    {busy ? "Saving…" : "Save changes"}
                  </button>

                  {/* Move to another campaign — same brand only, and logged. */}
                  <div className="pt-3 border-t border-line3">
                    <label className="block text-[11px] font-bold text-faint mb-[5px]">ย้ายไปแคมเปญอื่น</label>
                    <div className="flex gap-2">
                      <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={field}>
                        <option value="">{moveOptions.length ? "เลือกแคมเปญปลายทาง…" : "ไม่มีแคมเปญอื่นของแบรนด์นี้"}</option>
                        {moveOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={() => { void doMove(); }} disabled={!moveTo || moving}
                        className="text-[12.5px] font-bold px-4 rounded-[10px] border border-line2 bg-surface text-ink disabled:opacity-40 whitespace-nowrap">
                        {moving ? "กำลังย้าย…" : "ย้าย"}
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-faint">
                      ปัจจุบัน: {item.campaign || "—"} · ย้ายได้เฉพาะแคมเปญของแบรนด์เดียวกัน · ระบบจะบันทึก log และแจ้งทีม Creative ในใบงาน
                    </div>
                  </div>
                </fieldset>

                {/* What has already been changed on this post. */}
                {(item.changeLog ?? []).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line3">
                    <div className="text-[11px] font-bold text-faint mb-[6px]">ประวัติการแก้ไข</div>
                    <ul className="flex flex-col gap-[3px]">
                      {[...(item.changeLog ?? [])].reverse().slice(0, 6).map((h, i) => (
                        <li key={`${h.at}-${i}`} className="text-[11px] text-muted">
                          <span className="font-bold">{h.action}</span>{h.detail ? ` · ${h.detail}` : ""}
                          <span className="text-faint"> — {h.by} · {new Date(h.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Approved assets, with preview + download. This used to live only
                  on the Publish tab, which is locked behind a connected Meta
                  account — so the team could not reach the artwork Creative had
                  already delivered. It belongs with the post. */}
              <div className="rounded-[14px] border border-line2 bg-ivory p-4">
                {/* Raising the brief is a separate step from planning the post;
                    this is the link that keeps them tied by post id. */}
                {!item.graphicRequestId && !linkedGraphic && graphicLookup !== "loading" && (
                  <a href={`/graphic?${GRAPHIC_BRIEF_FOR_PARAM}=${encodeURIComponent(item.id)}`}
                    className="mb-3 flex items-center justify-between gap-2 rounded-[10px] border border-[#DDD1FF] bg-[#F7F2FF] px-3 py-[9px]">
                    <span className="text-[12px] font-bold text-[#2C2553]">🎨 ขอกราฟฟิกสำหรับโพสต์นี้</span>
                    <span className="text-[11px] font-bold text-[#6C5CE7]">เปิดฟอร์ม ↗</span>
                  </a>
                )}
                {(item.graphicRequestId || linkedGraphic) && (
                  <div className="mb-3">
                    {/* What KIND of artwork this post is waiting on. "ผูกกับ
                        Graphic Request #12" alone never said whether that was a
                        poster, a reel edit or a shoot — so planners opened the
                        Graphic module just to find out what they had asked for.
                        Kind comes from workKind(), the same rule the artwork
                        report and the daily capacity guard count by. */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {linkedGraphic ? (
                        <>
                          {/* Kind · type · brief link — the same strip the
                              caption writer gets, so both screens answer "what
                              am I looking at" identically. */}
                          <LinkedGraphicStrip graphic={linkedGraphic} extra={extraGraphics} />
                          <StatusBadge tone={linkedGraphic.stage === "Approved" || linkedGraphic.stage === "Delivered" ? "green" : "gold"}>{linkedGraphic.stage}</StatusBadge>
                        </>
                      ) : graphicLookup === "missing" ? (
                        <span className="text-[11.5px] font-semibold" style={{ color: "#B33A2E" }}>
                          ⚠ ไม่พบใบงาน #{item.graphicRequestId} — อาจถูกลบถาวรไปแล้ว · asset จะไม่ไหลกลับมาที่โพสต์นี้
                        </span>
                      ) : (
                        <span className="text-[11px] text-faint">กำลังโหลดรายละเอียดใบงาน…</span>
                      )}
                    </div>
                    {/* Size and designer, under the strip. The request id comes
                        from the row we actually resolved — reading it off the
                        post alone produced a "#undefined" link on every post
                        whose link is stored on the request instead. */}
                    {linkedGraphic && (linkedGraphic.size || (linkedGraphic.designer && linkedGraphic.designer !== "Unassigned")) && (
                      <div className="mt-1 text-[11px] text-faint">
                        {[linkedGraphic.size, linkedGraphic.designer !== "Unassigned" ? linkedGraphic.designer : ""].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-[11.5px] font-bold text-muted">🖼 Approved assets {item.assets?.length ? `(${item.assets.length})` : ""}</div>
                  {item.assets && item.assets.length > 1 && (
                    <button onClick={downloadAllAssets} className="text-[11px] font-bold text-accent">ดาวน์โหลดทั้งหมด</button>
                  )}
                </div>
                <AssetLinkList assets={item.assets} />
              </div>

              {/* Media link + Release status — Creative pastes the final file
                  link and ticks Released when the asset is ready to publish. */}
              <div className="rounded-[14px] border border-line2 bg-ivory p-4">
                <div className="text-[11.5px] font-bold text-muted mb-3">🎬 Media & release</div>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-faint mb-[5px]">External media link <span className="font-normal">· Drive / Canva / ไฟล์จริง</span></label>
                    <div className="flex items-center gap-2">
                      <input value={mediaLink} onChange={(e) => setMediaLink(e.target.value)} placeholder="https://…" inputMode="url" className={field} />
                      {mediaLink.trim().startsWith("http") && (
                        <a href={mediaLink.trim()} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-accent whitespace-nowrap">เปิด ↗</a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-muted">
                      Release status: {item.releaseStatus === "Released"
                        ? <span className="text-status-green font-bold">✓ Released{item.releasedBy ? ` · ${item.releasedBy}` : ""}</span>
                        : <span className="text-faint">ยังไม่ปล่อยงาน</span>}
                    </div>
                    {canRelease ? (
                      <button onClick={toggleRelease} disabled={busy}
                        className="text-[12px] font-bold px-3 py-[7px] rounded-[9px] disabled:opacity-40"
                        style={item.releaseStatus === "Released"
                          ? { background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }
                          : { background: "#4E7A4E", color: "#fff" }}>
                        {item.releaseStatus === "Released" ? "ยกเลิก Release" : "✓ Mark Released"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-faint text-right max-w-[190px]">
                        วางลิงก์ไฟล์ได้ · Content Creator หรือ Creative Leader เป็นคนกดปล่อยงาน
                      </span>
                    )}
                  </div>
                  {mediaDirty && (
                    <button onClick={saveMedia} disabled={busy}
                      className="text-[13px] font-bold py-[9px] rounded-[10px] bg-panel text-white disabled:opacity-40">
                      {busy ? "Saving…" : "Save media link"}
                    </button>
                  )}
                </div>
              </div>

              {/* Delete — soft, confirmed, and only for the planning side. */}
              {canEditPlan && (
                <button onClick={removePost} disabled={deleting}
                  className="text-[12.5px] font-bold py-[10px] rounded-[10px] disabled:opacity-40"
                  style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
                  {deleting ? "Deleting…" : "🗑 ลบโพสต์นี้"}
                </button>
              )}
            </div>
          )}

          {tab === "caption" && (
            <div className="flex flex-col gap-[14px]">
              <div>
                <div className="flex items-center justify-between mb-[6px]">
                  <label className="text-[11.5px] font-bold text-muted">Caption</label>
                  <StatusBadge tone={contentTone(item.captionStatus)}>{item.captionStatus}</StatusBadge>
                </div>
                {/* The brief travels with the caption into the expanded view:
                    writing one FROM the other is the whole job, and a pop-out
                    that left the brief behind in the drawer would trade one
                    cramped screen for a blind one. */}
                <ExpandableTextarea
                  value={caption}
                  onChange={setCaption}
                  expanded={captionExpanded}
                  onExpandedChange={setCaptionExpanded}
                  rows={6}
                  placeholder="Write caption here…"
                  className={field}
                  title={`Caption · ${item.title}`}
                  asideTitle="บรีฟของโพสต์นี้"
                  aside={<CaptionBriefGuide item={item} graphic={linkedGraphic} extraGraphics={extraGraphics} />}
                />
                <div className="text-[11px] text-faint mt-1 text-right">{caption.length} chars</div>
              </div>

              {/* Brief guide — reference from the Content Plan for writing the caption */}
              <CaptionBriefGuide item={item} graphic={linkedGraphic} extraGraphics={extraGraphics} />
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Hashtags</label>
                <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#wagyu #bangkok #teppen" className={field} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => saveTemplate("hashtags", hashtags)} className="rounded-pill border border-line2 bg-surface px-3 py-1 text-[11px] font-bold text-muted">Save hashtag set</button>
                  <TemplateChips values={templates.hashtags} bg="#EEF1F8" fg="#3E5C9A" onPick={setHashtags} onRemove={(v) => removeTemplate("hashtags", v)} />
                </div>
                <div className="text-[11px] text-faint mt-[6px]">
                  ชุดที่บันทึกไว้เป็นของแบรนด์ <b>{brandName(item.b)}</b> และทั้งทีมใช้ร่วมกัน — เก็บได้แบรนด์ละ 12 ชุดต่อช่อง
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Call to Action</label>
                {/* Multi-line: a real CTA is two or three lines with a link
                    under them, and a single-line input let the team type it but
                    never see it — the text scrolled sideways out of the box and
                    Enter did nothing (3/8/26). The composed caption joins the
                    blocks with a blank line and leaves what is inside each one
                    alone, so the breaks typed here survive to the post. */}
                <textarea value={cta} onChange={(e) => setCta(e.target.value)} rows={2}
                  placeholder="e.g. Reserve now via link in bio" className={`${field} resize-y leading-[1.5]`} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => saveTemplate("ctas", cta)} className="rounded-pill border border-line2 bg-surface px-3 py-1 text-[11px] font-bold text-muted">Save CTA</button>
                  <TemplateChips values={templates.ctas} bg="#EEF4EE" fg="#4E7A4E" onPick={setCta} onRemove={(v) => removeTemplate("ctas", v)} />
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Footer</label>
                {/* Same reason as the CTA above, more so: a footer is a stack of
                    branch lines ("📍LUNCH TIME at … / 📍DELIVERY Grab / Line …")
                    that has to break, not run on. */}
                <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={3}
                  placeholder="เช่น เงื่อนไข / สาขา / เวลาทำการ" className={`${field} resize-y leading-[1.5]`} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => saveTemplate("footers", footer)} className="rounded-pill border border-line2 bg-surface px-3 py-1 text-[11px] font-bold text-muted">Save footer</button>
                  <TemplateChips values={templates.footers} bg="#FFF6E8" fg="#C68A1E" onPick={setFooter} onRemove={(v) => removeTemplate("footers", v)} />
                </div>
              </div>
              <div className="rounded-[14px] border border-line2 bg-ivory p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11.5px] font-bold text-muted">Generated caption</div>
                  <button onClick={copyCaption} disabled={!composedCaption} className="rounded-[9px] bg-panel px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">{copyDone ? "Copied ✓" : "Copy"}</button>
                </div>
                <textarea readOnly rows={5} value={composedCaption} placeholder="Caption + CTA + Footer + Hashtags จะรวมให้อัตโนมัติ" className={`${field} resize-y leading-[1.5] bg-surface`} />
              </div>
              <div className="flex gap-2">
                <button onClick={saveCaption} disabled={busy} className="flex-1 text-[13.5px] font-bold py-[11px] rounded-[10px] bg-panel text-white disabled:opacity-40">{busy ? "Saving…" : "Save Caption"}</button>
                <button onClick={markCaptionReady} disabled={busy || !caption.trim()} className="text-[13.5px] font-semibold py-[11px] px-4 rounded-[10px] border border-line2 text-muted disabled:opacity-40">Mark Ready</button>
              </div>
              <div className="text-[11.5px] text-faint">Last edited by {captionOwner(item) || "—"}{caption.trim() ? "" : " · เขียน caption ก่อนกด Mark Ready"}</div>

              {/* What the writer was told last time — kept in front of them
                  while they rewrite, not buried in a notification. */}
              {(item.captionFeedback ?? []).length > 0 && item.captionStatus !== "Approved" && (
                <div className="rounded-[12px] px-3 py-[10px]" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
                  <div className="text-[11px] font-extrabold mb-1" style={{ color: "#B33A2E" }}>↩ caption ถูกส่งกลับแก้</div>
                  {(item.captionFeedback ?? []).slice(-3).map((f, i) => (
                    <div key={i} className="text-[12px] leading-[1.5]" style={{ color: "#B33A2E" }}>
                      · {f.reason} <span className="text-faint">— {f.by}</span>
                    </div>
                  ))}
                </div>
              )}

              {captionApproved(item) && (
                <div className="rounded-[12px] px-3 py-[10px] text-[12px] font-semibold" style={{ background: "#EEF4EE", color: "#4E7A4E", border: "1px solid #CFE4C2" }}>
                  ✓ caption อนุมัติแล้วโดย {item.captionApprovedBy || "—"}{stamp(item.captionApprovedAt) ? ` · ${stamp(item.captionApprovedAt)}` : ""}
                </div>
              )}

              {/* Marketing's call, and never the writer's own — see canDecideCaption. */}
              {captionAwaitsApproval(item) && canDecideCap && (
                <div className="rounded-[12px] border border-line2 bg-ivory p-3 flex flex-col gap-2">
                  <div className="text-[12px] font-extrabold text-ink">caption รออนุมัติ</div>
                  <div className="text-[11.5px] text-faint">
                    อนุมัติที่ตัวหนังสือได้เลย ไม่ต้องรอ artwork — ทีมผลิตจะได้เริ่มงานจาก caption ที่ตกลงแล้ว
                  </div>
                  <input value={captionReason} onChange={(e) => setCaptionReason(e.target.value)}
                    placeholder="เหตุผลถ้าส่งกลับแก้…" className={field} />
                  <div className="flex gap-2">
                    <button onClick={() => decideCaption("approve")} disabled={busy}
                      className="text-[12.5px] font-bold text-white rounded-[9px] px-4 py-[8px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>
                      อนุมัติ caption
                    </button>
                    <button onClick={() => decideCaption("revise")} disabled={busy || !captionReason.trim()}
                      className="text-[12.5px] font-bold rounded-[9px] px-4 py-[8px] border border-line2 bg-surface text-status-red disabled:opacity-40">
                      ส่งกลับแก้
                    </button>
                  </div>
                </div>
              )}
              {captionAwaitsApproval(item) && !canDecideCap && (
                <div className="text-[11.5px] text-faint">
                  caption ส่งแล้ว — รอฝั่ง Marketing อนุมัติ{isSameCaptionWriter ? " (คนเขียนอนุมัติงานตัวเองไม่ได้)" : ""}
                </div>
              )}
            </div>
          )}

          {tab === "approval" && (
            <div className="flex flex-col gap-[14px]">
              <div className="rounded-[14px] p-4" style={{ background: "#F7F4EE" }}>
                <div className="text-[12px] font-bold tracking-[0.05em] uppercase text-faint mb-[10px]">Approval Status</div>
                <StatusBadge tone={contentTone(item.approvalStatus)}>{item.approvalStatus}</StatusBadge>
                <div className="text-[12.5px] text-faint mt-2">{item.feedbackRounds ?? 0} feedback round(s)</div>
                {item.approvalStatus === "Approved" && item.approvedBy && (
                  <div className="text-[12px] text-status-green font-semibold mt-1">
                    ✓ Approved by {item.approvedBy}{stamp(item.approvedAt) ? ` · ${stamp(item.approvedAt)}` : ""}
                  </div>
                )}
              </div>

              {/* Feedback history */}
              {item.feedback && item.feedback.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-[11.5px] font-bold text-muted">Revision history</div>
                  {item.feedback.slice().reverse().map((f) => (
                    <div key={f.round} className="rounded-[11px] px-[13px] py-[10px] border-[1.5px]" style={{ borderColor: "#F0D9C0", background: "#FCF6EE" }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11.5px] font-bold text-status-orange">Round {f.round}</span>
                        <span className="text-[11px] text-faint">{f.by} · {new Date(f.at).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[12.5px] text-ink">{f.reason}</div>
                    </div>
                  ))}
                </div>
              )}

              {revising ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[11.5px] font-bold text-muted">Reason for revision <span className="text-status-red">*</span></label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
                    placeholder="What needs to change before this can be approved?"
                    className="w-full text-[13px] px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line2 bg-ivory outline-none resize-none" />
                  <label className="flex items-start gap-2 text-[12px] text-ink cursor-pointer">
                    <input type="checkbox" checked={captionNeedsWork} className="mt-[3px]"
                      onChange={(e) => setCaptionNeedsWork(e.target.checked)} />
                    <span>
                      ✍️ แคปชั่นต้องแก้ด้วย
                      <span className="block text-[11px] text-faint">
                        จะดึงสถานะแคปชั่นกลับเป็น &ldquo;{captionStatusAfterRevision(item)}&rdquo; — คนเขียนจะเห็นว่ายังไม่ผ่าน
                        และ Approve ไม่ได้จนกว่าจะกด Mark Ready ใหม่
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={requestRevision} disabled={!reason.trim() || busy}
                      className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] text-white disabled:opacity-40" style={{ background: "#C67A28" }}>
                      {busy ? "Sending…" : "Send Revision Request"}
                    </button>
                    <button onClick={() => { setRevising(false); setReason(""); setCaptionNeedsWork(false); }} className="text-[13px] font-semibold py-[10px] px-4 rounded-[10px] border border-line2 text-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button onClick={approve} disabled={busy || item.approvalStatus === "Approved" || approveBlockers.length > 0}
                      className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] text-white disabled:opacity-40" style={{ background: "#4E7A4E" }}>
                      {item.approvalStatus === "Approved" ? "✓ Approved" : busy ? "Saving…" : "✓ Approve"}
                    </button>
                    <button onClick={() => setRevising(true)} disabled={busy}
                      className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] border-[1.5px] border-line2 text-status-orange disabled:opacity-40">↩ Request Revision</button>
                  </div>
                  {item.approvalStatus !== "Approved" && approveBlockers.length > 0 && (
                    <div className="text-[11px] rounded-[8px] px-3 py-2" style={{ background: "#FFF5F4", color: "#B33A2E" }}>
                      <div className="font-bold mb-[2px]">ยัง Approve ไม่ได้ — ต้องผ่าน:</div>
                      <ul className="list-disc pl-4">{approveBlockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "publish" && !metaConnected && (
            <div className="flex flex-col items-center text-center gap-3 py-10 px-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-[26px]" style={{ background: "#F2F0EB" }}>🔒</div>
              <div className="text-[15px] font-extrabold text-ink">ยังใช้งาน Publish ไม่ได้</div>
              <div className="text-[12.5px] text-muted leading-[1.6] max-w-[360px]">
                หน้านี้ต้องเชื่อมบัญชี Meta (Facebook Page + Instagram Business) ก่อน
                จึงจะ Schedule / Publish ได้ — ตั้งค่าที่ <b className="text-ink">Settings › Integrations</b>
              </div>
              <div className="text-[11px] text-faint mt-1">ระหว่างนี้ยังทำ Caption / Approval และแนบ asset ได้ตามปกติ</div>
            </div>
          )}
          {tab === "publish" && metaConnected && (
            <div className="flex flex-col gap-[14px]">
              <div className="rounded-[12px] px-[14px] py-3" style={{ background: "#EEF3FF", border: "1px solid #C5D4F8" }}>
                <div className="text-[12px] font-bold mb-1" style={{ color: "#1E3A8A" }}>Meta Publish Queue</div>
                <div className="text-[12px]" style={{ color: "#3B6BF5" }}>
                  {metaConnected
                    ? `Mapped to ${metaAccount?.facebookPageName || metaAccount?.facebookPageId || "Facebook Page"}${metaAccount?.instagramHandle ? ` · ${metaAccount.instagramHandle}` : ""}`
                    : "Meta account not mapped yet · set it in Settings > Integrations"}
                </div>
              </div>

              {/* Approved assets attached from the Graphic Request module */}
              <div>
                <div className="text-[11.5px] font-bold text-muted mb-2">Approved assets {item.assets?.length ? `(${item.assets.length})` : ""}</div>
                <AssetLinkList assets={item.assets} />
              </div>
              <div>
                <div className="text-[11.5px] font-bold text-muted mb-2">Select channels</div>
                <div className="flex flex-col gap-[7px]">
                  {(metaChannels.length ? metaChannels : ["Facebook", "Instagram"]).map((channel) => {
                    const checked = selectedChannels.includes(channel);
                    const icon = /facebook/i.test(channel) ? "📘" : /reel/i.test(channel) ? "🎬" : "📸";
                    const sub = /facebook/i.test(channel)
                      ? (metaAccount?.facebookPageName || metaAccount?.facebookPageId || "Facebook Page")
                      : (metaAccount?.instagramHandle || metaAccount?.instagramBusinessId || "Instagram Business");
                    return (
                      <label key={channel} className="flex items-center justify-between px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line3 bg-surface cursor-pointer">
                        <div className="flex items-center gap-[9px]"><span className="text-[15px]">{icon}</span><div><div className="text-[13px] font-semibold">{channel}</div><div className="text-[11px] text-faint">{sub}</div></div></div>
                        <input type="checkbox" checked={checked} onChange={() => setSelectedChannels((list) => checked ? list.filter((x) => x !== channel) : [...list, channel])} />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                <div><label className="block text-[11.5px] font-bold text-muted mb-[5px]">Schedule Date</label><DatePicker value={scheduleDate} onChange={(v) => setScheduleDate(v || null)} /></div>
                <div><label className="block text-[11.5px] font-bold text-muted mb-[5px]">Schedule Time</label><input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className={field} /></div>
              </div>
              <div>
                <div className="text-[11.5px] font-bold text-muted mb-2">Preflight checklist</div>
                <div className="flex flex-col gap-[6px]">
                  {preflight(item, metaConnected).map((pf) => (
                    <div key={pf.label} className="flex items-center gap-[9px] px-[12px] py-2 rounded-[9px]" style={{ background: "#F7F4EE" }}>
                      <span className="text-[13px]">{pf.ok ? "✅" : "⬜"}</span>
                      <span className="text-[12.5px] font-medium" style={{ color: pf.ok ? "#4E7A4E" : "#9A9387" }}>{pf.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={scheduleMeta} disabled={!gate.ok || !metaConnected || !selectedChannels.length || busy}
                  className="text-[13px] font-bold py-3 rounded-[11px] disabled:cursor-not-allowed"
                  style={{ background: gate.ok && metaConnected && selectedChannels.length ? "#EEF3FF" : "#E8E2D6", color: gate.ok && metaConnected && selectedChannels.length ? "#3150A6" : "#9A9387" }}>
                  📌 Schedule to Meta
                </button>
                <button onClick={publishMetaNow} disabled={!gate.ok || !metaConnected || !selectedChannels.length || busy}
                  className="text-[13px] font-bold py-3 rounded-[11px] disabled:cursor-not-allowed"
                  style={{ background: gate.ok && metaConnected && selectedChannels.length ? "#211F1C" : "#E8E2D6", color: gate.ok && metaConnected && selectedChannels.length ? "#fff" : "#9A9387" }}>
                  🚀 Publish now
                </button>
              </div>

              {item.publishStatus === "Published" ? (
                <div className="rounded-[11px] px-[14px] py-3 text-center" style={{ background: "#EFF7EF", border: "1px solid #BFE0C4" }}>
                  <div className="text-[13px] font-bold text-status-green">✓ Published{item.publishedBy ? ` · ${item.publishedBy}` : ""}</div>
                  {item.publishedAt && <div className="text-[11px] text-faint mt-[2px]">{new Date(item.publishedAt).toLocaleString()}</div>}
                  <div className="text-[11.5px] text-faint mt-[3px]">โพสต์ด้วยมือแล้ว — บันทึกสถานะไว้ในระบบ</div>
                </div>
              ) : (
                <>
                  <button onClick={publish} disabled={!gate.ok || busy}
                    className="text-[13.5px] font-bold py-3 rounded-[11px] text-white disabled:cursor-not-allowed"
                    style={{ background: gate.ok ? "#211F1C" : "#E8E2D6", color: gate.ok ? "#fff" : "#9A9387" }}>
                    {busy ? "Publishing…" : gate.ok ? "✓ Mark as Published manually" : "🔒 Publish locked"}
                  </button>
                  {!gate.ok && (
                    <div className="rounded-[10px] px-[13px] py-[10px]" style={{ background: "#FBF3F1", border: "1px solid #E8C5BC" }}>
                      <div className="text-[11px] font-bold text-status-red mb-1">ยังกด Publish ไม่ได้ — ต้องผ่าน:</div>
                      {gate.reasons.map((r) => (
                        <div key={r} className="text-[12px] text-status-red font-semibold flex items-center gap-[6px]"><span>⚠</span><span>{r}</span></div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
