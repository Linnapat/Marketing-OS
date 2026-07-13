"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import { BrandFilterValue, BrandId, brandName, BRANDS } from "@/lib/brands";
import {
  GRAPHICS, STAGE_ORDER, Graphic, stageTone, PRIORITY_TONE, DESIGNER_COLOR,
  DESIGNERS, graphicKpis, graphicNeedsAttention, emptyDeliverable,
} from "@/lib/data/graphic";
import { fetchGraphics, createGraphic, buildGraphic } from "@/lib/db/graphic";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { createContent } from "@/lib/db/content";
import { appendBriefItem } from "@/lib/db/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { ContentItem } from "@/lib/data/content";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { emptyContentItem, BriefContentItem } from "@/lib/data/brief";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { useAuth } from "@/lib/auth";
import { useBrandVisibility } from "@/lib/brandVisibility";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  FilterBar,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelDate(iso: string): string { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : ""; }


export default function GraphicPage() {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [view, setView] = useState<"board" | "list">("board");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [designer, setDesigner] = useState<string>("all");
  const [drawer, setDrawer] = useState<{ g: Graphic; tab: "overview" | "feedback" } | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [graphics, setGraphics] = useState<Graphic[]>(GRAPHICS);

  useEffect(() => {
    let alive = true;
    fetchGraphics().then((g) => { if (alive) setGraphics(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const next = brandVisibility.normalize(brand);
    if (next !== brand) setBrand(next);
  }, [brand, brandVisibility]);

  // Creating a graphic request now goes through the shared Content Plan template:
  // it spawns the graphic (with per-asset deliverables), a real content post, and
  // writes the item back into the campaign's Content Plan — one source of truth.
  const addGraphic = async (g: Graphic, post: ContentItem | null, briefItem: BriefContentItem | null, campaign: string) => {
    setReqOpen(false);
    setGraphics((gs) => [g, ...gs]);
    await createGraphic(g);
    if (post) await createContent(post).catch(() => {});
    if (briefItem && campaign && campaign !== "—") appendBriefItem(campaign, briefItem).catch(() => {});
  };

  const items = graphics.filter((g) => (brand === "all" || g.b === brand) && (designer === "all" || g.designer === designer) && inDateFilter(date, g.due));
  const kpi = graphicKpis(items);
  const attention = graphicNeedsAttention(items);

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
        eyebrow="CREATIVE KITCHEN"
        title="Graphic Request"
        description="Brief, assign, review, approve, and deliver every creative request in one workspace."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={() => setReqOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Send Brief</button>}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-faint">
                {items.length} requests in view · shared with campaign, content, and approval checkpoints
              </div>
              <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard
          title="Graphic Request Summary ✨"
          titleClassName="text-[#7A5710]"
          style={{
            background: "linear-gradient(180deg, #F4D48D 0%, #E7BE67 100%)",
            border: "1px solid #D5A94D",
            boxShadow: "0 18px 44px rgba(180, 132, 33, 0.20)",
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { ...KPIS[0], emoji: "🎨" },
              { ...KPIS[1], emoji: "🛠️" },
              { ...KPIS[2], emoji: "💬" },
              { ...KPIS[3], emoji: "🔁" },
              { ...KPIS[4], emoji: "✅" },
            ].map((k) => (
              <div key={k.label} className="rounded-[20px] border px-4 py-4 bg-white/55" style={{ borderColor: "#D9B86A" }}>
                <div className="text-[11px] uppercase tracking-[0.08em] text-[#8A6930] font-extrabold">
                  {k.emoji} {k.label}
                </div>
                <div className="mt-3 text-[28px] leading-none font-extrabold text-[#2F2413]">{k.value}</div>
                <div className="mt-2 text-[11px] font-semibold text-[#70552B]">
                  {k.label === "Total" ? "All open design requests in this view" :
                    k.label === "In Progress" ? "Currently being worked on" :
                      k.label === "Waiting Feedback" ? "Waiting for comment or approval" :
                        k.label === "Revisions" ? "Requested changes still in loop" :
                          "Ready and approved to move forward"}
                </div>
              </div>
            ))}
          </div>
        </ModuleSummaryCard>

        <FilterBar>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-[7px]">
                <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Brand</span>
                <select value={brand} onChange={(e) => setBrand(e.target.value as BrandFilterValue)} style={SELECT_STYLE}>
                  {brandVisibility.allowAll && <option value="all">All Brands</option>}
                  {brandOptions.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-[7px]">
                <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Designer</span>
                <select value={designer} onChange={(e) => setDesigner(e.target.value)} style={SELECT_STYLE}>
                  <option value="all">All</option>
                  {DESIGNERS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-pill bg-[#F2EEFF] px-3 py-[7px] font-bold text-[#6C5CE7]">Creative leader assigns later</span>
              <span className="rounded-pill bg-[#FFF6E8] px-3 py-[7px] font-bold text-[#C68A1E]">Revision tracking on</span>
            </div>
          </div>
        </FilterBar>
      </div>

      {/* Needs Attention */}
      {attention.length > 0 && (
        <div className="mt-4 bg-status-goldBg border border-accent-border rounded-cardLg p-4">
          <div className="text-[12px] font-bold text-status-gold mb-3">⚠ Needs Attention · {attention.length}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {attention.map((g) => (
              <button key={g.id} onClick={() => setDrawer({ g, tab: g.openFb > 0 ? "feedback" : "overview" })} className="flex items-center gap-3 text-left bg-surface rounded-card px-3 py-2 hover:bg-ivory">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{g.title}</div>
                  <div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={g.b} size={6} />{g.campaign}</div>
                </div>
                <span className="text-[11px] font-semibold text-status-gold flex-shrink-0">{g.isOverdue ? "⚠ Overdue" : !g.briefComplete ? "Brief incomplete" : `💬 ${g.openFb} open`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        {view === "board" ? <BoardView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} /> : <ListView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} />}
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
      {reqOpen && <RequestModal nextId={Math.max(0, ...graphics.map((g) => g.id)) + 1} onClose={() => setReqOpen(false)} onCreate={addGraphic} />}
    </>
  );
}

function BoardView({ items, onOpen }: { items: Graphic[]; onOpen: (g: Graphic) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGE_ORDER.map((stage) => {
        const cards = items.filter((g) => g.stage === stage);
        return (
          <div key={stage} className="flex-shrink-0 w-[280px]">
            <div className="flex items-center gap-2 mb-3 px-1">
              <StatusBadge tone={stageTone(stage)}>{stage}</StatusBadge>
              <span className="text-[12px] text-faint font-semibold">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {cards.map((g) => (
                <button key={g.id} onClick={() => onOpen(g)} className="w-full text-left bg-surface border border-line rounded-card p-[13px] hover:border-accent transition">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[13px] font-bold text-ink leading-tight">{g.title}</span>
                    <StatusBadge tone={PRIORITY_TONE[g.priority]}>{g.priority}</StatusBadge>
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

function ListView({ items, onOpen }: { items: Graphic[]; onOpen: (g: Graphic) => void }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "2fr 1.2fr 1fr 0.8fr 1fr 0.7fr 1.2fr" }}>
        <div>Request</div><div>Campaign</div><div>Designer</div><div>Due</div><div>Stage</div><div>Fb</div><div>Pending</div>
      </div>
      {items.map((g) => (
        <button key={g.id} onClick={() => onOpen(g)} className="w-full grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_0.8fr_1fr_0.7fr_1.2fr] gap-y-1 items-center px-5 py-3 text-left border-b border-line4 last:border-0 hover:bg-ivory/60">
          <div><div className="text-[13px] font-bold text-ink">{g.title}</div><div className="text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={g.b} size={6} />{g.type}</div></div>
          <span className="text-[12px] text-muted truncate">{g.campaign}</span>
          <span className="text-[12px] text-muted">{g.designer}</span>
          <span className="text-[12px]" style={{ color: g.isOverdue ? "#B33A2E" : "#6b6258", fontWeight: g.isOverdue ? 700 : 400 }}>{g.due}</span>
          <StatusBadge tone={stageTone(g.stage)}>{g.stage}</StatusBadge>
          <span className="text-[12px] font-semibold" style={{ color: g.openFb > 0 ? "#B33A2E" : "#9A9387" }}>{g.openFb || "—"}</span>
          <span className="text-[12px] text-muted">{g.pendingApprover}</span>
        </button>
      ))}
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

function RequestModal({ nextId, onClose, onCreate }: { nextId: number; onClose: () => void; onCreate: (g: Graphic, post: ContentItem | null, briefItem: BriefContentItem | null, campaign: string) => void }) {
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [b, setB] = useState<BrandId>(brandOptions[0] ?? "teppen");
  const [campaign, setCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [approver, setApprover] = useState("");
  const { member, user } = useAuth();
  const requester = member?.name || user?.email?.split("@")[0] || "You";
  // Same content-item "template" as the Campaign Builder's Content Plan — a graphic
  // request is just a content item that needs a graphic, so it stays in sync.
  const [item, setItem] = useState<BriefContentItem>(() => ({ ...emptyContentItem(nextId), requiredGraphic: true }));
  const onChange = (patch: Partial<BriefContentItem>) => setItem((it) => ({ ...it, ...patch }));

  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!brandOptions.includes(b)) setB(brandOptions[0] ?? "teppen"); }, [b, brandOptions]);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === b), [campaigns, b]);
  useEffect(() => { if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign(""); }, [brandCampaigns, campaign]);

  const canCreate = item.title.trim() && item.platforms.length > 0 && campaign.trim();
  const missing = [
    !campaign.trim() ? "campaign" : null,
    !item.title.trim() ? "brief title" : null,
    !item.platforms.length ? "platform" : null,
  ].filter(Boolean) as string[];
  const submit = () => {
    if (!canCreate) return;
    const plats = item.platforms;
    const pairs = item.assets.length ? item.assets : plats.map((p) => ({ platform: p, size: "" }));
    const deliverables = pairs.map((a) => emptyDeliverable(a.platform, a.size || "—", item.referenceBriefLink || ""));
    const approverName = approver.trim() || requester;
    const g: Graphic = {
      ...buildGraphic({
        id: nextId, b, campaign: campaign.trim(), title: item.title.trim(),
        type: item.type, due: labelDate(item.publishDate) || "TBD", designer: "Unassigned",
        requester, approver: approverName, channels: plats,
      }),
      stage: "New Request",
      size: pairs.map((a) => a.size).filter(Boolean).join(" · ") || "—",
      deliverables,
      nextAction: "Creative leader to assign in-house or outsource designer",
      contentItem: item.title.trim() || "—",
    };
    const iso = item.publishDate || new Date().toISOString().slice(0, 10);
    const day = Math.max(1, Math.min(31, Number(iso.split("-")[2]) || 1));
    const post: ContentItem = {
      id: `c${nextId}-gfx`, day, dateIso: iso, time: "10:00", title: item.title.trim(), b, plat: plats[0] ?? "Instagram", platforms: plats,
      status: "Draft", campaign: campaign.trim(), owner: "Unassigned", caption: "", hashtags: "", cta: "",
      captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft",
    };
    onCreate(g, post, item, campaign.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-1">Send Graphic Brief</div>
        <div className="text-[12px] text-faint mb-4">ฟอร์มเดียวกับ Content Plan — สร้างแล้วเป็น content + graphic (แยก asset ต่อ platform×size) และ sync กลับเข้า Campaign อัตโนมัติ</div>
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
                <option value="">{brandCampaigns.length ? "Select campaign…" : "No campaigns for this brand"}</option>
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
          {/* Shared content-item template (title, type, platform × asset size, brief) */}
          <ContentItemForm item={item} onChange={onChange} requesterFallback={requester} showAssignmentFields={false} />
        </div>
        <div className="mt-5 rounded-[16px] border px-4 py-3" style={{ background: canCreate ? "#EEF8E8" : "#FBF6EC", borderColor: canCreate ? "#CFE4C2" : "#EADBC1" }}>
          <div className="text-[12px] font-bold" style={{ color: canCreate ? "#3F6A34" : "#8A6D1E" }}>
            {canCreate ? "Ready to send to Creative leader" : `Before sending, add ${missing.join(", ")}`}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: canCreate ? "#5A7A4D" : "#9A8460" }}>
            Requester stays fixed to login, and designer will be assigned after the brief comes in.
          </div>
        </div>
        <button onClick={submit} disabled={!canCreate} className="w-full mt-4 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Send Graphic Request</button>
      </div>
    </div>
  );
}
