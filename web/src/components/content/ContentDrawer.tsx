"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ContentItem, contentTone, platIcon, itemPlatforms, contentWarnings, preflight, canPublish, contentApproveBlockers, advanceApprovalState } from "@/lib/data/content";
import { brandName, brandColor } from "@/lib/brands";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateContent, deleteContent, approveContent, publishContent, scheduleContentToMeta, publishContentToMeta } from "@/lib/db/content";
import { createRevisionTask } from "@/lib/db/tasks";
import { fetchMetaPublishingAccounts, hasMetaAccount, MetaBrandAccount } from "@/lib/db/metaPublishing";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { DatePicker } from "@/components/ui/DatePicker";

const TABS = [["overview", "Overview"], ["caption", "Caption"], ["approval", "Approval"], ["publish", "Publish"]] as const;
type DTab = (typeof TABS)[number][0];
type CaptionTemplates = { hashtags: string[]; footers: string[]; ctas: string[] };
const CAPTION_TEMPLATE_KEY = "marketing_os_caption_templates_v1";
const emptyTemplates: CaptionTemplates = { hashtags: [], footers: [], ctas: [] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, 12);
}

export function ContentDrawer({ item, onClose, onUpdate, onDelete }: {
  item: ContentItem; onClose: () => void;
  onUpdate?: (next: ContentItem) => void;
  onDelete?: (deleted: ContentItem) => void;
}) {
  const [tab, setTab] = useState<DTab>("overview");
  const [caption, setCaption] = useState(item.caption);
  // Editable post basics (title / date / time) — saved from the Overview tab.
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDate, setEditDate] = useState<string | null>(item.dateIso ?? null);
  const [editTime, setEditTime] = useState(item.time || "10:00");
  const [hashtags, setHashtags] = useState(item.hashtags);
  const [cta, setCta] = useState(item.cta);
  const [footer, setFooter] = useState(item.footer ?? "");
  const [templates, setTemplates] = useState<CaptionTemplates>(emptyTemplates);
  const [copyDone, setCopyDone] = useState(false);
  const warnings = contentWarnings(item);

  const { member, user } = useAuth();
  const reviewer = member?.name ?? user?.email ?? "CMO";
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState(item.time || "10:00");
  const [metaAccount, setMetaAccount] = useState<MetaBrandAccount | undefined>();
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
    try {
      const raw = window.localStorage.getItem(CAPTION_TEMPLATE_KEY);
      if (raw) setTemplates({ ...emptyTemplates, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const rememberTemplate = (kind: keyof CaptionTemplates, value: string) => {
    const v = value.trim();
    if (!v) return;
    const next = { ...templates, [kind]: uniq([v, ...templates[kind]]) };
    setTemplates(next);
    window.localStorage.setItem(CAPTION_TEMPLATE_KEY, JSON.stringify(next));
  };
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
  const persist = async (next: ContentItem) => {
    setBusy(true);
    try {
      await updateContent(next);
      onUpdate?.(next);
    } catch (error) {
      toastError(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setBusy(false); }
  };

  // Save the post basics (title / date / time). `day` is derived from the ISO
  // date so the month calendar re-slots the post immediately.
  const saveBasics = () => {
    const day = editDate ? Number(editDate.slice(8, 10)) || item.day : item.day;
    persist({ ...item, title: editTitle.trim() || item.title, dateIso: editDate ?? item.dateIso, day, time: editTime || item.time });
  };

  // Media link + release status (Creative).
  const [mediaLink, setMediaLink] = useState(item.mediaLink ?? "");
  useEffect(() => { setMediaLink(item.mediaLink ?? ""); }, [item.mediaLink]);
  const mediaDirty = mediaLink.trim() !== (item.mediaLink ?? "").trim();
  const saveMedia = () => persist({ ...item, mediaLink: mediaLink.trim() || undefined });
  const toggleRelease = () => {
    const released = item.releaseStatus === "Released";
    persist(released
      ? { ...item, releaseStatus: "", releasedBy: undefined, releasedAt: undefined }
      : { ...item, releaseStatus: "Released", releasedBy: reviewer, releasedAt: new Date().toISOString(), mediaLink: mediaLink.trim() || item.mediaLink });
    if (!released) notify("launch", `🎬 Creative ปล่อยงานแล้ว: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${reviewer}`, "/content");
  };
  const basicsDirty = editTitle !== item.title || (editDate ?? null) !== (item.dateIso ?? null) || editTime !== (item.time || "10:00");

  // Permanently delete the post (asks for confirmation first).
  const [deleting, setDeleting] = useState(false);
  const removePost = async () => {
    if (!window.confirm(`ลบโพสต์ "${item.title}" ถาวร? การลบย้อนกลับไม่ได้`)) return;
    setDeleting(true);
    try {
      await deleteContent(item);
      onDelete?.(item);
      onClose();
    } catch (error) {
      toastError(`ลบโพสต์ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setDeleting(false); }
  };

  // Save caption/hashtags/cta; "Mark Ready" flips captionStatus and, if the post
  // is now fully ready, advanceApprovalState pushes it into My Approval.
  const saveCaption = () => persist(advanceApprovalState({ ...item, caption, hashtags, cta, footer }));
  const markCaptionReady = () => persist(advanceApprovalState({ ...item, caption, hashtags, cta, footer, captionStatus: "Ready" }));

  const approveBlockers = contentApproveBlockers(item);
  const approve = async () => {
    setBusy(true);
    try {
      const res = await approveContent(item, reviewer);
      if (!res.ok) { toastError("ยัง Approve ไม่ได้:\n• " + res.reasons.join("\n• ")); return; }
      onUpdate?.(res.post);
      notify("approved", `✅ Content อนุมัติแล้ว: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${reviewer}`, "/content");
    } finally { setBusy(false); }
  };

  const requestRevision = () => {
    const r = reason.trim();
    if (!r) return;
    const round = (item.feedbackRounds ?? 0) + 1;
    persist({
      ...item, approvalStatus: "Revision Requested", feedbackRounds: round,
      feedback: [...(item.feedback ?? []), { round, reason: r, by: reviewer, at: new Date().toISOString() }],
    });
    // Bounce it back into the fixer's My Tasks (creator, else requester).
    const fixer = item.owner && item.owner !== "Unassigned" ? item.owner : (item.requester || item.designer || "");
    if (fixer) {
      createRevisionTask({
        module: "Content", title: `แก้ Content — ${item.title}`, assignee: fixer,
        brand: brandName(item.b), campaign: item.campaign, reason: r, by: reviewer,
      }).catch((error) => toastError(`สร้าง task แก้ Content ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    notify("rejected", `↩ Content ถูกส่งกลับแก้: ${item.title}`, `${fixer ? `ถึง ${fixer} — ` : ""}${r} · โดย ${reviewer}`, "/my-tasks");
    setReason(""); setRevising(false);
  };

  const gate = canPublish(item);
  const publish = async () => {
    setBusy(true);
    try {
      const res = await publishContent(item, reviewer);
      if (!res.ok) { toastError("ยัง Publish ไม่ได้:\n• " + res.reasons.join("\n• ")); return; }
      onUpdate?.(res.post);
      notify("launch", `🚀 โพสต์ถูก publish: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${reviewer}`, "/content");
    } finally { setBusy(false); }
  };
  const scheduleMeta = async () => {
    const scheduledFor = `${scheduleDate || item.dateIso || `2026-07-${String(item.day || 1).padStart(2, "0")}`}T${scheduleTime || item.time || "10:00"}:00+07:00`;
    setBusy(true);
    try {
      const res = await scheduleContentToMeta(item, reviewer, scheduledFor, selectedChannels);
      if (!res.ok) { toastError("ยัง Queue ไป Meta ไม่ได้:\n• " + res.reasons.join("\n• ")); return; }
      onUpdate?.(res.post);
      notify("launch", `📌 Scheduled to Meta: ${item.title}`, `${brandName(item.b)} · ${selectedChannels.join(", ")}`, "/content");
    } finally { setBusy(false); }
  };
  const publishMetaNow = async () => {
    setBusy(true);
    try {
      const res = await publishContentToMeta(item, reviewer, selectedChannels, metaAccount);
      if (!res.ok) { toastError("Meta publish ไม่สำเร็จ:\n• " + res.reasons.join("\n• ")); onUpdate?.(res.post); return; }
      onUpdate?.(res.post);
      notify("launch", `🚀 Published to Meta: ${item.title}`, `${brandName(item.b)} · ${selectedChannels.join(", ")}`, "/content");
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
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-muted">
              <span className="flex items-center gap-[5px]"><span className="w-[7px] h-[7px] rounded-full" style={{ background: brandColor(item.b) }} />{brandName(item.b)}</span>
              <span className="text-faint">·</span><span>{item.campaign}</span>
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
              <div className="rounded-[14px] h-40 flex flex-col items-center justify-center gap-2" style={{ background: "#F0EBE0" }}>
                <span className="text-[28px]">🖼</span>
                <span className="text-[13px] text-faint font-semibold">{item.assetStatus}</span>
              </div>
              <div className="grid grid-cols-2 gap-[10px]">
                {[["Status", <StatusBadge key="s" tone={contentTone(item.status)}>{item.status}</StatusBadge>],
                  ["Owner", <span key="o" className="text-[13.5px] font-semibold">{item.owner}</span>],
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
                <div className="flex flex-col gap-3">
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
                  <button onClick={saveBasics} disabled={busy || !basicsDirty || !editTitle.trim()}
                    className="text-[13px] font-bold py-[10px] rounded-[10px] bg-panel text-white disabled:opacity-40">
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
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
                    <button onClick={toggleRelease} disabled={busy}
                      className="text-[12px] font-bold px-3 py-[7px] rounded-[9px] disabled:opacity-40"
                      style={item.releaseStatus === "Released"
                        ? { background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }
                        : { background: "#4E7A4E", color: "#fff" }}>
                      {item.releaseStatus === "Released" ? "ยกเลิก Release" : "✓ Mark Released"}
                    </button>
                  </div>
                  {mediaDirty && (
                    <button onClick={saveMedia} disabled={busy}
                      className="text-[13px] font-bold py-[9px] rounded-[10px] bg-panel text-white disabled:opacity-40">
                      {busy ? "Saving…" : "Save media link"}
                    </button>
                  )}
                </div>
              </div>

              {/* Delete — permanent, confirmed */}
              <button onClick={removePost} disabled={deleting}
                className="text-[12.5px] font-bold py-[10px] rounded-[10px] disabled:opacity-40"
                style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
                {deleting ? "Deleting…" : "🗑 ลบโพสต์นี้"}
              </button>
            </div>
          )}

          {tab === "caption" && (
            <div className="flex flex-col gap-[14px]">
              <div>
                <div className="flex items-center justify-between mb-[6px]">
                  <label className="text-[11.5px] font-bold text-muted">Caption</label>
                  <StatusBadge tone={contentTone(item.captionStatus)}>{item.captionStatus}</StatusBadge>
                </div>
                <textarea rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write caption here…" className={`${field} resize-y leading-[1.5]`} />
                <div className="text-[11px] text-faint mt-1 text-right">{caption.length} chars</div>
              </div>

              {/* Brief guide — reference from the Content Plan for writing the caption */}
              {(() => {
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
              })()}
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Hashtags</label>
                <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#wagyu #bangkok #teppen" className={field} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => rememberTemplate("hashtags", hashtags)} className="rounded-pill border border-line2 bg-surface px-3 py-1 text-[11px] font-bold text-muted">Save hashtag set</button>
                  {templates.hashtags.map((v) => <button key={v} onClick={() => setHashtags(v)} className="rounded-pill bg-[#EEF1F8] px-3 py-1 text-[11px] font-bold text-[#3E5C9A]">{v}</button>)}
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Call to Action</label>
                <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Reserve now via link in bio" className={field} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => rememberTemplate("ctas", cta)} className="rounded-pill border border-line2 bg-surface px-3 py-1 text-[11px] font-bold text-muted">Save CTA</button>
                  {templates.ctas.map((v) => <button key={v} onClick={() => setCta(v)} className="rounded-pill bg-[#EEF4EE] px-3 py-1 text-[11px] font-bold text-[#4E7A4E]">{v}</button>)}
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-muted mb-[6px]">Footer</label>
                <input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="เช่น เงื่อนไข / สาขา / เวลาทำการ" className={field} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => rememberTemplate("footers", footer)} className="rounded-pill border border-line2 bg-surface px-3 py-1 text-[11px] font-bold text-muted">Save footer</button>
                  {templates.footers.map((v) => <button key={v} onClick={() => setFooter(v)} className="rounded-pill bg-[#FFF6E8] px-3 py-1 text-[11px] font-bold text-[#C68A1E]">{v}</button>)}
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
              <div className="text-[11.5px] text-faint">Last edited by {item.owner}{caption.trim() ? "" : " · เขียน caption ก่อนกด Mark Ready"}</div>
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
                    ✓ Approved by {item.approvedBy}{item.approvedAt ? ` · ${new Date(item.approvedAt).toLocaleString()}` : ""}
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
                  <div className="flex gap-2">
                    <button onClick={requestRevision} disabled={!reason.trim() || busy}
                      className="flex-1 text-[13px] font-bold py-[10px] rounded-[10px] text-white disabled:opacity-40" style={{ background: "#C67A28" }}>
                      {busy ? "Sending…" : "Send Revision Request"}
                    </button>
                    <button onClick={() => { setRevising(false); setReason(""); }} className="text-[13px] font-semibold py-[10px] px-4 rounded-[10px] border border-line2 text-muted">Cancel</button>
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
                {item.assets && item.assets.length > 0 ? (
                  <div className="flex flex-col gap-[7px]">
                    {item.assets.map((a, i) => (
                      <a key={i} href={a.link} target="_blank" rel="noreferrer"
                        className="flex items-center justify-between px-[13px] py-[10px] rounded-[10px] border-[1.5px] hover:bg-ivory"
                        style={{ borderColor: "#BFE0C4", background: "#F3FAF3" }}>
                        <div className="flex items-center gap-[9px] min-w-0">
                          <span className="text-[14px]">✅</span>
                          <div className="min-w-0"><div className="text-[12.5px] font-semibold truncate">{a.platform}</div><div className="text-[11px] text-faint">{a.size}</div></div>
                        </div>
                        <span className="text-[11.5px] font-bold text-status-green flex-shrink-0">Open ↗</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12px] text-faint px-[13px] py-[10px] rounded-[10px]" style={{ background: "#F7F4EE" }}>
                    ยังไม่มี asset — จะแนบอัตโนมัติเมื่อทีมกราฟฟิกส่งงานและอนุมัติครบทุกชิ้นใน Graphic Request
                  </div>
                )}
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
