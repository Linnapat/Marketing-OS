"use client";

import { useEffect, useMemo, useState } from "react";
import { BRAND_ORDER, BRANDS, BrandFilterValue, BrandId } from "@/lib/brands";
import { useAuth } from "@/lib/auth";
import { fetchBrandConfigs } from "@/lib/db/settings";
import { BRANDS_DATA, BrandCfg } from "@/lib/data/settings";

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const BRAND_ALIASES: Record<BrandId, string[]> = {
  teppen: ["teppen", "teppenthailand"],
  omakase: ["omakase", "omakasedon"],
  mainichi: ["mainichi"],
  touka: ["touka"],
};

const isBrandId = (value: string): value is BrandId => value in BRANDS;
const configuredBrandIds = (configs: BrandCfg[]): BrandId[] => {
  const ids = configs.map((b) => b.key).filter(isBrandId);
  return ids.length ? ids : BRAND_ORDER;
};
const configuredBrandNames = (configs: BrandCfg[]): Record<BrandId, string> => (
  BRAND_ORDER.reduce((acc, id) => {
    const cfg = configs.find((b) => b.key === id);
    acc[id] = cfg?.name?.replace(/\s+Thailand$/i, "") || BRANDS[id].name;
    return acc;
  }, {} as Record<BrandId, string>)
);

export function visibleBrandsFromScope(scope?: string | null, configs: BrandCfg[] = BRANDS_DATA): BrandId[] {
  const raw = (scope ?? "").trim();
  const configuredIds = configuredBrandIds(configs);
  if (!raw || /^all brands$/i.test(raw)) return configuredIds;
  if (/external only/i.test(raw)) return [];
  const names = configuredBrandNames(configs);

  const normalized = norm(raw.replace(/^Branch\s*·\s*/i, ""));
  const visible = configuredIds.filter((id) => {
    const name = norm(names[id] || BRANDS[id].name);
    return normalized.includes(name) || BRAND_ALIASES[id].some((alias) => normalized.includes(norm(alias)));
  });

  return visible.length ? visible : configuredIds;
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
  const [configs, setConfigs] = useState<BrandCfg[]>(BRANDS_DATA);

  useEffect(() => {
    let alive = true;
    fetchBrandConfigs().then((next) => {
      if (alive && next.length) setConfigs(next);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return useMemo(() => {
    const isAdmin = role === "CMO";
    const allowAll = isAdmin || canSeeAllBrands(member?.brandAccess);
    const configuredIds = configuredBrandIds(configs);
    const brandNames = configuredBrandNames(configs);
    const brandColors = BRAND_ORDER.reduce((acc, id) => {
      acc[id] = configs.find((b) => b.key === id)?.color || BRANDS[id].color;
      return acc;
    }, {} as Record<BrandId, string>);
    const visibleBrands = isAdmin ? configuredIds : visibleBrandsFromScope(member?.brandAccess, configs);
    return {
      allowAll,
      visibleBrands,
      brandNames,
      brandColors,
      brandConfigs: configs,
      scopeLabel: member?.brandAccess || "All brands",
      isVisible: (brand: BrandFilterValue) => isBrandVisible(brand, visibleBrands, allowAll),
      normalize: (brand: BrandFilterValue): BrandFilterValue => (
        isBrandVisible(brand, visibleBrands, allowAll) ? brand : firstVisibleBrand(visibleBrands)
      ),
    };
  }, [configs, member?.brandAccess, role]);
}
