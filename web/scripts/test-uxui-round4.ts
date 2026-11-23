/* UX/UI round 4 — Hold and delete from the approval queue.
 * Three paths: hold then bring back · delete (to Trash, never destroyed) ·
 * other roles get no button.
 * Run: node --import tsx scripts/test-uxui-round4.ts */
import {
  canHoldOrDelete, holdReasonValid, holdPost, resumePost, holdGraphic, resumeGraphic, isHeld,
  deleteReasonText, deleteSummary, cancelPostWithRequest,
} from "../src/lib/data/approvalHold";
import { buildApprovalRows, selectGraphicApprovals, countByKind, type ApprovalCtx } from "../src/lib/data/approvals";
import { isPostOverdue, type ContentItem } from "../src/lib/data/content";
import { computeGraphicOverdue, emptyDeliverable, type Graphic } from "../src/lib/data/graphic";
import { graphicItems, contentItems } from "../src/lib/data/statusBoard";
import { deleteFromQueue, holdFromQueue, resumeFromQueue, canHoldRow } from "../src/lib/approvalActions";
import { personKeys } from "../src/lib/identity";
import { ROLES } from "../src/lib/role";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const AT = "2026-11-23T03:00:00.000Z";
const REASON = "รอราคาใหม่จากสาขา";
const post = (o: Partial<ContentItem> = {}) => ({
  id: "p1", day: 10, dateIso: "2026-11-10", time: "10:00", title: "Payday", b: "teppen", plat: "Facebook", status: "Draft",
  campaign: "C", owner: "Ninew", requester: "Pupay", caption: "ข้อความ", hashtags: "", cta: "",
  captionStatus: "Ready", assetStatus: "Approved", approvalStatus: "Draft", publishStatus: "Queued", createdAt: "2026-10-20T00:00:00Z", ...o,
} as ContentItem);
const req = (o: Partial<Graphic> = {}): Graphic => ({
  id: 77, stage: "Waiting Feedback", title: "Kaisen Don — Photo album", b: "teppen", campaign: "C", due: "Nov 1", dueIso: "2026-11-01",
  designer: "Jungjing", requester: "Pupay", approver: "Gik", type: "Photo album", priority: "High", fb: 0, openFb: 0, isOverdue: false,
  briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: null, nextAction: "—", platform: "Instagram", size: "1:1 (1080×1080)",
  contentItem: "—", code: "TPN_2611_001-C24-A01",
  deliverables: [{ ...emptyDeliverable("Instagram", "1:1 (1080×1080)"), assetLink: "https://x/a.png", status: "Waiting review", version: 1, submittedBy: "Jungjing", submittedAt: "2026-10-21T02:00:00Z" }],
  ...o,
} as Graphic);
const ctx = (role: string, me: string): ApprovalCtx => ({
  myKeys: personKeys({ name: me }), me, role, canApproveCampaign: role === "CMO", canApproveExpense: role === "CMO",
  canSeeSpending: true, canEditContentPlan: /CMO|Marketing/.test(role), isVisible: () => true, canSeeBrandLabel: () => true, doneIds: new Set<number>(),
});
const empty = { captions: [], graphics: [], campaigns: [], requests: [], expenses: [], kol: [] };

async function main() {
  console.log("\n— เส้นทาง 3: ใครเห็นปุ่ม —");
  is("CMO และ Creative Leader เห็น", [canHoldOrDelete("CMO"), canHoldOrDelete("Creative Leader")], [true, true]);
  is("ตำแหน่งอื่นทุกตำแหน่งไม่เห็น", ROLES.filter((r) => r !== "CMO" && r !== "Creative Leader").map(canHoldOrDelete).some(Boolean), false);
  is("role ว่าง = ไม่เห็น", canHoldOrDelete(""), false);
  is("เหตุผลต้องอย่างน้อย 10 ตัวอักษร", [holdReasonValid("สั้นไป"), holdReasonValid("   เว้นวรรค   "), holdReasonValid(REASON)], [false, false, true]);

  console.log("\n— เส้นทาง 1: Hold แล้วนำกลับ (โพสต์) —");
  const held = holdPost(post(), REASON, "Gik", AT);
  is("Publish เป็น Hold พร้อมเหตุผล", [held.publishStatus, held.publishStatusReason], ["Hold", REASON]);
  is("จำสถานะเดิมไว้", held.approvalHold?.prevPublishStatus, "Queued");
  is("บันทึกว่าใคร เมื่อไร", [held.approvalHold?.by, held.approvalHold?.at], ["Gik", AT]);
  is("ลงประวัติการแก้ไข", held.changeLog?.at(-1)?.by, "Gik");
  is("Hold ซ้ำไม่ทับของเดิม", holdPost(held, "เหตุผลใหม่ที่ยาวพอ", "X", AT).approvalHold?.reason, REASON);
  is("ระหว่าง Hold ไม่นับว่าเลยวันโพสต์", isPostOverdue(held, "2026-11-23"), false);
  const back = resumePost(held, "Gik");
  is("นำกลับ: สถานะเดิมกลับมา", [back.publishStatus, back.approvalHold, back.publishStatusReason], ["Queued", undefined, undefined]);
  is("…และกลับมานับว่าเลยวันตามจริง", isPostOverdue(back, "2026-11-23"), true);
  is("ถ้าระหว่างนั้นมีคนเปลี่ยนสถานะเอง ไม่ทับ", resumePost({ ...held, publishStatus: "Cancelled" }, "Gik").publishStatus, "Cancelled");

  console.log("\n— เส้นทาง 1: Hold แล้วนำกลับ (ใบงาน + คิวอนุมัติ) —");
  const g = req();
  const cl = ctx("Creative Leader", "Peach");
  const before = selectGraphicApprovals([g], cl);
  is("ก่อน Hold: อยู่ในคิว และนับ", [before.length > 0, countByKind(before).artwork + countByKind(before).photo + countByKind(before).vdo > 0], [true, true]);
  const hg = holdGraphic(g, REASON, "Peach", AT);
  is("stage ของใบงานไม่ถูกแตะ", hg.stage, g.stage);
  is("มีข้อความบนใบงานบอกเหตุผล", hg.notices?.at(-1)?.text.includes(REASON), true);
  is("ระหว่าง Hold ใบงานไม่เลยกำหนด", [computeGraphicOverdue(g, new Date("2026-11-23")), computeGraphicOverdue(hg, new Date("2026-11-23"))], [true, false]);
  const during = selectGraphicApprovals([hg], cl);
  is("ทุกแถวของใบงานถูกพักไว้", during.length > 0 && during.every((r) => !!r.held), true);
  is("…ไม่เป็นของใคร ไม่มีปุ่มตัดสิน", [during.some((r) => r.mine), during.some((r) => r.canAct)], [false, false]);
  is("…ไม่นับในตัวเลขรออนุมัติ", Object.values(countByKind(during)).reduce((a, b) => a + b, 0), 0);
  is("…เหตุผล คนกด วันที่ ตามไปด้วย", [during[0].held?.reason, during[0].held?.by, during[0].held?.at], [REASON, "Peach", AT]);
  const sb = graphicItems([hg])[0];
  is("Status Board ขึ้น Hold และไม่มีวันให้เลย", [sb.rawStatus.startsWith("Hold"), sb.dueIso], [true, undefined]);
  is("โพสต์ที่ Hold บน Status Board ไม่มีวันให้เลย", contentItems([held])[0].dueIso, undefined);
  const after = selectGraphicApprovals([resumeGraphic(hg, "Peach")], cl);
  is("นำกลับ: กลับเข้าคิวเดิมครบ", [after.length, after.some((r) => !!r.held)], [before.length, false]);
  const cap = buildApprovalRows({ ...empty, captions: [held] }, ctx("Marketing Executive", "Pupay"));
  is("Caption ของโพสต์ที่ Hold ก็ออกจากคิว", [cap.length, !!cap[0]?.held, countByKind(cap).caption], [1, true, 0]);

  console.log("\n— เส้นทาง 2: ลบงาน —");
  is("เลือกเหตุผลสำเร็จรูป", deleteReasonText("ยกเลิกแคมเปญ", ""), "ยกเลิกแคมเปญ");
  is("อื่น ๆ ต้องกรอกเอง", [deleteReasonText("อื่น ๆ", "  "), deleteReasonText("อื่น ๆ", "ลูกค้าขอถอน")], ["", "ลูกค้าขอถอน"]);
  is("ยังไม่เลือก = ยังลบไม่ได้", deleteReasonText("", "x"), "");
  const sum = deleteSummary(g, true).join(" | ");
  is("หน้าต่างยืนยันบอกชื่องานและเลขงาน", sum.includes(g.title) && sum.includes("TPN_2611_001-C24-A01"), true);
  is("…บอกว่าไปถังขยะ กู้คืนได้ และแคมเปญไม่ถูกลบ", ["ถังขยะ", "กู้คืนได้", "แคมเปญไม่ถูกลบ"].every((w) => sum.includes(w)), true);
  const cancelled = cancelPostWithRequest(held, "ยกเลิกแคมเปญ", "Gik");
  is("ยกเลิกโพสต์ด้วย = Cancelled (ไม่ถูกลบ)", [cancelled.publishStatus, cancelled.publishStatusReason, isHeld(cancelled)], ["Cancelled", "ยกเลิกแคมเปญ", false]);

  // The actions themselves, with no database configured (demo mode): nothing
  // real can be written, and moveToTrash reports success without touching one.
  const row = before[0];
  is("แถวอาร์ตเวิร์กและ caption Hold/ลบได้", [canHoldRow(row), canHoldRow(cap[0])], [true, true]);
  const h = await holdFromQueue(row, REASON, "Peach");
  is("action Hold คืนใบงานที่ถูกพัก", [h.graphics.length, isHeld(h.graphics[0]), h.removedGraphicIds.length], [1, true, 0]);
  const r2 = await resumeFromQueue({ ...row, g: h.graphics[0], held: h.graphics[0].approvalHold } as typeof row, "Peach");
  is("action นำกลับ คืนใบงานที่ไม่ถูกพัก", isHeld(r2.graphics[0]), false);
  const d = await deleteFromQueue(row, "งานไม่ผ่าน ไม่ทำต่อ", "Peach", false);
  is("action ลบ: ใบงานถูกย้ายออก (ผ่าน Trash) และไม่มีโพสต์ถูกแตะเมื่อเลือกเก็บ", [d.removedGraphicIds, d.posts.length], [[77], 0]);
  const dc = await deleteFromQueue(cap[0], "ยกเลิกแคมเปญ", "Gik", true);
  is("action ลบ caption + ยกเลิกโพสต์ = โพสต์ Cancelled", [dc.posts[0]?.publishStatus, dc.removedGraphicIds.length], ["Cancelled", 0]);
  const dk = await deleteFromQueue(cap[0], "งานไม่ผ่าน ไม่ทำต่อ", "Gik", false);
  is("action ลบ caption + เก็บโพสต์ = ถอนจากคิว ข้อความยังอยู่", [dk.posts[0]?.captionStatus, dk.posts[0]?.caption, dk.posts[0]?.publishStatus], ["Draft", "ข้อความ", "Hold"]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
