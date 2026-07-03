"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, brandName } from "@/lib/brands";
import { ASSETS, ASSET_APPROVAL_TONE } from "@/lib/data/requests";

const TYPES = ["all", "Key Visual", "Story", "Print", "Social Media", "Reel Cover", "Carousel", "LINE Rich Message"];

export default function AssetLibraryPage() {
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [type, setType] = useState("all");
  const rows = ASSETS.filter((a) => (brand === "all" || a.b === brand) && (type === "all" || a.type === type));

  return (
    <>
      <PageHeader eyebrow="Asset Library" title="Asset Library" subtitle={`${rows.length} assets · final artwork, versions, and Drive / Canva links per campaign`}
        right={<button className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">+ Upload Asset</button>} />

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
