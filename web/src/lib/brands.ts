// Brand registry — the single source of truth for brand identity across the app.
//
// Brands are DATA, not a fixed list: Settings → Brands & Branches can rename or
// recolour a brand AND add new ones. The four below are the seed defaults — they
// are the ids every existing row (campaigns, content, expenses…) already uses, and
// the fallback when no config has been saved yet. At startup AppShell calls
// applyBrandOverrides() with the saved `brands_config`, which rebuilds the registry
// to exactly the configured set (including brands the team added).
//
// Colors of the defaults are taken verbatim from the Marketing OS design files.

/** A brand id. Historically a fixed union of the four TEPPEN brands; now any
 *  configured key (Settings generates `brand-<timestamp>` for new brands). */
export type BrandId = string;

export interface Brand {
  id: BrandId;
  name: string;
  color: string;
  /** Short code used to prefix per-brand campaign numbers (TPN-2026-001). */
  code: string;
}

/** Seed defaults — also the fallback for a brand that config no longer lists but
 *  existing rows still reference (so a deleted brand still renders readably). */
const DEFAULT_BRANDS: Record<string, Brand> = {
  teppen: { id: "teppen", name: "TEPPEN", color: "#B33A2E", code: "TPN" },
  omakase: { id: "omakase", name: "Omakase Don", color: "#3E5C9A", code: "OMD" },
  mainichi: { id: "mainichi", name: "Mainichi", color: "#4E7A4E", code: "MNC" },
  touka: { id: "touka", name: "Touka", color: "#C68A1E", code: "TOU" },
};
const DEFAULT_ORDER: BrandId[] = ["teppen", "omakase", "mainichi", "touka"];

// The live registry. Both are mutated IN PLACE by applyBrandOverrides so every
// module that did `import { BRANDS, BRAND_ORDER }` sees the configured set —
// reassigning the exports would leave those imports pointing at the old objects.
export const BRANDS: Record<string, Brand> = { ...DEFAULT_BRANDS };
export const BRAND_ORDER: BrandId[] = [...DEFAULT_ORDER];

/** Registry entry, falling back to the seed defaults so a brand that was removed
 *  from config but is still referenced by old rows keeps its name/colour. */
const lookup = (id: BrandId): Brand | undefined => BRANDS[id] ?? DEFAULT_BRANDS[id];

/** Campaign-number prefix for a brand the defaults don't know: first 3 alphanumerics. */
function deriveCode(name: string, id: BrandId): string {
  const base = (name || id).replace(/[^A-Za-z0-9]/g, "");
  return (base.slice(0, 3) || "GEN").toUpperCase();
}

/** Rebuild the registry from Settings → Brands. Called once at app start, before
 *  the first paint (AppShell). An empty/absent config keeps the seed defaults. */
export function applyBrandOverrides(configs: { key: string; name?: string; color?: string }[]): void {
  const rows = (configs ?? []).filter((c) => c?.key);
  if (!rows.length) return; // nothing saved yet — keep the defaults

  for (const k of Object.keys(BRANDS)) delete BRANDS[k];
  BRAND_ORDER.length = 0;

  for (const c of rows) {
    const def = DEFAULT_BRANDS[c.key];
    const name = c.name?.trim() || def?.name || c.key;
    BRANDS[c.key] = {
      id: c.key,
      name,
      color: c.color?.trim() || def?.color || "#9A9387",
      code: def?.code ?? deriveCode(name, c.key),
    };
    BRAND_ORDER.push(c.key);
  }
}

export const brandCode = (id: BrandId) => lookup(id)?.code ?? "GEN";
export const brandColor = (id: BrandId) => lookup(id)?.color ?? "#9A9387";
export const brandName = (id: BrandId) => lookup(id)?.name ?? id;

/** Zero-filled accumulator keyed by every configured brand — use this instead of
 *  hardcoding `{ teppen: 0, omakase: 0, … }`, which silently drops new brands. */
export function emptyBrandTotals(): Record<BrandId, number> {
  return Object.fromEntries(BRAND_ORDER.map((id) => [id, 0]));
}

// Filter chips always include an "All Brands" option keyed as null.
export type BrandFilterValue = BrandId | "all";
