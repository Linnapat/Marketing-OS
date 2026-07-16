// Matching a source system's brand label → one of OUR configured brand keys.
//
// Pure and dependency-free on purpose: the Google-Sheet importers run on the
// server, but this logic decides which brand a row of MONEY belongs to, so it
// must be unit-testable (see scripts/test-brands.ts). The server-only part —
// actually loading `brands_config` — lives in lib/serverBrands.
//
// Why this exists: the importers used to carry a hardcoded alias table that
// mapped "takao" → "touka". Takao Japanese Food and Touka are *different*
// brands, so ~264 rows of Takao's budget were being reported under Touka. A
// hardcoded table also can't see a brand the team adds in Settings. Matching the
// configured names fixes both.

export interface BrandCfgLite { key: string; name?: string }

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Source names that look nothing like the brand's configured name, so no amount
 *  of matching finds them ("OMD by TEPPEN" is our "Omakase Don"). Consulted only
 *  after the configured names fail. Deliberately has no "takao" entry — that was
 *  the bug; Takao resolves from its configured name like every other brand. */
const LEGACY_ALIASES: Record<string, string> = {
  teppen: "teppen",
  omdbyteppen: "omakase",
  omakasedon: "omakase",
  omakase: "omakase",
  mainichisushi: "mainichi",
  mainichi: "mainichi",
};

/** Build a resolver from the configured brands. Returns undefined when the label
 *  can't be pinned to exactly one brand — the caller skips the row, which is
 *  safer than posting money to a guess. */
export function makeBrandResolver(configs: BrandCfgLite[]): (value: string) => string | undefined {
  const byNorm = (configs ?? [])
    .filter((c) => c?.key)
    .map((c) => ({ key: c.key, n: norm(c.name || c.key) }))
    .filter((c) => c.n);

  return (value: string): string | undefined => {
    const v = norm(value);
    if (!v) return undefined;

    // 1. exact configured name — sheet "Mainichi" vs brand "Mainichi"
    const exact = byNorm.find((c) => c.n === v);
    if (exact) return exact.key;

    // 2. containment either way — "TAKAO" ⊂ "takaojapanesefood",
    //    "mainichisushi" ⊃ "mainichi", "TEPPEN" ⊂ "teppenenterment".
    //    Require exactly one candidate: two means we cannot tell whose money it
    //    is, so fall through rather than guess.
    const partial = byNorm.filter((c) => c.n.includes(v) || v.includes(c.n));
    if (partial.length === 1) return partial[0].key;

    // 3. source names unlike the configured name
    return LEGACY_ALIASES[v];
  };
}
