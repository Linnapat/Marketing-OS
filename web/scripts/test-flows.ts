/* Runtime tests for the KOL + Content flow logic (pure functions).
 * Run with:  npx tsx --tsconfig tsconfig.json scripts/test-flows.ts
 * No test runner is configured; this is a self-contained assert harness. */

import { Kol, KOLS } from "../src/lib/data/kol";
import {
  canTransition, prerequisitesFor, canSaveResults, nextStage, hasOwner, hasPostLink,
} from "../src/lib/kolFlow";
import { ContentItem, CONTENT, contentApproveBlockers, contentReadyForApproval, advanceApprovalState, canPublish } from "../src/lib/data/content";
import { campaignMonthKeys, emptyBrief, emptyContentItem, taskPreview, budgetSummary, nextCampaignCode, CampaignBrief, CONTENT_PLATFORMS, needsAssetSize, validateSubmit, guidelineChecklist, visitGoalOf } from "../src/lib/data/brief";
import { Graphic, GraphicDeliverable, GRAPHICS, workKind, countWorkOnDay, artworkUnits, artworkUnitsOf, DAILY_WORK_CAP } from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

// A minimal KOL fixture at a given stage; override any field.
const base = (over: Partial<Kol>): Kol => ({ ...(KOLS[0] as Kol), posts: [], postLink: null, ...over });

console.log("KOL flow — guarded transitions");
{
  const k = base({ status: "Request", owner: "Unassigned" });
  check("Request→Owner Assigned blocked when no owner", !canTransition(k, "Owner Assigned").ok);
  check("Request→Owner Assigned ok once owner set", canTransition(base({ status: "Request", owner: "Nok W." }), "Owner Assigned").ok);
  check("Request→Negotiating blocked (skips a stage)", !canTransition(base({ status: "Request", owner: "Nok W." }), "Negotiating").ok);
}
{
  const k = base({ status: "Negotiating", contractStatus: "Pending", quotationStatus: "Pending" });
  check("Negotiating→Contract Signed blocked without contract+quotation", !canTransition(k, "Contract Signed").ok);
  const ok = base({ status: "Negotiating", contractStatus: "Signed", quotationStatus: "Approved" });
  check("Negotiating→Contract Signed ok with both", canTransition(ok, "Contract Signed").ok);
}
{
  const noLink = base({ status: "Producing", postLink: null, posts: [] });
  check("Producing→In Review blocked without draft link", !canTransition(noLink, "In Review").ok);
  const withLink = base({ status: "Producing", posts: [{ platform: "Instagram", link: "https://x" }] });
  check("Producing→In Review ok with a post link", canTransition(withLink, "In Review").ok);
}
{
  const notApproved = base({ status: "Approved", posts: [{ platform: "Instagram", link: "https://x" }] });
  check("Approved→Posted ok (approval passed + link)", canTransition(notApproved, "Posted").ok);
  const noLink = base({ status: "Approved", posts: [] });
  check("Approved→Posted blocked without final link", !canTransition(noLink, "Posted").ok);
}
{
  check("Backward move (revision) always allowed", canTransition(base({ status: "In Review" }), "Producing").ok);
}

console.log("KOL — results gating");
{
  check("Save Results blocked before Posted", !canSaveResults(base({ status: "In Review", posts: [{ platform: "Instagram", link: "x" }] })).ok);
  check("Save Results ok when Posted + link", canSaveResults(base({ status: "Posted", posts: [{ platform: "Instagram", link: "x" }] })).ok);
  check("Save Results blocked when Posted but no link", !canSaveResults(base({ status: "Posted", posts: [] })).ok);
}

console.log("KOL — helpers");
{
  check("hasOwner false for Unassigned", !hasOwner(base({ owner: "Unassigned" })));
  check("hasPostLink true from posts[]", hasPostLink(base({ posts: [{ platform: "Instagram", link: "y" }] })));
  check("nextStage(Request) = Owner Assigned", nextStage(base({ status: "Request" })) === "Owner Assigned");
  check("nextStage(Completed) = null", nextStage(base({ status: "Completed" })) === null);
  check("prereq In Review lists link when missing", prerequisitesFor("In Review", base({ posts: [] })).length === 1);
}

console.log("Content — approve/publish gating");
{
  const c = (over: Partial<ContentItem>): ContentItem => ({ ...(CONTENT[0] as ContentItem), title: "T", campaign: "Wagyu Festival", platforms: ["Instagram"], captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft", ...over });
  check("Approve blocked when caption Missing", contentApproveBlockers(c({})).some((b) => /Caption/.test(b)));
  check("Approve blocked when asset not approved", contentApproveBlockers(c({ captionStatus: "Ready" })).some((b) => /Asset/.test(b)));
  check("Ready for approval when caption Ready + asset Approved", contentReadyForApproval(c({ captionStatus: "Ready", assetStatus: "Approved" })));
  check("No-asset post is approvable with caption Ready", contentReadyForApproval(c({ captionStatus: "Ready", assetStatus: "No Asset" })));
  check("advanceApprovalState → Waiting Approval when ready", advanceApprovalState(c({ captionStatus: "Ready", assetStatus: "Approved" })).approvalStatus === "Waiting Approval");
  check("advanceApprovalState keeps Draft when not ready", advanceApprovalState(c({})).approvalStatus === "Draft");
  check("Publish blocked before approval", !canPublish(c({ captionStatus: "Ready", assetStatus: "Approved", approvalStatus: "Draft" })).ok);
  check("Publish ok when caption+asset+approval done", canPublish(c({ captionStatus: "Approved", assetStatus: "Approved", approvalStatus: "Approved" })).ok);
}

console.log("Idempotency — source-id keys");
{
  // Simulate createXIfNew's guard: a set of already-materialised source ids.
  const seen = new Set<string>();
  const tryCreate = (key: string) => { if (seen.has(key)) return false; seen.add(key); return true; };
  // First submit of a 3-page KOL requirement kr1.
  const keys = [1, 2, 3].map((p) => `kr1#${p}`);
  const first = keys.map(tryCreate);
  check("first submit creates all 3 pages", first.every(Boolean) && seen.size === 3);
  // Retry the same submit — nothing new.
  const retry = keys.map(tryCreate);
  check("retry creates 0 (idempotent)", retry.every((x) => x === false) && seen.size === 3);
  // Content idempotency key is (campaign, contentItem) → one per item.
  const cseen = new Set<string>();
  const c1 = tryCreateKey(cseen, "camp1::ci1");
  const c1again = tryCreateKey(cseen, "camp1::ci1");
  check("content item creates once, retry no-op", c1 && !c1again);
}

console.log("Campaign planning — monthly budget + work-item alignment");
{
  check("campaign month keys include every month in a long campaign", campaignMonthKeys("2026-07-15", "2026-09-02").join(",") === "2026-07,2026-08,2026-09");
  const brief = emptyBrief("campaign-test");
  const graphic = { ...emptyContentItem(1), id: "graphic", title: "KV", requiredGraphic: true, platforms: ["Instagram"], assets: [{ platform: "Instagram", size: "1:1" }] };
  const contentOnly = { ...emptyContentItem(2), id: "copy", title: "Copy", requiredGraphic: false, platforms: ["Facebook"], assets: [{ platform: "Facebook", size: "1:1" }] };
  brief.content = [graphic, contentOnly];
  const preview = taskPreview(brief);
  check("graphic content becomes one creative work item", preview.find((row) => row.kind === "Creative / Graphic Tasks")?.count === 1);
  check("content-only item becomes one content task", preview.find((row) => row.kind === "Content Tasks")?.count === 1);
}

function tryCreateKey(set: Set<string>, key: string) { if (set.has(key)) return false; set.add(key); return true; }

console.log("Asset size — only demanded from platforms that have sizes to offer");
{
  // Delivery ships with no size list on purpose. If Submit demanded one anyway
  // the dropdown would be empty, so the campaign could never be submitted and
  // the only escape would be to deselect Delivery. Guard both directions.
  check("Delivery is offered as a platform", (CONTENT_PLATFORMS as readonly string[]).includes("Delivery"));
  check("Delivery is exempt — it has no sizes", !needsAssetSize("Delivery"));
  check("Instagram still requires a size", needsAssetSize("Instagram"));

  const base = (platforms: string[], assets: { platform: string; size: string }[]) => {
    const b = emptyBrief("asset-test");
    b.name = "N"; b.objective = "Awareness"; b.campaignType = "Always-on"; b.b = "teppen";
    b.branches = ["Central"]; b.startDate = "2026-08-01"; b.endDate = "2026-08-31";
    b.launchDate = "2026-08-01"; b.audience = "A"; b.mainMessage = "M"; b.offer = "O";
    b.approver = "CMO";
    b.budget = { ...b.budget, total: 1000 };
    b.content = [{ ...emptyContentItem(1), id: "c1", title: "T", subHead: "S", platforms, assets }];
    return b;
  };
  const sizeErr = (b: CampaignBrief) => validateSubmit(b).filter((e) => e.startsWith("Please select asset size"));

  check("Delivery alone does not block submit", sizeErr(base(["Delivery"], [])).length === 0);
  check("Instagram without a size still blocks", sizeErr(base(["Instagram"], [])).length === 1);
  check("mixed: only Instagram is named, not Delivery",
    sizeErr(base(["Delivery", "Instagram"], [])).join("|") === "Please select asset size for Instagram");
  check("Delivery + sized Instagram is clean", sizeErr(base(["Delivery", "Instagram"], [{ platform: "Instagram", size: "1:1 (1080×1080)" }])).length === 0);
  // The checklist gates Submit too, and had the same rule — it must agree.
  check("guideline checklist agrees Delivery is complete",
    guidelineChecklist(base(["Delivery"], [])).find((i) => i.key === "content")?.done === true);
}

console.log("Visit goal — free text off the brief, shown in the Campaign list");
{
  const g = (v: unknown) => visitGoalOf({ successGoals: { Visit: v as string } });
  check("plain number", g("600") === 600);
  check("thousands separator", g("12,000") === 12000);
  check("blank reads 0, not NaN", g("") === 0);
  check("junk reads 0, not NaN", g("n/a") === 0);
  check("a campaign with no brief at all reads 0", visitGoalOf(undefined) === 0);
  check("negative is not a goal", g("-5") === 0);
  // A NaN here would render as "NaN" in the column and poison the group total.
  const total = [g("600"), g(""), g("n/a"), g("1,400")].reduce((s, n) => s + n, 0);
  check("totals stay finite when some briefs are unfilled", total === 2000);
}

console.log("Budget — Production excluded from allocation");
{
  const b = emptyBrief("bud-test");
  b.budget = { ...b.budget, total: 100000, ads: 40000, kol: 20000, graphic: 15000, printing: 5000, crm: 0, other: 0, adsByPlatform: [] };
  const s = budgetSummary(b);
  check("allocated excludes graphic/production", s.allocated === 40000 + 20000 + 5000); // 65k, not 80k
  b.budget = { ...b.budget, other: 3000, otherNote: "" };
  check("Other without a note warns", budgetSummary(b).warnings.some((w) => w.includes("Other")));
  b.budget = { ...b.budget, otherNote: "ค่าขนส่ง POSM" };
  check("Other with a note clears the warning", !budgetSummary(b).warnings.some((w) => w.includes("Other")));
}

console.log("Budget — optional: a zero-spend campaign (e.g. Mainichi free-message quota) must still submit");
{
  const b = emptyBrief("no-budget-test");
  b.name = "N"; b.objective = "Awareness"; b.campaignType = "Always-on"; b.b = "mainichi";
  b.branches = ["Central"]; b.startDate = "2026-08-01"; b.endDate = "2026-08-31";
  b.launchDate = "2026-08-01"; b.audience = "A"; b.mainMessage = "M"; b.offer = "O";
  b.approver = "CMO";
  b.content = [{
    ...emptyContentItem(1), id: "c1", title: "T", subHead: "S", platforms: ["Instagram"],
    assets: [{ platform: "Instagram", size: "1:1 (1080×1080)" }], graphicDueDate: "2026-07-31", publishDate: "2026-08-01",
  }];
  // budget.total stays 0 — untouched.
  check("no budget-related blocker when total is 0", !validateSubmit(b).some((e) => /budget/i.test(e)));
  check("guideline checklist no longer treats budget as must-have",
    guidelineChecklist(b).find((i) => i.key === "budget")?.must === false);
}

console.log("Campaign code — per-brand running number");
{
  const mk = (b: CampaignBrief["b"], code?: string): CampaignBrief => ({ ...emptyBrief("x"), b, code });
  const existing = [mk("teppen", "TPN-2026-001"), mk("teppen", "TPN-2026-002"), mk("omakase", "OMD-2026-005")];
  check("teppen next = 003", nextCampaignCode("teppen", existing, 2026) === "TPN-2026-003");
  check("omakase next = 006 (independent of teppen)", nextCampaignCode("omakase", existing, 2026) === "OMD-2026-006");
  check("mainichi first = 001", nextCampaignCode("mainichi", existing, 2026) === "MNC-2026-001");
}

console.log("Graphic request — daily capacity guard (3/day per kind)");
{
  check("Photo shoot → photo_shoot", workKind("Photo shoot") === "photo_shoot");
  check("VDO shooting → vdo_shoot", workKind("VDO shooting") === "vdo_shoot");
  check("Reel → vdo", workKind("Reel") === "vdo");
  check("requiredVideo flag → vdo", workKind("Poster", true) === "vdo");
  check("Poster → graphic", workKind("Poster") === "graphic");
  const del = (platform: string, size: string, artworkNo?: number): GraphicDeliverable =>
    ({ platform, size, refLink: "", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [], artworkNo });
  const gk = (over: Partial<Graphic>): Graphic => ({ ...(GRAPHICS[0] as Graphic), ...over });
  const day = "2026-08-10";
  const one = (id: number, type: string) => gk({ id, type, dueIso: day, deliverables: [del("FB", "1:1")] });
  const three = [one(1, "Poster"), one(2, "Menu book"), one(3, "Artwork")];
  check("3 requests × 1 artwork = 3 pieces", countWorkOnDay(three, "graphic", day) === 3);
  check("at cap blocks a 4th", countWorkOnDay(three, "graphic", day) >= DAILY_WORK_CAP);
  check("different kind not counted", countWorkOnDay(three, "photo_shoot", day) === 0);
  check("different day not counted", countWorkOnDay(three, "graphic", "2026-08-11") === 0);
}

console.log("Artwork counting — auto by size + manual grouping");
{
  const del = (platform: string, size: string, artworkNo?: number): GraphicDeliverable =>
    ({ platform, size, refLink: "", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [], artworkNo });
  const g = (dels: GraphicDeliverable[]): Graphic => ({ ...(GRAPHICS[0] as Graphic), deliverables: dels });
  check("same size, 2 platforms = 1 artwork", artworkUnits(g([del("FB", "1:1"), del("IG", "1:1")])) === 1);
  check("different sizes = 2 artworks", artworkUnits(g([del("FB", "1:1"), del("IG", "9:16")])) === 2);
  check("manual same artworkNo groups to 1", artworkUnits(g([del("FB", "1:1", 1), del("IG", "9:16", 1)])) === 1);
  check("mixed: 2 grouped + 1 distinct = 2", artworkUnits(g([del("FB", "1:1", 1), del("IG", "9:16", 1), del("TT", "4:5")])) === 2);
  check("never returns 0 (min 1)", artworkUnits(g([])) >= 1 && artworkUnits({ ...(GRAPHICS[0] as Graphic), deliverables: [] }) >= 1);
  check("artworkUnitsOf: 2 same-size assets = 1", artworkUnitsOf([{ size: "1:1" }, { size: "1:1" }]) === 1);
  check("artworkUnitsOf: 2 different sizes = 2", artworkUnitsOf([{ size: "1:1" }, { size: "9:16" }]) === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
