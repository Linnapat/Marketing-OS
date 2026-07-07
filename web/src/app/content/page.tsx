"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { ContentDrawer } from "@/components/content/ContentDrawer";
import { BrandFilterValue, brandName, BRAND_ORDER, BRANDS, BrandId } from "@/lib/brands";
import {
  CONTENT, ContentItem, contentTone, platIcon, brandOverview, PLATFORMS, itemPlatforms,
} from "@/lib/data/content";
import { fetchContent, createContent } from "@/lib/db/content";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { appendBriefItem } from "@/lib/db/brief";
import { createGraphic, buildGraphic } from "@/lib/db/graphic";
import { Graphic, emptyDeliverable } from "@/lib/data/graphic";
import { CampaignRow } from "@/lib/data/campaigns";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { emptyContentItem, BriefContentItem } from "@/lib/data/brief";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";

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

type View = "month" | "week" | "list" | "queue";
// July 2026 starts on a Wednesday (index 3, Sun=0).
const JULY_FIRST_DOW = 3;
const DAYS_IN_JULY = 31;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const labelDate = (iso: string) => { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : ""; };

export default function ContentPage() {
  const [view, setView] = useState<View>("month");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [open, setOpen] = useState<ContentItem | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>(CONTENT);
  const [newOpen, setNewOpen] = useState(false);
  const [newDay, setNewDay] = useState<number | null>(null);
  const openNew = (day?: number) => { setNewDay(day ?? null); setNewOpen(true); };
  const { member, user } = useAuth();
  const me = member?.name || user?.email?.split("@")[0] || "You";

  useEffect(() => {
    let alive = true;
    fetchContent().then((c) => { if (alive) setPosts(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const items = useMemo(() => posts.filter((c) => brand === "all" || c.b === brand), [posts, brand]);
  const cards = useMemo(() => brandOverview(posts), [posts]);

  const addPost = async (p: ContentItem, briefItem: BriefContentItem, campaign: string) => {
    setNewOpen(false);
    const created = await createContent(p);
    setPosts((ps) => [created, ...ps]);
    // Two-way sync: write the full content-item back into its campaign's Content Plan.
    if (campaign && campaign !== "—") appendBriefItem(campaign, briefItem).catch(() => {});
    // "Required Graphic" checked → drop a linked request into the Graphic
    // module (one deliverable per Platform × Asset Size). When every
    // deliverable is approved there, the asset links flow back onto THIS post
    // automatically (matched by campaign + content-item title) and unlock the
    // Publish gate. Unchecked = "No Asset": no request, publish without one.
    if (briefItem.requiredGraphic) {
      const plats = briefItem.platforms.length ? briefItem.platforms : [p.plat];
      const pairs = briefItem.assets.length ? briefItem.assets : plats.map((pl) => ({ platform: pl, size: "" }));
      const deliverables = pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", briefItem.referenceBriefLink || ""));
      const g: Graphic = {
        ...buildGraphic({
          id: Date.now(), b: p.b, campaign: p.campaign, title: p.title,
          type: briefItem.type, due: labelDate(briefItem.publishDate) || "TBD",
          designer: "Unassigned", requester: me, approver: me, channels: plats,
        }),
        stage: "New Request",
        size: pairs.map((a) => a.size).filter(Boolean).join(" · ") || "—",
        deliverables,
        nextAction: `Deliver ${deliverables.length} asset(s)`,
        contentItem: p.title,
      };
      createGraphic(g).catch(() => {});
      notify("newTask", `🎨 คำขอกราฟฟิกใหม่: ${p.title}`, `${deliverables.length} asset · ${plats.join(", ")} · จาก Content Calendar โดย ${me}`, "/graphic");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Content Command Center"
        title="Content Calendar"
        subtitle={`${items.length} posts this month · plan, caption, approve, schedule, publish`}
        right={<button onClick={() => openNew()} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]">+ New Post</button>}
      />

      {/* Brand overview cards */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        {cards.map((bc) => (
          <div key={bc.b} className="bg-surface border border-line rounded-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BrandDot brand={bc.b} size={10} />
              <div className="text-[14px] font-extrabold">{bc.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-[6px] text-[11px]">
              <span className="text-faint font-semibold">Posts this month</span><span className="font-bold text-right">{bc.total}</span>
              <span className="font-semibold" style={{ color: "#3E5C9A" }}>Scheduled</span><span className="font-bold text-right" style={{ color: "#3E5C9A" }}>{bc.scheduled}</span>
              <span className="font-semibold" style={{ color: "#C68A1E" }}>Waiting approval</span><span className="font-bold text-right" style={{ color: "#C68A1E" }}>{bc.waitApproval}</span>
              <span className="font-semibold" style={{ color: "#B33A2E" }}>Missing asset</span><span className="font-bold text-right" style={{ color: "#B33A2E" }}>{bc.missingAsset}</span>
            </div>
            {bc.failed > 0 && <div className="mt-2 text-[11px] font-bold text-status-red rounded-[7px] px-2 py-1" style={{ background: "#FBF3F1" }}>⚠ {bc.failed} failed</div>}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "list", label: "List" }, { value: "queue", label: "🚀 Queue" }]}
        />
        <BrandFilter value={brand} onChange={setBrand} label="" />
      </div>

      <div className="mt-5">
        {view === "month" && <MonthView items={items} onOpen={setOpen} onNew={openNew} />}
        {view === "week" && <WeekView items={items} onOpen={setOpen} />}
        {view === "list" && <ListView items={items} onOpen={setOpen} onNew={openNew} />}
        {view === "queue" && <QueueView items={items} onOpen={setOpen} />}
      </div>

      {open && (
        <ContentDrawer
          item={open}
          onClose={() => setOpen(null)}
          onUpdate={(next) => {
            setOpen(next);
            setPosts((ps) => ps.map((p) => (p.id === next.id ? next : p)));
          }}
        />
      )}
      {newOpen && <NewPostModal onClose={() => setNewOpen(false)} onCreate={addPost} count={posts.length} initialDay={newDay} />}
    </>
  );
}

function NewPostModal({ onClose, onCreate, count, initialDay }: { onClose: () => void; onCreate: (p: ContentItem, briefItem: BriefContentItem, campaign: string) => void; count: number; initialDay?: number | null }) {
  const [b, setB] = useState<BrandId>("teppen");
  const [campaign, setCampaign] = useState("");
  const [time, setTime] = useState("10:00");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  // Same content-item "template" as the Campaign Builder's Content Plan.
  const [item, setItem] = useState<BriefContentItem>(() => {
    const it = emptyContentItem(1);
    return initialDay ? { ...it, publishDate: `2026-07-${String(initialDay).padStart(2, "0")}` } : it;
  });
  const onChange = (patch: Partial<BriefContentItem>) => setItem((it) => ({ ...it, ...patch }));

  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === b), [campaigns, b]);
  useEffect(() => {
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign]);

  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const canCreate = item.title.trim() && item.platforms.length > 0 && campaign.trim();
  const create = () => {
    if (!canCreate) return;
    const day = item.publishDate ? Math.max(1, Math.min(31, Number(item.publishDate.split("-")[2]) || 1)) : (initialDay ?? 27);
    const post: ContentItem = {
      id: `c${String(count + 1).padStart(2, "0")}-new`,
      day, time, title: item.title.trim(), b, plat: item.platforms[0] ?? "Instagram", platforms: item.platforms,
      status: "Draft", campaign: campaign.trim(), owner: "Unassigned",
      caption: "", hashtags: "", cta: "",
      captionStatus: "Missing", assetStatus: item.requiredGraphic ? "Waiting Design" : "No Asset",
      approvalStatus: "Draft", publishStatus: "Draft",
    };
    onCreate(post, item, campaign.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-1">New Post</div>
        <div className="text-[12px] text-faint mb-4">ฟอร์มเดียวกับ Content Plan — บันทึกแล้ว sync กลับเข้า Campaign อัตโนมัติ</div>
        <div className="flex flex-col gap-4">
          {/* Calendar context: brand, campaign, time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
              <select value={b} onChange={(e) => setB(e.target.value as BrandId)} className={field}>
                {BRAND_ORDER.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign <span style={{ color: "#B33A2E" }}>*</span></label>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}>
                <option value="">{brandCampaigns.length ? "Select campaign…" : "No campaigns for this brand"}</option>
                {brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
            </div>
          </div>
          {/* Shared content-item template */}
          <ContentItemForm item={item} onChange={onChange} />
        </div>
        <button onClick={create} disabled={!canCreate} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Create Post</button>
      </div>
    </div>
  );
}

function MonthView({ items, onOpen, onNew }: { items: ContentItem[]; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void }) {
  const cells: (number | null)[] = [
    ...Array(JULY_FIRST_DOW).fill(null),
    ...Array.from({ length: DAYS_IN_JULY }, (_, i) => i + 1),
  ];
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line4">
        {DOW.map((d) => <div key={d} className="text-[10.5px] font-bold text-faint uppercase tracking-[0.05em] px-2 py-2 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const dayItems = day ? items.filter((c) => c.day === day) : [];
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
                  <button key={c.id} onClick={() => onOpen(c)} className="w-full text-left flex items-center gap-[5px] rounded-[6px] px-[5px] py-[3px] hover:bg-ivory transition" style={{ background: "#FAF8F4", border: "1px solid #F0EBE0" }}>
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

function WeekView({ items, onOpen }: { items: ContentItem[]; onOpen: (c: ContentItem) => void }) {
  const byDay = [...new Set(items.map((c) => c.day))].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3">
      {byDay.map((day) => (
        <div key={day} className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-2 text-[12px] font-bold border-b border-line4">July {day}</div>
          {items.filter((c) => c.day === day).sort((a, b) => a.time.localeCompare(b.time)).map((c) => <Row key={c.id} c={c} onOpen={onOpen} />)}
        </div>
      ))}
    </div>
  );
}

function Row({ c, onOpen }: { c: ContentItem; onOpen: (c: ContentItem) => void }) {
  return (
    <button onClick={() => onOpen(c)} className="w-full grid grid-cols-[52px_1fr_auto] gap-3 items-center px-5 py-[11px] text-left border-b border-line4 last:border-0 hover:bg-ivory/60">
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

function ListView({ items, onOpen, onNew }: { items: ContentItem[]; onOpen: (c: ContentItem) => void; onNew: (day?: number) => void }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-[10px] border-b border-line4" style={{ background: "#FBF9F4" }}>
        <span className="text-[11px] uppercase tracking-[0.05em] text-faint font-bold">Content schedule</span>
        <button onClick={() => onNew()} className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-3 py-[6px]">+ New Post</button>
      </div>
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "60px 2fr 1.2fr 1fr 1fr 1fr 1fr" }}>
        <div>Date</div><div>Content</div><div>Campaign</div><div>Caption</div><div>Asset</div><div>Approval</div><div>Publish</div>
      </div>
      {[...items].sort((a, b) => a.day - b.day).map((c) => {
        return (
          <button key={c.id} onClick={() => onOpen(c)} className="w-full grid grid-cols-1 md:grid-cols-[60px_2fr_1.2fr_1fr_1fr_1fr_1fr] gap-y-1 items-center px-5 py-3 text-left border-b border-line4 last:border-0 hover:bg-ivory/60">
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
    </div>
  );
}

function QueueView({ items, onOpen }: { items: ContentItem[]; onOpen: (c: ContentItem) => void }) {
  const queue = items.filter((c) => ["Scheduled in OS", "Queued", "Published", "Failed"].includes(c.publishStatus));
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
                <div className="text-[11px] text-faint">{brandName(c.b)} · July {c.day}, {c.time}</div>
              </div>
              <StatusBadge tone={contentTone(c.publishStatus)}>{c.publishStatus}</StatusBadge>
              <button onClick={() => onOpen(c)} className="text-[11.5px] font-bold text-accent border border-line2 rounded-[8px] px-3 py-[5px]">Open ↗</button>
            </div>
          );
        })}
        {queue.length === 0 && <div className="text-[13px] text-faint text-center py-10">No scheduled posts for this brand.</div>}
      </div>
    </div>
  );
}
