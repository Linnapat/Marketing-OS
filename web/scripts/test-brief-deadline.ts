/* Brief deadline + rush breaches — the rule that decides whether a graphic
 * request goes straight into the queue or has to be signed off as urgent.
 * Getting this wrong either lets the month fill past capacity silently, or
 * turns every ordinary brief into paperwork.
 * Run: node --import tsx scripts/test-brief-deadline.ts */

import {
  briefDeadlineFor, rushBreaches, rushBlocksProduction, DEFAULT_BRIEF_CUTOFF_DAY, RushCode,
} from "../src/lib/data/briefDeadline";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
const codes = (b: { code: RushCode }[]) => b.map((x) => x.code).sort().join(",");

console.log("\n— เดดไลน์ = วันที่ตัดรอบของ 'เดือนก่อนหน้า' เดือนที่ต้องส่งงาน —");
{
  is("งานส่งเดือน ก.ย. → บรีฟภายใน 25 ส.ค.", briefDeadlineFor("2026-09-10", 25), "2026-08-25");
  is("ใช้เดือนของวันส่งงาน ไม่ใช่วันไหนของเดือน", briefDeadlineFor("2026-09-30", 25), "2026-08-25");
  // ข้ามปี
  is("งานส่งเดือน ม.ค. → บรีฟภายใน ธ.ค. ปีก่อน", briefDeadlineFor("2026-01-05", 25), "2025-12-25");
  // วันตัดรอบเกินจำนวนวันของเดือนนั้น → เลื่อนมาวันสุดท้าย ไม่ใช่ล้นไปเดือนถัดไป
  is("ตัดรอบวันที่ 31 แต่เดือนก่อนมี 30 วัน → 30", briefDeadlineFor("2026-07-10", 31), "2026-06-30");
  is("ตัดรอบวันที่ 30 แต่ ก.พ. มี 28 วัน → 28", briefDeadlineFor("2026-03-10", 30), "2026-02-28");
  is("ปิดใช้งาน (0) → ไม่มีเดดไลน์", briefDeadlineFor("2026-09-10", 0), null);
  is("ไม่มีวันส่งงาน → ไม่มีเดดไลน์", briefDeadlineFor("", 25), null);
  is("ค่า default คือ 25", DEFAULT_BRIEF_CUTOFF_DAY, 25);
}

const input = (over: Partial<Parameters<typeof rushBreaches>[0]> = {}) => ({
  graphicDueIso: "2026-09-10",
  requestIso: "2026-08-01",
  cutoffDay: 25,
  minDueIso: "2026-08-08",
  capLimit: 3, capUsed: 0, capAdding: 1,
  kindLabel: "Graphic",
  ...over,
});

console.log("\n— บรีฟปกติ ไม่ต้องขออนุญาตใคร —");
{
  is("ส่งก่อนเดดไลน์ + ทันลีดไทม์ + โควตาว่าง", codes(rushBreaches(input())), "");
  is("ส่งวันสุดท้ายพอดี ยังไม่ถือว่าเลย", codes(rushBreaches(input({ requestIso: "2026-08-25" }))), "");
  is("วันส่งงานเท่ากับวันเร็วสุดพอดี ผ่าน", codes(rushBreaches(input({ graphicDueIso: "2026-08-08", minDueIso: "2026-08-08", requestIso: "2026-07-20" }))), "");
  is("ใช้โควตาพอดีเป๊ะ ยังไม่เกิน", codes(rushBreaches(input({ capUsed: 2, capAdding: 1 }))), "");
  is("ไม่มีวันส่งงาน = ยังกรอกไม่เสร็จ ไม่ต้องเตือน", codes(rushBreaches(input({ graphicDueIso: "" }))), "");
}

console.log("\n— แต่ละกฎที่ผิด ต้องระบุได้ว่าผิดข้อไหน —");
{
  is("เลยเดดไลน์รายเดือน", codes(rushBreaches(input({ requestIso: "2026-08-26" }))), "deadline");
  is("กระชั้นกว่าลีดไทม์", codes(rushBreaches(input({ graphicDueIso: "2026-08-05", minDueIso: "2026-08-08", requestIso: "2026-07-20" }))), "leadTime");
  is("เกินโควตาวันนั้น", codes(rushBreaches(input({ capUsed: 3, capAdding: 1 }))), "dailyCap");
  // ผิดหลายข้อพร้อมกันต้องขึ้นครบ — คนอนุมัติต้องเห็นภาพเต็ม ไม่ใช่ข้อแรกข้อเดียว
  is("ผิดครบสามข้อ", codes(rushBreaches(input({ requestIso: "2026-09-01", graphicDueIso: "2026-09-02", minDueIso: "2026-09-08", capUsed: 3 }))), "dailyCap,deadline,leadTime");
}

console.log("\n— ปิดกฎรายเดือนแล้ว กฎอื่นต้องยังทำงาน —");
{
  is("ปิดเดดไลน์ → ส่งช้าแค่ไหนก็ไม่ผิดข้อนี้", codes(rushBreaches(input({ cutoffDay: 0, requestIso: "2026-09-09" }))), "");
  is("…แต่โควตายังกันอยู่", codes(rushBreaches(input({ cutoffDay: 0, capUsed: 5 }))), "dailyCap");
  is("capLimit 0 = ไม่จำกัด", codes(rushBreaches(input({ capLimit: 0, capUsed: 99 }))), "");
}

console.log("\n— งานเร่งด่วนที่ยังไม่ได้รับอนุมัติ ต้องไม่เริ่มผลิต —");
{
  is("รออนุมัติ = ยังไม่เริ่ม", rushBlocksProduction("Pending"), true);
  is("ถูกปฏิเสธ = ไม่เริ่ม", rushBlocksProduction("Rejected"), true);
  is("อนุมัติแล้ว = เริ่มได้", rushBlocksProduction("Approved"), false);
  is("บรีฟปกติ = เริ่มได้", rushBlocksProduction(""), false);
  is("แถวเก่าที่ไม่มีค่านี้ = เริ่มได้", rushBlocksProduction(undefined), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
