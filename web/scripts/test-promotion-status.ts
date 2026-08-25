/* The Status column on Promotion Summary Print — the sheet that goes on a wall.
 * Store staff read it to decide whether a promotion is on today, so the one
 * thing it must never say is that something ended before it started. That is
 * exactly what it said: a campaign someone had marked "Completed" printed
 * "จบแล้ว" while its flight was still a week out, because the column trusted
 * the campaign's workflow state instead of its dates.
 * Run with:  npm test   (chained after test-flows.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { printedStatus, type OmdStorePromotion, type OmdStorePromotionStatus } from "../src/lib/data/omdStorePromotions";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${String(actual)}\n      expected: ${String(expected)}`); }
}

const TODAY = "2026-08-25";
const at = (status: OmdStorePromotionStatus, startDate: string, endDate?: string) =>
  printedStatus({ status, startDate, endDate } as Pick<OmdStorePromotion, "status" | "startDate" | "endDate">, TODAY);

console.log("— ยังไม่ถึงวันเริ่ม —");
// The bug, in one line: the campaign in the report ran 1 Sep – 30 Nov and was
// printed on 25 Aug.
is("แคมเปญที่ถูกมาร์คว่า Completed แต่ยังไม่เริ่ม ต้องไม่ขึ้นว่าจบแล้ว", at("ended", "2026-09-01", "2026-11-30"), "upcoming");
is("แคมเปญปกติที่ยังไม่เริ่ม", at("active", "2026-09-01", "2026-11-30"), "upcoming");
is("เริ่มพรุ่งนี้ ก็ยังไม่เริ่ม", at("active", "2026-08-26", "2026-09-30"), "upcoming");

console.log("\n— กำลังใช้งาน —");
is("เริ่มวันนี้พอดี = ใช้งานอยู่", at("active", "2026-08-25", "2026-09-30"), "active");
is("จบวันนี้พอดี = ยังใช้งานอยู่ (ทั้งวัน)", at("active", "2026-08-01", "2026-08-25"), "active");
is("อยู่กลางช่วง", at("active", "2026-08-01", "2026-09-30"), "active");
is("ไม่มีวันจบ = open end", at("active", "2026-08-01", undefined), "open_end");
is("ไม่มีวันจบ แต่ยังไม่เริ่ม = ยังไม่เริ่ม (วันเริ่มมาก่อน)", at("active", "2026-09-01", undefined), "upcoming");

console.log("\n— จบไปแล้ว —");
is("วันจบผ่านไปแล้ว", at("active", "2026-07-01", "2026-08-24"), "ended");
is("ปิดก่อนกำหนด: มาร์ค Completed ระหว่างที่ยังรันอยู่", at("ended", "2026-08-01", "2026-09-30"), "ended");
is("ปิดก่อนกำหนดแบบไม่มีวันจบ", at("ended", "2026-08-01", undefined), "ended");

console.log("\n— ยกเลิก: อย่างเดียวที่วันที่บอกไม่ได้ —");
// Cancelled must never read as something to put up, at any point on the
// calendar — "กำลังจะเริ่ม" on a cancelled promotion is how a pulled offer ends
// up printed and taped to a wall.
is("ยกเลิกก่อนเริ่ม", at("cancelled", "2026-09-01", "2026-11-30"), "cancelled");
is("ยกเลิกระหว่างรัน", at("cancelled", "2026-08-01", "2026-09-30"), "cancelled");
is("ยกเลิกหลังจบ", at("cancelled", "2026-07-01", "2026-07-31"), "cancelled");

console.log("\n— ข้อมูลไม่ครบ ต้องไม่พัง —");
is("ไม่มีวันเริ่มและวันจบ = open end", at("active", "", undefined), "open_end");
is("ไม่มีวันเริ่ม แต่จบไปแล้ว", at("active", "", "2026-08-01"), "ended");

console.log("\n— สถานะที่เก็บไว้ต้องไม่ค้าง —");
{
  // A manual promotion saved back in July as "upcoming" is running by now; the
  // stored word is a snapshot, the dates are the fact.
  is("แถวที่บันทึกไว้ว่า upcoming แต่ถึงวันแล้ว = ใช้งานอยู่", at("upcoming", "2026-08-01", "2026-09-30"), "active");
  is("แถวที่บันทึกไว้ว่า upcoming แต่เลยวันจบแล้ว = จบแล้ว", at("upcoming", "2026-07-01", "2026-07-31"), "ended");
  is("แถวที่บันทึกไว้ว่า active แต่ยังไม่ถึงวัน = ยังไม่เริ่ม", at("active", "2026-12-01", "2026-12-31"), "upcoming");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
