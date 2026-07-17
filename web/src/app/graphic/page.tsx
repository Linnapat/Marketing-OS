"use client";

import { toastError } from "@/lib/toast";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import { BrandFilterValue, BrandId, brandColor, brandName, BRANDS, BRAND_ORDER } from "@/lib/brands";
import {
  GRAPHICS, STAGE_ORDER, Graphic, stageTone, PRIORITY_TONE, DESIGNER_COLOR,
  DESIGNERS, graphicKpis, emptyDeliverable, approveAllWaiting,
  DAILY_WORK_CAP, WORK_KIND_LABEL, workKind, countWorkOnDay, artworkUnitsOf,
} from "@/lib/data/graphic";
import { fetchGraphics, createGraphic, buildGraphic, updateGraphic, syncApprovedAssetsToContent } from "@/lib/db/graphic";
import { notify } from "@/lib/notify";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { SavedViewsBar } from "@/components/ui/SavedViews";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { createContent } from "@/lib/db/content";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchBrandConfigs, fetchMembers } from "@/lib/db/settings";
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
  const [view, setView] = useState<GraphicView>("campaign");
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

  const items = graphics.filter((g) => brandVisibility.visibleBrands.includes(g.b) && (brand === "all" || g.b === brand) && (designer === "all" || g.designer === designer) && inDateFilter(date, g.due));
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
                    <option value="all">{brandVisibility.allowAll ? "All Brands" : "ทุกแบรนด์ที่ดูแล"}</option>
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
// `brand` holds a BrandId, `cast` a comma-separated list of member names.
interface ShootRow { id: string; date: string; time: string; brand: BrandId; content: string; location: string; menu: string; cast: string; source?: "manual" | "content" }

// Rows saved before brand became data-driven stored the display NAME ("Omakase
// Don"); match it back to its id so brand-scoped filtering works on old rows. An
// unrecognised value is kept verbatim rather than dropped.
const toBrandId = (v: string): BrandId => {
  if (!v || BRANDS[v]) return v;
  return BRAND_ORDER.find((id) => brandName(id).toLowerCase() === v.toLowerCase()) ?? v;
};

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
  source: r.source ?? "manual",
});

const castList = (v: string): string[] => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Cast picker — tick several people per shoot; stored as "A, B, C".
 *  The panel is portalled and fixed-positioned: the shoot table scrolls inside
 *  `overflow-x-auto`, which would clip a normally-positioned dropdown. */
function CastPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const picked = castList(value);
  // Someone typed in before, or a member who has since left — keep them tickable.
  const all = Array.from(new Set([...options, ...picked]));
  const toggle = (name: string) =>
    onChange((picked.includes(name) ? picked.filter((p) => p !== name) : [...picked, name]).join(", "));

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
            className="fixed z-[61] max-h-[240px] overflow-y-auto bg-white border border-line2 rounded-[9px] shadow-soft p-1 no-print"
            style={{ top: at.top, left: at.left, minWidth: Math.max(at.width, 170) }}
          >
            {all.length === 0 && <div className="px-2 py-2 text-[11.5px] text-faint">ไม่มีรายชื่อทีม</div>}
            {all.map((name) => (
              <label key={name} className="flex items-center gap-2 px-2 py-[5px] rounded-[6px] text-[12px] text-muted hover:bg-ivory cursor-pointer">
                <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)} className="accent-accent" />
                <span className="truncate">{name}</span>
              </label>
            ))}
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
function ShootSheetPreview({ rows, printedAt, onClose }: { rows: ShootRow[]; printedAt: string; onClose: () => void }) {
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
            <div className="text-[19px] font-extrabold text-ink">🎬 Shoot Schedule — Creative</div>
            <div className="text-[11px] text-faint">ใบนัดถ่าย · {sorted.length} คิว</div>
          </div>
          <div className="text-[11px] text-faint">พิมพ์เมื่อ {printedAt}</div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "#17172A" }}>
              <th className={sh}>Date</th><th className={sh}>Time</th><th className={sh}>Brand</th>
              <th className={sh}>Content</th><th className={sh}>Location</th><th className={sh}>Menu</th>
              <th className={sh}>Cast</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[11.5px] text-faint">ยังไม่มีคิวถ่าย</td></tr>
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
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 pt-2 border-t border-line4 text-[10px] text-faint">
          Marketing OS · Creative Kitchen — ตารางนี้แก้ได้ที่หน้า Graphic Request → Shoot Schedule
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ShootCalendar({ me }: { me: string }) {
  const [rows, setRows] = useState<ShootRow[]>([]);
  const [autoRows, setAutoRows] = useState<ShootRow[]>([]);
  // Dropdown option sources, both keyed by brand id so a row that picked a brand
  // only offers that brand's branches (Location) and Content Plan items.
  const [branchesByBrand, setBranchesByBrand] = useState<Record<BrandId, string[]>>({});
  const [contentByBrand, setContentByBrand] = useState<Record<BrandId, string[]>>({});
  const [castOpts, setCastOpts] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);

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
      // Every Content Plan item title → the Content dropdown, grouped by brand.
      const byBrand: Record<BrandId, string[]> = {};
      for (const b of all) {
        const titles = (b.content ?? []).map((c) => c.title).filter(Boolean);
        byBrand[b.b] = Array.from(new Set([...(byBrand[b.b] ?? []), ...titles])).sort();
      }
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
  const allContent = useMemo(() => Array.from(new Set(Object.values(contentByBrand).flat())).sort(), [contentByBrand]);
  const listId = (kind: "content" | "location", brand: BrandId) => `shoot-${kind}-opts-${brand || "all"}`;

  const persist = (next: ShootRow[]) => {
    setRows(next);
    saveJsonSetting("creative_shoots_v2", "Creative shoot schedule", next)
      .catch((error) => toastError(`บันทึกตารางถ่ายงานไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };
  const addRow = () => persist([...rows, { id: `shoot-${Date.now()}`, date: "", time: "", brand: "", content: "", location: "", menu: "", cast: me, source: "manual" }]);
  const editRow = (id: string, patch: Partial<ShootRow>) => persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => persist(rows.filter((r) => r.id !== id));
  const importAuto = (a: ShootRow) => persist([...rows, { ...a, id: `shoot-${Date.now()}`, cast: me, source: "manual" }]);

  // Brand is what scopes Location + Content, so drop values that don't belong to
  // the newly picked brand instead of leaving a wrong branch behind.
  const setBrand = (r: ShootRow, brand: BrandId) => {
    const branches = branchesByBrand[brand] ?? [];
    const contents = contentByBrand[brand] ?? [];
    editRow(r.id, {
      brand,
      location: branches.includes(r.location) ? r.location : "",
      content: contents.includes(r.content) ? r.content : "",
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

      {preview && <ShootSheetPreview rows={rows} printedAt={printedAt} onClose={() => setPreview(false)} />}

      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 no-print">
          <div className="text-[13px] font-bold text-ink">🎬 Shoot Schedule <span className="text-[10.5px] text-faint font-normal">· ตารางขอถ่ายงาน — Creative Leader แก้ได้ทุกช่อง · ปริ้นเป็นใบนัดถ่ายได้</span></div>
          <div className="flex items-center gap-2">
            <button onClick={addRow} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-3 py-[7px]">+ เพิ่มคิวถ่าย</button>
            <button onClick={() => setPreview(true)} className="inline-flex items-center gap-[6px] text-[12px] font-bold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-white">🖨 Preview & ปริ้น</button>
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
                // Tinted by brand — the row reads as "whose shoot this is" at a glance.
                <tr key={r.id} className="border-b border-line4 last:border-0" style={{ background: r.brand ? tint(brandColor(r.brand), 0.05) : undefined }}>
                  <td className="px-[10px] py-[5px]" style={{ borderLeft: `3px solid ${r.brand ? brandColor(r.brand) : "transparent"}` }}><input type="date" value={r.date} onChange={(e) => editRow(r.id, { date: e.target.value })} className={cell} /></td>
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
                    </span>
                  </td>
                  <td className="px-[10px] py-[5px]"><input value={r.content} onChange={(e) => editRow(r.id, { content: e.target.value })} list={listId("content", r.brand)} placeholder="เลือก/พิมพ์จาก Content Plan" className={`${cell} min-w-[180px]`} /></td>
                  <td className="px-[10px] py-[5px]"><input value={r.location} onChange={(e) => editRow(r.id, { location: e.target.value })} list={listId("location", r.brand)} placeholder="เลือกสาขา" className={`${cell} min-w-[130px]`} /></td>
                  <td className="px-[10px] py-[5px]"><input value={r.menu} onChange={(e) => editRow(r.id, { menu: e.target.value })} placeholder="เมนู / งานที่ถ่าย" className={`${cell} min-w-[150px]`} /></td>
                  <td className="px-[10px] py-[5px] min-w-[150px]"><CastPicker value={r.cast} options={castOpts} onChange={(v) => editRow(r.id, { cast: v })} /></td>
                  <td className="px-[10px] py-[5px] text-right no-print"><button onClick={() => removeRow(r.id)} className="text-[12px] text-status-red font-bold" aria-label="ลบ">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Option sources per brand: Content (Content Plan titles) + Location (branches).
              The "all" pair serves rows that haven't picked a brand yet. */}
          <datalist id={listId("content", "")}>{allContent.map((o) => <option key={o} value={o} />)}</datalist>
          <datalist id={listId("location", "")}>{allBranches.map((o) => <option key={o} value={o} />)}</datalist>
          {brandKeys.map((b) => (
            <Fragment key={b}>
              <datalist id={listId("content", b)}>{(contentByBrand[b] ?? []).map((o) => <option key={o} value={o} />)}</datalist>
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

  // Daily capacity guard — max DAILY_WORK_CAP ARTWORK PIECES of each kind per
  // due date. This request adds its own pieces (distinct size, platform collapsed).
  const kind = workKind(item.type, item.requiredVideo);
  const dueDay = (item.graphicDueDate || "").slice(0, 10);
  const usedToday = dueDay ? countWorkOnDay(graphics, kind, dueDay) : 0;
  const newUnits = artworkUnitsOf(item.assets.length ? item.assets : item.platforms.map(() => ({ size: "" })));
  const atCap = !!dueDay && usedToday + newUnits > DAILY_WORK_CAP;

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
              📅 โควตา {WORK_KIND_LABEL[kind]} วันที่ {dueDay}: ใช้แล้ว {usedToday} + งานนี้ {newUnits} / {DAILY_WORK_CAP} artwork
            </span>
            <span className="text-[11px] font-semibold">
              {atCap ? "⚠ เกินโควตา — ลดไซซ์/รวม artwork หรือเลือกวันอื่น" : `เหลือ ${DAILY_WORK_CAP - usedToday - newUnits} ชิ้น`}
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
