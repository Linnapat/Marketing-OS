/* Runtime tests for the KOL + Content flow logic (pure functions).
 * Run with:  npx tsx --tsconfig tsconfig.json scripts/test-flows.ts
 * No test runner is configured; this is a self-contained assert harness. */

import { Kol, KOLS } from "../src/lib/data/kol";
import { assertMockUniqueId, releaseMockId, seedMockIds, resetMockGuard } from "../src/lib/db/mockGuard";
import {
  canTransition, prerequisitesFor, canSaveResults, nextStage, hasOwner, hasPostLink,
} from "../src/lib/kolFlow";
import { ContentItem, CONTENT, contentApproveBlockers, contentReadyForApproval, advanceApprovalState, captionStatusAfterRevision, canPublish, sameDayPosts, sameDayWarning, bySchedule, moveToCampaign, withChange } from "../src/lib/data/content";
import { materialised } from "../src/lib/data/brief";
import { campaignMonthKeys, emptyBrief, emptyContentItem, taskPreview, budgetSummary, nextCampaignCode, CampaignBrief, CONTENT_PLATFORMS, needsAssetSize, validateSubmit, guidelineChecklist, visitGoalOf, minGraphicDueDate, isGraphicDueDateAllowed, graphicDueRangeImpossible, finalArtworkDue, subtractBusinessDays, FINAL_AW_BUFFER_DAYS, GRAPHIC_MIN_BUSINESS_DAYS } from "../src/lib/data/brief";
import { Graphic, GraphicDeliverable, GRAPHICS, workKind, countWorkOnDay, artworkUnits, artworkUnitsOf, DAILY_WORK_CAP, isAccepted, contentEditLock, withNotice, unseenNotices,
  needsStoryboard, footageReady, storyboardCleared, productionBlockers, productionSteps, workDayIso, workingMonth,
  awaitsStoryboardDecision, awaitsArtworkReview, briefChangeAudience, creativeBriefDetails,
  assignedShoots, withShootMoved, withShooterAssigned } from "../src/lib/data/graphic";
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

console.log("Campaign code — BRAND_YYMM_NNN, numbered per brand per month");
{
  const mk = (b: CampaignBrief["b"], code?: string): CampaignBrief => ({ ...emptyBrief("x"), b, code });
  const existing = [mk("teppen", "TPN_2609_001"), mk("teppen", "TPN_2609_002"), mk("omakase", "OMD_2609_005")];
  const sep = "2026-09-01";
  check("teppen next = 003", nextCampaignCode("teppen", existing, sep) === "TPN_2609_003");
  check("omakase next = 006 (independent of teppen)", nextCampaignCode("omakase", existing, sep) === "OMD_2609_006");
  check("mainichi first = 001", nextCampaignCode("mainichi", existing, sep) === "MNC_2609_001");
  // The month comes from when the campaign RUNS, so the same brand restarts at
  // 001 in October even though September already has two.
  check("new month restarts the count", nextCampaignCode("teppen", existing, "2026-10-15") === "TPN_2610_001");
  check("start date mid-month still uses that month", nextCampaignCode("omakase", existing, "2026-09-30") === "OMD_2609_006");
  // A brief with no start date yet must still get a code; it re-derives when the
  // date is filled in.
  check("undated falls back to the current month", /^TPN_\d{4}_001$/.test(nextCampaignCode("teppen", [])));
  check("malformed date does not produce NaN", /^TPN_\d{4}_001$/.test(nextCampaignCode("teppen", [], "not-a-date")));
  // The old year-scoped codes must not be counted as this month's numbering.
  check("pre-31-Jul codes are ignored",
    nextCampaignCode("teppen", [mk("teppen", "TPN-2026-008")], sep) === "TPN_2609_001");
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

// ── รับงานแล้วล็อก + ย้ายแคมเปญ + log (feedback ข้อ 3 และ 7) ──────────────
{
  const base = { ...(GRAPHICS[0] as Graphic) };
  const fresh: Graphic = { ...base, acceptedBy: undefined, acceptedAt: undefined, notices: undefined };
  const taken: Graphic = { ...fresh, acceptedBy: "Jungjing", acceptedAt: "2026-08-01T03:00:00.000Z" };

  check("ยังไม่รับงาน = ยังไม่ล็อก", isAccepted(fresh) === false && contentEditLock(fresh).locked === false);
  check("รับงานแล้ว = ล็อก", isAccepted(taken) === true && contentEditLock(taken).locked === true);
  check("เหตุผลบอกชื่อคนรับงาน", contentEditLock(taken).reason.includes("Jungjing"));
  // ไม่มีใบงานเลย (โพสต์ที่ไม่ต้องใช้กราฟฟิก) ต้องแก้ได้ตามปกติ
  check("ไม่มีใบงาน = ไม่ล็อก", contentEditLock(null).locked === false && contentEditLock(undefined).locked === false);
  // acceptedBy ว่างแต่มี acceptedAt ยังต้องล็อก และข้อความต้องไม่หลุดเป็น undefined
  check("acceptedBy ว่างก็ยังล็อก", contentEditLock({ ...fresh, acceptedAt: "2026-08-01T03:00:00.000Z" }).locked === true);
  check("ข้อความไม่มี undefined", !contentEditLock({ ...fresh, acceptedAt: "2026-08-01T03:00:00.000Z" }).reason.includes("undefined"));

  // notices — แบนเนอร์ในใบงาน
  const noticed = withNotice(fresh, "Gik", "ย้ายไปแคมเปญ Wagyu");
  check("เพิ่ม notice ได้", unseenNotices(noticed).length === 1);
  check("notice เก็บคนแจ้ง", unseenNotices(noticed)[0].by === "Gik");
  check("ที่ dismiss แล้วไม่นับ", unseenNotices({ ...noticed, notices: noticed.notices!.map((n) => ({ ...n, seen: true })) }).length === 0);
  {
    // ไม่ให้ blob บวมไม่จำกัด
    let g = fresh;
    for (let i = 0; i < 25; i++) g = withNotice(g, "Gik", `n${i}`);
    check("notice ถูก cap ที่ 20", (g.notices ?? []).length === 20);
    check("cap แล้วเก็บอันใหม่สุดไว้", (g.notices ?? []).at(-1)!.text === "n24");
  }

  // ย้ายแคมเปญ
  const post: ContentItem = { ...(CONTENT[0] as ContentItem), campaign: "Old Camp", campaignId: "CAM-1" };
  const movedPost = moveToCampaign(post, { id: "CAM-2", name: "New Camp" }, "Gik");
  check("ย้ายแล้วชื่อแคมเปญเปลี่ยน", movedPost.campaign === "New Camp");
  // id ต้องย้ายตามชื่อ ไม่งั้นโพสต์จะไปโผล่ใต้แคมเปญเดิมด้วย
  check("campaignId ย้ายตามด้วย", movedPost.campaignId === "CAM-2");
  check("ย้ายแล้วมี log", (movedPost.changeLog ?? []).length === 1);
  check("log บอกต้นทาง→ปลายทาง", (movedPost.changeLog![0].detail ?? "").includes("Old Camp") && (movedPost.changeLog![0].detail ?? "").includes("New Camp"));
  check("log บอกคนทำ", movedPost.changeLog![0].by === "Gik");
  check("ปลดออกจากแคมเปญได้", moveToCampaign(post, { name: "" }, "Gik").campaignId === undefined);
  {
    let c = post;
    for (let i = 0; i < 35; i++) c = withChange(c, "Gik", "แก้", `#${i}`);
    check("changeLog ถูก cap ที่ 30", (c.changeLog ?? []).length === 30);
  }
}

// ── Production pipeline: storyboard → ถ่าย → ส่ง asset (feedback graphic request) ──
{
  const g = (over: Partial<Graphic>): Graphic => ({ ...(GRAPHICS[0] as Graphic), deliverables: [], ...over });

  // needsStoryboard: งานวิดีโอเท่านั้น
  check("Reel ต้องมี storyboard", needsStoryboard({ type: "Reel", requiredVideo: false }) === true);
  check("Short Video ต้องมี storyboard", needsStoryboard({ type: "Short Video", requiredVideo: false }) === true);
  check("VDO shooting ต้องมี storyboard", needsStoryboard({ type: "VDO shooting", requiredVideo: false }) === true);
  check("ติ๊ก Required Video ก็ต้องมี", needsStoryboard({ type: "Photo", requiredVideo: true }) === true);
  check("Poster ไม่ต้องมี storyboard", needsStoryboard({ type: "Poster", requiredVideo: false }) === false);
  check("Photo shoot ไม่ต้องมี storyboard", needsStoryboard({ type: "Photo shoot", requiredVideo: false }) === false);

  // footageReady: ไม่ได้ require shooting = ผ่านเสมอ
  check("ไม่ require shooting = footage ผ่าน", footageReady({ requiresShooting: false, footageLink: "" }) === true);
  check("require shooting แต่ยังไม่มี footage = ไม่ผ่าน", footageReady({ requiresShooting: true, footageLink: "" }) === false);
  check("ช่องว่าง ๆ ไม่นับว่ามี footage", footageReady({ requiresShooting: true, footageLink: "   " }) === false);
  check("มี footage แล้ว = ผ่าน", footageReady({ requiresShooting: true, footageLink: "https://drive/x" }) === true);

  // gate ส่ง asset
  const poster = g({ type: "Poster", requiredVideo: false, requiresShooting: false });
  check("Poster ธรรมดา ส่ง asset ได้เลย", productionBlockers(poster).length === 0);

  const reelFresh = g({ type: "Reel", requiredVideo: true, storyboardStatus: "" });
  check("Reel ยังไม่มี storyboard = บล็อก", productionBlockers(reelFresh).length === 1);
  check("บอกให้ Creative Content ส่งก่อน", productionBlockers(reelFresh)[0].includes("Creative Content"));
  check("storyboard ส่งแล้วรออนุมัติ = ยังบล็อก", productionBlockers(g({ type: "Reel", storyboardStatus: "Submitted" }))[0].includes("รอเจ้าของงานอนุมัติ"));
  check("storyboard ถูกตีกลับ = ยังบล็อก", productionBlockers(g({ type: "Reel", storyboardStatus: "Revision" }))[0].includes("ส่งกลับแก้"));
  check("storyboard อนุมัติแล้ว = ผ่าน", productionBlockers(g({ type: "Reel", storyboardStatus: "Approved" })).length === 0);

  // สิ่งที่ค้างอยู่ที่ "เจ้าของงาน" — คิวอนุมัติใน My Tasks อ่านจากสองอันนี้
  check("storyboard ส่งแล้ว = รอเจ้าของงานตัดสิน", awaitsStoryboardDecision(g({ type: "Reel", storyboardStatus: "Submitted" })) === true);
  check("ยังไม่ส่ง storyboard = ไม่เข้าคิวอนุมัติ", awaitsStoryboardDecision(g({ type: "Reel", storyboardStatus: "" })) === false);
  check("storyboard ตีกลับแล้ว = ไม่เข้าคิวอนุมัติ", awaitsStoryboardDecision(g({ type: "Reel", storyboardStatus: "Revision" })) === false);
  check("storyboard อนุมัติแล้ว = ออกจากคิว", awaitsStoryboardDecision(g({ type: "Reel", storyboardStatus: "Approved" })) === false);
  // งานที่ไม่ใช่วิดีโอไม่มี storyboard ให้อนุมัติ แม้ field จะค้างอยู่
  check("Poster ที่มี field ค้าง ไม่เข้าคิว storyboard", awaitsStoryboardDecision(g({ type: "Poster", requiredVideo: false, storyboardStatus: "Submitted" })) === false);
  {
    const d = (status: GraphicDeliverable["status"]): GraphicDeliverable => ({ ...(GRAPHICS[0].deliverables?.[0] as GraphicDeliverable), status });
    check("ไม่มี deliverable = ไม่มีอะไรให้รีวิว", awaitsArtworkReview(g({ deliverables: [] })) === false);
    check("มีชิ้นที่รอรีวิว = เข้าคิว", awaitsArtworkReview(g({ deliverables: [d("Approved"), d("Waiting review")] })) === true);
    check("อนุมัติครบแล้ว = ออกจากคิว", awaitsArtworkReview(g({ deliverables: [d("Approved")] })) === false);
  }

  // แก้บรีฟแล้วต้องบอกใคร — เงียบจนกว่าจะมีคนรับงาน
  {
    const at = "2026-08-01T03:00:00.000Z";
    check("ยังไม่มีใครรับงาน = ไม่ต้องแจ้งใคร", briefChangeAudience(g({ acceptedAt: undefined, designer: "Aom" })) === null);
    check("รับงานแล้ว = แจ้งคนที่รับ", briefChangeAudience(g({ acceptedAt: at, acceptedBy: "Aom", designer: "Boss" })) === "Aom");
    // มอบหมายคนหนึ่ง แต่อีกคนหยิบไปทำ — ต้องเป็นคนที่หยิบไป ไม่ใช่ชื่อบนใบงาน
    check("คนรับงานมาก่อนชื่อ designer", briefChangeAudience(g({ acceptedAt: at, acceptedBy: "Aom", designer: "Unassigned" })) === "Aom");
    check("ไม่มี acceptedBy ใช้ designer แทน", briefChangeAudience(g({ acceptedAt: at, acceptedBy: "", designer: "Boss" })) === "Boss");
    check("รับงานแล้วแต่ยังไม่มีคนทำ = ไม่มีใครให้แจ้ง", briefChangeAudience(g({ acceptedAt: at, acceptedBy: "", designer: "Unassigned" })) === null);
  }

  const shootPending = g({ type: "Poster", requiredVideo: false, requiresShooting: true, shooter: "Jeeno" });
  check("require shooting ยังไม่ส่ง footage = บล็อก", productionBlockers(shootPending).length === 1);
  check("บอกชื่อคนถ่าย", productionBlockers(shootPending)[0].includes("Jeeno"));
  check("ยังไม่ระบุคนถ่ายก็บอกได้", productionBlockers(g({ type: "Poster", requiresShooting: true }))[0].includes("ยังไม่ได้ระบุคนถ่าย"));
  // ติดทั้งสองอย่างต้องบอกทั้งสองอย่าง ไม่ใช่ปล่อยให้แก้ทีละรอบ
  check("ติดทั้ง storyboard และ footage = 2 เหตุผล", productionBlockers(g({ type: "Reel", requiresShooting: true, shooter: "Four" })).length === 2);

  // ลำดับขั้น
  {
    const steps = productionSteps(g({ type: "Reel", requiredVideo: true, requiresShooting: true, shooter: "Four", storyboardStatus: "" }));
    check("Reel + ถ่าย = 3 ขั้น", steps.length === 3);
    check("ขั้นแรกคือ storyboard", steps[0].key === "storyboard" && steps[0].state === "active");
    // ถ่ายก่อน storyboard เสร็จไม่ได้ ต้องเป็น waiting ไม่ใช่ active
    check("ถ่ายยังรอ storyboard อยู่", steps[1].key === "shoot" && steps[1].state === "waiting");
    check("ส่ง asset ยังรอ", steps[2].key === "asset" && steps[2].state === "waiting");
  }
  {
    const steps = productionSteps(g({ type: "Reel", requiredVideo: true, requiresShooting: true, shooter: "Four", storyboardStatus: "Approved" }));
    check("storyboard ผ่านแล้ว ถ่ายกลายเป็น active", steps[1].state === "active");
    check("storyboard แสดงว่าเสร็จ", steps[0].state === "done");
  }
  {
    const steps = productionSteps(g({ type: "Poster", requiredVideo: false, requiresShooting: false }));
    check("Poster มีขั้นเดียว", steps.length === 1 && steps[0].key === "asset");
    check("Poster ส่ง asset ได้เลย", steps[0].state === "active");
  }

  // บรีฟที่ editor/คนถ่ายเห็นใน My Task ต้องมีลิงก์ storyboard ให้กดเปิดได้
  {
    const sbRow = (x: Graphic) => creativeBriefDetails(x).find((d) => d.label === "Storyboard");
    const reel = (over: Partial<Graphic>) => g({ type: "Reel", requiredVideo: true, ...over });
    check("Reel + มี storyboard = มีแถวให้กด", !!sbRow(reel({ storyboardLink: "https://slides/x", storyboardStatus: "Approved" })));
    check("แถวนั้นชี้ไปที่ลิงก์จริง", sbRow(reel({ storyboardLink: "https://slides/x", storyboardStatus: "Approved" }))?.href === "https://slides/x");
    check("อนุมัติแล้วบอกว่าอนุมัติแล้ว", sbRow(reel({ storyboardLink: "https://slides/x", storyboardStatus: "Approved", storyboardDecidedBy: "Ken S." }))?.value.includes("Ken S.") === true);
    check("ยังรออนุมัติก็เปิดดูได้ แต่บอกสถานะไว้", sbRow(reel({ storyboardLink: "https://slides/x", storyboardStatus: "Submitted" }))?.value.includes("รอเจ้าของงานอนุมัติ") === true);
    // ยังไม่มีลิงก์ = ไม่ต้องมีแถวเปล่า ๆ ให้กดแล้วไม่ไปไหน
    check("ยังไม่ส่ง storyboard = ไม่มีแถวนี้", !sbRow(reel({ storyboardLink: "", storyboardStatus: "" })));
    // งานที่ไม่ใช่วิดีโอไม่มี storyboard ให้ดู แม้ field จะค้างอยู่
    check("Poster ไม่มีแถว storyboard", !sbRow(g({ type: "Poster", requiredVideo: false, storyboardLink: "https://slides/x" })));
    check("บรีฟหลักยังอยู่ครบเหมือนเดิม", creativeBriefDetails(reel({ storyboardLink: "https://slides/x" })).some((d) => d.label.includes("ลิงก์บรีฟ")));
  }

  // คิวถ่ายที่มอบหมายในใบงาน ต้องไหลไปตารางถ่าย (ใบนัดถ่ายที่ทีมปริ้นไปใช้จริง)
  {
    const shoot = (over: Partial<Graphic>) => g({ type: "VDO shooting", requiresShooting: true, shootDate: "2026-09-10", shooter: "Jeeno", footageLink: "", ...over });
    check("มอบหมายคนถ่าย+วันถ่าย = ขึ้นตารางถ่าย", assignedShoots([shoot({})]).length === 1);
    check("เอาวันถ่ายจากใบงาน ไม่ใช่วันโพสต์", assignedShoots([shoot({})])[0].date === "2026-09-10");
    check("คนถ่ายคือ cast", assignedShoots([shoot({})])[0].cast === "Jeeno");
    check("ผูกกลับไปที่ใบงานได้", assignedShoots([shoot({ id: 77 })])[0].graphicId === 77);
    // ยังไม่ระบุคนถ่าย ก็ยังต้องขึ้น — คิวถ่ายมีอยู่จริง แค่ยังไม่รู้ว่าใครไป
    check("ยังไม่ระบุคนถ่ายก็ยังขึ้น", assignedShoots([shoot({ shooter: "" })]).length === 1);
    check("Unassigned ไม่ถือเป็นชื่อคน", assignedShoots([shoot({ shooter: "Unassigned" })])[0].cast === "");
    // ไม่มีวันถ่าย = ยังไม่มีอะไรให้ไปโผล่บนใบนัด
    check("ไม่มีวันถ่าย = ไม่ขึ้น", assignedShoots([shoot({ shootDate: "" })]).length === 0);
    check("ไม่ต้องถ่าย = ไม่ขึ้น", assignedShoots([shoot({ requiresShooting: false })]).length === 0);
    check("ยังไม่ตัดสินใจว่าถ่ายไหม = ไม่ขึ้น", assignedShoots([shoot({ requiresShooting: undefined })]).length === 0);
    // ส่ง footage แล้ว = ถ่ายเสร็จแล้ว ใบนัดถ่ายคือรายการที่ต้องไป ไม่ใช่ประวัติ
    check("ส่ง footage แล้ว = หลุดจากใบนัด", assignedShoots([shoot({ footageLink: "https://drive/f" })]).length === 0);
    // เรียงตามวัน เพราะมันคือตาราง ไม่ใช่กอง
    {
      const rows = assignedShoots([shoot({ id: 1, shootDate: "2026-09-20" }), shoot({ id: 2, shootDate: "2026-09-02" })]);
      check("เรียงตามวันถ่าย", rows.map((r) => r.graphicId).join(",") === "2,1");
    }
  }

  // แก้วันถ่าย/คนถ่ายจากตารางถ่าย ต้องเขียนกลับใบงาน ไม่ใช่เก็บไว้เองคนละที่
  {
    const s0 = g({ id: 5, requiresShooting: true, shootDate: "2026-09-10", shooter: "Jeeno" });
    const moved = withShootMoved(s0, "2026-09-14", "Boss");
    check("วันถ่ายเปลี่ยนที่ใบงาน", moved.shootDate === "2026-09-14");
    check("มีร่องรอยว่าเลื่อนจากวันไหนไปวันไหน", (moved.history?.at(-1)?.note ?? "").includes("2026-09-10 → 2026-09-14"));
    check("บอกว่าใครเลื่อน", moved.history?.at(-1)?.by === "Boss");
    check("วันเดิม = ไม่เขียนอะไรเพิ่ม", withShootMoved(s0, "2026-09-10", "Boss") === s0);
    // เลื่อนวันถ่ายแล้วเดือนที่งานไปนับต้องขยับตาม (โควตา/รายงานอ่านจากตรงนี้)
    check("เดือนที่ทำงานจริงขยับตามวันถ่ายใหม่", workingMonth(moved) === "2026-09");

    const named = withShooterAssigned(s0, "Four", "Boss");
    check("เปลี่ยนคนถ่ายที่ใบงาน", named.shooter === "Four");
    check("ร่องรอยบอกคนเดิม→คนใหม่", (named.history?.at(-1)?.note ?? "").includes("Jeeno → Four"));
    check("คนเดิม = ไม่เขียนอะไรเพิ่ม", withShooterAssigned(s0, "Jeeno", "Boss") === s0);
    check("ล้างคนถ่ายได้", withShooterAssigned(s0, "", "Boss").shooter === "");
    // ต้นฉบับต้องไม่ถูกแก้
    check("ไม่แตะของเดิม", s0.shootDate === "2026-09-10" && s0.shooter === "Jeeno");
  }

  // วันที่ทำงานจริง / เดือนที่ทำงานจริง
  check("ไม่มีวันถ่าย ใช้ due date", workDayIso({ dueIso: "2026-08-20" }) === "2026-08-20");
  check("มีวันถ่าย ใช้วันถ่าย", workDayIso({ shootDate: "2026-09-03", dueIso: "2026-08-20" }) === "2026-09-03");
  check("เดือนที่ทำงานจริงย้ายตามวันถ่าย", workingMonth({ shootDate: "2026-09-03", dueIso: "2026-08-20" }) === "2026-09");
  check("ไม่มีอะไรเลยได้ค่าว่าง", workDayIso({}) === "" && workingMonth({}) === "");
  // โควตารายวันต้องนับที่วันถ่าย ไม่ใช่วัน due
  {
    const shoot = g({ id: 9001, type: "VDO shooting", dueIso: "2026-08-20", shootDate: "2026-09-03", deliverables: [] });
    check("โควตานับที่วันถ่าย", countWorkOnDay([shoot], "vdo_shoot", "2026-09-03") >= 1);
    check("วัน due ไม่ถูกนับซ้ำ", countWorkOnDay([shoot], "vdo_shoot", "2026-08-20") === 0);
  }
}

// ── วันส่ง Final artwork: ล็อกจากวันโพสต์ (content) vs กรอกเอง (adhoc) ──────
{
  // 2026-08-03 = จันทร์ ใช้เป็นวันตั้งต้นเพื่อให้นับวันทำการเดาได้
  const REQ = "2026-08-03";
  // ข้ามเสาร์-อาทิตย์
  check("ถอยวันทำการข้ามเสาร์อาทิตย์", subtractBusinessDays("2026-08-10", 1) === "2026-08-07");
  check("ถอย 2 วันทำการจากจันทร์", subtractBusinessDays("2026-08-10", 2) === "2026-08-06");
  check("วันที่ไม่ถูกต้องได้ค่าว่าง", subtractBusinessDays("", 2) === "");

  // งาน adhoc — ไม่มีวันโพสต์ จึงกรอกเอง
  const adhoc = finalArtworkDue(undefined, REQ);
  check("adhoc ไม่ล็อกวัน", adhoc.fixed === false);
  check("adhoc ไม่มีวันให้", adhoc.iso === "");
  check("adhoc ไม่นับเป็นงานเร่ง", adhoc.rushed === false);
  check("adhoc บอกวันเร็วสุด", adhoc.reason.includes(minGraphicDueDate(REQ)));

  // งานคอนเทนต์ที่มีเวลาพอ — ล็อกเป็น publish − buffer
  const roomy = finalArtworkDue("2026-09-30", REQ);
  check("งานคอนเทนต์ล็อกวัน", roomy.fixed === true);
  check("ล็อกเป็น publish − buffer", roomy.iso === subtractBusinessDays("2026-09-30", FINAL_AW_BUFFER_DAYS));
  check("เวลาพอ ไม่ใช่งานเร่ง", roomy.rushed === false);
  // ต้องไม่เร็วกว่าเวลาที่ครีเอทีฟทำได้จริง
  check("ยังไม่เร็วกว่า lead time", roomy.iso >= minGraphicDueDate(REQ));

  // เวลาไม่พอสำหรับ buffer แต่ยังส่งทันก่อนโพสต์
  const tight = finalArtworkDue(minGraphicDueDate(REQ), REQ);
  check("เวลาตึงยังล็อกวัน", tight.fixed === true);
  check("เวลาตึง = ใช้วันเร็วสุดที่ทำได้", tight.iso === minGraphicDueDate(REQ));
  check("เวลาตึงนับเป็นงานเร่ง", tight.rushed === true);

  // โพสต์เร็วกว่าที่ทำทัน — ต้องไม่คืนวันที่เป็นไปไม่ได้ แต่บอกให้เลื่อนโพสต์
  const impossible = finalArtworkDue("2026-08-04", REQ);
  check("โพสต์เร็วเกินไปก็ยังให้วันที่ทำได้จริง", impossible.iso === minGraphicDueDate(REQ));
  check("โพสต์เร็วเกินไป = งานเร่ง", impossible.rushed === true);
  check("บอกให้เลื่อนวันโพสต์", impossible.reason.includes("เลื่อนวันโพสต์"));
  // ห้ามคืนวันก่อนวันที่ขอ ไม่ว่ากรณีไหน
  check("ไม่มีกรณีไหนคืนวันก่อนวันขอ", [roomy, tight, impossible].every((r) => r.iso >= REQ));
}

// ── post/graphic ids ต้องไม่ซ้ำแม้ตอน re-submit (บั๊กที่เจอในฐานข้อมูลจริง) ──
{
  // จำลองกติกาการแจก id ใน saveCampaignBrief: index ของ content item ต้องเดิน
  // ทุกรอบ ไม่ผูกกับตัวนับ task ที่เพิ่มเฉพาะตอนสร้าง task สำเร็จ
  const mintIds = (items: number, taskCreated: (i: number) => boolean) => {
    const stamp = 1785329824415;
    let n = 0;            // ตัวนับ task
    let itemIndex = 0;    // index ของ content item
    const posts: string[] = [];
    const gids: number[] = [];
    for (let i = 0; i < items; i++) {
      const idx = itemIndex++;
      posts.push(`c${stamp}-${idx}`);
      gids.push(stamp * 1000 + idx);
      if (taskCreated(i)) n++;
    }
    return { posts, gids, n };
  };
  const uniq = (a: unknown[]) => new Set(a.map(String)).size === a.length;

  // เคสปกติ: ทุก item สร้าง task
  const all = mintIds(6, () => true);
  check("id โพสต์ไม่ซ้ำ (ปกติ)", uniq(all.posts));
  check("id ใบงานไม่ซ้ำ (ปกติ)", uniq(all.gids));

  // เคสที่พังจริง: re-submit — ไม่มี task ถูกสร้างเลย
  const resubmit = mintIds(6, () => false);
  check("re-submit แล้ว id โพสต์ยังไม่ซ้ำ", uniq(resubmit.posts));
  check("re-submit แล้ว id ใบงานยังไม่ซ้ำ", uniq(resubmit.gids));
  check("ตัวนับ task ไม่ขยับตอน re-submit", resubmit.n === 0);
  // ci-1 กับ ci-6 คือคู่ที่ชนกันจริงในฐานข้อมูล
  check("item แรกกับ item สุดท้ายต่างกัน", resubmit.posts[0] !== resubmit.posts[5]);

  // เคสผสม: บาง item สร้าง task บาง item ไม่สร้าง
  const mixed = mintIds(8, (i) => i % 3 === 0);
  check("เคสผสม id โพสต์ไม่ซ้ำ", uniq(mixed.posts));
  check("เคสผสม id ใบงานไม่ซ้ำ", uniq(mixed.gids));

  // ตัวคั่นกัน id ของคนละ stamp มาสะกดเป็นตัวเดียวกัน
  check("มีตัวคั่นระหว่าง stamp กับ index", all.posts[0].includes("-"));
  // stamp*1000 กัน 2 แคมเปญที่ submit ห่างกันไม่กี่ ms ชนกัน
  check("id ใบงานของ stamp ที่ห่างกัน 1ms ไม่ชนกัน",
    (1785329824415 * 1000 + 9) !== (1785329824416 * 1000 + 0));
}


// ── mock mode must fail the way the database fails ────────────────────────
// The two worst bugs here were invisible locally because every mock write
// "succeeded". This is the guard that would have caught the id collision on a
// developer's machine instead of in production.
{
  resetMockGuard();
  seedMockIds("content_posts", ["c1", "c2"]);
  let threw = false;
  try { assertMockUniqueId("content_posts", "c3"); } catch { threw = true; }
  check("id ใหม่ไม่ชน = ผ่าน", !threw);

  threw = false;
  try { assertMockUniqueId("content_posts", "c3"); } catch { threw = true; }
  check("id ซ้ำรอบสอง = โยน error", threw);

  threw = false;
  try { assertMockUniqueId("content_posts", "c1"); } catch { threw = true; }
  check("ชนกับ seed data = โยน error", threw);

  // ข้อความต้องบอกว่าเป็น constraint เดียวกับของจริง ไม่ใช่ error ลอย ๆ
  let msg = "";
  try { assertMockUniqueId("content_posts", "c1"); } catch (e) { msg = (e as Error).message; }
  check("ข้อความอ้าง constraint จริง", msg.includes("content_posts_blob_id_uniq"));

  // ลบแล้วต้องใช้ id ซ้ำได้ เหมือน DB จริง
  releaseMockId("content_posts", "c1");
  threw = false;
  try { assertMockUniqueId("content_posts", "c1"); } catch { threw = true; }
  check("ลบแล้วใช้ id เดิมได้อีก", !threw);

  // ตารางคนละตัวใช้ id เดียวกันได้ (คนละ unique index)
  threw = false;
  try { assertMockUniqueId("graphic_requests", "c1"); } catch { threw = true; }
  check("คนละตารางไม่ชนกัน", !threw);

  // id ว่าง/undefined ต้องไม่ทำให้พัง
  threw = false;
  try { assertMockUniqueId("content_posts", undefined); assertMockUniqueId("content_posts", ""); } catch { threw = true; }
  check("id ว่างไม่โยน error", !threw);
  resetMockGuard();
}

// ── ย้ายแคมเปญต้องไม่ลาก sourceContentItemId ของแคมเปญเดิมไปด้วย ──────────
// เจอจากของจริง: unique index (campaign_id, sourceContentItemId) ปฏิเสธ เพราะ
// ci-N เริ่มนับใหม่ทุกแคมเปญ — ปลายทางมี ci-2 ของตัวเองอยู่แล้ว
{
  const post: ContentItem = {
    ...(CONTENT[0] as ContentItem),
    campaign: "Old Camp", campaignId: "CAM-1", sourceContentItemId: "ci-2",
  };
  const moved = moveToCampaign(post, { id: "CAM-2", name: "New Camp" }, "Gik");
  check("ย้ายแล้วตัดสายจากแผนเดิม", moved.sourceContentItemId === undefined);
  check("ย้ายแล้ว campaignId เปลี่ยน", moved.campaignId === "CAM-2");
  // ต้องไม่ชนกับโพสต์ของปลายทางที่ถือ ci-2 ของตัวเอง
  const nativeOfTarget = { campaignId: "CAM-2", sourceContentItemId: "ci-2" };
  check("ไม่ชน unique key ของปลายทาง",
    !(moved.campaignId === nativeOfTarget.campaignId && moved.sourceContentItemId === nativeOfTarget.sourceContentItemId));
  // ที่มาต้องยังตามรอยได้ ไม่ใช่หายเฉย ๆ
  check("log บอกว่ามาจากแผนไหน", (moved.changeLog?.at(-1)?.detail ?? "").includes("ci-2"));
  check("log บอกต้นทาง→ปลายทาง", (moved.changeLog?.at(-1)?.detail ?? "").includes("Old Camp"));
  // โพสต์ที่ไม่ได้มาจากแผน (ตั้งเอง) ย้ายได้ปกติ ไม่พัง
  const adhoc = moveToCampaign({ ...post, sourceContentItemId: undefined }, { id: "CAM-3", name: "C3" }, "Gik");
  check("โพสต์ที่ไม่มีแผนต้นทางย้ายได้ปกติ", adhoc.campaignId === "CAM-3" && adhoc.sourceContentItemId === undefined);
}

{
  // ── ส่งกลับแก้ "เพราะแคปชั่น" ต้องดึงสถานะแคปชั่นกลับด้วย ──────────────
  // เดิม requestRevision ตั้งแค่ approvalStatus → โพสต์ยังโชว์ "Caption: Ready"
  // ทั้งที่เพิ่งถูกตีกลับเพราะแคปชั่น และ approve ซ้ำได้ทันที
  console.log("\n— วงจร Revise ของแคปชั่น —");
  const c = (over: Partial<ContentItem>): ContentItem => ({
    ...(CONTENT[0] as ContentItem), title: "T", campaign: "Wagyu Festival", platforms: ["Instagram"],
    captionStatus: "Missing", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft", ...over,
  });
  check("มีข้อความแล้ว → Draft", captionStatusAfterRevision({ caption: "ข้อความ" }) === "Draft");
  check("ยังไม่มีข้อความ → คง Missing ไม่ดันเป็น Draft", captionStatusAfterRevision({ caption: "" }) === "Missing");
  check("ช่องว่างล้วน → Missing", captionStatusAfterRevision({ caption: "   " }) === "Missing");

  // วงจรครบรอบ
  const ready = c({ caption: "v1", captionStatus: "Ready", assetStatus: "Approved", approvalStatus: "Waiting Approval" });
  check("เริ่มต้น: approve ได้", contentApproveBlockers(ready).length === 0);

  const bounced = { ...ready, approvalStatus: "Revision Requested",
                    captionStatus: captionStatusAfterRevision(ready) };
  check("ตีกลับแล้วแคปชั่นกลับเป็น Draft", bounced.captionStatus === "Draft");
  check("ตีกลับแล้ว approve ไม่ได้ และเหตุผลชี้ที่แคปชั่น",
    contentApproveBlockers(bounced).some((b) => /Caption/.test(b)));

  const fixed = advanceApprovalState({ ...bounced, caption: "v2", captionStatus: "Ready" });
  check("แก้แล้ว Mark Ready → กลับเข้า Waiting Approval", fixed.approvalStatus === "Waiting Approval");
  check("และ approve ได้อีกครั้ง", contentApproveBlockers(fixed).length === 0);

  const bouncedOther = { ...ready, approvalStatus: "Revision Requested" };
  check("ตีกลับเรื่องอื่น → แคปชั่นยัง Ready", bouncedOther.captionStatus === "Ready");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
