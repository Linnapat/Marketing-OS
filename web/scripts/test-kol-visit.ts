/* วันไปร้านของ KOL + การเปลี่ยนเพจแทนคนที่ยกเลิก
 *
 * วันไปร้านไม่ใช่วันโพสต์ และไม่ใช่ `visits` (ซึ่งนับลูกค้าที่โพสต์พามา) —
 * เป็นนัดของตัวเองที่สาขาต้องจัดคนรอ เดิมอยู่ใน LINE อย่างเดียว ระบบจึงตอบ
 * ไม่ได้ว่า "สัปดาห์นี้ใครจะมา" และคนที่เงียบหายไปไม่มาเลย หน้าตาเหมือนกับ
 * คนที่แค่ยังไม่ถึงกำหนดโพสต์
 * Run: node --import tsx scripts/test-kol-visit.ts */

import { visitStateOf, visitOverdue, visitSummary, VISIT_META } from "../src/lib/data/kolVisit";
import { replaceCreator } from "../src/lib/kolFlow";
import type { Kol } from "../src/lib/data/kol";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const k = (over: Partial<Kol>) => over as Kol;
const TODAY = "2026-08-19";

console.log("— สถานะการไปร้าน: derive ไม่ใช่บังคับให้กรอกสองช่อง —");
is("ไม่มีอะไรเลย = ยังไม่นัด", visitStateOf(k({})), "unscheduled");
is("มีวันนัด ไม่ได้ตั้งสถานะ = นัดแล้ว", visitStateOf(k({ visitDate: "2026-08-25" })), "scheduled");
is("ตั้งสถานะแล้ว สถานะชนะ", visitStateOf(k({ visitDate: "2026-08-25", visitStatus: "visited" })), "visited");
// no-show เป็นข้อเท็จจริง แม้ไม่เคยกรอกวัน
is("ไม่มาตามนัด แม้ไม่มีวันที่ ก็ยังนับ", visitStateOf(k({ visitStatus: "no_show" })), "no_show");
is("วันว่าง ๆ (ช่องว่าง) ไม่นับว่านัดแล้ว", visitStateOf(k({ visitDate: "   " })), "unscheduled");

console.log("\n— นัดไว้แล้วเลยวัน แต่ไม่มีใครบอกว่าเกิดอะไรขึ้น —");
is("เลยวันนัดแล้วยังไม่สรุป = ต้องตาม", visitOverdue(k({ visitDate: "2026-08-10" }), TODAY), true);
is("วันนี้พอดี ยังไม่เลย", visitOverdue(k({ visitDate: TODAY }), TODAY), false);
is("นัดวันหน้า ไม่ต้องตาม", visitOverdue(k({ visitDate: "2026-08-25" }), TODAY), false);
// สามสถานะนี้คือคำตอบแล้ว ไม่ใช่เรื่องค้าง
is("ไปแล้ว = ไม่ค้าง", visitOverdue(k({ visitDate: "2026-08-10", visitStatus: "visited" }), TODAY), false);
is("ไม่มาตามนัด = ไม่ค้าง (ตอบแล้ว)", visitOverdue(k({ visitDate: "2026-08-10", visitStatus: "no_show" }), TODAY), false);
is("ยกเลิกนัด = ไม่ค้าง", visitOverdue(k({ visitDate: "2026-08-10", visitStatus: "cancelled" }), TODAY), false);
is("ไม่เคยนัด = ไม่ค้าง", visitOverdue(k({}), TODAY), false);

console.log("\n— ข้อความสรุปในแถวรายการ —");
is("ยังไม่นัด", visitSummary(k({}), TODAY), VISIT_META.unscheduled.label);
is("นัดอนาคต", visitSummary(k({ visitDate: "2026-08-25" }), TODAY), "2026-08-25 · นัดแล้ว");
is("ไปแล้ว", visitSummary(k({ visitDate: "2026-08-10", visitStatus: "visited" }), TODAY), "2026-08-10 · ไปแล้ว");
is("เลยวันนัดแล้วยังไม่สรุป", visitSummary(k({ visitDate: "2026-08-10" }), TODAY), "2026-08-10 · เลยวันนัดแล้ว ยังไม่ระบุว่ามาไหม");

console.log("\n— KOL ยกเลิก แล้วเอาเพจอื่นมาแทนในสล็อตเดิม —");
{
  const booked = k({
    id: 1, name: "แก้วใบใหญ่กินอะไรวันนี้", h: "@kaewbaiyai", plat: "TikTok", followers: 120000,
    campaign: "Fuji Don (USP)", b: "mainichi", branch: "Ekkamai",
    fee: 14000, foodCost: 1414, totalCost: 15414,
    quotationStatus: "Approved", approvedAmount: 15414, approvedBy: "Pupay", approvedAt: "2026-08-19T08:16:47Z",
    contractStatus: "Signed", proposalApprovalTaskId: 1787126893968,
    postLink: "tiktok.com/@kaewbaiyai/video/1", postedDate: "2026-08-18", actualReach: 90000,
    visitDate: "2026-08-20", visitStatus: "scheduled",
    history: [{ type: "approved", at: "2026-08-19T08:16:47Z", by: "Pupay" }],
  });
  const after = replaceCreator(booked, { name: "lallapamm", handle: "@lallapamm", platform: "Instagram", followers: 80000, masterKolId: "m-2", reason: "KOL ยกเลิก ติดคิวงานอื่น" }, "Ninew", "2026-08-19T10:00:00Z");

  is("คนใหม่เข้าสล็อต", `${after.name}|${after.h}|${after.plat}`, "lallapamm|@lallapamm|Instagram");
  // สล็อตคือสิ่งที่ตั้งงบไว้ — งบ/แคมเปญ/แบรนด์/สาขา ไม่เปลี่ยน
  is("งบและสล็อตยังเดิม", `${after.totalCost}|${after.campaign}|${after.b}|${after.branch}`, "15414|Fuji Don (USP)|mainichi|Ekkamai");

  // การอนุมัติไม่โอนตามสล็อต — คนอนุมัติต้องเห็นชื่อใหม่
  is("ตกกลับเป็นรออนุมัติ", after.quotationStatus, "Pending Approval");
  is("ล้างหลักฐานอนุมัติของคนเดิม", [after.approvedAmount, after.approvedBy, after.approvedAt], [undefined, undefined, undefined]);
  is("ออก task ใหม่ ไม่ชี้ของเดิมที่ติ๊กจบแล้ว", after.proposalApprovalTaskId, undefined);
  is("สัญญาตามคนไปด้วย", after.contractStatus, "Pending");

  // ผลงานของคนที่ออกไป ไม่ใช่ของคนใหม่
  is("ล้างผลงานเดิม", [after.postLink, after.postedDate, after.actualReach, after.posts], [null, null, 0, []]);
  is("ล้างนัดไปร้านของคนเดิม", [after.visitDate, after.visitStatus], [undefined, undefined]);

  // ประวัติต้องบอกได้ว่าใครถูกแทน ใครแทน ใครสั่ง และเพราะอะไร
  const ev = after.history![after.history!.length - 1];
  is("บันทึกการเปลี่ยนตัวไว้ในประวัติ",
    [ev.type, ev.from, ev.to, ev.by, ev.note],
    ["creator_replaced", "แก้วใบใหญ่กินอะไรวันนี้", "lallapamm", "Ninew", "KOL ยกเลิก ติดคิวงานอื่น"]);
  is("ประวัติเดิมไม่หาย", after.history!.length, 2);
  is("ไม่แก้แถวต้นฉบับ", booked.name, "แก้วใบใหญ่กินอะไรวันนี้");

  // ไม่ใส่ชื่อใหม่ = ไม่เปลี่ยนชื่อทิ้ง
  const noName = replaceCreator(booked, { name: "   " }, "Ninew", "2026-08-19T10:00:00Z");
  is("ชื่อว่างไม่ล้างชื่อเดิม", noName.name, "แก้วใบใหญ่กินอะไรวันนี้");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
