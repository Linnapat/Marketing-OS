"use client";

import { BRAND_ORDER, BrandFilterValue, BRANDS } from "@/lib/brands";
import { SELECT_STYLE } from "@/components/ui/selectStyle";

/** Brand filter dropdown: All Brands · TEPPEN · Omakase Don · Mainichi · Touka. */
export function BrandFilter({
  value,
  onChange,
  label = "Brand",
}: {
  value: BrandFilterValue;
  onChange: (v: BrandFilterValue) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-[9px] flex-wrap">
      {label && (
        <span className="text-[11px] font-bold text-faint tracking-[0.08em] uppercase">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BrandFilterValue)}
        style={SELECT_STYLE}
      >
        <option value="all">All Brands</option>
        {BRAND_ORDER.map((id) => (
          <option key={id} value={id}>{BRANDS[id].name}</option>
        ))}
      </select>
    </label>
  );
}
