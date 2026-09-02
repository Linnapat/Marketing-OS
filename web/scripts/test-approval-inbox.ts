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
  expenseBudgetOf, approvalCampaigns, matchesApprovalBrand, matchesApprovalCampaign, approvalTitle, platformLabel,
  type ApprovalCtx, type ApprovalRow,
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
  // สายการเงิน/ผู้บริหารเห็นยอดได้ คนอื่นไม่เห็นเลนนี้เลย
  canSeeSpending: /CMO|Finance|Marketing Manager/.test(role),
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

/* คิวของ CMO เคยมี 77 รายการ เพราะ CMO เซ็นแทนได้ทุกด้าน = ทุกงานในบริษัทนับเป็น "ของฉัน"
   ตอนนี้ "ของฉัน" = งานที่จ่าหน้าถึงเรา ส่วนสิทธิ์เซ็นแทนอยู่ที่ canAct (ปุ่มยังอยู่) */
console.log("\n— เซ็นแทนได้ ≠ เป็นงานของเรา —");
{
  const g = req();
  const cmo = selectGraphicApprovals([g], ctx("CMO", "Aran P."));
  is("CMO เห็นทั้งสองด้าน", cmo.length, 2);
  is("แต่ไม่มีด้านไหนเป็นของ CMO", mineOf(cmo), 0);
  is("…และยังกดได้ทั้งสองด้าน", cmo.every((r) => r.canAct), true);
  is("แถวยังบอกว่าจริง ๆ รอใคร", cmo.find((r) => r.kind === "artwork" && r.lens === "info")?.waitingOn, "Ken S.");

  // Marketing Manager ที่ไม่ใช่ผู้ขอเปิดงาน ก็เซ็นด้านข้อมูลแทนได้ แต่ไม่ใช่เจ้าของ
  const mm = selectGraphicApprovals([g], ctx("Marketing Manager / BGL", "Pupay"));
  is("MM ที่ไม่ได้เปิดงาน ไม่ใช่เจ้าของ", mineOf(mm), 0);
  is("…แต่ยังเซ็นด้านข้อมูลแทนได้", mm.find((r) => r.kind === "artwork" && r.lens === "info")?.canAct, true);
  is("…ด้าน CI ไม่ใช่เรื่องของ MM", mm.find((r) => r.kind === "artwork" && r.lens === "ci")?.canAct, false);

  // เจ้าของจริงยังได้งานของตัวเองเหมือนเดิม
  is("ผู้ขอเปิดงานยังได้ด้านข้อมูลเป็นของตัวเอง", mineOf(selectGraphicApprovals([g], ctx("Marketing Executive", "Ken S."))), 1);
  is("Creative Leader ยังได้ด้าน CI เป็นของตัวเอง", mineOf(selectGraphicApprovals([g], ctx("Creative Leader", "Boss L."))), 1);
}

console.log("\n— แคปชั่นที่ไม่ได้จ่าหน้าถึงใคร ไม่ใช่ของ CMO —");
{
  const post = (over: Record<string, unknown> = {}) => ({
    id: "c1", title: "T", b: "teppen", campaign: "W", plat: "Facebook", owner: "Pupay",
    caption: "x", captionStatus: "Ready", assetStatus: "—", approvalStatus: "—", publishStatus: "—",
    createdAt: "2026-08-15T00:00:00Z", ...over,
  }) as never;
  // ไม่มี approver/requester = ไม่มีชื่อใครบนงาน
  const loose = buildApprovalRows({ ...empty, captions: [post()] }, ctx("CMO", "Aran P."));
  is("แคปชั่นลอย ๆ ไม่ถูกนับเป็นของ CMO", mineOf(loose), 0);
  // CMO กดได้เฉพาะงานที่ตัวเองเปิด — แคปชั่นลอย ๆ ไม่ใช่ของเขา
  is("…และ CMO ก็กดไม่ได้ด้วย", loose[0]?.canAct, false);
  // narawich ไม่ใช่คนเขียน (post() ตั้ง owner = Pupay) จึงเคลียร์ได้จริง
  is("…แต่ฝั่งวางแผนคนอื่นเคลียร์ได้ ไม่ถูกทิ้งค้าง",
    buildApprovalRows({ ...empty, captions: [post()] }, ctx("Marketing Executive", "narawich"))[0]?.canAct, true);
  is("…และบอกว่ารอฝ่ายวางแผน", loose[0]?.waitingOn, "ฝ่ายวางแผน");
  // จ่าหน้าถึงใคร = ของคนนั้น
  const addressed = buildApprovalRows({ ...empty, captions: [post({ approver: "Aran P." })] }, ctx("CMO", "Aran P."));
  is("แคปชั่นที่จ่าหน้าถึงเรา = ของเรา", mineOf(addressed), 1);
  const other = buildApprovalRows({ ...empty, captions: [post({ approver: "Ken S." })] }, ctx("CMO", "Aran P."));
  is("จ่าหน้าถึงคนอื่น = ไม่ใช่ของเรา", mineOf(other), 0);
  is("…แต่ CMO ยังกดไม่ได้ ถ้าไม่ได้จ่าหน้าถึง", other[0]?.canAct, false);
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

console.log("\n— ชิ้นที่ยังไม่ส่งไม่เข้าคิว · ชิ้นที่ผ่านแล้วย้ายไป Queued —");
{
  // ชิ้นที่ยังไม่ส่ง ไม่มีอะไรให้ตัดสินและไม่มีอะไรให้รอ publish
  const notYet = req({ deliverables: [submitted({ status: "Not submitted" })] });
  is("ยังไม่ส่ง = ไม่มีแถวเลย", selectGraphicApprovals([notYet], ctx("Creative Leader", "Boss L.")).length, 0);

  // ผ่านแล้วต้อง "ไม่หายไป" — เดิมกดอนุมัติแล้วแถวหายจากจอ อ่านแล้วเหมือนไม่ได้บันทึก
  const done = req({ deliverables: [submitted({ status: "Not submitted" }), submitted({ status: "Approved" })] });
  const rows = selectGraphicApprovals([done], ctx("Creative Leader", "Boss L."));
  is("ผ่านแล้วยังอยู่ในลิสต์ 1 แถว", rows.length, 1);
  is("…อยู่ในกลุ่ม Queued", rows[0]?.queued, true);
  is("…ไม่มีอะไรให้กดแล้ว", rows[0]?.canAct, false);
  is("…และไม่ไปโผล่ในคิวตัดสินใจของใคร", rows[0]?.mine, false);

  // โพสต์ลงจริงแล้ว = จบ ต้องหลุดออกจากลิสต์
  const published = [{ id: "p1", campaignId: done.campaignId, sourceContentItemId: done.sourceContentItemId,
    graphicRequestId: String(done.id), publishStatus: "Published", status: "Published" }];
  is("โพสต์ลงแล้ว → หลุดออกจาก Queued",
    selectGraphicApprovals([done], ctx("Creative Leader", "Boss L."), published as never).length, 0);
}

console.log("\n— แคปชั่นต้องไม่ค้างโดยไม่มีใครกดได้ —");
{
  // 2 ก.ย. 69: เลน Caption ขึ้น "ทั้งทีม 42" ให้ Pupay โดยที่ทั้ง 42 ไม่มีใครกดได้เลย
  // ต้นเหตุ: fan-out stamp คนเขียน = requester ทำให้คนเขียน/คนขอ/ผู้อนุมัติเป็นคนเดียว
  // กติกาห้ามเซ็นงานตัวเองกันคนนั้นออก และแถวที่ระบุชื่อไว้ไม่เปิดให้คนอื่นกด
  const post = (over: Record<string, unknown> = {}) => ({
    id: "p1", day: 1, time: "10:00", title: "โพสต์", b: "teppen", plat: "Instagram",
    status: "Draft", campaign: "Brand Awareness", caption: "ข้อความ", hashtags: "", cta: "",
    captionStatus: "Ready", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft",
    ...over,
  });
  const rowsFor = (p: unknown, me: string, role: string) =>
    buildApprovalRows({ captions: [p as never], graphics: [], campaigns: [], requests: [], expenses: [], kol: [] },
      ctx(role, me)).filter((r) => r.kind === "caption");

  // ปกติ: Creative เขียน · Marketer ที่ขอเปิดโพสต์เป็นคนอนุมัติ
  const normal = post({ owner: "Pichayaporn", requester: "Pupay", approver: "Pupay" });
  is("คนขอเปิดโพสต์เป็นคนอนุมัติ", rowsFor(normal, "Pupay", "Marketing Manager / BGL")[0]?.canAct, true);
  is("…และนับเป็นงานของเขา", rowsFor(normal, "Pupay", "Marketing Manager / BGL")[0]?.mine, true);
  is("คนเขียนกดงานตัวเองไม่ได้", rowsFor(normal, "Pichayaporn", "Creative Leader")[0]?.canAct, false);

  // ข้อมูลยังพังอยู่ (คนเขียน = ผู้อนุมัติ) → ต้องตกไปฝั่งวางแผน ไม่ใช่ตายทั้งแถว
  const collapsed = post({ owner: "Pupay", requester: "Pupay", approver: "Pupay" });
  is("คนเขียน=ผู้อนุมัติ → เจ้าตัวยังกดไม่ได้", rowsFor(collapsed, "Pupay", "Marketing Manager / BGL")[0]?.canAct, false);
  is("…แต่ฝั่งวางแผนคนอื่นกดได้ ไม่ใช่ทางตัน",
    rowsFor(collapsed, "narawich", "Marketing Executive")[0]?.canAct, true);
  is("…CMO ไม่นับ เพราะกดได้เฉพาะงานที่ตัวเองเปิด",
    rowsFor(collapsed, "Gik", "CMO")[0]?.canAct, false);
  is("…และป้ายบอกว่ารอฝ่ายวางแผน ไม่ใช่ชี้คนที่กดไม่ได้",
    rowsFor(collapsed, "Gik", "CMO")[0]?.waitingOn, "ฝ่ายวางแผน");

  // อนุมัติแล้วต้องไม่หายจากจอ — ย้ายลงกลุ่ม Queued เหมือนอาร์ตเวิร์กและ VDO
  const approved = post({ captionStatus: "Approved", captionApprovedAt: "2026-09-01T00:00:00Z",
    owner: "Pichayaporn", requester: "Pupay", approver: "Pupay" });
  const q = rowsFor(approved, "Pupay", "Marketing Manager / BGL");
  is("อนุมัติแล้วยังอยู่ในลิสต์", q.length, 1);
  is("…อยู่ในกลุ่ม Queued", q[0]?.queued, true);
  is("…ไม่มีอะไรให้กดแล้ว", q[0]?.canAct, false);
  is("…และไม่ไปพองตัวเลข 'รอคุณตัดสินใจ'", q[0]?.mine, false);
  // ลงจริงแล้ว = จบ หลุดออกจากลิสต์
  is("โพสต์ publish แล้ว → หลุดออกจาก Queued",
    rowsFor(post({ captionStatus: "Approved", publishStatus: "Published", owner: "Pichayaporn", requester: "Pupay" }),
      "Pupay", "Marketing Manager / BGL").length, 0);
  // แคปชั่นที่ยังไม่เขียน ไม่ใช่ทั้งงานค้างและไม่ใช่ของที่รอ publish
  is("แคปชั่นที่ยังไม่พร้อม ไม่โผล่เลย",
    rowsFor(post({ captionStatus: "Missing", owner: "Pichayaporn", requester: "Pupay" }), "Pupay", "Marketing Manager / BGL").length, 0);

  // CMO ไม่รับแคปชั่นของแบรนด์อื่นเข้าคิวตัวเอง — กติกาที่ตั้งใจไว้ตั้งแต่ 5 ส.ค. 69
  // (เทสต์ "CMO ยังกดไม่ได้ ถ้าไม่ได้จ่าหน้าถึง" ด้านบนกำหนดไว้แล้ว)
  is("แคปชั่นที่จ่าหน้าถึง Marketer ของแบรนด์ ไม่ใช่งานของ CMO",
    rowsFor(normal, "Gik", "CMO")[0]?.mine, false);
}

console.log("\n— แบรนด์คือตัวคัดกรองเดียวที่ซ่อนงาน —");
{
  is("brand ที่มองไม่เห็น = ไม่มีแถว",
    selectGraphicApprovals([req()], ctx("Creative Leader", "Boss L.", { isVisible: () => false })).length, 0);
}

/* Marketer เห็นเฉพาะแบรนด์ที่ตัวเองดูแล — ต้องจริงกับ *ทุกชนิด* ไม่ใช่แค่งานกราฟิก
   ชนิดใหม่ที่ลืมเช็ค isVisible จะโผล่ที่นี่ก่อนไปโผล่ในคิวของคนอื่น */
console.log("\n— ทุกชนิดต้องถูกกรองด้วยแบรนด์ —");
{
  const hidden = ctx("CMO", "Aran P., ", { isVisible: () => false, canSeeBrandLabel: () => false });
  const everything = {
    captions: [{
      id: "c1", title: "โพสต์", b: "teppen", campaign: "Wagyu", plat: "Facebook", owner: "Mei T.",
      requester: "Ken S.", approver: "Ken S.", caption: "x", captionStatus: "Ready",
      assetStatus: "—", approvalStatus: "—", publishStatus: "—", createdAt: "2026-08-01T00:00:00Z",
    }] as never[],
    graphics: [req()],
    campaigns: [{ id: "CAM-1", name: "A", b: "teppen", owner: "Ken S.", status: "Waiting for Approval" }] as never[],
    requests: [{ id: "R1", b: "teppen", campaign: "Wagyu", stage: "Waiting Approval", type: "Design", approver: "Aran P." }] as never[],
    expenses: [{ _id: 1, b: "teppen", campaign: "Wagyu", category: "Media", requested: 1000, status: "Waiting Approval", due: "—" }] as never[],
    kol: [{ id: 1, title: "KOL", brand: "Teppen Thailand", campaign: "Wagyu", status: "Need Approval", assignee: "Aran P." }] as never[],
  };
  is("แบรนด์ที่ไม่ได้ดูแล = ไม่มีแถวใดเลย", buildApprovalRows(everything, hidden).length, 0);
  const shown = buildApprovalRows(everything, ctx("CMO", "Aran P."));
  is("แบรนด์ที่ดูแล = มีแถว", shown.length > 0, true);
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

console.log("\n— Storyboard: รอคนขอเปิดงานตัดสิน —");
{
  const sb = req({ id: 9, type: "VDO Editing", requiredVideo: true, deliverables: [],
    storyboardOwner: "Nok W.", storyboardStatus: "Submitted",
    storyboardSubmittedBy: "Nok W.", storyboardSubmittedAt: "2026-08-05T00:00:00Z" });
  const asRequester = selectGraphicApprovals([sb], ctx("Marketing Manager / BGL", "Ken S."));
  is("มีแถว storyboard", asRequester.length, 1);
  is("ผู้ขอเปิดงานกดได้", asRequester[0].mine, true);
  is("นับอายุจากวันที่ส่ง", waitingDays(asRequester[0].waitingSince, Date.parse("2026-08-08T00:00:00Z")), 3);
  const other = selectGraphicApprovals([sb], ctx("Creative Leader", "Boss L."));
  is("คนอื่นเห็นแต่กดไม่ได้", other.length === 1 && other[0].mine === false, true);
  is("…และบอกว่ารอใคร", other[0].waitingOn, "Ken S.");
}

console.log("\n— KOL / งบ: รอคนที่ถูกมอบหมาย —");
{
  const task = (over: Record<string, unknown>) => ({
    id: 71, title: "Tokyo Tom proposal", assignee: "Aran P.", status: "Need Approval",
    brand: "TEPPEN", campaign: "Wagyu Festival", approvalKind: "kolProposal", relatedKolId: 5, ...over,
  }) as never;
  const asApprover = buildApprovalRows({ ...empty, kol: [task({})] }, ctx("CMO", "Aran P."));
  is("คนที่ถูกมอบหมายกดได้", asApprover[0]?.mine, true);
  const other = buildApprovalRows({ ...empty, kol: [task({})] }, ctx("CMO", "Ken S."));
  is("คนอื่นเห็นแต่กดไม่ได้", other.length === 1 && other[0].mine === false, true);
  is("…และบอกว่ารอใคร", other[0]?.waitingOn, "Aran P.");
  // งานที่ทำเสร็จแล้วต้องไม่ค้างอยู่ในคิว
  const done = buildApprovalRows({ ...empty, kol: [task({})] },
    ctx("CMO", "Aran P.", { doneIds: new Set([71]) }));
  is("งานที่ปิดแล้วหลุดจากคิว", done.length, 0);
}

console.log("\n— เงินเป็นข้อยกเว้น: ไม่ใช่ทุกคนที่เห็น —");
{
  const exp = { _id: 1, category: "Media", b: "teppen", campaign: "X", requested: 5000, approved: 0, status: "Waiting Approval", due: "—", createdAt: "2026-08-10T00:00:00Z" } as never;
  is("CMO กดได้", buildApprovalRows({ ...empty, expenses: [exp] }, ctx("CMO", "Aran P."))[0]?.mine, true);
  // สายที่เห็นยอดได้แต่ไม่ใช่คนอนุมัติ — เห็นว่ามีใบค้าง แต่กดไม่ได้
  const mm = buildApprovalRows({ ...empty, expenses: [exp] }, ctx("Marketing Manager / BGL", "Mei T."));
  is("สายที่เห็นยอดได้ เห็นใบค้าง", mm.length, 1);
  is("…แต่กดไม่ได้", mm[0]?.mine, false);
  // นี่คือข้อยกเว้นของกติกา "ทุกคนเห็นทุกอย่าง" — คนที่ไม่มีสิทธิ์เห็นยอด
  // ต้องไม่เห็นแม้แต่ว่ามีใบค้างอยู่ ไม่งั้นคิวกลายเป็นช่องรั่วที่สะดวก
  const staff = buildApprovalRows({ ...empty, expenses: [exp] }, ctx("Content Planner", "Ken S."));
  is("คนที่ไม่มีสิทธิ์เห็นยอด ไม่เห็นเลนเงินเลย", staff.length, 0);
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
    { kind: "campaign", key: "a", b: "teppen", campaign: "", waitingSince: "", mine: false, canAct: false, submittedBy: "", waitingOn: "CMO", c: {} as never },
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

console.log("\n— ตัวกรองแบรนด์ / แคมเปญ ที่หัวคิว —");
{
  const row = (over: Partial<ApprovalRow>): ApprovalRow => ({
    kind: "campaign", key: "k", b: "teppen", campaign: "Wagyu Festival",
    waitingSince: "", mine: false, canAct: false, submittedBy: "", waitingOn: "CMO", c: {} as never, ...over,
  } as ApprovalRow);

  // แบรนด์
  is("เลือกทุกแบรนด์ = ผ่านหมด", matchesApprovalBrand(row({}), "all"), true);
  is("แบรนด์ตรงกัน = ผ่าน", matchesApprovalBrand(row({}), "teppen"), true);
  is("แบรนด์ไม่ตรง = ไม่ผ่าน", matchesApprovalBrand(row({}), "omakase"), false);
  // แถวที่ต้นทางเก็บแบรนด์เป็น "ป้าย" ไม่ใช่ id (งาน KOL) — ถูกกรองสิทธิ์มาแล้วตั้งแต่ต้นทาง
  // ถ้ามาซ่อนตรงนี้อีก = ซ่อนงานเพราะอ่านแบรนด์ไม่ออก
  is("แถวที่ไม่มี brand id ไม่ถูกซ่อน", matchesApprovalBrand(row({ b: null }), "omakase"), true);

  // แคมเปญ
  is("เลือกทุกแคมเปญ = ผ่านหมด", matchesApprovalCampaign(row({}), "all"), true);
  is("แคมเปญตรงกัน = ผ่าน", matchesApprovalCampaign(row({}), "Wagyu Festival"), true);
  is("เทียบไม่สนตัวพิมพ์เล็กใหญ่", matchesApprovalCampaign(row({}), "wagyu festival"), true);
  is("แคมเปญอื่น = ไม่ผ่าน", matchesApprovalCampaign(row({}), "Songkran"), false);
  is("แถวที่ไม่มีแคมเปญ ไม่ใช่แคมเปญที่เลือก", matchesApprovalCampaign(row({ campaign: "" }), "Wagyu Festival"), false);

  // รายชื่อแคมเปญในตัวเลือก
  const names = approvalCampaigns([
    row({ campaign: "Wagyu Festival" }), row({ campaign: "wagyu festival" }),
    row({ campaign: "" }), row({ campaign: "—" }), row({ campaign: "Songkran" }),
  ]);
  is("ตัวเลือกไม่ซ้ำ (ไม่สนตัวพิมพ์)", names.length, 2);
  is("ตัวเลือกเรียงตามตัวอักษร", names[0], "Songkran");
  is("ไม่เอาแคมเปญว่างหรือขีด", names.includes("—"), false);
}

console.log("\n— ชื่อรายการแบบสั้น (ลิสต์ในกระดิ่ง) —");
{
  const rows = selectGraphicApprovals([req()], ctx("Creative Leader", "Boss L."));
  const artwork = rows.find((r) => r.kind === "artwork")!;
  // ชิ้นเดียวที่ต้องตรวจสองด้าน = สองแถว ถ้าไม่บอกด้าน ลิสต์สั้น ๆ จะอ่านเหมือนงานซ้ำ
  is("งานอาร์ตเวิร์กบอกชื่องาน + platform + ด้านที่ตรวจ", approvalTitle(artwork), "Wagyu KV · Instagram · ข้อมูล");
  const ciRow = rows.find((r) => r.kind === "artwork" && r.lens === "ci")!;
  is("อีกด้านชื่อไม่ซ้ำกัน", approvalTitle(ciRow), "Wagyu KV · Instagram · CI");
  is("แคปชั่นใช้ชื่อโพสต์", approvalTitle({
    kind: "caption", key: "c", b: "teppen", campaign: "W", waitingSince: "", mine: true, canAct: true, submittedBy: "", waitingOn: "—",
    post: { title: "โพสต์ข้าวหน้าปลา" } as never,
  } as ApprovalRow), "โพสต์ข้าวหน้าปลา");
  is("โพสต์ไม่มีชื่อ ไม่คืนค่าว่าง", approvalTitle({
    kind: "caption", key: "c", b: "teppen", campaign: "W", waitingSince: "", mine: true, canAct: true, submittedBy: "", waitingOn: "—",
    post: { title: "" } as never,
  } as ApprovalRow), "(ไม่มีชื่อโพสต์)");
  is("เบิกงบบอกหมวดกับแคมเปญ", approvalTitle({
    kind: "expense", key: "e", b: "teppen", campaign: "Wagyu", waitingSince: "", mine: true, canAct: true, submittedBy: "", waitingOn: "CMO",
    r: { category: "Media", campaign: "Wagyu" } as never,
  } as ApprovalRow), "Media · Wagyu");
  // แถวเบิกงบที่ไม่ผูกแคมเปญเก็บค่าเป็น "—" ไม่ใช่ค่าว่าง
  is("เบิกงบที่ไม่มีแคมเปญ ไม่ลากขีดมาโชว์", approvalTitle({
    kind: "expense", key: "e", b: "teppen", campaign: "—", waitingSince: "", mine: true, canAct: true, submittedBy: "", waitingOn: "CMO",
    r: { category: "Media", campaign: "—" } as never,
  } as ApprovalRow), "Media");
}

console.log("\n— คอลัมน์ ส่งโดย / ส่งวันที่ / Post date —");
{
  const g = req();
  const rows = selectGraphicApprovals([g], ctx("Creative Leader", "Boss L."));
  is("ส่งโดยอ่านจากคนที่ส่งชิ้นนั้น", rows[0].submittedBy, "Boss");
  // ส่งวันที่ใช้ฟิลด์เดียวกับที่นับ "รอมากี่วัน" — สองคอลัมน์นี้จะขัดกันเองไม่ได้
  is("ส่งวันที่คือวันเดียวกับที่เริ่มนับรอ", rows[0].waitingSince, submitted().submittedAt);
  is("ไม่รู้จัก Content Plan → ไม่เดา Post date", rows[0].postDate, undefined);

  // ผูกกับโพสต์แล้ว = รู้ว่าของชิ้นนี้ต้องออกวันไหน
  const post = { id: "p1", campaign: "Wagyu Festival", title: "Wagyu KV", dateIso: "2026-09-02", day: 2 } as never;
  const linked = selectGraphicApprovals([{ ...g, contentPostId: "p1" }], ctx("Creative Leader", "Boss L."), [post]);
  is("ผูกโพสต์แล้วได้ Post date", linked[0].postDate, "2026-09-02");

  // ลิงก์ที่ชี้ไปโพสต์ที่ไม่มีอยู่ = ลิงก์เสีย ไม่ใช่สัญญาณให้เดาต่อ
  const broken = selectGraphicApprovals([{ ...g, contentPostId: "ghost" }], ctx("Creative Leader", "Boss L."), [post]);
  is("ลิงก์เสีย → ไม่เดา Post date จากชื่อ", broken[0].postDate, undefined);

  // ดีไซเนอร์ยังไม่ได้ระบุชื่อบนชิ้นงาน → ถอยไปใช้ชื่อดีไซเนอร์ของใบงาน
  const noSubmitter = selectGraphicApprovals(
    [{ ...g, deliverables: [{ ...submitted(), submittedBy: "" }] }], ctx("Creative Leader", "Boss L."));
  is("ไม่มีชื่อคนส่งบนชิ้นงาน → ใช้ดีไซเนอร์ของใบงาน", noSubmitter[0].submittedBy, "Boss");
}

console.log("\n— ไฟล์เดียวหลาย platform = แถวเดียว —");
{
  // ไฟล์ 9:16 ตัวเดียวส่งลง 3 platform = 3 แถวในตาราง deliverables แต่เป็นงานชิ้นเดียว
  // ที่ต้องตรวจครั้งเดียว — applyLensVerdict fan ให้ทั้งกลุ่มอยู่แล้ว ถ้าคิวโชว์ 3 แถว
  // กดผ่านอันเดียวแล้วอีกสองอันหายไปเอง
  const threeWays = req({ deliverables: [
    submitted({ platform: "Facebook", size: "9:16 (1080×1920)" }),
    submitted({ platform: "Instagram", size: "9:16 (1080×1920)" }),
    submitted({ platform: "TikTok", size: "9:16 (1080x1920)" }),
  ] });
  const rows = selectGraphicApprovals([threeWays], ctx("Creative Leader", "Boss L."));
  is("สามแพลตฟอร์มยุบเหลือสองแถว (ด้านละหนึ่ง)", rows.length, 2);
  const info = rows.find((r) => r.kind === "artwork" && r.lens === "info");
  is("แถวเดียวบอกครบทุกแพลตฟอร์ม",
    info && info.kind === "artwork" ? info.platforms.join(",") : "—", "Facebook,Instagram,TikTok");

  // คนละไซซ์ = คนละไฟล์ = คนละงาน ต้องไม่ถูกยุบรวม
  const twoSizes = req({ deliverables: [
    submitted({ platform: "Facebook", size: "9:16 (1080×1920)" }),
    submitted({ platform: "Facebook", size: "1:1 (1080×1080)" }),
  ] });
  is("คนละไซซ์ยังแยกแถว", selectGraphicApprovals([twoSizes], ctx("Creative Leader", "Boss L.")).length, 4);

  // แถวที่เคยถูกเซ็นไว้ก่อนมีการ fan ต้องไม่ลากงานที่ยังค้างของพี่น้องหายไปด้วย
  const halfSettled = req({ deliverables: [
    submitted({ platform: "Facebook", size: "9:16 (1080×1920)", review: { ci: { verdict: "pass", by: "Boss L.", at: "2026-08-02T02:00:00Z" } } }),
    submitted({ platform: "Instagram", size: "9:16 (1080×1920)" }),
  ] });
  const mixed = selectGraphicApprovals([halfSettled], ctx("Creative Leader", "Boss L."));
  is("ด้าน CI ที่ยังค้างของอีกแถวไม่หายไป", mixed.some((r) => r.kind === "artwork" && r.lens === "ci"), true);
}

console.log("\n— ชื่อแพลตฟอร์มแบบสั้น —");
is("สามอันขึ้นครบ", platformLabel(["Facebook", "Instagram", "TikTok"]), "Facebook · Instagram · TikTok");
is("เกินสามอันย่อ", platformLabel(["Facebook", "Instagram", "TikTok", "LINE OA"]), "Facebook · Instagram +2");
is("ไม่มีเลยใช้ค่าสำรอง", platformLabel([], "Instagram"), "Instagram");

console.log("\n— แถวต้องบอกชื่อคนที่กดได้จริง —");
{
  const named = ctx("CMO", "Aran P.", { creativeLeader: "Pichayaporn", cmoName: "Gik" });
  const g = req({ requester: "Pichayaporn" });
  const rows = selectGraphicApprovals([g], named);
  is("ด้าน CI ปกติชี้ที่ Creative Leader",
    rows.find((r) => r.kind === "artwork" && r.lens === "ci")?.waitingOn, "Pichayaporn");

  // เคสที่รายงานมา: Creative Leader เป็นผู้ขอเปิดงานเอง เซ็นด้านข้อมูลไปแล้ว
  const blocked = req({
    requester: "Pichayaporn",
    deliverables: [submitted({ review: { info: { verdict: "pass", by: "Pichayaporn", at: "2026-08-26T09:00:00Z" } } })],
  });
  const ciRow = selectGraphicApprovals([blocked], named).find((r) => r.kind === "artwork" && r.lens === "ci");
  is("เซ็นอีกด้านไปแล้ว → แถวชี้ไปที่ CMO ไม่ใช่คนที่กดไม่ได้", ciRow?.waitingOn, "Gik");
  // ยังไม่รู้ชื่อใครเลย (member list ยังไม่มา) → ถอยไปใช้ชื่อ role เหมือนเดิม
  const anon = selectGraphicApprovals([blocked], ctx("CMO", "Aran P."))
    .find((r) => r.kind === "artwork" && r.lens === "ci");
  is("ยังไม่รู้ชื่อ → ใช้ชื่อตำแหน่งเหมือนเดิม", anon?.waitingOn, "Creative Leader");
}

console.log(`\n${fail === 0 ? "✓" : "✗"} approval inbox: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
