"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import { BrandFilterValue, BrandId, brandName, BRANDS, BRAND_ORDER } from "@/lib/brands";
import {
  GRAPHICS, STAGE_ORDER, Graphic, stageTone, PRIORITY_TONE, DESIGNER_COLOR,
  DESIGNERS, graphicKpis, emptyDeliverable, approveAllWaiting,
  DAILY_WORK_CAP, WORK_KIND_LABEL, workKind, countWorkOnDay,
} from "@/lib/data/graphic";
import { fetchGraphics, createGraphic, buildGraphic, updateGraphic, syncApprovedAssetsToContent } from "@/lib/db/graphic";
import { notify } from "@/lib/notify";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { SavedViewsBar } from "@/components/ui/SavedViews";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { createContent } from "@/lib/db/content";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchBrandConfigs } from "@/lib/db/settings";
import { fetchJsonSetting, saveJsonSetting } from "@/lib/db/settings";
import { appendBriefItem } from "@/lib/db/brief";
import { CampaignRow } from "@/lib/data/campaigns";
import { ContentItem } from "@/lib/data/content";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { emptyContentItem, BriefContentItem, CampaignBrief, CONTENT_PLATFORMS, GRAPHIC_MIN_BUSINESS_DAYS, isGraphicDueDateAllowed, todayIso } from "@/lib/data/brief";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { useAuth } from "@/lib/auth";
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

export default function GraphicPage() {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [view, setView] = useState<GraphicView>("board");
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
    try {
      await createGraphic(g);
      if (post) await createContent(post);
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
  const { member, user } = useAuth();
  const me = member?.name || user?.email?.split("@")[0] || "Approver";
  const quickApprove = (g: Graphic) => {
    const ng = approveAllWaiting(g, me);
    if (!ng) return;
    setGraphics((gs) => gs.map((x) => (x.id === ng.id ? ng : x)));
    updateGraphic(ng)
      .then(() => {
        if (ng.stage === "Approved") {
          syncApprovedAssetsToContent(ng).catch((error) => toastError(`อนุมัติแล้ว แต่ sync asset เข้า Content ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
          notify("approved", `✅ งานกราฟฟิกอนุมัติครบทุกชิ้น: ${ng.title}`, `โดย ${me} — แนบ asset เข้า Content Calendar ให้แล้ว`, "/content");
        }
      })
      .catch((error) => toastError(`Approve ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };

  const items = graphics.filter((g) => (brand === "all" || g.b === brand) && (designer === "all" || g.designer === designer) && inDateFilter(date, g.due));
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
        eyebrow="CREATIVE KITCHEN"
        title="Graphic Request"
        description="Brief, assign, review, approve, and deliver every creative request in one workspace."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={() => setReqOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Send Brief</button>}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
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
                <span className="text-[12px] font-semibold text-faint">{items.length} requests in view</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <SavedViewsBar<GraphicSavedView>
                  pageKey="graphic"
                  current={{ view, brand, designer, date }}
                  onApply={(v) => { setView(v.view); setBrand(v.brand); setDesigner(v.designer); setDate(v.date); }}
                />
                <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }, { value: "campaign", label: "By Campaign" }, { value: "shoot", label: "🎬 Shoot Schedule" }]} />
              </div>
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

      <div className="mt-5">
        {view === "board" && <BoardView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} onQuickApprove={quickApprove} />}
        {view === "list" && <ListView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} onQuickApprove={quickApprove} />}
        {view === "campaign" && <CampaignGroupView items={items} onOpen={(g) => setDrawer({ g, tab: "overview" })} onQuickApprove={quickApprove} />}
        {view === "shoot" && <ShootCalendar me={me} />}
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
      {reqOpen && <RequestModal nextId={Math.max(0, ...graphics.map((g) => g.id)) + 1} graphics={graphics} onClose={() => setReqOpen(false)} onCreate={addGraphic} />}
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
interface ShootRow { id: string; date: string; time: string; brand: string; content: string; location: string; menu: string; cast: string; source?: "manual" | "content" }

// Back-compat: earlier rows used campaign/shootDate/owner/requestDate. Map the
// old fields onto the new shape so existing shoots aren't lost.
type LegacyShootRow = Partial<ShootRow> & { campaign?: string; shootDate?: string; owner?: string; requestDate?: string };
const normalizeShoot = (r: LegacyShootRow): ShootRow => ({
  id: r.id || `shoot-${Date.now()}`,
  date: r.date ?? r.shootDate ?? "",
  time: r.time ?? "",
  brand: r.brand ?? "",
  content: r.content ?? r.campaign ?? "",
  location: r.location ?? "",
  menu: r.menu ?? "",
  cast: r.cast ?? r.owner ?? "",
  source: r.source ?? "manual",
});

function ShootCalendar({ me }: { me: string }) {
  const [rows, setRows] = useState<ShootRow[]>([]);
  const [autoRows, setAutoRows] = useState<ShootRow[]>([]);
  // Dropdown option sources: branch names (Location) + Content Plan item titles.
  const [locationOpts, setLocationOpts] = useState<string[]>([]);
  const [contentOpts, setContentOpts] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchJsonSetting<LegacyShootRow[]>("creative_shoots_v2").then((v) => { if (alive && v) setRows(v.map(normalizeShoot)); }).catch(() => {});
    fetchBrandConfigs().then((cfgs) => {
      if (!alive) return;
      setLocationOpts(Array.from(new Set(cfgs.flatMap((c) => c.branchList))).sort());
    }).catch(() => {});
    // Photo shoot / VDO shooting items from Content Plan appear as read-only
    // reference rows so the leader can see what the briefs already asked for.
    fetchAllBriefs().then((briefs) => {
      if (!alive) return;
      const all = Object.values(briefs);
      // Every Content Plan item title → the Content dropdown/search source.
      setContentOpts(Array.from(new Set(all.flatMap((b) => (b.content ?? []).map((c) => c.title).filter(Boolean)))).sort());
      setAutoRows(all.flatMap((b) =>
        (b.content ?? [])
          .filter((c) => /photo shoot|vdo shooting/i.test(c.type || ""))
          .map((c) => normalizeShoot({
            id: `auto-${b.id}-${c.id}`, content: c.title || c.type, brand: brandName(b.b),
            date: (c.publishDate || "").slice(0, 10), menu: "", location: "", cast: "จาก Content Plan", source: "content",
          }))));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const persist = (next: ShootRow[]) => {
    setRows(next);
    saveJsonSetting("creative_shoots_v2", "Creative shoot schedule", next)
      .catch((error) => toastError(`บันทึกตารางถ่ายงานไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };
  const addRow = () => persist([...rows, { id: `shoot-${Date.now()}`, date: "", time: "", brand: "", content: "", location: "", menu: "", cast: me, source: "manual" }]);
  const editRow = (id: string, patch: Partial<ShootRow>) => persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => persist(rows.filter((r) => r.id !== id));
  const importAuto = (a: ShootRow) => persist([...rows, { ...a, id: `shoot-${Date.now()}`, cast: me, source: "manual" }]);

  const cell = "w-full text-[12px] px-2 py-[5px] rounded-[7px] border border-line2 bg-white outline-none";
  const th = "text-left text-[10px] font-extrabold uppercase tracking-[0.05em] text-faint px-[10px] py-2 border-b border-line";
  const printedAt = new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="shoot-print">
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: #fff !important; }
          /* Print ONLY the shoot schedule: hide the whole app, then reveal
             just this subtree and pin it to the top of the page. */
          body * { visibility: hidden !important; }
          .shoot-print, .shoot-print * { visibility: visible !important; }
          .shoot-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff; padding: 0; }
          .no-print, .no-print * { display: none !important; }
          .shoot-print .print-only { display: block !important; }
          /* Render the inline inputs/selects as plain values on paper. */
          .shoot-print input, .shoot-print select {
            border: none !important; background: transparent !important; padding: 0 !important;
            -webkit-appearance: none; appearance: none; color: #000 !important;
          }
          .shoot-print table { width: 100% !important; }
          .shoot-print th, .shoot-print td { border: 1px solid #ccc !important; }
        }
      `}</style>

      <div className="print-only hidden mb-3">
        <div className="text-[20px] font-extrabold">🎬 Shoot Schedule — Creative</div>
        <div className="text-[12px] text-faint">พิมพ์เมื่อ {printedAt}</div>
      </div>

      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 no-print">
          <div className="text-[13px] font-bold text-ink">🎬 Shoot Schedule <span className="text-[10.5px] text-faint font-normal">· ตารางขอถ่ายงาน — Creative Leader แก้ได้ทุกช่อง · ปริ้นเป็นใบนัดถ่ายได้</span></div>
          <div className="flex items-center gap-2">
            <button onClick={addRow} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-3 py-[7px]">+ เพิ่มคิวถ่าย</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white">🖨 ปริ้น</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse whitespace-nowrap">
            <thead><tr className="bg-ivory">
              <th className={th}>Date</th><th className={th}>Time</th><th className={th}>Brand</th>
              <th className={th}>Content</th><th className={th}>Location</th><th className={th}>Menu</th>
              <th className={th}>Cast</th><th className={`${th} no-print`}></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-[12px] text-faint">ยังไม่มีคิวถ่าย — กด &quot;เพิ่มคิวถ่าย&quot; หรือดึงจาก Content Plan ด้านล่าง</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line4 last:border-0">
                  <td className="px-[10px] py-[5px]"><input type="date" value={r.date} onChange={(e) => editRow(r.id, { date: e.target.value })} className={cell} /></td>
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
                  <td className="px-[10px] py-[5px]">
                    <select value={r.brand} onChange={(e) => editRow(r.id, { brand: e.target.value })} className={cell}>
                      <option value="">—</option>
                      {BRAND_ORDER.map((id) => <option key={id} value={brandName(id)}>{brandName(id)}</option>)}
                    </select>
                  </td>
                  <td className="px-[10px] py-[5px]"><input value={r.content} onChange={(e) => editRow(r.id, { content: e.target.value })} list="shoot-content-opts" placeholder="เลือก/พิมพ์จาก Content Plan" className={`${cell} min-w-[180px]`} /></td>
                  <td className="px-[10px] py-[5px]"><input value={r.location} onChange={(e) => editRow(r.id, { location: e.target.value })} list="shoot-location-opts" placeholder="เลือกสาขา" className={`${cell} min-w-[130px]`} /></td>
                  <td className="px-[10px] py-[5px]"><input value={r.menu} onChange={(e) => editRow(r.id, { menu: e.target.value })} placeholder="เมนู / งานที่ถ่าย" className={`${cell} min-w-[150px]`} /></td>
                  <td className="px-[10px] py-[5px]"><input value={r.cast} onChange={(e) => editRow(r.id, { cast: e.target.value })} placeholder="ทีม / cast" className={cell} /></td>
                  <td className="px-[10px] py-[5px] text-right no-print"><button onClick={() => removeRow(r.id)} className="text-[12px] text-status-red font-bold" aria-label="ลบ">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Shared option sources for Content (Content Plan titles) + Location (branches) */}
          <datalist id="shoot-content-opts">{contentOpts.map((o) => <option key={o} value={o} />)}</datalist>
          <datalist id="shoot-location-opts">{locationOpts.map((o) => <option key={o} value={o} />)}</datalist>
        </div>
      </div>

      {autoRows.length > 0 && (
        <div className="mt-3 bg-surface border border-line rounded-cardLg p-4 no-print">
          <div className="text-[12px] font-bold text-muted mb-2">📎 จาก Content Plan (Photo shoot / VDO shooting) — กด &quot;＋&quot; เพื่อดึงเข้าตารางแล้วแก้ต่อได้</div>
          <div className="flex flex-col gap-1">
            {autoRows.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[12px] border-b border-line4 last:border-0 py-[5px]">
                <span className="font-semibold text-ink flex-1 truncate">{a.content}</span>
                <span className="text-faint truncate">{a.brand}</span>
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

function QuickApproveBtn({ g, onQuickApprove }: { g: Graphic; onQuickApprove?: (g: Graphic) => void }) {
  if (!onQuickApprove || !hasWaitingReview(g)) return null;
  return (
    <span
      role="button" tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onQuickApprove(g); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onQuickApprove(g); } }}
      title="อนุมัติทุกชิ้นที่รอรีวิวของงานนี้"
      className="inline-flex items-center text-[11px] font-bold text-white rounded-[8px] px-2.5 py-[4px] cursor-pointer whitespace-nowrap"
      style={{ background: "#4E7A4E" }}
    >✓ Approve</span>
  );
}

function BoardView({ items, onOpen, onQuickApprove }: { items: Graphic[]; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic) => void }) {
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
function CampaignGroupView({ items, onOpen, onQuickApprove }: { items: Graphic[]; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic) => void }) {
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

function ListView({ items, onOpen, onQuickApprove }: { items: Graphic[]; onOpen: (g: Graphic) => void; onQuickApprove?: (g: Graphic) => void }) {
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
          <span className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge tone={stageTone(g.stage)}>{g.stage}</StatusBadge>
            <QuickApproveBtn g={g} onQuickApprove={onQuickApprove} />
          </span>
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

function RequestModal({ nextId, graphics, onClose, onCreate }: { nextId: number; graphics: Graphic[]; onClose: () => void; onCreate: (g: Graphic, post: ContentItem | null, briefItem: BriefContentItem | null, campaign: string) => void }) {
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [b, setB] = useState<BrandId>(brandOptions[0] ?? "teppen");
  const [campaign, setCampaign] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [approver, setApprover] = useState("");
  const { member, user } = useAuth();
  const requester = member?.name || user?.email?.split("@")[0] || "You";
  const requestDate = todayIso();
  // Same content-item "template" as the Campaign Builder's Content Plan — a graphic
  // request is just a content item that needs a graphic, so it stays in sync.
  const [item, setItem] = useState<BriefContentItem>(() => ({ ...emptyContentItem(nextId), requiredGraphic: true }));
  const onChange = (patch: Partial<BriefContentItem>) => setItem((it) => ({ ...it, ...patch }));

  const [briefs, setBriefs] = useState<Record<string, CampaignBrief>>({});
  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    fetchAllBriefs().then((b) => { if (alive) setBriefs(b); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!brandOptions.includes(b)) setB(brandOptions[0] ?? "teppen"); }, [b, brandOptions]);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === b), [campaigns, b]);
  useEffect(() => { if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign(""); }, [brandCampaigns, campaign]);

  // Match the brief's social platforms: picking a campaign pre-selects the
  // platforms the brief actually plans to post on (only if none chosen yet).
  useEffect(() => {
    const brief = campaign ? briefs[campaign] : undefined;
    if (!brief || item.platforms.length) return;
    const social = brief.channels.filter((c) => (CONTENT_PLATFORMS as readonly string[]).includes(c));
    if (social.length) onChange({ platforms: social });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, briefs]);

  // Daily capacity guard — max DAILY_WORK_CAP requests of each kind per due date.
  const kind = workKind(item.type, item.requiredVideo);
  const dueDay = (item.graphicDueDate || "").slice(0, 10);
  const usedToday = dueDay ? countWorkOnDay(graphics, kind, dueDay) : 0;
  const atCap = !!dueDay && usedToday >= DAILY_WORK_CAP;

  const dueOrderValid = !item.publishDate || !item.graphicDueDate || item.graphicDueDate <= item.publishDate;
  const graphicLeadValid = !!item.graphicDueDate && isGraphicDueDateAllowed(item.graphicDueDate, requestDate);
  const canCreate = item.title.trim() && item.platforms.length > 0 && campaign.trim() && item.graphicDueDate && dueOrderValid && graphicLeadValid && !atCap;
  const missing = [
    !campaign.trim() ? "campaign" : null,
    !item.title.trim() ? "brief title" : null,
    !item.platforms.length ? "platform" : null,
    !item.graphicDueDate ? "graphic due date" : null,
    item.graphicDueDate && !graphicLeadValid ? `graphic due date at least ${GRAPHIC_MIN_BUSINESS_DAYS} business days` : null,
    !dueOrderValid ? "graphic due date before publish date" : null,
    atCap ? `เกินโควตา ${WORK_KIND_LABEL[kind]} วันนั้น (สูงสุด ${DAILY_WORK_CAP}/วัน)` : null,
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
        type: item.type, due: labelDate(item.graphicDueDate) || "TBD", dueIso: item.graphicDueDate, designer: "Unassigned",
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
          <ContentItemForm item={item} onChange={onChange} requesterFallback={requester} requestDate={requestDate} showAssignmentFields={false} />
        </div>
        {/* Daily capacity meter for the selected work kind + due date */}
        {dueDay && (
          <div className="mt-4 rounded-[12px] border px-4 py-[10px] flex items-center justify-between gap-2"
            style={atCap
              ? { background: "#FFF5F4", borderColor: "#F5C8C4", color: "#B33A2E" }
              : { background: "#EEF4EE", borderColor: "#CFE4C2", color: "#4E7A4E" }}>
            <span className="text-[12px] font-bold">
              📅 โควตา {WORK_KIND_LABEL[kind]} วันที่ {dueDay}: ใช้แล้ว {usedToday} / {DAILY_WORK_CAP}
            </span>
            <span className="text-[11px] font-semibold">
              {atCap ? "⚠ เต็มแล้ว — เลือกวันอื่น" : `เหลือ ${DAILY_WORK_CAP - usedToday} ชิ้น`}
            </span>
          </div>
        )}
        <div className="mt-3 rounded-[16px] border px-4 py-3" style={{ background: canCreate ? "#EEF8E8" : "#FBF6EC", borderColor: canCreate ? "#CFE4C2" : "#EADBC1" }}>
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
