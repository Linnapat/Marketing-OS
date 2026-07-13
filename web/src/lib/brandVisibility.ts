"use client";

import { useMemo } from "react";
import { BRAND_ORDER, BRANDS, BrandFilterValue, BrandId } from "@/lib/brands";
import { useAuth } from "@/lib/auth";

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const BRAND_ALIASES: Record<BrandId, string[]> = {
  teppen: ["teppen", "teppenthailand"],
  omakase: ["omakase", "omakasedon"],
  mainichi: ["mainichi"],
  touka: ["touka"],
};

export function visibleBrandsFromScope(scope?: string | null): BrandId[] {
  const raw = (scope ?? "").trim();
  if (!raw || /^all brands$/i.test(raw)) return BRAND_ORDER;
  if (/external only/i.test(raw)) return [];

  const normalized = norm(raw.replace(/^Branch\s*·\s*/i, ""));
  const visible = BRAND_ORDER.filter((id) => {
    const name = norm(BRANDS[id].name);
    return normalized.includes(name) || BRAND_ALIASES[id].some((alias) => normalized.includes(norm(alias)));
  });

  return visible.length ? visible : BRAND_ORDER;
}

export function canSeeAllBrands(scope?: string | null): boolean {
  const raw = (scope ?? "").trim();
  return !raw || /^all brands$/i.test(raw);
}

export function isBrandVisible(brand: BrandFilterValue, visible: BrandId[], allowAll: boolean): boolean {
  if (brand === "all") return allowAll;
  return visible.includes(brand);
}

export function firstVisibleBrand(visible: BrandId[]): BrandFilterValue {
  return visible[0] ?? "all";
}

export function useBrandVisibility() {
  const { member, role } = useAuth();
  return useMemo(() => {
    const isAdmin = role === "CMO";
    const allowAll = isAdmin || canSeeAllBrands(member?.brandAccess);
    const visibleBrands = isAdmin ? BRAND_ORDER : visibleBrandsFromScope(member?.brandAccess);
    return {
      allowAll,
      visibleBrands,
      scopeLabel: member?.brandAccess || "All brands",
      isVisible: (brand: BrandFilterValue) => isBrandVisible(brand, visibleBrands, allowAll),
      normalize: (brand: BrandFilterValue): BrandFilterValue => (
        isBrandVisible(brand, visibleBrands, allowAll) ? brand : firstVisibleBrand(visibleBrands)
      ),
    };
  }, [member?.brandAccess, role]);
}
