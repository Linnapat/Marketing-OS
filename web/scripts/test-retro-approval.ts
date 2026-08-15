/* Runtime tests for the retro-approval rule — which edits to an ALREADY
 * APPROVED campaign cost the CMO an approval, and which are merely logged.
 *
 * This is the rule the whole change hangs on. Get it wrong in the permissive
 * direction and a budget can be doubled with nobody signing off; get it wrong
 * in the strict direction and we are back to the old behaviour, where fixing a
 * caption typo revoked the approval of a live campaign.
 * Run with:  npm test
 */

import { splitBriefChanges } from "../src/lib/data/briefDiff";
import { retroEntryFor, pendingEntriesOf } from "../src/lib/data/retroApproval";
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
const hits = (lines: string[], part: string) => lines.some((l) => l.includes(part));

const base = (): CampaignBrief => {
  const b = emptyBrief("CAM-1");
  b.name = "Wagyu Festival";
  b.startDate = "2026-08-01"; b.endDate = "2026-08-31";
  b.channels = ["Facebook", "Instagram"];
  b.budget.total = 150000; b.budget.ads = 60000; b.budget.kol = 30000;
  b.successGoals = { Reach: "300000" };
  b.content = [{
    ...emptyContentItem(1), title: "KV Launch", type: "Photo",
    platforms: ["Facebook"], publishDate: "2026-08-05", captionDirection: "ของดีต้องบอกต่อ",
  }];
  b.kols = [{ ...emptyKolItem(1), name: "@foodie", budget: 15000, count: 1, postingStart: "2026-08-10" }];
  b.status = "Approved";
  return b;
};

console.log("\n— what the CMO must still sign off (major) —");
{
  const a = base(); const b = base();
  b.budget.ads = 90000;
  const { major, minor } = splitBriefChanges(a, b);
  check("a budget change is major", hits(major, "งบ Ads"));
  is("…and nothing lands in minor", minor.length, 0);
}
{
  const a = base(); const b = base();
  b.endDate = "2026-09-15";
  check("moving the flight is major", hits(splitBriefChanges(a, b).major, "ช่วงแคมเปญ"));
}
{
  const a = base(); const b = base();
  b.successGoals = { Reach: "120000" };
  check("cutting the goal is major", hits(splitBriefChanges(a, b).major, "เป้า Reach"));
}
{
  const a = base(); const b = base();
  b.content = [...a.content, { ...emptyContentItem(9), id: "ci-9", title: "Teaser Reel" }];
  check("ADDING a content item is major", hits(splitBriefChanges(a, b).major, "Content: เพิ่ม"));
}
{
  const a = base(); const b = base();
  b.content = [];
  check("REMOVING a content item is major", hits(splitBriefChanges(a, b).major, "Content: ลบ"));
}
{
  const a = base(); const b = base();
  b.kols = [{ ...a.kols[0], budget: 25000 }];
  check("a KOL fee change is major", hits(splitBriefChanges(a, b).major, "KOL “@foodie”"));
}
{
  const a = base(); const b = base();
  b.kols = [{ ...a.kols[0], name: "@another" }];
  check("swapping which page carries the brand is major", hits(splitBriefChanges(a, b).major, "เพจ"));
}
{
  const a = base(); const b = base();
  b.channels = ["Facebook", "Instagram", "TikTok"];
  check("adding a channel is major", hits(splitBriefChanges(a, b).major, "Channels"));
}

console.log("\n— what must NOT cost an approval (minor) —");
{
  const a = base(); const b = base();
  b.content = [{ ...a.content[0], captionDirection: "ของดีต้องรีบบอกต่อ" }];
  const { major, minor } = splitBriefChanges(a, b);
  is("a caption fix queues nothing", major.length, 0);
  check("…but it is still recorded", hits(minor, "caption"));
}
{
  const a = base(); const b = base();
  b.content = [{ ...a.content[0], publishDate: "2026-08-07", platforms: ["Facebook", "Instagram"] }];
  is("rescheduling a post inside the campaign is minor", splitBriefChanges(a, b).major.length, 0);
}
{
  const a = base(); const b = base();
  b.audience = "Office workers"; b.mainMessage = "วากิว A5"; b.offer = "เซ็ต 1,290.-";
  is("rewording the pitch is minor", splitBriefChanges(a, b).major.length, 0);
}
{
  const a = base(); const b = base();
  b.kols = [{ ...a.kols[0], postingStart: "2026-08-12" }];
  is("moving a KOL's posting window is minor", splitBriefChanges(a, b).major.length, 0);
}
{
  const a = base();
  const { major, minor } = splitBriefChanges(a, base());
  is("no edit at all yields no major", major.length, 0);
  is("…and no minor", minor.length, 0);
}

console.log("\n— the queue entry —");
{
  const entry = retroEntryFor({ at: "2026-08-15T03:00:00.000Z", by: "Ploy", status: "Approved", major: [], minor: ["caption"] });
  is("a minor-only edit creates NO entry", entry, null);
}
{
  const entry = retroEntryFor({
    at: "2026-08-15T03:00:00.000Z", by: "Ploy", status: "In Progress",
    major: ["งบ Ads: ฿60,000 → ฿90,000"], minor: ["Content “KV Launch”: แก้ caption"],
  });
  check("a major edit creates one", !!entry);
  is("…keyed by the save timestamp", entry?.id, "2026-08-15T03:00:00.000Z");
  is("…naming who made it", entry?.by, "Ploy");
  is("…remembering the status the campaign KEPT", entry?.status, "In Progress");
  is("…carrying only the major lines as the ask", entry?.changes.length, 1);
  check("…with the minor ones as context", !!entry?.minor?.length);
}
{
  const entry = retroEntryFor({ at: "2026-08-15T03:00:00.000Z", by: "", status: "Approved", major: ["งบรวม: ฿1 → ฿2"], minor: [] });
  is("an unnamed editor is still attributable", entry?.by, "Unknown");
  is("…and no empty minor array is stored", entry?.minor, undefined);
}

console.log("\n— reading the queue —");
{
  const brief = {
    pendingApprovals: [
      { id: "c", at: "2026-08-14T00:00:00.000Z", by: "A", changes: ["x"], status: "Approved" },
      { id: "a", at: "2026-08-01T00:00:00.000Z", by: "B", changes: ["y"], status: "Approved" },
    ],
  };
  is("oldest edit is read first", pendingEntriesOf(brief)[0].id, "a");
  is("a brief with no queue reads as empty", pendingEntriesOf({}).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
