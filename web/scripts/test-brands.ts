/* Runtime tests for BRANDS as data — the registry (rename / add / remove) and the
 * sheet-label → brand-key resolver that decides which brand a row of MONEY lands
 * on. A wrong answer here posts one brand's budget onto another, silently.
 * Run with:  npm test   (chained after test-money.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { BRAND_ORDER, brandName, brandColor, brandCode, applyBrandOverrides, emptyBrandTotals } from "../src/lib/brands";
import { makeBrandResolver } from "../src/lib/brandResolve";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}

// The shape of the real production config: two seed brands renamed, `touka`
// removed, and brands the team added through Settings (generated keys).
const CONFIG = [
  { key: "teppen", name: "Teppen Enterment", color: "#050505" },
  { key: "omakase", name: "Omakase Don", color: "#1f66f4" },
  { key: "mainichi", name: "Mainichi", color: "#ffc800" },
  { key: "brand-1784116388699", name: "Takao Japanese Food " },
];

console.log("brand registry — Settings is the source of truth");
check("seed defaults before any config", BRAND_ORDER.includes("teppen") && BRAND_ORDER.includes("touka"));
applyBrandOverrides(CONFIG);
check("a brand added in Settings reaches the app", BRAND_ORDER.includes("brand-1784116388699"));
is("its name comes from config", brandName("brand-1784116388699"), "Takao Japanese Food");
is("a campaign code is derived for it", brandCode("brand-1784116388699"), "TAK");
is("renaming a seed brand propagates", brandName("teppen"), "Teppen Enterment");
is("recolouring a seed brand propagates", brandColor("teppen"), "#050505");
is("a brand dropped from config still renders for old rows", brandName("touka"), "Touka");
check("but it is no longer offered", !BRAND_ORDER.includes("touka"));
check("budget accumulators key off the configured brands", "brand-1784116388699" in emptyBrandTotals());
check("…and no longer invent a dropped one", !("touka" in emptyBrandTotals()));
is("an unknown id degrades to itself, never throws", brandName("nope-123"), "nope-123");
// Empty config must not wipe the registry — a failed load would blank the app.
applyBrandOverrides([]);
check("an empty config keeps the previous brands", BRAND_ORDER.includes("teppen"));

console.log("sheet label → brand key (money attribution)");
const r = makeBrandResolver(CONFIG);
// Real `department` values from the Finance ledger.
is("TEPPEN", r("TEPPEN"), "teppen");
is("OMD by TEPPEN → Omakase (names share nothing; legacy alias)", r("OMD by TEPPEN"), "omakase");
is("Mainichi Sushi → Mainichi (source name is longer)", r("Mainichi Sushi"), "mainichi");
// The bug this replaces: the old table mapped takao → touka, a DIFFERENT brand.
is("TAKAO → Takao Japanese Food, not Touka", r("TAKAO"), "brand-1784116388699");
check("non-brand ledger rows are skipped", ["MARKETING", "CRM", "Creative", "OFFICE"].every((v) => r(v) === undefined));
is("blank is skipped", r(""), undefined);

// Touka is a real brand the team will add later; it must resolve on its own key
// the moment it exists in Settings — without another code change.
const withTouka = makeBrandResolver([...CONFIG, { key: "brand-9999", name: "Touka" }]);
is("future TOUKA resolves to Touka", withTouka("TOUKA"), "brand-9999");
is("…and TAKAO still resolves to Takao", withTouka("TAKAO"), "brand-1784116388699");

// Ambiguity must not be guessed: money would land on the wrong brand.
const ambiguous = makeBrandResolver([{ key: "a", name: "Teppen One" }, { key: "b", name: "Teppen Two" }]);
is("an ambiguous label is skipped, not guessed", ambiguous("Teppen"), "teppen"); // falls to the legacy alias, never to a or b
check("neither ambiguous candidate is picked", !["a", "b"].includes(String(ambiguous("Teppen"))));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
