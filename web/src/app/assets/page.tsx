"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, BRAND_ORDER, brandName } from "@/lib/brands";
import { ASSETS, ASSET_APPROVAL_TONE, Asset } from "@/lib/data/requests";
import { fetchAssets, createAsset } from "@/lib/db/assets";

const TYPES = ["all", "Key Visual", "Story", "Print", "Social Media", "Reel Cover", "Carousel", "LINE Rich Message"];

export default function AssetLibraryPage() {
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [type, setType] = useState("all");
  const [assets, setAssets] = useState<Asset[]>(ASSETS);
  const [uploadOpen, setUploadOpen] = useState(false);
  const empty = { name: "", b: "teppen" as BrandId, campaign: "", type: "Key Visual", driveUrl: "", canvaUrl: "" };
  const [nu, setNu] = useState(empty);

  useEffect(() => {
    let alive = true;
    fetchAssets().then((a) => { if (alive) setAssets(a); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const upload = async () => {
    if (!nu.name.trim()) return;
    const draft: Asset = {
      id: "tmp", name: nu.name.trim(), b: nu.b, campaign: nu.campaign.trim() || "—", type: nu.type,
      version: "v1", approval: "Draft", driveUrl: nu.driveUrl.trim(), canvaUrl: nu.canvaUrl.trim(), updated: "just now",
    };
    setUploadOpen(false);
    setNu(empty);
    const created = await createAsset(draft);
    setAssets((as) => [created, ...as]);
  };

  const rows = assets.filter((a) => (brand === "all" || a.b === brand) && (type === "all" || a.type === type));
  const field = "w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";

  return (
    <>
      <PageHeader eyebrow="Asset Library" title="Asset Library" subtitle={`${rows.length} assets · final artwork, versions, and Drive / Canva links per campaign`}
        right={<button onClick={() => setUploadOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">+ Upload Asset</button>} />

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
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={nu.b} onChange={(e) => setNu({ ...nu, b: e.target.value as BrandId })} className={field}>{BRAND_ORDER.map((b) => <option key={b} value={b}>{brandName(b)}</option>)}</select></div>
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

      <div className="mt-4 flex flex-col gap-3">
        <BrandFilter value={brand} onChange={setBrand} />
        <div className="flex items-center gap-[7px] flex-wrap">
          <span className="text-[11px] font-bold text-faint tracking-[0.05em] uppercase">Type</span>
          {TYPES.map((t) => {
            const active = t === type;
            return <button key={t} onClick={() => setType(t)} className="text-[12px] px-[12px] py-[5px] rounded-pill whitespace-nowrap"
              style={active ? { fontWeight: 700, background: "#211F1C", color: "#fff" } : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>{t === "all" ? "All" : t}</button>;
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
        {rows.map((a) => (
          <div key={a.id} className="bg-surface border border-line rounded-cardLg overflow-hidden">
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
                {a.driveUrl && <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Drive ↗</span>}
                {a.canvaUrl && <span className="text-[11.5px] text-accent font-semibold cursor-pointer">Canva ↗</span>}
              </div>
            </div>
          </div>
        ))}
        <div className="border-2 border-dashed border-line2 rounded-cardLg flex flex-col items-center justify-center p-8 text-center min-h-[180px]">
          <div className="text-[13px] font-bold text-faint">Drop asset</div>
          <div className="text-[11px] text-faint mt-1">Drive · Canva · final artwork</div>
        </div>
      </div>
    </>
  );
}
