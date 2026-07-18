/* Runtime tests for briefDiff — the "what changed" lines the CMO reads before
 * re-approving an edited campaign. These strings land in the approval log and
 * LINE notifications, so the wording is pinned here: a diff that misses a
 * budget change lets an edit slip past re-approval unread.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { briefDiff, briefDiffSummary } from "../src/lib/data/briefDiff";
import { emptyBrief, emptyContentItem, emptyKolItem, CampaignBrief } from "../src/lib/data/brief";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}
const has = (lines: string[], part: string) => lines.some((l) => l.includes(part));

const base = (): CampaignBrief => {
  const b = emptyBrief("CAM-1");
  b.name = "Wagyu Festival";
  b.audience = "Office workers";
  b.mainMessage = "ที่สุดของวากิว";
  b.offer = "เซ็ต 1,290.-";
  b.startDate = "2026-08-01"; b.endDate = "2026-08-31"; b.launchDate = "2026-08-05";
  b.channels = ["Facebook", "Instagram"];
  b.budget.total = 150000; b.budget.ads = 60000; b.budget.kol = 30000;
  b.successGoals = { Reach: "300000", "CV%": "2" };
  b.content = [{ ...emptyContentItem(1), title: "KV Launch", type: "Photo", platforms: ["Facebook"], publishDate: "2026-08-05" }];
  b.kols = [{ ...emptyKolItem(1), name: "@foodie", budget: 15000, count: 1 }];
  return b;
};

console.log("\n— no change, no noise —");
is("identical briefs diff to nothing", briefDiff(base(), base()).length, 0);
is("…and the summary is empty", briefDiffSummary(base(), base()), "");

console.log("\n— money changes are named with both numbers —");
{
  const a = base(); const b = base();
  b.budget.total = 180000; b.budget.ads = 90000;
  const d = briefDiff(a, b);
  check("total change carries before → after", has(d, "งบรวม: ฿150,000 → ฿180,000"));
  check("bucket change carries before → after", has(d, "งบ Ads: ฿60,000 → ฿90,000"));
  is("nothing else invented", d.length, 2);
}

console.log("\n— text and list fields —");
{
  const a = base(); const b = base();
  b.mainMessage = "วากิว A5 ราคาเอื้อมถึง";
  b.channels = ["Facebook", "TikTok"];
  b.successGoals = { Reach: "500000", "CV%": "2" };
  const d = briefDiff(a, b);
  check("key message shows truncated before → after", has(d, "Key Message"));
  check("channels show added and removed", has(d, "เพิ่ม TikTok") && has(d, "เอาออก Instagram"));
  check("goal change is per-metric", has(d, "เป้า Reach: 300000 → 500000"));
}

console.log("\n— content matched by id: edit ≠ remove+add —");
{
  const a = base(); const b = base();
  b.content = [
    { ...a.content[0], publishDate: "2026-08-07", requiredVideo: true },
    { ...emptyContentItem(9), id: "ci-9", title: "Teaser Reel" },
  ];
  const d = briefDiff(a, b);
  check("edited item names the fields", has(d, "Content “KV Launch”: แก้") && has(d, "publish 2026-08-05 → 2026-08-07"));
  check("…including the VDO flag", has(d, "ต้องใช้ VDO"));
  check("new item reads as added", has(d, "Content: เพิ่ม “Teaser Reel”"));
  check("nothing reads as removed", !has(d, "Content: ลบ"));
}
{
  const a = base(); const b = base();
  b.content = [];
  check("removed item is reported by title", has(briefDiff(a, b), "Content: ลบ “KV Launch”"));
}

console.log("\n— KOL changes —");
{
  const a = base(); const b = base();
  b.kols = [{ ...a.kols[0], budget: 20000, count: 2 }];
  const d = briefDiff(a, b);
  check("kol budget + count change on one line", has(d, "KOL “@foodie”: แก้ งบ ฿15,000 → ฿20,000, จำนวน 1 → 2"));
}

console.log("\n— summary caps for the notification —");
{
  const a = base(); const b = base();
  b.name = "X"; b.audience = "Y"; b.mainMessage = "Z"; b.offer = "O";
  b.budget.total = 1; b.budget.ads = 2; b.budget.kol = 3; b.budget.crm = 4;
  b.channels = []; b.launchDate = "2026-08-09";
  const all = briefDiff(a, b);
  check("a heavy edit produces many lines", all.length > 8);
  const summary = briefDiffSummary(a, b);
  check("…but the summary is capped with a +N tail", summary.includes("+อีก") && summary.includes("รายการ"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
