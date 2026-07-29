/* Runtime tests for the KOL + Content flow logic (pure functions).
 * Run with:  npx tsx --tsconfig tsconfig.json scripts/test-flows.ts
 * No test runner is configured; this is a self-contained assert harness. */

import { Kol, KOLS } from "../src/lib/data/kol";
import {
  canTransition, prerequisitesFor, canSaveResults, nextStage, hasOwner, hasPostLink,
} from "../src/lib/kolFlow";
import { ContentItem, CONTENT, contentApproveBlockers, contentReadyForApproval, advanceApprovalState, canPublish, sameDayPosts, sameDayWarning, bySchedule } from "../src/lib/data/content";
import { materialised } from "../src/lib/data/brief";
import { campaignMonthKeys, emptyBrief, emptyContentItem, taskPreview, budgetSummary, nextCampaignCode, CampaignBrief, CONTENT_PLATFORMS, needsAssetSize, validateSubmit, guidelineChecklist, visitGoalOf, minGraphicDueDate, isGraphicDueDateAllowed, graphicDueRangeImpossible } from "../src/lib/data/brief";
import { Graphic, GraphicDeliverable, GRAPHICS, workKind, countWorkOnDay, artworkUnits, artworkUnitsOf, DAILY_WORK_CAP } from "../src/lib/data/graphic";
import { memberTeam } from "../src/components/ui/OwnerSelect";

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

console.log("Graphic due date — the lead time and the publish date can contradict each other");
{
  // 2026-07-27 is a Monday; five business days later is Monday 2026-08-03.
  const request = "2026-07-27";
  check("minimum due date is 5 business days out", minGraphicDueDate(request) === "2026-08-03");
  check("a date before the minimum is rejected", !isGraphicDueDateAllowed("2026-07-30", request));
  check("the minimum itself is allowed", isGraphicDueDateAllowed("2026-08-03", request));

  // Found on production: raising a brief from a post that publishes inside the
  // lead time gave the picker min 2026-08-03 and max 2026-07-27, so every date
  // in every month was disabled and the form could not be submitted at all.
  check("publish inside the lead time = impossible range", graphicDueRangeImpossible("2026-07-27", request));
  check("publish after the lead time = fine", !graphicDueRangeImpossible("2026-08-10", request));
  check("no publish date = nothing to contradict", !graphicDueRangeImpossible(undefined, request));
  check("publish exactly on the minimum = fine", !graphicDueRangeImpossible("2026-08-03", request));

  // …and Submit must not block on "due ≤ publish" when no date can satisfy it.
  const brief = (publishDate: string, graphicDueDate: string): CampaignBrief => {
    const b = emptyBrief("due-range-test");
    b.name = "N"; b.objective = "Awareness"; b.campaignType = "Always-on"; b.b = "teppen";
    b.branches = ["Central"]; b.startDate = "2026-07-01"; b.endDate = "2026-12-31";
    b.launchDate = "2026-07-01"; b.audience = "A"; b.mainMessage = "M"; b.offer = "O"; b.approver = "CMO";
    b.content = [{
      ...emptyContentItem(1), id: "c1", title: "T", subHead: "S", platforms: ["Instagram"],
      assets: [{ platform: "Instagram", size: "1:1 (1080×1080)" }], requiredGraphic: true,
      publishDate, graphicDueDate,
    }];
    return b;
  };
  const afterPublish = (b: CampaignBrief) => validateSubmit(b).some((e) => /must not be after Publish Date/.test(e));
  // A post far enough out: the rule still bites.
  check("due after publish is still blocked when the range is possible", afterPublish(brief("2026-09-01", "2026-09-15")));
  // A post inside the lead time: warned in the form, never blocked here.
  check("…but not blocked when no date could satisfy both", !afterPublish(brief("2026-07-28", "2026-08-03")));
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

console.log("memberTeam — any \"creative\"-titled role reaches the Creative bucket");
{
  // Previously only the exact phrase "creative leader" matched, so a role like
  // "Creative Content" fell through to Planner and never showed up as an
  // assignable designer in the Graphic drawer.
  check("Creative Leader → Creative", memberTeam("Creative Leader") === "Creative");
  check("Creative Content → Creative", memberTeam("Creative Content") === "Creative");
  check("Creative Director → Creative", memberTeam("Creative Director") === "Creative");
  check("Agency - GID → Creative", memberTeam("Agency - GID") === "Creative");
  check("Agency - Freelance → Creative", memberTeam("Agency - Freelance") === "Creative");
  // "creator" must not accidentally match "creative" — Content Creator stays Planner.
  check("Content Creator stays Planner", memberTeam("Content Creator") === "Planner");
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

console.log("Artwork counting — by pixels, platform collapsed");
{
  const del = (platform: string, size: string, artworkNo?: number): GraphicDeliverable =>
    ({ platform, size, refLink: "", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [], artworkNo });
  const g = (dels: GraphicDeliverable[]): Graphic => ({ ...(GRAPHICS[0] as Graphic), deliverables: dels });
  check("same size, 2 platforms = 1 artwork", artworkUnits(g([del("FB", "1:1"), del("IG", "1:1")])) === 1);
  check("different sizes = 2 artworks", artworkUnits(g([del("FB", "1:1"), del("IG", "9:16")])) === 2);
  // The real case: one 1080×1920 export ticked on three platforms, each naming
  // the preset differently. Matching the label billed it three times.
  check("same pixels under 3 labels = 1 artwork", artworkUnits(g([
    del("FB", "9:16 Story (1080×1920)"), del("IG", "9:16 Reel/Story (1080×1920)"), del("TT", "9:16 (1080×1920)"),
  ])) === 1);
  // Ratios cannot decide it: FB's 1:1 is 1080×1080, Google Business Profile's is 720×720.
  check("same ratio, different pixels = 2", artworkUnits(g([del("FB", "1:1 (1080×1080)"), del("GBP", "1:1 (720×720)")])) === 2);
  // A stored artworkNo no longer overrides the pixels it was derived from —
  // rows numbered under the old label rule split one file into three.
  check("stale artworkNo does not outvote the pixels", artworkUnits(g([
    del("FB", "9:16 (1080×1920)", 1), del("IG", "9:16 Story (1080×1920)", 2),
  ])) === 1);
  check("never returns 0 (min 1)", artworkUnits(g([])) >= 1 && artworkUnits({ ...(GRAPHICS[0] as Graphic), deliverables: [] }) >= 1);
  check("artworkUnitsOf: 2 same-size assets = 1", artworkUnitsOf([{ size: "1:1" }, { size: "1:1" }]) === 1);
  check("artworkUnitsOf: 2 different sizes = 2", artworkUnitsOf([{ size: "1:1" }, { size: "9:16" }]) === 2);
}

// ── Same-day clash warning (feedback: "แจ้งเตือนหากมีแผนลง Content วันเดียวกัน") ──
{
  const post = (id: string, b: string, iso: string, time = "10:00", title = id): ContentItem =>
    ({ ...(CONTENT[0] as ContentItem), id, b: b as ContentItem["b"], dateIso: iso, day: Number(iso.slice(8, 10)), time, title });

  const a = post("x1", "teppen", "2026-08-10", "09:00", "Morning");
  const same = post("x2", "teppen", "2026-08-10", "18:00", "Evening");
  const otherBrand = post("x3", "mainichi", "2026-08-10");
  const otherDay = post("x4", "teppen", "2026-08-11");

  check("same brand same day = clash", sameDayPosts(a, [a, same, otherBrand, otherDay]).length === 1);
  check("ไม่นับตัวเอง", sameDayPosts(a, [a]).length === 0);
  // คนละแบรนด์ลงวันเดียวกันเป็นเรื่องปกติ คนละกลุ่มผู้ชม
  check("คนละแบรนด์ไม่ถือว่าชน", sameDayPosts(a, [a, otherBrand]).length === 0);
  check("คนละวันไม่ถือว่าชน", sameDayPosts(a, [a, otherDay]).length === 0);
  check("วันว่าง = ไม่มีข้อความเตือน", sameDayWarning(a, [a]) === null);
  check("ชนแล้วมีข้อความ", (sameDayWarning(a, [a, same]) ?? "").includes("Evening"));
  check("ข้อความบอกจำนวน", (sameDayWarning(a, [a, same]) ?? "").includes("1 รายการ"));
  {
    // เกิน 3 ต้องสรุปเป็น "และอีก N" ไม่ใช่ไล่ทั้งหมด
    const many = [a, post("y1", "teppen", "2026-08-10"), post("y2", "teppen", "2026-08-10"),
      post("y3", "teppen", "2026-08-10"), post("y4", "teppen", "2026-08-10")];
    check("เกิน 3 ตัวย่อด้วย 'และอีก'", (sameDayWarning(a, many) ?? "").includes("และอีก 1"));
  }

  // ── เรียงตามวัน แล้วค่อยเวลา (feedback: "Content, Campaign เรียงตามลำดับวันที่") ──
  const sorted = [same, a, otherDay].slice().sort(bySchedule).map((c) => c.id);
  check("เรียงตามวันก่อน", sorted[2] === "x4");
  check("วันเดียวกันเรียงตามเวลา", sorted[0] === "x1" && sorted[1] === "x2");
}

// ── materialised(): แคมเปญที่อนุมัติแล้วไม่ย้อนไปโชว์ "แผน" แทนโพสต์ที่ถูกลบ ──
{
  check("Draft ยังไม่ materialise", materialised({ status: "Draft" }) === false);
  check("Waiting for Approval ยังไม่ materialise", materialised({ status: "Waiting for Approval" }) === false);
  check("Need Revision ยังไม่ materialise", materialised({ status: "Need Revision" }) === false);
  check("Approved = materialise แล้ว", materialised({ status: "Approved" }) === true);
  check("In Progress = materialise แล้ว", materialised({ status: "In Progress" }) === true);
  check("Completed = materialise แล้ว", materialised({ status: "Completed" }) === true);
  check("ไม่มี brief = ยังไม่ materialise", materialised(null) === false && materialised(undefined) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
