/* Runtime tests for the Google-Sheet → CampaignBrief importer. The sheet is
 * human/AI-written, so the risk isn't a crash — it's a plausible-looking brief
 * that quietly says something the sheet didn't: a date a month off, a KOL row
 * dropped, a branch that belongs to another brand.
 * Run with:  npm test   (chained after test-brands.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { briefFromSheet, applyBriefPatch, looksLikeTab, looksLikeCollapsedFieldTab, num, sheetDate, sheetMonth, briefFixture } from "../src/lib/data/briefSheet";
import { budgetSummary } from "../src/lib/data/brief";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}

// The brands as Settings has them (Takao and Touka are DIFFERENT brands — the
// bug this resolver was written to kill).
const resolve = (label: string) => ({ teppen: "teppen", "omakase don": "omakase", takao: "brand-777", touka: "touka" } as Record<string, string>)[label.trim().toLowerCase()];

console.log("\n— cell readers —");
is("plain number", num("150000"), 150000);
is("baht + commas", num("฿150,000"), 150000);
is("k suffix", num("150k"), 150000);
is("M suffix", num("1.2M"), 1200000);
is("blank is 0", num(""), 0);
is("junk is 0", num("TBD"), 0);

{
  const w: string[] = [];
  is("ISO passes through", sheetDate("2026-07-01", "d", w), "2026-07-01");
  is("ISO needs no warning", w.length, 0);
}
{
  const w: string[] = [];
  is("D/M/YYYY when day > 12", sheetDate("17/7/2026", "d", w), "2026-07-17");
  is("…silently, it's unambiguous", w.length, 0);
}
{
  const w: string[] = [];
  is("M/D/YYYY when second part > 12", sheetDate("7/17/2026", "d", w), "2026-07-17");
  is("…silently, it's unambiguous", w.length, 0);
}
{
  // 7/1/2026 is either 1 Jul or 7 Jan — a month-and-a-half apart. Guessing
  // silently is the failure mode this whole file exists to prevent.
  const w: string[] = [];
  is("ambiguous slash date takes US reading", sheetDate("7/1/2026", "Start Date", w), "2026-07-01");
  is("…but says so", w.length, 1);
  check("…and the warning names the field and the reading", w[0].includes("Start Date") && w[0].includes("2026-07-01"));
}
{
  const w: string[] = [];
  is("unreadable date is refused, not guessed", sheetDate("next friday", "Launch Date", w), "");
  is("…with a warning", w.length, 1);
}
is("month YYYY-MM", sheetMonth("2026-07"), "2026-07");
is("month YYYY/M pads", sheetMonth("2026/7"), "2026-07");
is("month 'Jul 2026'", sheetMonth("Jul 2026"), "2026-07");
is("unreadable month is empty", sheetMonth("summer"), "");

console.log("\n— a full, well-formed sheet —");
const OVERVIEW = [
  ["Field", "Value"],
  ["Campaign Name", "Wagyu Festival"],
  ["Brand", "Takao"],
  ["Branches", "Silom, Thonglor"],
  ["Objective", "awareness"],            // wrong case
  ["Campaign Type", "Online + Offline"],
  ["Priority", "High"],
  ["Start Date", "2026-07-01"],
  ["End Date", "2026-07-31"],
  ["Launch Date", "2026-07-05"],
  ["Target Audience", "Office workers 25-40"],
  ["Key Message", "ที่สุดของวากิว"],
  ["Main Offer", "เซ็ตวากิว 1,290.-"],
  ["Channels", "Facebook, Instagram, TikTok"],
  ["Goal: Reach", "500000"],
  ["Goal: CV%", "2.5"],
];
const CONTENT = [
  ["Title", "Type", "Platforms", "Asset Sizes", "Publish Date", "Needs Graphic", "CTA"],
  ["KV Launch", "Photo", "Facebook, Instagram", "1:1", "2026-07-05", "Yes", "จองเลย"],
  ["Teaser Reel", "Reel", "Instagram", "Instagram: 9:16", "2026-07-02", "No", ""],
  ["", "", "", "", "", "", ""],            // spacer row the AI left behind
];
const KOL = [
  ["Name", "KOL Type", "Platforms", "Followers", "Count", "Budget", "Content Required", "Posting Start"],
  ["@foodie.bkk", "Foodie", "Instagram", "120k", "1", "15,000", "Reel", "2026-07-10"],
  ["", "Micro", "TikTok", "", "3", "5000", "Reel, Story", "2026-07-12"],   // not chosen yet
];
const BUDGET = [
  ["Category", "Amount"],
  ["Total", "150,000"],
  ["Ads", "60000"],
  ["KOL", "30000"],
  ["Graphic", "10000"],
  ["Ads: Facebook / Instagram", "40000"],
  ["Ads: TikTok", "20000"],
  ["Month: 2026-07", "150000"],
];

const full = briefFromSheet({ overview: OVERVIEW, content: CONTENT, kol: KOL, budget: BUDGET }, resolve);
is("name", full.patch.name, "Wagyu Festival");
is("Takao resolves to its own brand, NOT touka", full.patch.b, "brand-777");
is("objective matches case-insensitively", full.patch.objective, "Awareness");
is("start date", full.patch.startDate, "2026-07-01");
is("channels", (full.patch.channels ?? []).join("|"), "Facebook|Instagram|TikTok");
is("a goal implies its metric is a KPI", (full.patch.successMetrics ?? []).includes("Reach"), true);
is("goal value", full.patch.successGoals?.["CV%"], "2.5");

is("content rows", full.counts.content, 2);
check("blank spacer row is skipped", full.patch.content?.length === 2);
is("bare size pairs with every platform of the row", full.patch.content![0].assets.length, 2);
is("…and resolves to the platform's real size", full.patch.content![0].assets[0].size, "1:1 (1080×1080)");
is("qualified 'Instagram: 9:16' resolves", full.patch.content![1].assets[0].size, "9:16 Reel/Story (1080×1920)");
is("Needs Graphic = No is honoured", full.patch.content![1].requiredGraphic, false);
is("Needs Graphic = Yes", full.patch.content![0].requiredGraphic, true);

is("kol rows", full.counts.kols, 2);
is("followers 120k", full.patch.kols![0].followers, 120000);
is("a page-less row still imports (type only)", full.patch.kols![1].kolType, "Micro");
is("count", full.patch.kols![1].count, 3);
is("multi content required", full.patch.kols![1].contentRequired.join("|"), "Reel|Story");

is("budget total", full.patch.budget?.total, 150000);
is("ads platforms", full.patch.budget?.adsByPlatform.length, 2);
is("monthly", full.patch.budget?.monthly?.[0].month, "2026-07");
is("a clean sheet warns about nothing", full.warnings.length, 0);

console.log("\n— the brief the form actually gets —");
{
  const current = { ...briefFixture(), plannerOwner: "Linnapat D.", approver: "Linnapat D.", code: "TKO-2026-004" };
  const branchesFor = (brand: string) => (brand === "brand-777" ? ["Silom", "Thonglor", "Ekkamai"] : ["Other"]);
  const { brief, warnings } = applyBriefPatch(current, full.patch, branchesFor);
  is("identity fields survive the import", brief.id, current.id);
  is("code is not overwritten by the sheet", brief.code, "TKO-2026-004");
  is("planner stays the logged-in user", brief.plannerOwner, "Linnapat D.");
  is("status stays Draft — a sheet cannot self-approve", brief.status, "Draft");
  is("branches kept", brief.branches.join("|"), "Silom|Thonglor");
  is("branch string mirrors branches", brief.branch, "Silom, Thonglor");
  is("valid branches raise no warning", warnings.length, 0);
  // The budget guard and validation still run on this brief — check it's the
  // real shape they expect, not a half-populated one. Ads 60k + KOL 30k; the
  // 10k graphic is production, which budgetSummary deliberately leaves out of
  // the media allocation.
  is("budget summary reads the imported buckets", budgetSummary(brief).allocated, 90000);
}
{
  // A sheet naming another brand's branch must not smuggle it in.
  const { brief, warnings } = applyBriefPatch(briefFixture(), full.patch, () => ["Ekkamai"]);
  is("foreign branches are dropped", brief.branches.length, 0);
  is("…with a warning", warnings.length, 1);
  check("…that names them", warnings[0].includes("Silom"));
}

console.log("\n— a sloppy sheet reports rather than guesses —");
{
  const messy = briefFromSheet({
    overview: [["Field", "Value"], ["Campaign Name", "Rainy Promo"], ["Brand", "Nonesuch"], ["Objective", "Vibes"], ["Start Date", "7/1/2026"]],
    content: [["Title", "Type", "Platforms"], ["Poster", "Hologram", "MySpace"]],
    kol: null,
    budget: null,
  }, resolve);
  is("name still lands", messy.patch.name, "Rainy Promo");
  is("unknown brand is not set", messy.patch.b, undefined);
  is("unknown objective is not set", messy.patch.objective, undefined);
  check("unknown brand is reported", messy.warnings.some((w) => w.includes("Nonesuch")));
  check("unknown objective is reported", messy.warnings.some((w) => w.includes("Vibes")));
  check("unknown content type is reported", messy.warnings.some((w) => w.includes("Hologram")));
  check("unknown platform is reported", messy.warnings.some((w) => w.includes("MySpace")));
  check("ambiguous date is reported", messy.warnings.some((w) => w.includes("Start Date")));
  is("the content row still imports", messy.counts.content, 1);
}
{
  const noName = briefFromSheet({ overview: [["Field", "Value"], ["Brand", "Teppen"]], content: null, kol: null, budget: null }, resolve);
  check("a missing campaign name is called out", noName.warnings.some((w) => w.includes("Campaign Name")));
}
{
  // KOL money with no envelope in Budget → the form would show it as an overrun.
  const orphan = briefFromSheet({
    overview: [["Field", "Value"], ["Campaign Name", "X"]],
    content: null,
    kol: [["Name", "Budget", "Count"], ["@a", "20000", "2"]],
    budget: [["Category", "Amount"], ["Total", "50000"]],
  }, resolve);
  check("KOL budget without a KOL envelope is flagged", orphan.warnings.some((w) => w.includes("KOL")));
  is("…counting pages × budget", orphan.warnings.some((w) => w.includes("40,000")), true);
}

console.log("\n— tab identification (Google hands back the FIRST tab for a name that doesn't exist) —");
// Verified against a real sheet: gviz answers 200 with tab #1, never a 404. So
// every optional tab must be identified by shape, or a one-tab sheet imports
// its Overview as content, KOL rows and a budget.
is("the Overview tab is recognised", looksLikeTab("overview", OVERVIEW), true);
is("the Content tab is recognised", looksLikeTab("content", CONTENT), true);
is("the KOL tab is recognised", looksLikeTab("kol", KOL), true);
is("the Budget tab is recognised", looksLikeTab("budget", BUDGET), true);
is("Overview is NOT mistaken for Content", looksLikeTab("content", OVERVIEW), false);
is("Overview is NOT mistaken for KOL", looksLikeTab("kol", OVERVIEW), false);
is("Overview is NOT mistaken for Budget", looksLikeTab("budget", OVERVIEW), false);
is("Content is NOT mistaken for KOL", looksLikeTab("kol", CONTENT), false);
is("Content is NOT mistaken for Overview", looksLikeTab("overview", CONTENT), false);
is("KOL is NOT mistaken for Content", looksLikeTab("content", KOL), false);
is("Budget is NOT mistaken for Overview", looksLikeTab("overview", BUDGET), false);
is("an empty grid is no tab at all", looksLikeTab("overview", []), false);
{
  // The whole point, end to end: a sheet with only an Overview tab. Google
  // returns that same grid for all four requests; the route filters with
  // looksLikeTab, so nothing is invented.
  const onlyOverview = briefFromSheet(
    { overview: OVERVIEW, content: looksLikeTab("content", OVERVIEW) ? OVERVIEW : null, kol: looksLikeTab("kol", OVERVIEW) ? OVERVIEW : null, budget: looksLikeTab("budget", OVERVIEW) ? OVERVIEW : null },
    resolve,
  );
  is("no content is invented from the Overview tab", onlyOverview.counts.content, 0);
  is("no KOL is invented from the Overview tab", onlyOverview.counts.kols, 0);
  is("no budget is invented from the Overview tab", onlyOverview.patch.budget, undefined);
  is("…and the real Overview still imports", onlyOverview.patch.name, "Wagyu Festival");
}

console.log("\n— the paste-into-one-cell accident (from a real sheet) —");
{
  // Verbatim from a sheet a planner filled in: the rows were pasted while A1 was
  // in edit mode, so every field name landed in A1 and every value in B1 — and
  // Google's CSV export flattened the in-cell newlines to spaces on the way out.
  const COLLAPSED = [
    ["Field Campaign Name Brand Branches Objective Campaign Type Priority Start Date End Date Launch Date Target Audience Key Message Main Offer Store Promotion Channels Concept KV Direction Proposal Link",
     "Value CRM-10% off for Must Eat OMD by TEPPEN 7 สาขาทั่วกรุงเทพฯ CRM CRM High 2026-09-01 2026-12-31 2026-09-01 สมาชิก OMD ทั้งหมด"],
    ["Goal: Reach", "0"],
    ["Goal: CV%", "3"],
  ];
  is("a collapsed tab is not accepted as Overview", looksLikeTab("overview", COLLAPSED), false);
  is("…and is recognised as the paste accident", looksLikeCollapsedFieldTab(COLLAPSED), true);
  is("a healthy Overview is NOT flagged as collapsed", looksLikeCollapsedFieldTab(OVERVIEW), false);
  is("a Content tab is NOT flagged as collapsed", looksLikeCollapsedFieldTab(CONTENT), false);
  is("a genuinely absent tab is NOT flagged as collapsed", looksLikeCollapsedFieldTab([["Something else", "x"]]), false);
  // A long sentence that merely mentions one field name must not trip it.
  is("prose mentioning one field name is not a collapsed tab",
    looksLikeCollapsedFieldTab([["หมายเหตุ: กรุณากรอก Campaign Name ให้ครบทุกแคมเปญก่อนส่งให้ทีมตรวจสอบอีกครั้งนะครับ", ""]]), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
