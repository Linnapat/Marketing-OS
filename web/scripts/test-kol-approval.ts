/* การอนุมัติ proposal ของ KOL = อนุมัติ "จำนวนเงิน" ไม่ใช่ธงบนแถว
 *
 * เคสจริงบน production 19 ส.ค. 69: 3 proposal ค้างที่ "Pending Approval" ทั้งที่
 * มีหลักฐานว่าถูกอนุมัติแล้ว (approvedBy=Pupay + approvedAmount) — ใบหนึ่งถูก
 * อนุมัติ 3 รอบ เพราะทุกครั้งที่กด "Submit Profile & Proposal" ซ้ำ (แก้ handle /
 * วันโพสต์ / เบอร์ติดต่อ) ปุ่มเขียน quotationStatus กลับเป็น Pending Approval
 * แบบไม่มีเงื่อนไข และ task ขออนุมัติสร้างเฉพาะตอนยังไม่มี task = ไม่มีใครถูกถาม
 * Run: node --import tsx scripts/test-kol-approval.ts */

import { committedAmount, hasApprovalOnRecord, approvalCoversAmount, quotationStateFor } from "../src/lib/kolFlow";
import type { Kol } from "../src/lib/data/kol";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
const k = (over: Partial<Kol>) => over as Kol;

console.log("— committedAmount: ยอดที่ผูกพันจริง = ค่าตัว + ค่าอาหาร —");
is("ใช้ totalCost เมื่อมี", committedAmount(k({ totalCost: 15414, fee: 14000, foodCost: 1414 })), 15414);
is("ไม่มี totalCost → บวกเอง (แถวเก่า)", committedAmount(k({ fee: 14000, foodCost: 1414 })), 15414);
is("ดีลแลกของ ค่าตัว 0 แต่มีค่าอาหาร", committedAmount(k({ fee: 0, foodCost: 1414 })), 1414);
is("ไม่มีอะไรเลย = 0", committedAmount(k({})), 0);

console.log("\n— อ่านจากหลักฐาน ไม่ใช่จากคำว่าสถานะ (สถานะคือสิ่งที่ถูกเขียนทับ) —");
is("มี approvedAt = เคยอนุมัติ", hasApprovalOnRecord(k({ approvedAt: "2026-08-19T08:16:47Z" })), true);
is("มีแต่ approvedAmount ก็นับ", hasApprovalOnRecord(k({ approvedAmount: 15414 })), true);
is("ไม่มีหลักฐานเลย", hasApprovalOnRecord(k({ quotationStatus: "Approved" })), false);

console.log("\n— เคสจริง: แก้โปรไฟล์แล้วกดส่งซ้ำ ต้องไม่ล้างการอนุมัติ —");
{
  // แถวจริง: แก้วใบใหญ่กินอะไรวันนี้ · อนุมัติ ฿15,414 โดย Pupay
  const approved = k({
    quotationStatus: "Pending Approval",   // สิ่งที่ปุ่มเขียนทับไว้
    approvedAt: "2026-08-19T08:16:47.245Z", approvedBy: "Pupay", approvedAmount: 15414,
    fee: 14000, foodCost: 1414, totalCost: 15414,
  });
  is("การอนุมัติยังครอบยอดปัจจุบัน", approvalCoversAmount(approved), true);
  is("สถานะที่ถูกต้องคือ Approved ไม่ใช่ Pending", quotationStateFor(approved).status, "Approved");
  is("ไม่ต้องขออนุมัติใหม่", quotationStateFor(approved).needsReapproval, false);
}

console.log("\n— แต่ถ้ายอดขยับหลังอนุมัติ ต้องขออนุมัติใหม่จริง ๆ —");
{
  const raised = k({
    quotationStatus: "Approved",
    approvedAt: "2026-08-19T08:16:47.245Z", approvedBy: "Pupay", approvedAmount: 15414,
    fee: 20000, foodCost: 1414, totalCost: 21414,
  });
  is("ยอดไม่ตรงกับที่อนุมัติ", approvalCoversAmount(raised), false);
  is("ต้องตกกลับเป็น Pending Approval", quotationStateFor(raised).status, "Pending Approval");
  is("และต้องขออนุมัติใหม่", quotationStateFor(raised).needsReapproval, true);

  // ลดยอดก็ต้องถามใหม่เหมือนกัน — คนอนุมัติตกลงกับ "ดีลนี้" ไม่ใช่ "เพดานนี้"
  const lowered = k({ ...raised, fee: 9000, totalCost: 10414 });
  is("ลดยอดก็ต้องขออนุมัติใหม่", quotationStateFor(lowered).needsReapproval, true);
}

console.log("\n— แถวเก่าที่ไม่มี approvedAmount ต้องไม่ถูกเปิดใหม่โดยไม่มีเหตุ —");
{
  const legacy = k({ quotationStatus: "Approved", approvedAt: "2026-08-05T06:59:08Z", fee: 16000, totalCost: 16000 });
  is("ไม่มียอดให้เทียบ = ถือว่ายังครอบ", approvalCoversAmount(legacy), true);
  is("คงเป็น Approved", quotationStateFor(legacy).status, "Approved");
}

console.log("\n— ยังไม่เคยอนุมัติ = ปล่อยสถานะเดิมไว้ ไม่ไปเดาแทน —");
{
  is("Pending คงเป็น Pending", quotationStateFor(k({ quotationStatus: "Pending", fee: 5000 })).status, "Pending");
  is("Received คงเป็น Received", quotationStateFor(k({ quotationStatus: "Received", fee: 5000 })).status, "Received");
  is("รอการอนุมัติรอบแรก ไม่นับว่าต้องขอใหม่",
    quotationStateFor(k({ quotationStatus: "Pending Approval", fee: 5000 })).needsReapproval, false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
