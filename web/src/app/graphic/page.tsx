"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import {
  GRAPHICS, STAGE_ORDER, Graphic, stageTone, PRIORITY_TONE, DESIGNER_COLOR,
  DESIGNERS, graphicKpis, graphicNeedsAttention,
} from "@/lib/data/graphic";
import { fetchGraphics, createGraphic, buildGraphic } from "@/lib/db/graphic";
import { DatePicker, fmtDisplay } from "@/components/ui/DatePicker";
import { OwnerSelect } from "@/components/ui/OwnerSelect";

export default function GraphicPage() {
  const [view, setView] = useState<"board" | "list">("board");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [designer, setDesigner] = useState<string>("all");
  const [drawer, setDrawer] = useState<{ g: Graphic; tab: "overview" | "feedback" } | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [graphics, setGraphics] = useState<Graphic[]>(GRAPHICS);

  useEffect(() => {
    let alive = true;
    fetchGraphics().then((g) => { if (alive) setGraphics(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const addGraphic = async (g: Graphic) => {
    setReqOpen(false);
    setGraphics((gs) => [g, ...gs]);
    await createGraphic(g);
  };

  const items = graphics.filter((g) => (brand === "all" || g.b === brand) && (designer === "all" || g.designer === designer));
  const kpi = graphicKpis(items);
  const attention = graphicNeedsAttention(items);

  const KPIS: { label: string; value: number; tone?: string; dark?: boolean }[] = [
    { label: "Total", value: kpi.total },
    { label: "In Progress", value: kpi.inProgress },
    { label: "Waiting Feedback", value: kpi.waiting, tone: "gold" },
    { label: "Revisions", value: kpi.revisions, tone: "orange" },
    { label: "Approved", value: kpi.approved, tone: "green" },
    { label: "Open Feedback", value: kpi.feedback, tone: kpi.feedback ? "red" : undefined, dark: true },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Creative Request"
        title="Graphic Request"
        subtitle={`${items.length} requests · brief, design, review, approve, deliver`}
        right={<button onClick={() => setReqOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">+ New Request</button>}
      />

      {/* KPI strip */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-card p-4 border" style={k.dark ? { background: "#211F1C", borderColor: "#211F1C" } : { background: "#fff", borderColor: "#ECE6DA" }}>
            <div className="text-[10px] uppercase tracking-[0.06em] font-bold mb-[6px]" style={{ color: k.dark ? "#B8945A" : "#9A9387" }}>{k.label}</div>
            <div className="text-[22px] font-extrabold letter-tightest" style={{ color: k.dark ? "#fff" : k.tone === "red" ? "#B33A2E" : k.tone === "gold" ? "#C68A1E" : k.tone === "orange" ? "#C2691E" : k.tone === "green" ? "#4E7A4E" : "#211F1C" }}>{k.value}</div>
          </div>
        ))}
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

      {/* Controls */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-[7px]">
            <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Designer</span>
            {["all", ...DESIGNERS].map((d) => {
              const active = d === designer;
              return (
                <button key={d} onClick={() => setDesigner(d)} className="text-[12px] px-[12px] py-[5px] rounded-pill whitespace-nowrap"
                  style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>
                  {d === "all" ? "All" : d}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3"><BrandFilter value={brand} onChange={setBrand} /></div>

      <div className="mt-5">
        {view === "board" ? <BoardView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} /> : <ListView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} />}
      </div>

      {drawer && <GraphicDrawer g={drawer.g} initialTab={drawer.tab} onClose={() => setDrawer(null)} />}
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
              {cards.length === 0 && <div className="text-[11px] text-faint text-center py-4 border border-dashed border-line2 rounded-card">Empty</div>}
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
    </div>
  );
}

const GFX_BRAND_TO_ID: Record<string, BrandId> = { TEPPEN: "teppen", "Omakase Don": "omakase", Mainichi: "mainichi", Touka: "touka" };

function RequestModal({ nextId, onClose, onCreate }: { nextId: number; onClose: () => void; onCreate: (g: Graphic) => void }) {
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const CHANNELS = ["IG Feed", "IG Story", "IG Reel", "Facebook", "TikTok", "YouTube", "LINE OA", "Google", "Print", "In-Store", "Other"];
  const [chans, setChans] = useState<string[]>([]);
  const [gBrand, setGBrand] = useState("TEPPEN");
  const [gCampaign, setGCampaign] = useState("Wagyu Festival");
  const [gTitle, setGTitle] = useState("");
  const [gType, setGType] = useState("Key Visual");
  const [gDue, setGDue] = useState("");
  const [gDesigner, setGDesigner] = useState("Unassigned");
  const [gRequester, setGRequester] = useState("");
  const [gApprover, setGApprover] = useState("");

  const submit = () => {
    onCreate(buildGraphic({
      id: nextId, b: GFX_BRAND_TO_ID[gBrand] ?? "teppen", campaign: gCampaign, title: gTitle.trim(),
      type: gType, due: fmtDisplay(gDue) || "TBD", designer: gDesigner, requester: gRequester.trim(), approver: gApprover.trim(), channels: chans,
    }));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-4">New Graphic Request</div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={gBrand} onChange={(e) => setGBrand(e.target.value)} className={field}><option>TEPPEN</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option></select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label><select value={gCampaign} onChange={(e) => setGCampaign(e.target.value)} className={field}><option>Wagyu Festival</option><option>Cocktail Hour Launch</option><option>Rainy Season Promo</option></select></div>
          </div>
          <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Request Title</label><input value={gTitle} onChange={(e) => setGTitle(e.target.value)} className={field} placeholder="e.g. Wagyu key visual" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Asset Type</label><select value={gType} onChange={(e) => setGType(e.target.value)} className={field}><option>Key Visual</option><option>Poster</option><option>Carousel</option><option>Reel Cover</option><option>Story</option><option>LINE Rich Message</option></select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Deadline</label><DatePicker value={gDue || null} onChange={setGDue} /></div>
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Channels &amp; sizes (choose multiple)</label>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((ch) => {
                const on = chans.includes(ch);
                // Constant border width + font-weight so toggling never changes the
                // chip's size (which was causing the row to reflow / shift).
                return (
                  <button key={ch} onClick={() => setChans((c) => on ? c.filter((x) => x !== ch) : [...c, ch])} className="text-[12px] font-semibold px-[12px] py-[6px] rounded-pill border transition-colors"
                    style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { color: "#6b6258", background: "#fff", borderColor: "#E5DECF" }}>
                    {ch}
                  </button>
                );
              })}
            </div>
            {chans.map((ch) => (
              <div key={ch} className="flex items-center gap-2 mt-2">
                <span className="text-[12px] font-semibold w-24 flex-shrink-0">{ch}</span>
                <input className={`${field} py-[7px]`} placeholder="Size e.g. 1080×1080" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Requester</label><OwnerSelect value={gRequester} onChange={setGRequester} team="Planner" /></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Designer</label><OwnerSelect value={gDesigner === "Unassigned" ? "" : gDesigner} onChange={(v) => setGDesigner(v || "Unassigned")} team="Creative" placeholder="Unassigned" /></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Approver</label><OwnerSelect value={gApprover} onChange={setGApprover} /></div>
          </div>
          <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Key message / notes</label><textarea rows={3} className={field} placeholder="Brief, mood direction, references…" /></div>
        </div>
        <button onClick={submit} disabled={!gTitle.trim()} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Create Request</button>
      </div>
    </div>
  );
}
