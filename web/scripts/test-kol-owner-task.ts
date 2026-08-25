/* งาน KOL ต้องเข้า My Tasks ของคนที่รับผิดชอบ
 *
 * บั๊กที่ชุดนี้กันไม่ให้กลับมา: KOL สร้าง task ให้คนเดียวคือ "คนอนุมัติ"
 * (Approve KOL proposal — …) ส่วนคนที่ลงมือทำจริง — หาครีเอเตอร์ เจรจาค่าตัว
 * ส่งบรีฟ ตามงาน กรอกผลลัพธ์ — ไม่เคยมีแถวเลย คิวของเขาอยู่แค่ในหน้า KOL
 * ซึ่งเป็นรายการ "ดีล" ไม่ใช่รายการ "สิ่งที่ต้องทำต่อ"
 *
 * Run with:  npm test */

import { kolAssignmentTask, kolTaskId, type Kol } from "../src/lib/data/kol";
import { STATUS_ORDER } from "../src/components/work/WorkViews";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const kol = (over: Partial<Kol> = {}): Kol => ({
  id: 501, name: "Nong Aim", h: "@nongaim.eats", plat: "Instagram", b: "teppen",
  branch: "Thonglor", campaign: "Wagyu Festival", kolType: "Food Blogger",
  followers: 320000, expectedReach: 0, actualReach: 0, visits: 0,
  fee: 45000, foodCost: 5000, totalCost: 50000,
  owner: "Ken S.", ownerTeam: "KOL Team", pendingApprover: "Aran P.",
  currentBlocker: null, status: "Negotiating", waitingSince: null,
  postDueDate: "Jun 28", postedDate: null, openComments: 0, latestComment: "",
  isOverdue: false, couponCode: null, contractStatus: "Pending", quotationStatus: "Pending",
  invoiceStatus: "Not issued", paymentStatus: "Not started", financeReqId: "—", paymentDue: "TBD",
  ...over,
} as Kol);

const t = (over: Partial<Kol> = {}) => kolAssignmentTask(kol(over));

console.log("\n— งานเข้า Task ของเจ้าของดีล —");
{
  const row = t()!;
  is("มีแถวให้เจ้าของ", row.assignee, "Ken S.");
  is("ไม่ใช่ของคนอนุมัติ", row.assignee === kol().pendingApprover, false);
  is("ผูกกลับไปที่ดีล", [row.relatedKolId, row.kolSlot], [501, "work"]);
  is("id ตั้งต้นคาดเดาได้", row.id, kolTaskId(501));
  is("ขึ้นโมดูล KOL", [row.module, row.type], ["KOL", "KOL"]);
  is("due = วันครบกำหนดโพสต์", row.due, "Jun 28");
  is("ชื่อบอกว่าเป็นใคร", row.title, "KOL: Nong Aim (@nongaim.eats)");
}

console.log("\n— ยังไม่มีเจ้าของ = ยังไม่มีแถว —");
is("owner ว่าง", t({ owner: "" }), null);
is('owner = "Unassigned"', t({ owner: "Unassigned" }), null);
is('owner = "—"', t({ owner: "—" }), null);

console.log("\n— next action บอกสิ่งที่ต้องทำ ไม่ใช่ชื่อ stage —");
is("Request", t({ status: "Request" })!.nextAction, "หาและติดต่อ Nong Aim");
is("Negotiating", t({ status: "Negotiating" })!.nextAction, "เจรจาค่าตัวและเงื่อนไข");
is("Contract Signed", t({ status: "Contract Signed" })!.nextAction, "ส่งบรีฟให้ครีเอเตอร์");
is("Producing", t({ status: "Content Creating" })!.nextAction, "ติดตามงานจากครีเอเตอร์");
is("Approved", t({ status: "Approved to Post" })!.nextAction, "ยืนยันวันโพสต์กับครีเอเตอร์");
is("Posted", t({ status: "Posted" })!.nextAction, "กรอกผลลัพธ์ (reach / engagement / visits)");
// stage ดิบที่ map เข้า In Review ต้องได้คำตอบเดียวกัน ไม่ใช่ตกไป default
is("Draft Submitted = In Review", t({ status: "Draft Submitted" })!.nextAction, "รอ Aran P. ตรวจงาน");
is("Waiting Review = In Review", t({ status: "Waiting Review" })!.nextAction, "รอ Aran P. ตรวจงาน");

console.log("\n— status = stage ของดีล เพื่อให้ List view กรุ๊ปตาม stage ได้ —");
// เดิมทุกแถวเป็น "Todo" เหมือนกันหมด specialist ที่ถือ 40 ดีลเลยเห็นกองเดียว
// แทนที่จะเห็น "12 Negotiating · 8 Producing · 5 In Review"
is("Negotiating", t({ status: "Negotiating" })!.status, "Negotiating");
is("Producing (จาก legacy Content Creating)", t({ status: "Content Creating" })!.status, "Producing");
is("In Review (จาก legacy Draft Submitted)", t({ status: "Draft Submitted" })!.status, "In Review");
is("Posted", t({ status: "Posted" })!.status, "Posted");
is("Paused", t({ status: "Paused" })!.status, "Paused");
// สองอันนี้ทับ stage เพราะความเร่งด่วนสำคัญกว่าว่าอยู่ขั้นไหน
is("จบแล้วอ่านว่า Done ไม่ใช่ Completed", t({ status: "Completed" })!.status, "Done");
is("เลยกำหนดอ่านว่า Stuck ไม่ใช่ stage", t({ status: "Negotiating", isOverdue: true })!.status, "Stuck");

console.log("\n— รอคนอื่นอยู่ ต้องไม่ตะโกนอยู่ใน Do First —");
is("In Review ไปอยู่ waitingMe", t({ status: "In Review" })!.group, "waitingMe");
is("Paused ก็รอเหมือนกัน", t({ status: "Paused" })!.group, "waitingMe");
is("Negotiating อยู่ Do First", t({ status: "Negotiating" })!.group, "doFirst");

console.log("\n— ติดปัญหา / เลยกำหนด —");
{
  const blocked = t({ currentBlocker: "Fee negotiation" })!;
  is("blocker ขึ้นแทน next action", blocked.nextAction, "Fee negotiation");
  is("blocker ติดมากับแถว", blocked.blocker, "Fee negotiation");
  const late = t({ isOverdue: true })!;
  is("เลยกำหนด = Stuck", [late.status, late.group], ["Stuck", "stuck"]);
  is("…และเด้งเป็น High", late.priority, "High");
  is("ปกติเป็น Med", t()!.priority, "Med");
}

console.log("\n— ดีลที่จบแล้ว ปิดแถว ไม่ใช่ทิ้งค้าง —");
{
  const done = t({ status: "Completed" })!;
  is("Completed = Done", [done.status, done.group], ["Done", "done"]);
  // Reporting map เข้า Completed ด้วย
  is("Reporting ก็ถือว่าจบ", t({ status: "Reporting" })!.status, "Done");
  // เคยตกไป default ว่า "ติดตามงาน KOL" บนดีลที่ปิดไปตั้งแต่เดือนพฤษภาคม
  is("ดีลที่จบแล้วไม่บอกให้ไปตามงาน", done.nextAction, "จบงานแล้ว — ผลลัพธ์บันทึกครบ");
  // Posted ยังไม่จบ — ต้องกรอกผลลัพธ์ก่อน
  is("Posted ยังไม่จบ", t({ status: "Posted" })!.group, "doFirst");
}

console.log("\n— List view จัดกลุ่มตาม stage ตามลำดับ pipeline —");
{
  // ถ้าไม่ประกาศ stage ไว้ใน STATUS_ORDER มันจะตกท้ายแถวแล้วเรียงตามตัวอักษร
  // บอร์ดของ specialist จะอ่านว่า Contract Signed → In Review → Negotiating
  // → Owner Assigned ซึ่งคือ pipeline ที่สับไพ่แล้ว
  const rank = (x: string) => STATUS_ORDER.indexOf(x);
  const pipeline = ["Request", "Owner Assigned", "Negotiating", "Contract Signed", "Producing", "In Review", "Approved", "Posted"];
  is("ทุก stage มีที่ทางของตัวเอง", pipeline.filter((x) => rank(x) === -1), []);
  is("เรียงตาม pipeline ไม่ใช่ตามตัวอักษร",
    pipeline.slice().sort((a, b) => rank(a) - rank(b)), pipeline);
  is("Stuck อยู่เหนือทุก stage", rank("Stuck") < rank("Request"), true);
  is("Done อยู่ท้ายสุด", rank("Done"), STATUS_ORDER.length - 1);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} KOL owner task: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
