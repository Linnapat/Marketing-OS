"use client";

import { useEffect } from "react";
import { BRAND_ORDER, BrandFilterValue, BRANDS } from "@/lib/brands";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { useBrandVisibility } from "@/lib/brandVisibility";

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
  const visibility = useBrandVisibility();
  const options = BRAND_ORDER.filter((id) => visibility.visibleBrands.includes(id));

  useEffect(() => {
    const next = visibility.normalize(value);
    if (next !== value) onChange(next);
  }, [onChange, value, visibility]);

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
        {visibility.allowAll && <option value="all">All Brands</option>}
        {options.map((id) => (
          <option key={id} value={id}>{BRANDS[id].name}</option>
        ))}
      </select>
    </label>
  );
}
