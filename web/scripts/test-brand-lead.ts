/* Who holds the brand-lead step of an approval chain.
 * Run: node --import tsx scripts/test-brand-lead.ts
 *
 * The bug this guards (reported 21 Aug 2026, OMD_2608_001-C02-A01): the
 * Approval tab of every Omakase Don graphic job named the Teppen · Mainichi
 * manager as step 3. Both the graphic ladder and the campaign chain resolved
 * that step with `members.find(role ~ /marketing manager|bgl|brand lead/)`
 * over a list ordered by email — no brand filter at all. Omakase Don has no
 * manager of its own, so it borrowed another brand's, who cannot even open
 * the request her scope hides from her.
 *
 * The roster below is the live one (21 Aug 2026), because the trap is in the
 * shape of the real team: exactly one MM/BGL, scoped to two brands, and an OMD
 * that is led by a Marketing Executive instead. */

import { resolveBrandLead } from "../src/lib/db/assignments";
import type { Member } from "../src/lib/db/settings";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const m = (name: string, email: string, role: string, brandAccess: string, status = "Active"): Member =>
  ({ name, email, role, access: "Editor", brandAccess, status, color: "#000" }) as Member;

// Ordered by email, the way fetchMembers returns them — the order the old
// `find()` was silently trusting.
const ROSTER: Member[] = [
  m("Saii", "aornkanya.s@teppenthailand.co.th", "Co-ordinator", "All brands"),
  m("GID", "info@gid-social.com", "Agency (External)", "External only"),
  m("Jeeno", "kasidit.ta@teppenthailand.co.th", "VDO Editor", "All brands"),
  m("Gik", "linnapat.d@teppenthailand.co.th", "CMO", "All brands"),
  m("Jungjing", "napaporn.m@teppenthailand.co.th", "Senior Graphic Designer", "All brands"),
  m("narawich", "narawich.k@teppenthailand.co.th", "Marketing Executive", "Selected brands · Omakase Don"),
  m("Pupay", "orapan.ch@teppenthailand.co.th", "Marketing Manager / BGL", "Selected brands · Teppen · Mainichi"),
  m("Pichayaporn", "pichayaporn.l@teppenthailand.co.th", "Creative Leader", "All brands"),
];

console.log("\n— the live roster —");
is("OMD lands on its own Marketing Executive, not the Teppen manager",
  resolveBrandLead("omakase", ROSTER), "narawich");
is("Teppen still lands on the manager scoped to it", resolveBrandLead("teppen", ROSTER), "Pupay");
is("Mainichi too", resolveBrandLead("mainichi", ROSTER), "Pupay");
is("a brand nobody leads returns null, so the step can be dropped",
  resolveBrandLead("touka", ROSTER), null);

console.log("\n— who may hold the step —");
is("a manager scoped to the brand outranks its executive",
  resolveBrandLead("omakase", [...ROSTER, m("Bee", "a.bee@teppenthailand.co.th", "Marketing Manager / BGL", "Selected brands · Omakase Don")]),
  "Bee");
is("'All brands' scope covers every brand",
  resolveBrandLead("touka", [...ROSTER, m("Ken", "zz.ken@teppenthailand.co.th", "Marketing Manager / BGL", "All brands")]),
  "Ken");
is("an inactive member never holds the step",
  resolveBrandLead("touka", [...ROSTER, m("Ken", "zz.ken@teppenthailand.co.th", "Marketing Manager / BGL", "All brands", "Invited")]),
  null);
is("an agency account never holds it either — 'External only' sees no brand",
  resolveBrandLead("touka", [...ROSTER, m("Shop", "zz.shop@gid-social.com", "Agency (External)", "External only")]),
  null);
is("nor does an agency row left on 'All brands' by mistake",
  resolveBrandLead("touka", [...ROSTER, m("QA", "zz.qa@teppenthailand.co.th", "Agency (External)", "All brands")]),
  null);

console.log("\n— brands whose names confuse each other —");
// Takao and Touka are different brands; a substring match on the short name is
// how one brand's budget ended up under the other before (brand refactor, Jul).
const takaoCfg = [
  { key: "touka", name: "Touka" }, { key: "omakase", name: "Omakase Don" },
  { key: "teppen", name: "Teppen" }, { key: "mainichi", name: "Mainichi" },
] as Parameters<typeof resolveBrandLead>[2];
is("a Touka-scoped manager does not lead Omakase Don",
  resolveBrandLead("omakase", [m("Lin", "a.lin@teppenthailand.co.th", "Marketing Manager / BGL", "Selected brands · Touka")], takaoCfg),
  null);
is("…and does lead Touka", resolveBrandLead("touka",
  [m("Lin", "a.lin@teppenthailand.co.th", "Marketing Manager / BGL", "Selected brands · Touka")], takaoCfg), "Lin");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
