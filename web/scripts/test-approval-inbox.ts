/* Runtime tests for the approvals inbox selector (lib/data/approvals).
 *
 * The bug this suite exists to keep fixed: artwork was collected with
 * "am I the requester", which is the rule from BEFORE sign-off became two
 * checks. Visual CI belongs to the Creative Leader, who is never the
 * requester — so the person holding half the artwork decisions in the company
 * had no queue at all, and pieces sat in Waiting review with nobody told.
 * Run with:  npm test */

import {
  selectGraphicApprovals, buildApprovalRows, countByKind, byWaitingLongest, waitingDays,
  expenseBudgetOf, type ApprovalRow,
} from "../src/lib/data/approvals";
import { emptyDeliverable, type Graphic, type GraphicDeliverable } from "../src/lib/data/graphic";
import { personKeys } from "../src/lib/identity";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const submitted = (over: Partial<GraphicDeliverable> = {}): GraphicDeliverable => ({
  ...emptyDeliverable("Instagram", "1:1 (1080×1080)"),
  assetLink: "https://drive.example/a.png",
  status: "Waiting review", version: 1,
  submittedBy: "Boss", submittedAt: "2026-08-01T02:00:00Z",
  ...over,
});

const req = (over: Partial<Graphic> = {}): Graphic => ({
  id: 1, stage: "Waiting Feedback", title: "Wagyu KV", b: "teppen", campaign: "Wagyu Festival",
  due: "Aug 30", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "Social Media",
  priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—",
  blocker: null, waitingSince: null, nextAction: "—", platform: "IG", size: "1:1 (1080×1080)",
  contentItem: "—", deliverables: [submitted()], ...over,
});

const ctx = (role: string, me: string) => ({
  myKeys: personKeys({ name: me }), me, role, isVisible: () => true,
});

console.log("\n— อาร์ตเวิร์กหนึ่งชิ้น เข้าคิวสองคน คนละด้าน —");
{
  const g = req();
  const requester = selectGraphicApprovals([g], ctx("Marketing Manager / BGL", "Ken S."));
  is("ผู้ขอเปิดงานเห็นด้านข้อมูล 1 แถว", requester.length, 1);
  is("…และเป็นด้าน info", requester[0].kind === "artwork" ? requester[0].lens : "—", "info");

  // นี่คือบั๊กเดิม: Creative Leader ไม่เคยเห็นงานที่ตัวเองต้องเซ็น CI เลย
  const leader = selectGraphicApprovals([g], ctx("Creative Leader", "Boss L."));
  is("Creative Leader เห็นด้าน CI 1 แถว", leader.length, 1);
  is("…และเป็นด้าน ci", leader[0].kind === "artwork" ? leader[0].lens : "—", "ci");

  const designer = selectGraphicApprovals([g], ctx("Senior Graphic Designer", "Boss"));
  is("ดีไซเนอร์เจ้าของงานไม่เห็นอะไร", designer.length, 0);
}

console.log("\n— ด้านที่มีคนเซ็นแล้ว หายไปจากคิว —");
{
  const g = req({ deliverables: [submitted({ review: { ci: { verdict: "pass", by: "Boss L.", at: "2026-08-02T02:00:00Z" } } })] });
  is("Creative Leader ที่เซ็น CI ไปแล้ว ไม่เห็นซ้ำ", selectGraphicApprovals([g], ctx("Creative Leader", "Boss L.")).length, 0);
  is("ผู้ขอเปิดงานยังเห็นด้านข้อมูลอยู่", selectGraphicApprovals([g], ctx("Marketing Manager / BGL", "Ken S.")).length, 1);
  // CMO คลุมได้ทั้งสองเลน — แต่ห้ามคนเดียวเซ็นครบใบ
  is("CMO ที่ยังไม่เซ็น เห็นแค่ด้านที่เหลือ", selectGraphicApprovals([g], ctx("CMO", "Aran P.")).length, 1);
  const bothByCmo = req({ deliverables: [submitted({ review: { ci: { verdict: "pass", by: "Aran P.", at: "2026-08-02T02:00:00Z" } } })] });
  is("CMO ที่เซ็น CI เองแล้ว ไม่เห็นด้านข้อมูลต่อ", selectGraphicApprovals([bothByCmo], ctx("CMO", "Aran P.")).length, 0);
}

console.log("\n— VDO ถูกแยกออกจาก Artwork —");
{
  const vdo = req({ id: 2, type: "VDO Editing", requiredVideo: true });
  is("งานตัดต่อขึ้นเป็น kind = vdo", selectGraphicApprovals([vdo], ctx("Creative Leader", "Boss L."))[0]?.kind, "vdo");
  const shoot = req({ id: 3, type: "Photo Shooting" });
  is("งานถ่ายภาพขึ้นเป็น kind = photo", selectGraphicApprovals([shoot], ctx("Creative Leader", "Boss L."))[0]?.kind, "photo");
  is("งานกราฟิกยังเป็น artwork", selectGraphicApprovals([req()], ctx("Creative Leader", "Boss L."))[0]?.kind, "artwork");
}

console.log("\n— ชิ้นที่ยังไม่ส่ง ไม่เข้าคิว —");
{
  const g = req({ deliverables: [submitted({ status: "Not submitted" }), submitted({ status: "Approved" })] });
  is("ไม่มีแถวจากชิ้นที่ยังไม่ส่ง/ผ่านแล้ว", selectGraphicApprovals([g], ctx("Creative Leader", "Boss L.")).length, 0);
}

console.log("\n— แบรนด์ที่มองไม่เห็น ไม่เข้าคิว —");
{
  const g = req();
  is("brand ถูกซ่อน = ไม่มีแถว",
    selectGraphicApprovals([g], { ...ctx("Creative Leader", "Boss L."), isVisible: () => false }).length, 0);
}

console.log("\n— เรียงตามงานที่รอนานที่สุด —");
{
  const rows: ApprovalRow[] = buildApprovalRows({
    captions: [
      { id: "c1", day: 1, time: "10:00", title: "ใหม่", b: "teppen", plat: "IG", status: "Draft",
        campaign: "X", owner: "A", caption: "", hashtags: "", cta: "",
        captionStatus: "Ready", assetStatus: "—", approvalStatus: "—", publishStatus: "—",
        createdAt: "2026-08-18T00:00:00Z" },
      { id: "c2", day: 1, time: "10:00", title: "เก่า", b: "teppen", plat: "IG", status: "Draft",
        campaign: "X", owner: "A", caption: "", hashtags: "", cta: "",
        captionStatus: "Ready", assetStatus: "—", approvalStatus: "—", publishStatus: "—",
        createdAt: "2026-08-01T00:00:00Z" },
    ],
    graphics: [], campaigns: [], requests: [], expenses: [], kol: [],
  });
  is("แถวเก่าสุดมาก่อน", rows[0].kind === "caption" ? rows[0].post.title : "—", "เก่า");
  // แคมเปญไม่มี timestamp ให้นับอายุ — ต้องไปท้ายแถว ไม่ใช่ถูกนับว่าใหม่เอี่ยม
  is("แถวที่ไม่รู้อายุไปอยู่ท้าย", byWaitingLongest(
    { kind: "campaign", key: "a", b: "teppen", waitingSince: "", c: {} as never },
    rows[0]) > 0, true);
  is("นับตามชนิดได้", countByKind(rows).caption, 2);
  is("ไม่มี timestamp = ไม่แสดงอายุ", waitingDays("", Date.now()), null);
  is("นับวันที่รอถูกต้อง", waitingDays("2026-08-01T00:00:00Z", Date.parse("2026-08-04T00:00:00Z")), 3);
}

console.log("\n— งบแคมเปญที่เหลือหลังอนุมัติ —");
{
  const campaigns = [{ id: "CAM-1", name: "Wagyu", b: "teppen", budget: 100_000 } as never];
  const reqs = [
    { _id: 1, category: "Media", b: "teppen", campaign: "Wagyu", campaignId: "CAM-1", requested: 30_000, approved: 30_000, status: "Approved", due: "—" },
    { _id: 2, category: "Media", b: "teppen", campaign: "Wagyu", campaignId: "CAM-1", requested: 80_000, approved: 0, status: "Waiting Approval", due: "—" },
  ] as never[];
  const info = expenseBudgetOf(campaigns, reqs)(reqs[1]);
  is("อนุมัติไปแล้วนับถูก", info?.committed, 30_000);
  is("อนุมัติใบนี้แล้วจะเกินงบ", (info?.left ?? 0) < 0, true);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} approval inbox: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
