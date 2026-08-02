"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { ASSETS, ASSET_APPROVAL_TONE, Asset, assetSeq, assetsByCampaign, assetPreviewSrc } from "@/lib/data/requests";
import { fetchAssets, createAsset, updateAssetPreview } from "@/lib/db/assets";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignRow } from "@/lib/data/campaigns";
import { Combobox } from "@/components/ui/Combobox";
import { getAppSetting, setAppSetting } from "@/lib/db/appSettings";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { SavedViewsBar } from "@/components/ui/SavedViews";
import { Segmented } from "@/components/ui/Segmented";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";

const TYPES = ["all", "Key Visual", "Story", "Print", "Social Media", "Reel Cover", "Carousel", "LINE Rich Message"];
type AssetTab = "library" | "portfolio";
interface PortfolioItem {
  id: string;
  brand: BrandId;
  title: string;
  category: string;
  link: string;
  note: string;
  updated: string;
}
const PORTFOLIO_KEY = "asset_brand_portfolio_v1";
const PORTFOLIO_CATEGORIES = ["Brand book", "Best practice", "Reference", "Campaign case", "Photo mood", "Video mood", "Other"];
const emptyPortfolio = (brand: BrandId): PortfolioItem => ({
  id: `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  brand,
  title: "",
  category: "Brand book",
  link: "",
  note: "",
  updated: "just now",
});

interface AssetSavedView { tab: AssetTab; brand: BrandFilterValue; type: string; group: "list" | "campaign" }

const COLLAPSED_KEY = "mos-assets-collapsed-campaigns";

const STRIPES ="repeating-linear-gradient(45deg,#F4EFE5,#F4EFE5 10px,#EFE9DC 10px,#EFE9DC 20px)";

/** The artwork itself when the link resolves to an image, else the striped
 *  placeholder. A dead image URL (a private Drive file, a moved Dropbox link)
 *  must not leave a broken-image icon in the middle of the library. */
function AssetPreview({ a, height, showType = true }: { a: Asset; height: number; showType?: boolean }) {
  const src = assetPreviewSrc(a);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  if (src && !broken) {
    return (
      <div className="w-full overflow-hidden bg-[#F4EFE5]" style={{ height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={a.name} loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className="w-full flex items-center justify-center" style={{ height, background: STRIPES }}>
      {showType && <span className="text-[11px] font-mono text-faint">{a.type}</span>}
    </div>
  );
}

/** Paste-a-link editor for the thumbnail, shown on the card so assets that
 *  predate previews (or live behind a link nothing can render) can still get
 *  one without reuploading. */
function PreviewEditor({ a, onSave, onClose }: { a: Asset; onSave: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState(a.previewUrl ?? "");
  return (
    <div className="flex flex-col gap-[6px] mt-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        autoFocus
        placeholder="วางลิงก์รูป (Drive / Dropbox / .jpg)"
        className="w-full text-[11.5px] px-[9px] py-[7px] rounded-[8px] border border-line2 bg-ivory outline-none"
      />
      <div className="flex gap-2">
        <button onClick={() => { onSave(url.trim()); onClose(); }} className="flex-1 text-[11.5px] font-bold text-white bg-panel rounded-[8px] py-[6px]">บันทึกรูป</button>
        <button onClick={onClose} className="text-[11.5px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[6px] bg-white">ยกเลิก</button>
      </div>
    </div>
  );
}

function AssetCard({ a, onSetPreview }: { a: Asset; onSetPreview: (a: Asset, url: string) => void }) {
  const [editing, setEditing] = useState(false);
  const hasPreview = !!assetPreviewSrc(a);
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden shadow-soft">
      <div className="relative">
        <AssetPreview a={a} height={128} />
        <span className="absolute top-2 right-2"><StatusBadge tone="blue">{a.version}</StatusBadge></span>
      </div>
      <div className="p-3">
        <div className="text-[13.5px] font-bold text-ink truncate">{a.name}</div>
        <div className="text-[11px] text-faint flex items-center gap-[5px] mt-[2px] mb-2"><BrandDot brand={a.b} size={6} />{brandName(a.b)} · {a.campaign}</div>
        <div className="flex items-center justify-between mb-2">
          <StatusBadge tone={ASSET_APPROVAL_TONE[a.approval] ?? "neutral"}>{a.approval}</StatusBadge>
          <span className="text-[11px] text-faint">{a.updated}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {a.driveUrl && <a href={a.driveUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Drive ↗</a>}
          {a.canvaUrl && <a href={a.canvaUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Canva ↗</a>}
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-[11.5px] font-semibold text-muted ml-auto">
              {hasPreview ? "เปลี่ยนรูป" : "＋ เพิ่มรูป Preview"}
            </button>
          )}
        </div>
        {editing && <PreviewEditor a={a} onSave={(url) => onSetPreview(a, url)} onClose={() => setEditing(false)} />}
      </div>
    </div>
  );
}

/** Compact table row — the same assets when scanning names / campaigns beats
 *  looking at thumbnails. */
function AssetRow({ a, onSetPreview }: { a: Asset; onSetPreview: (a: Asset, url: string) => void }) {
  const [editing, setEditing] = useState(false);
  const hasPreview = !!assetPreviewSrc(a);
  return (
    <>
      <tr className="border-t border-line hover:bg-ivory/60">
        <td className="py-[9px] px-3">
          <div className="w-[52px] rounded-[8px] overflow-hidden border border-line">
            <AssetPreview a={a} height={40} showType={false} />
          </div>
        </td>
        <td className="py-[9px] px-3">
          <div className="text-[12.5px] font-bold text-ink">{a.name}</div>
          <div className="text-[11px] text-faint flex items-center gap-[5px] mt-[2px]"><BrandDot brand={a.b} size={6} />{brandName(a.b)}</div>
        </td>
        <td className="py-[9px] px-3 text-[12px] text-muted">{a.campaign}</td>
        <td className="py-[9px] px-3 text-[12px] text-muted">{a.type}</td>
        <td className="py-[9px] px-3"><StatusBadge tone="blue">{a.version}</StatusBadge></td>
        <td className="py-[9px] px-3"><StatusBadge tone={ASSET_APPROVAL_TONE[a.approval] ?? "neutral"}>{a.approval}</StatusBadge></td>
        <td className="py-[9px] px-3 text-[11px] text-faint whitespace-nowrap">{a.updated}</td>
        <td className="py-[9px] px-3">
          <div className="flex items-center gap-3 justify-end whitespace-nowrap">
            {a.driveUrl && <a href={a.driveUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Drive ↗</a>}
            {a.canvaUrl && <a href={a.canvaUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Canva ↗</a>}
            <button onClick={() => setEditing((v) => !v)} className="text-[11.5px] font-semibold text-muted">{hasPreview ? "เปลี่ยนรูป" : "＋ รูป"}</button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8} className="px-3 pb-3 bg-ivory/40">
            <div className="max-w-[420px]"><PreviewEditor a={a} onSave={(url) => onSetPreview(a, url)} onClose={() => setEditing(false)} /></div>
          </td>
        </tr>
      )}
    </>
  );
}

function AssetTable({ rows, onSetPreview }: { rows: Asset[]; onSetPreview: (a: Asset, url: string) => void }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-x-auto shadow-soft">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint text-left">
            <th className="py-[10px] px-3 w-[70px]">Preview</th>
            <th className="py-[10px] px-3">Asset</th>
            <th className="py-[10px] px-3">Campaign</th>
            <th className="py-[10px] px-3">Type</th>
            <th className="py-[10px] px-3">Version</th>
            <th className="py-[10px] px-3">Approval</th>
            <th className="py-[10px] px-3">Updated</th>
            <th className="py-[10px] px-3 text-right">Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => <AssetRow key={a.id} a={a} onSetPreview={onSetPreview} />)}
        </tbody>
      </table>
      {rows.length === 0 && <div className="text-[12.5px] text-faint text-center py-10">No assets match this view.</div>}
    </div>
  );
}

export default function AssetLibraryPage() {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [type, setType] = useState("all");
  const [tab, setTab] = useState<AssetTab>("library");
  // Library grid can render flat or grouped by campaign.
  const [group, setGroup] = useState<"list" | "campaign">("list");
  // One box over both the campaign and the asset name. Splitting them into two
  // fields would make the user decide which one they are remembering before
  // they can type, and people arrive with either — "that Wagyu campaign" or
  // "the key visual".
  const [q, setQ] = useState("");
  // Campaigns the user rolled up. Collapsed rather than filtered, so the header
  // and its asset count stay on screen. Remembered between visits.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]") as string[]); } catch { /* no-op */ }
  }, []);
  const toggleCampaign = (name: string) => {
    setCollapsed((current) => {
      const next = current.includes(name) ? current.filter((c) => c !== name) : [...current, name];
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
  };
  const [assets, setAssets] = useState<Asset[]>(ASSETS);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState<PortfolioItem>(() => emptyPortfolio((brandOptions[0] ?? "teppen") as BrandId));
  const [uploadOpen, setUploadOpen] = useState(false);
  // Cards or a scannable table — the library is browsed both ways.
  const [display, setDisplay] = useState<"grid" | "list">("grid");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const empty = { name: "", b: (brandOptions[0] ?? "teppen") as BrandId, campaign: "", type: "Key Visual", driveUrl: "", canvaUrl: "", previewUrl: "" };
  const [nu, setNu] = useState(empty);

  useEffect(() => {
    let alive = true;
    fetchAssets().then((a) => { if (alive) setAssets(a); }).catch(() => {});
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    getAppSetting(PORTFOLIO_KEY).then((raw) => {
      if (!alive || !raw) return;
      try {
        const parsed = JSON.parse(raw) as PortfolioItem[];
        if (Array.isArray(parsed)) setPortfolio(parsed);
      } catch {}
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!brandOptions.includes(nu.b)) setNu((n) => ({ ...n, b: (brandOptions[0] ?? "teppen") as BrandId }));
    if (!brandOptions.includes(portfolioDraft.brand)) setPortfolioDraft((p) => ({ ...p, brand: (brandOptions[0] ?? "teppen") as BrandId }));
  }, [brandOptions, nu.b, portfolioDraft.brand]);

  // The picker only offers this brand's campaigns — an asset filed under
  // another brand's campaign is how spend and artwork drift apart.
  const uploadCampaignNames = useMemo(
    () => Array.from(new Set(campaigns.filter((c) => c.b === nu.b).map((c) => c.name))),
    [campaigns, nu.b],
  );
  useEffect(() => {
    if (nu.campaign && !uploadCampaignNames.includes(nu.campaign)) setNu((n) => ({ ...n, campaign: "" }));
    // Only when the brand's campaign list changes — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadCampaignNames]);

  const setPreview = async (a: Asset, url: string) => {
    setAssets((as) => as.map((x) => (x.id === a.id ? { ...x, previewUrl: url } : x)));
    try {
      await updateAssetPreview(a.id, url);
    } catch (error) {
      toastError(`บันทึกรูป Preview ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const upload = async () => {
    if (!nu.name.trim()) return;
    const draft: Asset = {
      id: "tmp", name: nu.name.trim(), b: nu.b, campaign: nu.campaign.trim() || "—", type: nu.type,
      version: "v1", approval: "Draft", driveUrl: nu.driveUrl.trim(), canvaUrl: nu.canvaUrl.trim(),
      previewUrl: nu.previewUrl.trim(), updated: "just now",
    };
    try {
      const created = await createAsset(draft);
      setAssets((as) => [created, ...as]);
      setUploadOpen(false);
      setNu(empty);
    } catch (error) {
      toastError(`บันทึก Asset ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const needle = q.trim().toLowerCase();
  const rows = assets
    .filter((a) => (brand === "all" || a.b === brand) && (type === "all" || a.type === type)
      && (!needle || `${a.campaign ?? ""} ${a.name}`.toLowerCase().includes(needle)))
    // Newest first everywhere — see assetSeq for why this is id order, not a date.
    .sort((x, y) => assetSeq(y) - assetSeq(x));
  const campaignGroups = assetsByCampaign(rows);
  const portfolioRows = portfolio.filter((p) => (brand === "all" || p.brand === brand));
  const field = "w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const approvedCount = rows.filter((a) => a.approval === "Approved").length;
  const linkedCount = rows.filter((a) => !!a.driveUrl || !!a.canvaUrl).length;
  const persistPortfolio = async (next: PortfolioItem[]) => {
    setPortfolio(next);
    await setAppSetting(PORTFOLIO_KEY, JSON.stringify(next));
  };
  const addPortfolio = async () => {
    if (!portfolioDraft.title.trim()) return;
    const nextItem = { ...portfolioDraft, title: portfolioDraft.title.trim(), link: portfolioDraft.link.trim(), note: portfolioDraft.note.trim(), updated: "just now" };
    try {
      await persistPortfolio([nextItem, ...portfolio]);
      setPortfolioDraft(emptyPortfolio((brandOptions[0] ?? "teppen") as BrandId));
    } catch (error) {
      toastError(`บันทึก Portfolio ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  return (
    <>
      <CampaignPageHeaderSection
        eyebrow="ASSETS"
        title="Assets"
        description="Keep final artwork, versions, and production links tidy for every campaign."
      />

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setUploadOpen(false)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="text-[16px] font-extrabold">Upload asset</div>
              <button onClick={() => setUploadOpen(false)} className="text-[18px] text-faint leading-none -mt-1">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Asset name <span className="text-status-red">*</span></label><input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="e.g. Wagyu KV final" className={field} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={nu.b} onChange={(e) => setNu({ ...nu, b: e.target.value as BrandId })} className={field}>{brandOptions.map((b) => <option key={b} value={b}>{brandVisibility.brandNames[b] ?? brandName(b)}</option>)}</select></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Type</label><select value={nu.type} onChange={(e) => setNu({ ...nu, type: e.target.value })} className={field}>{TYPES.filter((t) => t !== "all").map((t) => <option key={t}>{t}</option>)}</select></div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label>
                {/* Picked from the campaigns that exist, not typed — a
                    free-typed name never matches the campaign it belongs to. */}
                <Combobox
                  value={nu.campaign}
                  onChange={(next) => setNu((n) => ({ ...n, campaign: next }))}
                  options={uploadCampaignNames}
                  disabled={uploadCampaignNames.length === 0}
                  placeholder={uploadCampaignNames.length === 0 ? "ยังไม่มีแคมเปญของแบรนด์นี้" : "เลือกแคมเปญ (พิมพ์เพื่อค้นหา)"}
                  emptyLabel="ไม่พบแคมเปญที่ตรงกับที่พิมพ์"
                  inputClassName={field}
                />
                <div className="mt-[5px] text-[11px] text-faint">เว้นว่างได้ถ้า asset นี้ไม่ผูกกับแคมเปญ</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Drive link</label><input value={nu.driveUrl} onChange={(e) => setNu({ ...nu, driveUrl: e.target.value })} placeholder="https://drive…" className={field} /></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Canva link</label><input value={nu.canvaUrl} onChange={(e) => setNu({ ...nu, canvaUrl: e.target.value })} placeholder="https://canva…" className={field} /></div>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Preview image</label>
                <input value={nu.previewUrl} onChange={(e) => setNu({ ...nu, previewUrl: e.target.value })} placeholder="ลิงก์รูปสำหรับโชว์บนการ์ด" className={field} />
                <div className="mt-[5px] text-[11px] text-faint">
                  เว้นว่างได้ — ระบบจะดึงรูปจาก Drive / Dropbox link ให้เอง (ต้องแชร์แบบ “anyone with the link”)
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={upload} disabled={!nu.name.trim()} className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Upload</button>
              <button onClick={() => setUploadOpen(false)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={() => setUploadOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[12px] px-4 py-[10px] shadow-soft">+ Upload Asset</button>}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-[7px]">
                <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Brand</span>
                <select value={brand} onChange={(e) => setBrand(e.target.value as BrandFilterValue)} style={SELECT_STYLE}>
                  {brandVisibility.allowAll && <option value="all">All Brands</option>}
                  {brandOptions.map((id) => <option key={id} value={id}>{brandVisibility.brandNames[id] ?? brandName(id)}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-[7px]">
                <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Type</span>
                <select value={type} onChange={(e) => setType(e.target.value)} style={SELECT_STYLE}>
                  {TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}
                </select>
              </label>
              <span className="text-[12px] font-semibold text-faint">
                {tab === "library" ? `${rows.length} assets in view` : `${portfolioRows.length} portfolio items in view`}
              </span>
              <span className="ml-auto flex items-center gap-3 flex-wrap">
                <SavedViewsBar<AssetSavedView>
                  pageKey="assets"
                  current={{ tab, brand, type, group }}
                  onApply={(v) => { setTab(v.tab); setBrand(v.brand); setType(v.type); setGroup(v.group ?? "list"); }}
                />
                <div className="relative">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ค้นหาแคมเปญ / ชื่อ asset…"
                    aria-label="ค้นหาแคมเปญหรือชื่อ asset"
                    className="text-[13px] pl-[30px] pr-[28px] py-[8px] rounded-[10px] border border-line2 bg-ivory outline-none w-[200px]"
                  />
                  <span className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[12px] text-faint" aria-hidden>🔍</span>
                  {q && (
                    <button type="button" onClick={() => setQ("")} aria-label="ล้างคำค้น"
                      className="absolute right-[8px] top-1/2 -translate-y-1/2 text-[13px] text-faint hover:text-ink">×</button>
                  )}
                </div>
                <Segmented value={display} onChange={setDisplay} options={[{ value: "grid", label: "▦ Grid" }, { value: "list", label: "☰ List" }]} />
                {/* "list" here means ungrouped — the grid/table choice is the
                    control above. Labelled "All" so the two stop reading alike. */}
                <Segmented value={group} onChange={setGroup} options={[{ value: "list", label: "All" }, { value: "campaign", label: "Group Campaign" }]} />
              </span>
            </div>
            <div className="inline-flex w-fit rounded-[16px] border border-[#E4DEFA] bg-[#F4F1FF] p-[4px]">
              {[
                { value: "library", label: "Asset Library" },
                { value: "portfolio", label: "Portfolio" },
              ].map((option) => {
                const active = tab === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTab(option.value as AssetTab)}
                    className="rounded-[12px] px-4 py-[9px] text-[12px] font-extrabold transition"
                    style={{ background: active ? "#6C5CE7" : "transparent", color: active ? "#fff" : "#8A879A" }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CampaignCommandBar>

        <ModuleSummaryCard title="Assets Summary">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Assets in view", value: rows.length, note: "Current brand + type filter" },
              { label: "Approved", value: approvedCount, note: "Ready for handoff or publish" },
              { label: "Linked files", value: linkedCount, note: "Drive or Canva attached" },
              { label: "Portfolio", value: portfolioRows.length, note: "Brand reference library" },
            ].map((item) => (
              <div key={item.label} className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/50 font-bold">{item.label}</div>
                <div className="mt-3 text-[28px] leading-none font-extrabold text-white">{item.value}</div>
                <div className="mt-2 text-[11px] text-white/55">{item.note}</div>
              </div>
            ))}
          </div>
        </ModuleSummaryCard>
      </div>

      {tab === "library" ? (
        group === "campaign" ? (
          <div className="mt-5 flex flex-col gap-5">
            {campaignGroups.map(([c, list]) => {
              const shut = collapsed.includes(c);
              return (
                <div key={c}>
                  <button type="button" onClick={() => toggleCampaign(c)} aria-expanded={!shut}
                    className="w-full flex items-center gap-2 mb-2 px-1 text-left">
                    <span className="text-[11px] text-faint" aria-hidden>{shut ? "▸" : "▾"}</span>
                    <span className="text-[13px] font-extrabold text-ink">🎯 {c}</span>
                    <span className="text-[12px] text-faint font-semibold">{list.length} asset{list.length > 1 ? "s" : ""}</span>
                  </button>
                  {/* Collapse wins over the grid/table choice: a shut campaign
                      shows nothing either way. */}
                  {!shut && (display === "list" ? (
                    <AssetTable rows={list} onSetPreview={setPreview} />
                  ) : (
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                      {list.map((a) => <AssetCard key={a.id} a={a} onSetPreview={setPreview} />)}
                    </div>
                  ))}
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="text-[12.5px] text-faint text-center py-10">
                {needle ? `ไม่พบแคมเปญหรือ asset ที่ชื่อมี “${q.trim()}”` : "No assets match this view."}
              </div>
            )}
          </div>
        ) : display === "list" ? (
          <div className="mt-5"><AssetTable rows={rows} onSetPreview={setPreview} /></div>
        ) : (
          <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {/* A search that finds nothing has to say so. Without this the grid
                shows only the drop zone, which reads as "the library is empty". */}
            {rows.length === 0 && needle && (
              <div className="col-span-full text-[12.5px] text-faint text-center py-8">ไม่พบแคมเปญหรือ asset ที่ชื่อมี “{q.trim()}”</div>
            )}
            {rows.map((a) => <AssetCard key={a.id} a={a} onSetPreview={setPreview} />)}
            <div className="border-2 border-dashed border-line2 rounded-cardLg flex flex-col items-center justify-center p-8 text-center min-h-[180px] bg-white/70">
              <div className="text-[13px] font-bold text-muted">Drop asset</div>
              <div className="text-[11px] text-faint mt-1">Drive · Canva · final artwork</div>
            </div>
          </div>
        )
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-cardLg border border-line bg-surface p-5 shadow-soft h-fit">
            <div className="text-[14px] font-extrabold text-ink">Add brand portfolio</div>
            <div className="mt-1 text-[11.5px] text-faint">เก็บ brand book, mood, reference หรือ case ที่ใช้ซ้ำได้ต่อแบรนด์</div>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
                <select value={portfolioDraft.brand} onChange={(e) => setPortfolioDraft({ ...portfolioDraft, brand: e.target.value as BrandId })} className={field}>
                  {brandOptions.map((b) => <option key={b} value={b}>{brandVisibility.brandNames[b] ?? brandName(b)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Title <span className="text-status-red">*</span></label>
                <input value={portfolioDraft.title} onChange={(e) => setPortfolioDraft({ ...portfolioDraft, title: e.target.value })} className={field} placeholder="e.g. TEPPEN social mood 2026" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Category</label>
                <select value={portfolioDraft.category} onChange={(e) => setPortfolioDraft({ ...portfolioDraft, category: e.target.value })} className={field}>
                  {PORTFOLIO_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Portfolio link</label>
                <input value={portfolioDraft.link} onChange={(e) => setPortfolioDraft({ ...portfolioDraft, link: e.target.value })} className={field} placeholder="Drive / Canva / Figma / Website" />
              </div>
              <div>
                <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Note</label>
                <textarea value={portfolioDraft.note} onChange={(e) => setPortfolioDraft({ ...portfolioDraft, note: e.target.value })} className={`${field} min-h-[88px]`} placeholder="ใช้กับงานแบบไหน / mood / do-don't" />
              </div>
              <button onClick={addPortfolio} disabled={!portfolioDraft.title.trim()} className="text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Save Portfolio</button>
            </div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}>
            {portfolioRows.map((item) => (
              <div key={item.id} className="rounded-cardLg border border-line bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-extrabold text-ink truncate">{item.title}</div>
                    <div className="mt-1 text-[11px] text-faint flex items-center gap-[5px]"><BrandDot brand={item.brand} size={6} />{brandVisibility.brandNames[item.brand] ?? brandName(item.brand)}</div>
                  </div>
                  <StatusBadge tone="blue">{item.category}</StatusBadge>
                </div>
                {item.note && <div className="mt-3 text-[12px] leading-5 text-muted">{item.note}</div>}
                <div className="mt-4 flex items-center justify-between">
                  {item.link ? <a href={item.link} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-accent">Open portfolio ↗</a> : <span className="text-[12px] text-faint">No link</span>}
                  <span className="text-[11px] text-faint">{item.updated}</span>
                </div>
              </div>
            ))}
            {portfolioRows.length === 0 && (
              <div className="rounded-cardLg border border-dashed border-[#DDD1FF] bg-[#F7F2FF] p-8 text-center">
                <div className="text-[13px] font-bold text-[#5A4FB2]">No portfolio yet</div>
                <div className="mt-1 text-[11.5px] text-[#7D778F]">Add brand references so Creative / Agency can reuse the same direction.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
