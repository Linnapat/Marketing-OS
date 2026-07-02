"use client";

import { BRAND_ORDER, BrandFilterValue, BRANDS } from "@/lib/brands";

/** Row of brand pill chips: All Brands · TEPPEN · Omakase Don · Mainichi · Touka. */
export function BrandFilter({
  value,
  onChange,
  label = "Brand",
}: {
  value: BrandFilterValue;
  onChange: (v: BrandFilterValue) => void;
  label?: string;
}) {
  const chips: { id: BrandFilterValue; name: string }[] = [
    { id: "all", name: "All Brands" },
    ...BRAND_ORDER.map((id) => ({ id, name: BRANDS[id].name })),
  ];
  return (
    <div className="flex items-center gap-[7px] flex-wrap">
      {label && (
        <span className="text-[11px] font-bold text-faint tracking-[0.05em] uppercase">
          {label}
        </span>
      )}
      {chips.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className="text-[12px] px-[14px] py-[6px] rounded-pill whitespace-nowrap transition"
            style={
              active
                ? { fontWeight: 700, background: "#211F1C", color: "#fff" }
                : { fontWeight: 500, border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }
            }
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
