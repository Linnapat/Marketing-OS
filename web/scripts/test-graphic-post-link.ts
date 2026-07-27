/* Which Content Plan post does an approved graphic request deliver to?
 *
 * This is the rule that decides where artwork lands, and getting it wrong is
 * invisible: the asset attaches to *a* post, just not the right one, and nobody
 * checks a link that appears to have worked. The old inline version matched
 * sourceContentItemId without scoping it to a campaign — and that value is the
 * brief's row number ("ci-1", "ci-2", …) restarting per campaign, so live data
 * has "ci-1" in 13 campaigns at once and 488 cross-campaign id collisions.
 * Run: node --import tsx scripts/test-graphic-post-link.ts */

import { findLinkedPost, LinkablePost, Graphic } from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const g = (over: Partial<Graphic> = {}): Graphic => ({
  id: 900, stage: "Approved", title: "Wagyu KV", b: "teppen", campaign: "Wagyu Festival",
  due: "Aug 5", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "Photo",
  priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—",
  blocker: null, waitingSince: "", nextAction: "", platform: "IG", size: "1:1",
  contentItem: "Wagyu hero post", ...over,
});

const p = (over: Partial<LinkablePost> = {}): LinkablePost => ({
  id: "c-1", campaign: "Wagyu Festival", campaignId: "CPN-01", title: "Wagyu hero post", ...over,
});

console.log("\n— 1. contentPostId ชนะทุกอย่าง (ลิงก์ตรงจาก Phase 1) —");
{
  const target = p({ id: "c-42" });
  const decoy = p({ id: "c-9", graphicRequestId: "900", sourceContentItemId: "ci-1" });
  is("ผูก post id ไว้ → ได้โพสต์นั้น", findLinkedPost(g({ contentPostId: "c-42" }), [decoy, target])?.id, "c-42");
  // A stated link that resolves to nothing means the post is gone — guessing
  // from the weaker signals would silently attach to the decoy.
  is("ผูกไว้แต่หาโพสต์ไม่เจอ → null ไม่เดาต่อ", findLinkedPost(g({ contentPostId: "c-404" }), [decoy]), null);
}

console.log("\n— 2. โพสต์ชี้กลับมาที่ request —");
{
  const target = p({ id: "c-7", graphicRequestId: "900" });
  is("graphicRequestId ตรงกัน", findLinkedPost(g(), [p({ id: "c-1" }), target])?.id, "c-7");
  is("เทียบข้ามชนิด number/string ได้", findLinkedPost(g({ id: 900 }), [p({ id: "c-7", graphicRequestId: "900" })])?.id, "c-7");
  // Two posts claiming the same request is corrupt data, not a coin flip.
  is("โพสต์ 2 อันอ้าง request เดียวกัน → null",
    findLinkedPost(g(), [p({ id: "c-7", graphicRequestId: "900" }), p({ id: "c-8", graphicRequestId: "900" })]), null);
}

console.log("\n— 3. ci-N ต้องอยู่ใน campaign เดียวกัน (บั๊กเดิม) —");
{
  const otherCampaign = p({ id: "c-other", campaign: "Mother's Day", campaignId: "CPN-17", sourceContentItemId: "ci-1" });
  const sameCampaign = p({ id: "c-mine", sourceContentItemId: "ci-1" });
  const req = g({ sourceContentItemId: "ci-1", campaignId: "CPN-01" });

  is("เจอโพสต์ที่ ci ตรงและ campaign ตรง", findLinkedPost(req, [otherCampaign, sameCampaign])?.id, "c-mine");
  // ก่อนแก้: อันนี้คืน c-other → asset ไปแปะโพสต์ของอีกแคมเปญ
  is("มีแต่ ci ตรง แต่คนละ campaign → null", findLinkedPost(req, [otherCampaign]), null);
  is("ci ตรงกัน 2 โพสต์ใน campaign เดียวกัน → null (กำกวม)",
    findLinkedPost(req, [sameCampaign, p({ id: "c-dup", sourceContentItemId: "ci-1" })]), null);

  // แถวเก่าที่ยังไม่มี campaignId ให้เทียบด้วยชื่อแคมเปญแทน
  const legacy = g({ sourceContentItemId: "ci-2", campaignId: undefined });
  is("ไม่มี campaignId → fallback ชื่อ campaign",
    findLinkedPost(legacy, [p({ id: "c-legacy", campaignId: undefined, sourceContentItemId: "ci-2" })])?.id, "c-legacy");
  is("ชื่อ campaign คนละอัน → null",
    findLinkedPost(legacy, [p({ id: "c-x", campaign: "Other", campaignId: undefined, sourceContentItemId: "ci-2" })]), null);
}

console.log("\n— 4. แถวเก่าที่ไม่มี id เลย: campaign + ชื่อตรงเป๊ะ —");
{
  const req = g({ sourceContentItemId: undefined, contentItem: "Wagyu hero post" });
  is("ชื่อตรงเป๊ะ", findLinkedPost(req, [p({ id: "c-title" })])?.id, "c-title");
  is("ไม่สนตัวพิมพ์/ช่องว่าง", findLinkedPost(req, [p({ id: "c-title", title: "  WAGYU HERO POST " })])?.id, "c-title");
  // เดิมใช้ g.title.includes(p.title) — "Wagyu" จะแมตช์ทุกโพสต์ที่ชื่อเป็นส่วนหนึ่ง
  is("ชื่อเป็นแค่ส่วนหนึ่ง ไม่แมตช์แล้ว",
    findLinkedPost(g({ sourceContentItemId: undefined, contentItem: "", title: "Wagyu hero post extended" }), [p({ id: "c-sub", title: "Wagyu" })]), null);
  is("ชื่อซ้ำกัน 2 โพสต์ → null",
    findLinkedPost(req, [p({ id: "c-a" }), p({ id: "c-b" })]), null);
  is("ไม่มีอะไรให้เทียบเลย → null",
    findLinkedPost(g({ sourceContentItemId: undefined, contentItem: "", title: "" }), [p()]), null);
}

console.log("\n— 5. งานที่ไม่มีโพสต์ (POSM / ป้าย / เมนู) —");
{
  // Phase 1 ให้ request อยู่ได้โดยไม่มีโพสต์ — ห้ามไปหยิบโพสต์อื่นมาแปะ
  const posm = g({ contentPostId: undefined, sourceContentItemId: undefined, contentItem: "—", title: "POSM ขาตั้งหน้าร้าน", campaign: "Wagyu Festival" });
  is("ไม่มีตัวเชื่อมใดๆ → null", findLinkedPost(posm, [p(), p({ id: "c-2", title: "อีกโพสต์" })]), null);
  is("ไม่มีโพสต์ในระบบเลย → null", findLinkedPost(g(), []), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
