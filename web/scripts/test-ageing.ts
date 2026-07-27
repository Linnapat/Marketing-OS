/* Ageing + the assignment queue — "how long has this sat here, and whose
 * problem is it". Live data when this was written: 43 graphic requests with no
 * designer, 28 waiting a week or more, oldest 12 days.
 * Run: node --import tsx scripts/test-ageing.ts */

import {
  isUnowned, daysBetween, stageStartedAt, stageAgeDays, ageLevel,
  assignmentQueue, queueSummary, ASSIGN_SLOW_DAYS, ASSIGN_STUCK_DAYS,
} from "../src/lib/data/ageing";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) console.error(`    expected ${e}, got ${a}`);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("\n— อะไรนับว่า 'ไม่มีเจ้าของ' —");
{
  is("ค่าว่าง", isUnowned(""), true);
  is("undefined", isUnowned(undefined), true);
  is("เว้นวรรคล้วน", isUnowned("   "), true);
  is("Unassigned", isUnowned("Unassigned"), true);
  is("unassigned ตัวเล็ก", isUnowned("unassigned"), true);
  is("ขีดกลาง", isUnowned("—"), true);
  is("TBD", isUnowned("TBD"), true);
  is("ชื่อคนจริง = มีเจ้าของ", isUnowned("Jeeno"), false);
  // อย่าไปจับคำที่บังเอิญมี unassigned อยู่ข้างใน
  is("ชื่อที่มีคำว่า unassigned ปนอยู่ ไม่นับ", isUnowned("Unassigned Studio Co."), false);
}

console.log("\n— นับวัน —");
{
  is("วันเดียวกัน = 0", daysBetween("2026-07-28", "2026-07-28"), 0);
  is("ห่างกัน 1 วัน", daysBetween("2026-07-27", "2026-07-28"), 1);
  is("ข้ามเดือน", daysBetween("2026-06-28", "2026-07-01"), 3);
  is("ข้ามปี", daysBetween("2025-12-30", "2026-01-02"), 3);
  is("รับ timestamp เต็ม ตัดเอาเฉพาะวัน", daysBetween("2026-07-20T23:59:59Z", "2026-07-28"), 8);
  // อนาคต (นาฬิกาเครื่องเพี้ยน / ข้อมูลผิด) ต้องไม่ได้ค่าติดลบ
  is("วันในอนาคต = 0 ไม่ใช่ติดลบ", daysBetween("2026-08-10", "2026-07-28"), 0);
  is("ไม่มีวันเริ่ม = null", daysBetween(undefined, "2026-07-28"), null);
  is("ค่าว่าง = null", daysBetween("", "2026-07-28"), null);
}

console.log("\n— งานอยู่สเตจนี้มานานแค่ไหน —");
{
  const today = "2026-07-28";
  // ยังไม่มีใครแตะเลย → นับจากวันที่สร้าง
  is("ไม่มี history → ใช้วันที่สร้าง", stageAgeDays({ createdAt: "2026-07-16" }, today), 12);
  // มี history → นับจากเหตุการณ์ล่าสุด ไม่ใช่วันสร้าง
  is("มี history → นับจากเหตุการณ์ล่าสุด",
     stageAgeDays({ createdAt: "2026-07-01", history: [{ at: "2026-07-05" }, { at: "2026-07-25" }] }, today), 3);
  // เหตุการณ์เรียงมาไม่ตามลำดับ ต้องยังหยิบตัวล่าสุดถูก
  is("history ไม่เรียงลำดับ ก็ยังหยิบล่าสุดถูก",
     stageAgeDays({ history: [{ at: "2026-07-25" }, { at: "2026-07-10" }] }, today), 3);
  is("history ว่าง → fallback วันที่สร้าง", stageAgeDays({ createdAt: "2026-07-20", history: [] }, today), 8);
  is("stageStartedAt คืนเหตุการณ์ล่าสุด",
     stageStartedAt({ createdAt: "2026-07-01", history: [{ at: "2026-07-09" }] }), "2026-07-09");
  // ไม่มีอะไรบอกเวลาเลย = ไม่รู้ ไม่ใช่ 0 (0 จะอ่านว่า "เพิ่งเข้ามา" ซึ่งผิด)
  is("ไม่มีข้อมูลเวลาเลย → null", stageAgeDays({}, today), null);
}

console.log("\n— ระดับความค้าง —");
{
  is(`น้อยกว่า ${ASSIGN_SLOW_DAYS} วัน = ปกติ`, ageLevel(2), "fresh");
  is(`ครบ ${ASSIGN_SLOW_DAYS} วันพอดี = เริ่มนาน`, ageLevel(ASSIGN_SLOW_DAYS), "slow");
  is(`ครบ ${ASSIGN_STUCK_DAYS} วันพอดี = ค้างนาน`, ageLevel(ASSIGN_STUCK_DAYS), "stuck");
  is("12 วัน (ตัวที่นานสุดในระบบจริง) = ค้างนาน", ageLevel(12), "stuck");
  is("ไม่รู้อายุ = ไม่ปลุกให้ตกใจ", ageLevel(null), "fresh");
  is("ปรับเกณฑ์เองได้", ageLevel(5, 10, 20), "fresh");
}

console.log("\n— คิวรอมอบหมาย —");
{
  const today = "2026-07-28";
  type G = { id: number; designer?: string; createdAt?: string; history?: { at: string }[] };
  const rows: G[] = [
    { id: 1, designer: "Unassigned", createdAt: "2026-07-16" },              // 12 วัน
    { id: 2, designer: "", createdAt: "2026-07-25" },                         // 3 วัน
    { id: 3, designer: "Jeeno", createdAt: "2026-07-01" },                    // มีคนแล้ว ไม่เข้าคิว
    { id: 4, designer: "Unassigned", createdAt: "2026-07-27" },               // 1 วัน
    { id: 5, designer: undefined, createdAt: "2026-07-21" },                  // 7 วัน
  ];
  const q = assignmentQueue(rows, (g) => g.designer, today);

  is("เข้าคิวเฉพาะงานที่ไม่มีเจ้าของ", q.map((e) => e.item.id), [1, 5, 2, 4]);
  is("เรียงจากรอนานสุดก่อน", q.map((e) => e.days), [12, 7, 3, 1]);
  is("ติดป้ายระดับให้ถูก", q.map((e) => e.level), ["stuck", "stuck", "slow", "fresh"]);

  const sum = queueSummary(q);
  is("นับรวมทั้งคิว", sum.total, 4);
  is("นับเฉพาะที่เริ่มนาน", sum.slow, 1);
  is("นับเฉพาะที่ค้างนาน", sum.stuck, 2);
  is("บอกตัวที่รอนานสุด", sum.oldest, 12);

  is("คิวว่าง = ไม่มีอะไรต้องเตือน", queueSummary(assignmentQueue([], (g: G) => g.designer, today)),
     { total: 0, slow: 0, stuck: 0, oldest: null });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
