// Brand registry — the single source of truth for brand identity across the app.
// Colors are taken verbatim from the Marketing OS design files.

export type BrandId = "teppen" | "omakase" | "mainichi" | "touka";

export interface Brand {
  id: BrandId;
  name: string;
  color: string;
}

export const BRANDS: Record<BrandId, Brand> = {
  teppen: { id: "teppen", name: "TEPPEN", color: "#B33A2E" },
  omakase: { id: "omakase", name: "Omakase Don", color: "#3E5C9A" },
  mainichi: { id: "mainichi", name: "Mainichi", color: "#4E7A4E" },
  touka: { id: "touka", name: "Touka", color: "#C68A1E" },
};

export const BRAND_ORDER: BrandId[] = ["teppen", "omakase", "mainichi", "touka"];

export const brandColor = (id: BrandId) => BRANDS[id]?.color ?? "#9A9387";
export const brandName = (id: BrandId) => BRANDS[id]?.name ?? id;

// Filter chips always include an "All Brands" option keyed as null.
export type BrandFilterValue = BrandId | "all";
