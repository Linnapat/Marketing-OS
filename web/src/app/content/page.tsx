"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { ContentDrawer } from "@/components/content/ContentDrawer";
import { BrandFilterValue, brandName, BRANDS, BrandId } from "@/lib/brands";
import {
  CONTENT, ContentItem, contentTone, platIcon, PLATFORMS, itemPlatforms, contentDateIso,
} from "@/lib/data/content";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { fetchContent, createContent } from "@/lib/db/content";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { appendBriefItem } from "@/lib/db/brief";
import { createGraphic, buildGraphic } from "@/lib/db/graphic";
import { Graphic, emptyDeliverable } from "@/lib/data/graphic";
import { CampaignRow } from "@/lib/data/campaigns";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { emptyContentItem, BriefContentItem, GRAPHIC_MIN_BUSINESS_DAYS, isGraphicDueDateAllowed } from "@/lib/data/brief";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { useBrandVisibility } from "@/lib/brandVisibility";

/** Row of platform badges (one per selected channel). */
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

export default function ContentPage() {
  const [view, setView] = useState<View>("month");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [open, setOpen] = useState<ContentItem | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>(CONTENT);
  const [savedViews, setSavedViews] = useState<SavedContentView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newIso, setNewIso] = useState<string | null>(null);
  const { member, user } = useAuth();
  const me = member?.name || user?.email?.split("@")[0] || "You";

  useEffect(() => {
    let alive = true;
    fetchContent().then((c) => { if (alive) setPosts(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
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
  const gy = date.mode === "month" ? date.year : Number((date.start || "2026-07-01").slice(0, 4));
  const gm = date.mode === "month" ? date.month : Number((date.start || "2026-07-01").slice(5, 7)) - 1;
  const ymKey = `${gy}-${String(gm + 1).padStart(2, "0")}`;

  const openNew = (day?: number) => { setNewIso(day ? `${ymKey}-${String(day).padStart(2, "0")}` : null); setNewOpen(true); };

  const items = useMemo(
    () => posts.filter((c) => (brand === "all" || c.b === brand) && inDateFilter(date, contentDateIso(c))),
    [posts, brand, date],
  );
  const summary = useMemo(() => ({
    posts: items.length,
    waitingApproval: items.filter((c) => c.approvalStatus === "Waiting Approval").length,
    waitingAsset: items.filter((c) => c.assetStatus === "Waiting Design" || c.assetStatus === "Missing").length,
    scheduled: items.filter((c) => ["Scheduled in OS", "Queued", "Scheduled to Meta", "Publishing"].includes(c.publishStatus)).length,
  }), [items]);

  const addPost = async (p: ContentItem, briefItem: BriefContentItem, campaign: string, campaignId?: string) => {
    const requester = briefItem.requester?.trim() || me;
    const designer = briefItem.designer || "Unassigned";
    const approver = briefItem.approver?.trim() || requester;
    const normalizedBriefItem: BriefContentItem = { ...briefItem, requester, designer, approver };
    const sourceContentItemId = isTemplateContentId(briefItem.id) ? uniqueNewPostId("ci-cal") : briefItem.id;
    const graphicRequestId = briefItem.requiredGraphic ? String(Date.now() + 700) : undefined;
    const post: ContentItem = {
      ...p,
      requester,
      designer,
      approver,
      campaignId,
      sourceContentItemId,
      graphicRequestId,
    };
    const created = await createContent(post);
    setPosts((ps) => [created, ...ps]);
    setNewOpen(false);
    // Two-way sync: write the full content-item back into its campaign's Content Plan.
    if (campaign && campaign !== "—") {
      appendBriefItem(campaign, { ...normalizedBriefItem, id: sourceContentItemId })
        .catch((error) => toastError(`บันทึก Post แล้ว แต่ sync กลับ Campaign Plan ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    // "Required Graphic" checked → drop a linked request into the Graphic
    // module (one deliverable per Platform × Asset Size). When every
    // deliverable is approved there, the asset links flow back onto THIS post
    // automatically (matched by campaign + content-item title) and unlock the
    // Publish gate. Unchecked = "No Asset": no request, publish without one.
    if (briefItem.requiredGraphic) {
      const plats = normalizedBriefItem.platforms.length ? normalizedBriefItem.platforms : [p.plat];
      const pairs = normalizedBriefItem.assets.length ? normalizedBriefItem.assets : plats.map((pl) => ({ platform: pl, size: "" }));
      const deliverables = pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", normalizedBriefItem.referenceBriefLink || ""));
      const g: Graphic = {
        ...buildGraphic({
          id: Number(graphicRequestId), b: p.b, campaign: p.campaign, title: p.title,
          type: normalizedBriefItem.type, due: labelDate(normalizedBriefItem.graphicDueDate) || "TBD", dueIso: normalizedBriefItem.graphicDueDate,
          designer, requester, approver, channels: plats,
          campaignId, sourceContentItemId,
        }),
        stage: "New Request",
        size: pairs.map((a) => a.size).filter(Boolean).join(" · ") || "—",
        deliverables,
        nextAction: `Deliver ${deliverables.length} asset(s)`,
        contentItem: p.title,
      };
      createGraphic(g).catch((error) => toastError(`บันทึก Content แล้ว แต่สร้าง Graphic Request ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      notify("newTask", `🎨 คำขอกราฟฟิกใหม่: ${p.title}`, `${deliverables.length} asset · ${plats.join(", ")} · จาก Content Calendar โดย ${me}`, "/graphic");
    }
  };

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="THE DAILY BOOST"
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
                <span className="text-[12px] font-semibold text-faint">{items.length} posts in view</span>
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

      <div className="mt-5">
        {view === "month" && <MonthView items={items} year={gy} month={gm} onOpen={setOpen} onNew={openNew} />}
        {view === "week" && <WeekView items={items} monthName={MON[gm]} onOpen={setOpen} />}
        {view === "list" && <ListView items={items} onOpen={setOpen} onNew={openNew} />}
        {view === "queue" && <QueueView items={items} onOpen={setOpen} />}
        {view === "campaign" && <CampaignView items={items} onOpen={setOpen} onNew={openNew} />}
      </div>

      {open && (
        <ContentDrawer
          item={open}
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

function NewPostModal({ onClose, onCreate, count, initialIso }: { onClose: () => void; onCreate: (p: ContentItem, briefItem: BriefContentItem, campaign: string, campaignId?: string) => Promise<void>; count: number; initialIso?: string | null }) {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [b, setB] = useState<BrandId>(brandOptions[0] ?? "teppen");
  const [campaign, setCampaign] = useState("");
  const [time, setTime] = useState("10:00");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
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
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!brandOptions.includes(b)) setB(brandOptions[0] ?? "teppen"); }, [b, brandOptions]);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === b), [campaigns, b]);
  const selectedCampaign = useMemo(() => brandCampaigns.find((c) => c.name === campaign), [brandCampaigns, campaign]);
  useEffect(() => {
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign]);

  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const dueOrderValid = !item.publishDate || !item.graphicDueDate || item.graphicDueDate <= item.publishDate;
  const graphicLeadValid = !item.requiredGraphic || (!!item.graphicDueDate && isGraphicDueDateAllowed(item.graphicDueDate, requestDate));
  const canCreate = item.title.trim() && item.platforms.length > 0 && !!selectedCampaign && (!item.requiredGraphic || item.graphicDueDate) && dueOrderValid && graphicLeadValid;
  const missing = [
    !campaign.trim() ? "campaign" : null,
    campaign.trim() && !selectedCampaign ? "campaign from the list" : null,
    !item.title.trim() ? "post title" : null,
    !item.platforms.length ? "platform" : null,
    item.requiredGraphic && !item.graphicDueDate ? "graphic due date" : null,
    item.requiredGraphic && item.graphicDueDate && !graphicLeadValid ? `graphic due date at least ${GRAPHIC_MIN_BUSINESS_DAYS} business days` : null,
    !dueOrderValid ? "graphic due date before publish date" : null,
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
      status: "Draft", campaign: campaign.trim(), owner: "Unassigned",
      caption: "", hashtags: "", cta: "",
      captionStatus: "Missing", assetStatus: item.requiredGraphic ? "Waiting Design" : "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    };
    try {
      await onCreate(post, item, campaign.trim(), selectedCampaign?.id);
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
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                list="content-campaign-options"
                className={field}
                placeholder={brandCampaigns.length ? "Type to search campaign…" : "No campaigns for this brand"}
              />
              <datalist id="content-campaign-options">
                {brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </datalist>
              {campaign.trim() && !selectedCampaign && <div className="mt-1 text-[11px] font-semibold text-status-red">เลือก Campaign จากรายการที่มีอยู่ เพื่อให้ sync กลับ Campaign ได้ถูกต้อง</div>}
            </div>
          </div>
          {/* Shared content-item template */}
          <ContentItemForm item={item} onChange={onChange} requesterFallback={me} requestDate={requestDate} publishTime={time} onPublishTimeChange={setTime} />
        </div>
        <div className="mt-5 rounded-[16px] border px-4 py-3" style={{ background: canCreate ? "#EEF8E8" : "#FBF6EC", borderColor: canCreate ? "#CFE4C2" : "#EADBC1" }}>
          <div className="text-[12px] font-bold" style={{ color: canCreate ? "#3F6A34" : "#8A6D1E" }}>
            {canCreate ? "Ready to save into Content Plan" : `Before saving, add ${missing.join(", ")}`}
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

function MonthView({ items, year, month, onOpen, onNew }: { items: ContentItem[]; year: number; month: number; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void }) {
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
          const dayItems = day ? items.filter((c) => contentDateIso(c) === `${ymKey}-${String(day).padStart(2, "0")}`) : [];
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ items, monthName, onOpen }: { items: ContentItem[]; monthName: string; onOpen: (c: ContentItem) => void }) {
  const byDate = [...new Set(items.map((c) => contentDateIso(c)))].sort();
  return (
    <div className="flex flex-col gap-3">
      {byDate.map((iso) => (
        <div key={iso} className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-2 text-[12px] font-bold border-b border-line4">{labelDate(iso) || `${monthName} ${Number(iso.slice(8, 10))}`}</div>
          {items.filter((c) => contentDateIso(c) === iso).sort((a, b) => a.time.localeCompare(b.time)).map((c) => <Row key={c.id} c={c} onOpen={onOpen} />)}
        </div>
      ))}
    </div>
  );
}

function Row({ c, onOpen }: { c: ContentItem; onOpen: (c: ContentItem) => void }) {
  return (
    <button onClick={() => onOpen(c)} className="w-full grid grid-cols-[52px_1fr_auto] gap-3 items-center px-5 py-[11px] text-left border-b border-line4 last:border-0 hover:bg-ivory/60 border-l-[5px]" style={{ borderLeftColor: campaignAccent(c.campaign) }}>
      <span className="text-[11px] font-bold text-faint">{c.time}</span>
      <div className="flex items-center gap-2 min-w-0">
        <PlatBadges item={c} size={18} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{c.title}</div>
          <div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={c.b} size={6} />{brandName(c.b)} · {c.campaign}</div>
        </div>
      </div>
      <StatusBadge tone={contentTone(c.status)}>{c.status}</StatusBadge>
    </button>
  );
}


/** Campaign view — Platform-Performance-style collapsible groups: one row per
 *  campaign with summary stats, expandable to the post list inside. */
function CampaignView({ items, onOpen, onNew }: { items: ContentItem[]; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const c of items) { const k = c.campaign || "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  if (groups.length === 0) return <ListView items={items} onOpen={onOpen} onNew={onNew} />;
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
              <span className="text-[11.5px] text-faint font-semibold">{list.length} post{list.length > 1 ? "s" : ""}</span>
              <span className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                {chip("waiting approval", waitingApproval, "#C68A1E", "#FBF8EE")}
                {chip("waiting asset", waitingAsset, "#B33A2E", "#FFF5F4")}
                {chip("scheduled", scheduled, "#3E5C9A", "#EEF1F8")}
                {chip("published", published, "#4E7A4E", "#EEF4EE")}
              </span>
            </button>
            {isOpen && <div className="border-t border-line4"><ListView items={list} onOpen={onOpen} onNew={onNew} /></div>}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ items, onOpen, onNew }: { items: ContentItem[]; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-[10px] border-b border-line4" style={{ background: "#FBF9F4" }}>
        <span className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold">Content schedule</span>
        <button onClick={() => onNew()} className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[6px]">+ Plan Post</button>
      </div>
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "60px 2fr 1.2fr 1fr 1fr 1fr 1fr" }}>
        <div>Date</div><div>Content</div><div>Campaign</div><div>Caption</div><div>Asset</div><div>Approval</div><div>Publish</div>
      </div>
      {[...items].sort((a, b) => a.day - b.day).map((c) => {
        return (
          <button key={c.id} onClick={() => onOpen(c)} className="w-full grid grid-cols-1 md:grid-cols-[60px_2fr_1.2fr_1fr_1fr_1fr_1fr] gap-y-1 items-center px-5 py-3 text-left border-b border-line4 last:border-0 hover:bg-ivory/60 border-l-[5px]" style={{ borderLeftColor: campaignAccent(c.campaign) }}>
            <span className="text-[11px] font-bold text-faint">Jul {c.day}</span>
            <div className="flex items-center gap-2 min-w-0">
              <PlatBadges item={c} size={18} />
              <div className="min-w-0"><div className="text-[13px] font-semibold truncate">{c.title}</div><div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={c.b} size={6} />{c.owner}</div></div>
            </div>
            <span className="text-[12px] text-muted truncate">{c.campaign}</span>
            <StatusBadge tone={contentTone(c.captionStatus)}>{c.captionStatus}</StatusBadge>
            <StatusBadge tone={contentTone(c.assetStatus)}>{c.assetStatus}</StatusBadge>
            <StatusBadge tone={contentTone(c.approvalStatus)}>{c.approvalStatus}</StatusBadge>
            <StatusBadge tone={contentTone(c.publishStatus)}>{c.publishStatus}</StatusBadge>
          </button>
        );
      })}
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

function QueueView({ items, onOpen }: { items: ContentItem[]; onOpen: (c: ContentItem) => void }) {
  const queue = items.filter((c) => ["Scheduled in OS", "Queued", "Scheduled to Meta", "Publishing", "Published", "Failed"].includes(c.publishStatus));
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
