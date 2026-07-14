"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { ASSETS, ASSET_APPROVAL_TONE, Asset } from "@/lib/data/requests";
import { fetchAssets, createAsset } from "@/lib/db/assets";
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

function AssetCard({ a }: { a: Asset }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden shadow-soft">
      <div className="h-32 flex items-center justify-center relative" style={{ background: "repeating-linear-gradient(45deg,#F4EFE5,#F4EFE5 10px,#EFE9DC 10px,#EFE9DC 20px)" }}>
        <span className="text-[11px] font-mono text-faint">{a.type}</span>
        <span className="absolute top-2 right-2"><StatusBadge tone="blue">{a.version}</StatusBadge></span>
      </div>
      <div className="p-3">
        <div className="text-[13.5px] font-bold text-ink truncate">{a.name}</div>
        <div className="text-[11px] text-faint flex items-center gap-[5px] mt-[2px] mb-2"><BrandDot brand={a.b} size={6} />{brandName(a.b)} · {a.campaign}</div>
        <div className="flex items-center justify-between mb-2">
          <StatusBadge tone={ASSET_APPROVAL_TONE[a.approval] ?? "neutral"}>{a.approval}</StatusBadge>
          <span className="text-[11px] text-faint">{a.updated}</span>
        </div>
        <div className="flex items-center gap-3">
          {a.driveUrl && <a href={a.driveUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Drive ↗</a>}
          {a.canvaUrl && <a href={a.canvaUrl} target="_blank" rel="noreferrer" className="text-[11.5px] text-accent font-semibold">Canva ↗</a>}
        </div>
      </div>
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
  const [assets, setAssets] = useState<Asset[]>(ASSETS);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState<PortfolioItem>(() => emptyPortfolio((brandOptions[0] ?? "teppen") as BrandId));
  const [uploadOpen, setUploadOpen] = useState(false);
  const empty = { name: "", b: (brandOptions[0] ?? "teppen") as BrandId, campaign: "", type: "Key Visual", driveUrl: "", canvaUrl: "" };
  const [nu, setNu] = useState(empty);

  useEffect(() => {
    let alive = true;
    fetchAssets().then((a) => { if (alive) setAssets(a); }).catch(() => {});
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

  const upload = async () => {
    if (!nu.name.trim()) return;
    const draft: Asset = {
      id: "tmp", name: nu.name.trim(), b: nu.b, campaign: nu.campaign.trim() || "—", type: nu.type,
      version: "v1", approval: "Draft", driveUrl: nu.driveUrl.trim(), canvaUrl: nu.canvaUrl.trim(), updated: "just now",
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

  const rows = assets.filter((a) => (brand === "all" || a.b === brand) && (type === "all" || a.type === type));
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
        eyebrow="READY TO SERVE"
        title="Asset Pantry"
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
              <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label><input value={nu.campaign} onChange={(e) => setNu({ ...nu, campaign: e.target.value })} placeholder="Campaign name" className={field} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Drive link</label><input value={nu.driveUrl} onChange={(e) => setNu({ ...nu, driveUrl: e.target.value })} placeholder="https://drive…" className={field} /></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Canva link</label><input value={nu.canvaUrl} onChange={(e) => setNu({ ...nu, canvaUrl: e.target.value })} placeholder="https://canva…" className={field} /></div>
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
                <Segmented value={group} onChange={setGroup} options={[{ value: "list", label: "List" }, { value: "campaign", label: "Group Campaign" }]} />
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

        <ModuleSummaryCard title="Asset Pantry Summary">
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
            {Array.from(rows.reduce((m, a) => { const c = a.campaign || "—"; (m.get(c) ?? m.set(c, []).get(c)!).push(a); return m; }, new Map<string, Asset[]>()).entries())
              .sort((x, y) => x[0].localeCompare(y[0]))
              .map(([c, list]) => (
                <div key={c}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[13px] font-extrabold text-ink">🎯 {c}</span>
                    <span className="text-[12px] text-faint font-semibold">{list.length} asset{list.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
                    {list.map((a) => <AssetCard key={a.id} a={a} />)}
                  </div>
                </div>
              ))}
            {rows.length === 0 && <div className="text-[12.5px] text-faint text-center py-10">No assets match this view.</div>}
          </div>
        ) : (
          <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {rows.map((a) => <AssetCard key={a.id} a={a} />)}
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
