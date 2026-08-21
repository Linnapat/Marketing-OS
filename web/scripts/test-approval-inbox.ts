/* Runtime tests for the approvals inbox (lib/data/approvals).
 *
 * Two things this suite exists to keep true:
 *
 *  1. The queue holds the WHOLE team's open decisions, brand-scoped — you can
 *     see that an artwork has sat for two weeks even when it is not yours.
 *     Whether you may act is a flag on the row (`mine`), never the reason a row
 *     is missing.
 *
 *  2. `mine` still answers with the real rules. The bug that started this:
 *     artwork was collected with "am I the requester", which is the rule from
 *     BEFORE sign-off became two checks. Visual CI belongs to the Creative
 *     Leader, who is never the requester, so the person holding half the
 *     artwork decisions in the company had no queue at all.
 * Run with:  npm test */

import {
  buildApprovalRows, selectGraphicApprovals, countByKind, byWaitingLongest, waitingDays,
  expenseBudgetOf, type ApprovalCtx, type ApprovalRow,
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

const ctx = (role: string, me: string, over: Partial<ApprovalCtx> = {}): ApprovalCtx => ({
  myKeys: personKeys({ name: me }), me, role,
  canApproveCampaign: role === "CMO",
  canApproveExpense: role === "CMO",
  canEditContentPlan: /CMO|Marketing|Planner/.test(role),
  isVisible: () => true,
  canSeeBrandLabel: () => true,
  doneIds: new Set<number>(),
  ...over,
});

const empty = { captions: [], graphics: [], campaigns: [], requests: [], expenses: [], kol: [] };
const mineOf = (rows: ApprovalRow[]) => rows.filter((r) => r.mine).length;

console.log("\n— อาร์ตเวิร์กหนึ่งชิ้น ทุกคนเห็นสองแถว แต่กดได้คนละด้าน —");
{
  const g = req();
  const requester = selectGraphicApprovals([g], ctx("Marketing Manager / BGL", "Ken S."));
  is("เห็นครบทั้งสองด้าน", requester.length, 2);
  is("ผู้ขอเปิดงานกดได้ 1 ด้าน", mineOf(requester), 1);
  const mineRow = requester.find((r) => r.mine);
  is("…ด้านที่กดได้คือ info", mineRow && mineRow.kind === "artwork" ? mineRow.lens : "—", "info");

  // นี่คือบั๊กเดิม: Creative Leader ไม่เคยเห็นงานที่ตัวเองต้องเซ็น CI เลย
  const leader = selectGraphicApprovals([g], ctx("Creative Leader", "Boss L."));
  is("Creative Leader ก็เห็นสองด้าน", leader.length, 2);
  const leaderRow = leader.find((r) => r.mine);
  is("…แต่กดได้แค่ CI", leaderRow && leaderRow.kind === "artwork" ? leaderRow.lens : "—", "ci");

  // ดีไซเนอร์เจ้าของงาน "เห็น" ได้ เพื่อจะได้รู้ว่างานตัวเองค้างที่ใคร แต่กดไม่ได้
  const designer = selectGraphicApprovals([g], ctx("Senior Graphic Designer", "Boss"));
  is("ดีไซเนอร์เจ้าของงานยังเห็นสถานะได้", designer.length, 2);
  is("…แต่กดผ่านงานตัวเองไม่ได้", mineOf(designer), 0);
  is("แถว CI บอกว่ารอใครอยู่", designer.find((r) => r.kind === "artwork" && r.lens === "ci")?.waitingOn, "Creative Leader");
  is("แถวข้อมูลบอกชื่อคนที่รอ", designer.find((r) => r.kind === "artwork" && r.lens === "info")?.waitingOn, "Ken S.");
}

console.log("\n— ด้านที่มีคนเซ็นแล้ว หายไปจากคิวของทุกคน —");
{
  const g = req({ deliverables: [submitted({ review: { ci: { verdict: "pass", by: "Boss L.", at: "2026-08-02T02:00:00Z" } } })] });
  const rows = selectGraphicApprovals([g], ctx("Creative Leader", "Boss L."));
  is("เหลือแถวเดียว (ด้านข้อมูล)", rows.length, 1);
  is("Creative Leader ที่เซ็น CI ไปแล้ว กดด้านข้อมูลไม่ได้", mineOf(rows), 0);
  is("ผู้ขอเปิดงานกดด้านข้อมูลได้", mineOf(selectGraphicApprovals([g], ctx("Marketing Manager / BGL", "Ken S."))), 1);
  // CMO คลุมได้ทั้งสองเลน แต่ห้ามคนเดียวเซ็นครบใบ
  const bothByCmo = req({ deliverables: [submitted({ review: { ci: { verdict: "pass", by: "Aran P.", at: "2026-08-02T02:00:00Z" } } })] });
  is("CMO ที่เซ็น CI เองแล้ว กดด้านข้อมูลต่อไม่ได้", mineOf(selectGraphicApprovals([bothByCmo], ctx("CMO", "Aran P."))), 0);
}

console.log("\n— VDO ถูกแยกออกจาก Artwork —");
{
  const vdo = req({ id: 2, type: "VDO Editing", requiredVideo: true });
  is("งานตัดต่อขึ้นเป็น kind = vdo", selectGraphicApprovals([vdo], ctx("Creative Leader", "Boss L."))[0]?.kind, "vdo");
  is("งานถ่ายภาพขึ้นเป็น kind = photo", selectGraphicApprovals([req({ id: 3, type: "Photo Shooting" })], ctx("Creative Leader", "Boss L."))[0]?.kind, "photo");
  is("งานกราฟิกยังเป็น artwork", selectGraphicApprovals([req()], ctx("Creative Leader", "Boss L."))[0]?.kind, "artwork");
}

console.log("\n— ชิ้นที่ยังไม่ส่ง / ผ่านแล้ว ไม่เข้าคิว —");
{
  const g = req({ deliverables: [submitted({ status: "Not submitted" }), submitted({ status: "Approved" })] });
  is("ไม่มีแถวเลย", selectGraphicApprovals([g], ctx("Creative Leader", "Boss L.")).length, 0);
}

console.log("\n— แบรนด์คือตัวคัดกรองเดียวที่ซ่อนงาน —");
{
  is("brand ที่มองไม่เห็น = ไม่มีแถว",
    selectGraphicApprovals([req()], ctx("Creative Leader", "Boss L.", { isVisible: () => false })).length, 0);
}

console.log("\n— แคมเปญ: รออนุมัติ vs รอเจ้าของกดส่ง —");
{
  const waiting = { id: "CAM-1", name: "A", b: "teppen", owner: "Ken S.", status: "Waiting for Approval" } as never;
  const ready = { id: "CAM-2", name: "B", b: "teppen", owner: "Ken S.", status: "Ready for Review" } as never;
  const active = { id: "CAM-3", name: "C", b: "teppen", owner: "Ken S.", status: "Active" } as never;
  const asCmo = buildApprovalRows({ ...empty, campaigns: [waiting, ready, active] }, ctx("CMO", "Aran P."));
  is("แคมเปญที่ Active ไม่เข้าคิว", asCmo.length, 2);
  is("CMO กดอนุมัติใบที่รออนุมัติได้", asCmo.find((r) => r.kind === "campaign" && r.c.id === "CAM-1")?.mine, true);
  is("แต่ใบที่รอเจ้าของกดส่ง ไม่ใช่ของ CMO", asCmo.find((r) => r.kind === "campaign" && r.c.id === "CAM-2")?.mine, false);
  is("…และบอกว่ารอเจ้าของอยู่", asCmo.find((r) => r.kind === "campaign" && r.c.id === "CAM-2")?.waitingOn, "Ken S.");
  const asOwner = buildApprovalRows({ ...empty, campaigns: [waiting, ready] }, ctx("Content Planner", "Ken S."));
  is("เจ้าของกดส่งใบตัวเองได้", asOwner.find((r) => r.kind === "campaign" && r.c.id === "CAM-2")?.mine, true);
  is("แต่อนุมัติเองไม่ได้", asOwner.find((r) => r.kind === "campaign" && r.c.id === "CAM-1")?.mine, false);
}

console.log("\n— แคปชั่น: คนเขียนไม่ได้เซ็นงานตัวเอง —");
{
  const post = (over: Record<string, unknown>) => ({
    id: "c1", day: 1, time: "10:00", title: "T", b: "teppen", plat: "IG", status: "Draft",
    campaign: "X", owner: "Mei T.", caption: "hi", hashtags: "", cta: "",
    captionStatus: "Ready", assetStatus: "—", approvalStatus: "—", publishStatus: "—",
    createdAt: "2026-08-01T00:00:00Z", ...over,
  }) as never;
  const addressed = buildApprovalRows({ ...empty, captions: [post({ approver: "Ken S." })] }, ctx("Content Planner", "Ken S."));
  is("คนที่ถูกระบุให้ตรวจ กดได้", addressed[0]?.mine, true);
  const other = buildApprovalRows({ ...empty, captions: [post({ approver: "Ken S." })] }, ctx("Content Planner", "Nok W."));
  is("คนอื่นเห็นแถวแต่กดไม่ได้", other.length === 1 && other[0].mine === false, true);
  is("…และบอกว่ารอใคร", other[0]?.waitingOn, "Ken S.");
  const ownWords = buildApprovalRows({ ...empty, captions: [post({ owner: "Mei T." })] }, ctx("Content Planner", "Mei T."));
  is("คนเขียนเองกดไม่ได้ แม้ไม่มีคนถูกระบุ", ownWords[0]?.mine, false);
}

console.log("\n— เงิน: กติกาเดิม CMO เท่านั้น —");
{
  const exp = { _id: 1, category: "Media", b: "teppen", campaign: "X", requested: 5000, approved: 0, status: "Waiting Approval", due: "—", createdAt: "2026-08-10T00:00:00Z" } as never;
  is("CMO กดได้", buildApprovalRows({ ...empty, expenses: [exp] }, ctx("CMO", "Aran P."))[0]?.mine, true);
  const staff = buildApprovalRows({ ...empty, expenses: [exp] }, ctx("Content Planner", "Ken S."));
  is("คนอื่นเห็นว่ามีใบค้าง", staff.length, 1);
  is("…แต่กดไม่ได้", staff[0]?.mine, false);
}

console.log("\n— เรียงตามงานที่รอนานที่สุด —");
{
  const post = (id: string, title: string, createdAt: string) => ({
    id, day: 1, time: "10:00", title, b: "teppen", plat: "IG", status: "Draft",
    campaign: "X", owner: "A", caption: "", hashtags: "", cta: "",
    captionStatus: "Ready", assetStatus: "—", approvalStatus: "—", publishStatus: "—", createdAt,
  }) as never;
  const rows = buildApprovalRows(
    { ...empty, captions: [post("c1", "ใหม่", "2026-08-18T00:00:00Z"), post("c2", "เก่า", "2026-08-01T00:00:00Z")] },
    ctx("Content Planner", "Ken S."),
  );
  is("แถวเก่าสุดมาก่อน", rows[0].kind === "caption" ? rows[0].post.title : "—", "เก่า");
  // แคมเปญไม่มี timestamp ให้นับอายุ — ต้องไปท้ายแถว ไม่ใช่ถูกนับว่าใหม่เอี่ยม
  is("แถวที่ไม่รู้อายุไปอยู่ท้าย", byWaitingLongest(
    { kind: "campaign", key: "a", b: "teppen", waitingSince: "", mine: false, waitingOn: "CMO", c: {} as never },
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
