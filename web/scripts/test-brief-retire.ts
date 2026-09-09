/* Runtime tests for briefRetire — what happens to real work when a content item
 * is taken out of a campaign plan.
 *
 * The rule is asymmetric on purpose and that asymmetry is the whole point:
 * untouched work follows the plan into the bin, work anyone has started never
 * does. Getting it wrong in one direction leaves ghost posts on the calendar
 * (the bug this fixes); getting it wrong in the other silently deletes a
 * delivered artwork. Both directions are pinned here.
 * Run with:  npm test
 */

import { orphanedPosts, retireVerdict, retireLogLine, BriefBundle } from "../src/lib/data/briefRetire";
import { ContentItem } from "../src/lib/data/content";
import { Graphic } from "../src/lib/data/graphic";
import { Task } from "../src/lib/data/tasks";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}

const post = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: "c1-0", day: 1, time: "10:00", title: "วิ่งยังไง แลกยังไง?", b: "omakase", plat: "Instagram",
  platforms: ["Instagram"], status: "Draft", campaign: "Run For Don", owner: "Pichayaporn",
  campaignId: "CAM-1", sourceContentItemId: "ci-3",
  caption: "", hashtags: "", cta: "", captionStatus: "Missing", assetStatus: "Waiting Design",
  approvalStatus: "Draft", publishStatus: "Draft", ...over,
} as ContentItem);

const graphic = (over: Partial<Graphic> = {}): Graphic => ({
  id: 900, stage: "New Request", title: "วิ่งยังไง แลกยังไง? — Photo", b: "omakase", campaign: "Run For Don",
  due: "TBD", designer: "Unassigned", requester: "Pichayaporn", approver: "Pichayaporn", type: "Photo",
  priority: "Med", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "",
  blocker: null, waitingSince: null, nextAction: "", platform: "Instagram", size: "—", contentItem: "—",
  campaignId: "CAM-1", sourceContentItemId: "ci-3", deliverables: [],
  ...over,
} as Graphic);

const task = (over: Partial<Task> = {}): Task => ({
  id: 500, title: "Graphic — วิ่งยังไง แลกยังไง? (2 asset)", module: "Graphic", moduleIcon: "🎨",
  moduleColor: "#C68A1E", type: "Graphic", assignee: "Unassigned", brand: "Omakase", campaign: "Run For Don",
  status: "Todo", priority: "Med", group: "quickWins", due: "TBD", blocker: null, pendingApprover: null,
  isQuickWin: false, nextAction: "", checklist: [],
  relatedBrief: "CAM-1", briefTaskKey: "CAM-1:graphic:ci-3", relatedGraphicId: "900", ...over,
} as Task);

const bundle = (over: Partial<BriefBundle> = {}): BriefBundle =>
  ({ post: post(), graphics: [graphic()], tasks: [task()], ...over });

console.log("\n— which posts the plan no longer claims —");
{
  const live = new Set(["ci-1", "ci-2", "ci-4", "ci-6"]);
  const posts = ["ci-1", "ci-2", "ci-3", "ci-4", "ci-5", "ci-6"]
    .map((src, i) => post({ id: `c1-${i}`, sourceContentItemId: src }));
  const out = orphanedPosts(posts, live);
  is("the two dropped items are found", out.length, 2);
  is("…and they are the right two", out.map((p) => p.sourceContentItemId).join(","), "ci-3,ci-5");
}
{
  // The bug that started this: the plan and the posts already agree.
  const out = orphanedPosts([post({ sourceContentItemId: "ci-1" })], new Set(["ci-1"]));
  is("nothing to retire when the plan still claims every post", out.length, 0);
}
{
  // A post raised by hand carries no brief item and was never the plan's.
  const hand = post({ id: "c-manual", sourceContentItemId: undefined });
  const out = orphanedPosts([hand], new Set(["ci-1"]));
  is("a hand-raised post is never a candidate", out.length, 0);
}

console.log("\n— untouched work follows the plan into the bin —");
{
  const v = retireVerdict(bundle());
  check("draft post + New Request + Todo tasks is retirable", v.retirable);
  is("…with nothing to explain", v.reasons.length, 0);
  check("the log line says where it went", retireLogLine(post(), v).includes("ถังขยะ"));
}
{
  const v = retireVerdict({ post: post(), graphics: [], tasks: [] });
  check("a post with no graphic and no task is retirable", v.retirable);
}

console.log("\n— work anyone has started stays —");
const kept = (name: string, b: BriefBundle, part: string) => {
  const v = retireVerdict(b);
  check(name, !v.retirable && v.reasons.some((r) => r.includes(part)));
};
kept("a written caption keeps the bundle", bundle({ post: post({ caption: "วิ่งครบ 5 กม. แลกดังได้เลย" }) }), "caption");
kept("an approved post keeps the bundle", bundle({ post: post({ approvalStatus: "Approved" }) }), "อนุมัติ");
kept("a published post keeps the bundle", bundle({ post: post({ status: "Published", publishStatus: "Published" }) }), "Published");
kept("a scheduled post keeps the bundle", bundle({ post: post({ publishStatus: "Scheduled to Meta" }) }), "Scheduled to Meta");
kept("an accepted graphic keeps the bundle", bundle({ graphics: [graphic({ stage: "In Progress" })] }), "In Progress");
kept("an assigned designer keeps the bundle", bundle({ graphics: [graphic({ designer: "narawich" })] }), "narawich");
kept("a submitted file keeps the bundle",
  bundle({ graphics: [graphic({ deliverables: [{ platform: "IG", size: "1:1", refLink: "", assetLink: "https://drive/x", sourceLink: "", status: "Waiting review", version: 1, submittedBy: "narawich", submittedAt: "", feedback: [] }] })] }),
  "ไฟล์ส่งแล้ว");
kept("a task in progress keeps the bundle", bundle({ tasks: [task({ status: "In Progress" })] }), "In Progress");
kept("a finished task keeps the bundle", bundle({ tasks: [task({ status: "Done" })] }), "Done");

console.log("\n— all-or-nothing: one piece of real work keeps the whole bundle —");
{
  // The post is a clean draft; only the artwork has been delivered. Binning the
  // post would strand that artwork on the board with nothing naming it.
  const v = retireVerdict(bundle({ graphics: [graphic({ stage: "Approved" })] }));
  check("a clean post is kept when its artwork is done", !v.retirable);
  check("the log line names the reason instead of claiming a delete",
    retireLogLine(post(), v).includes("งานที่สร้างไว้ยังอยู่"));
}
{
  const v = retireVerdict(bundle({ graphics: [graphic(), graphic({ id: 901, stage: "Approved" })] }));
  is("one reason per distinct cause, not per row", v.reasons.length, 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
