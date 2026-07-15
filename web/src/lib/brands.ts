// Brand registry — the single source of truth for brand identity across the app.
// Colors are taken verbatim from the Marketing OS design files.

export type BrandId = "teppen" | "omakase" | "mainichi" | "touka";

export interface Brand {
  id: BrandId;
  name: string;
  color: string;
  /** Short code used to prefix per-brand campaign numbers (TPN-2026-001). */
  code: string;
}

export const BRANDS: Record<BrandId, Brand> = {
  teppen: { id: "teppen", name: "TEPPEN", color: "#B33A2E", code: "TPN" },
  omakase: { id: "omakase", name: "Omakase Don", color: "#3E5C9A", code: "OMD" },
  mainichi: { id: "mainichi", name: "Mainichi", color: "#4E7A4E", code: "MNC" },
  touka: { id: "touka", name: "Touka", color: "#C68A1E", code: "TOU" },
};

export const brandCode = (id: BrandId) => BRANDS[id]?.code ?? "GEN";

export const BRAND_ORDER: BrandId[] = ["teppen", "omakase", "mainichi", "touka"];

// ── Runtime overrides from Settings → Brands (brands_config) ────────────────
// The static BRANDS above are the defaults; when a user edits a brand's name or
// colour in Settings, applyBrandOverrides() layers the saved values on top so
// brandName()/brandColor()/BrandDot reflect the change everywhere. Hydrated
// once at app start (AppShell) before the first paint.
const brandOverrides: Partial<Record<BrandId, { name?: string; color?: string }>> = {};

export function applyBrandOverrides(configs: { key: string; name?: string; color?: string }[]): void {
  for (const c of configs) {
    if (!(c.key in BRANDS)) continue; // ignore custom brands not in the id union
    brandOverrides[c.key as BrandId] = {
      name: c.name?.trim() || undefined,
      color: c.color?.trim() || undefined,
    };
  }
}

export const brandColor = (id: BrandId) => brandOverrides[id]?.color ?? BRANDS[id]?.color ?? "#9A9387";
export const brandName = (id: BrandId) => brandOverrides[id]?.name ?? BRANDS[id]?.name ?? id;

// Filter chips always include an "All Brands" option keyed as null.
export type BrandFilterValue = BrandId | "all";
