/* Brief deadline + rush breaches — the rule that decides whether a graphic
 * request goes straight into the queue or has to be signed off as urgent.
 * Getting this wrong either lets the month fill past capacity silently, or
 * turns every ordinary brief into paperwork.
 * Run: node --import tsx scripts/test-brief-deadline.ts */

import {
  briefDeadlineFor, rushBreaches, rushBlocksProduction, DEFAULT_BRIEF_CUTOFF_DAY, RushCode,
  parseBriefExtensions, withBriefExtension, currentBriefRound,
} from "../src/lib/data/briefDeadline";
import { thirdFriday, lastFriday, artworkScheduleFor, monthServedByArtworkDue } from "../src/lib/data/artworkSchedule";
import { finalArtworkDue } from "../src/lib/data/brief";
import { parseTeamHolidays, withTeamHoliday, workingDayOnOrBefore } from "../src/lib/data/teamHolidays";
import { monthServedByFinalAw } from "../src/lib/data/deadlinePolicy";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
const codes = (b: { code: RushCode }[]) => b.map((x) => x.code).sort().join(",");

console.log("\n— เดดไลน์ = ศุกร์ที่ 3 ของ 'เดือนก่อนหน้า' เดือนที่ต้องส่งงาน —");
{
  is("งานส่งเดือน ก.ย. → บรีฟภายในศุกร์ที่ 3 ของ ส.ค.", briefDeadlineFor("2026-09-10", 25), "2026-08-21");
  is("ใช้เดือนของวันส่งงาน ไม่ใช่วันไหนของเดือน", briefDeadlineFor("2026-09-30", 25), "2026-08-21");
  // ข้ามปี
  is("งานส่งเดือน ม.ค. → บรีฟภายใน ธ.ค. ปีก่อน", briefDeadlineFor("2026-01-05", 25), "2025-12-19");
  // ตัวเลขที่เคยตั้งไว้ไม่เลือกวันอีกแล้ว — เป็นแค่สวิตช์เปิด/ปิด
  is("ค่าเดิม 20 กับ 25 ให้วันเดียวกัน", briefDeadlineFor("2027-01-29", 20), briefDeadlineFor("2027-01-29", 25));
  is("ธ.ค. 69 = 18 ไม่ใช่ 20", briefDeadlineFor("2027-01-29", 20), "2026-12-18");
  is("พ.ย. 69 = 20 ตามที่ประกาศ", briefDeadlineFor("2026-12-25", 20), "2026-11-20");
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
  is("ส่งวันสุดท้ายพอดี ยังไม่ถือว่าเลย", codes(rushBreaches(input({ requestIso: "2026-08-21" }))), "");
  is("วันส่งงานเท่ากับวันเร็วสุดพอดี ผ่าน", codes(rushBreaches(input({ graphicDueIso: "2026-08-08", minDueIso: "2026-08-08", requestIso: "2026-07-15" }))), "");
  is("ใช้โควตาพอดีเป๊ะ ยังไม่เกิน", codes(rushBreaches(input({ capUsed: 2, capAdding: 1 }))), "");
  is("ไม่มีวันส่งงาน = ยังกรอกไม่เสร็จ ไม่ต้องเตือน", codes(rushBreaches(input({ graphicDueIso: "" }))), "");
}

console.log("\n— แต่ละกฎที่ผิด ต้องระบุได้ว่าผิดข้อไหน —");
{
  is("เลยเดดไลน์รายเดือน", codes(rushBreaches(input({ requestIso: "2026-08-22" }))), "deadline");
  is("กระชั้นกว่าลีดไทม์", codes(rushBreaches(input({ graphicDueIso: "2026-08-05", minDueIso: "2026-08-08", requestIso: "2026-07-15" }))), "leadTime");
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

console.log("\n— รอบงาน Creative: บรีฟ / draft แรก / ไฟล์ Final คนละวันกัน —");
{
  // ตารางที่ Creative Leader ประกาศ พ.ย. 69
  is("ศุกร์ที่ 3 ของ พ.ย. 69", thirdFriday("2026-11"), "2026-11-20");
  is("ศุกร์ที่ 3 ของ ธ.ค. 69", thirdFriday("2026-12"), "2026-12-18");
  is("ศุกร์สุดท้ายของ พ.ย. 69", lastFriday("2026-11"), "2026-11-27");
  is("ศุกร์สุดท้ายของ ธ.ค. 69", lastFriday("2026-12"), "2026-12-25");
  // เดือนที่วันที่ 1 เป็นวันศุกร์ / เดือนที่มีศุกร์ 5 ครั้ง
  is("วันที่ 1 เป็นศุกร์ → ศุกร์ที่ 3 คือ 15", thirdFriday("2027-01"), "2027-01-15");
  is("เดือนที่มีศุกร์ 5 ครั้ง → เอาครั้งสุดท้าย", lastFriday("2027-01"), "2027-01-29");

  const jan = artworkScheduleFor("2027-01-12");
  is("งาน ม.ค. → Final Brief 20 พ.ย.", jan?.finalBrief, "2026-11-20");
  is("งาน ม.ค. → draft แรก 18 ธ.ค.", jan?.firstDraft, "2026-12-18");
  is("งาน ม.ค. → ไฟล์ Final 25 ธ.ค.", jan?.finalAw, "2026-12-25");
  const dec = artworkScheduleFor("2026-12");
  is("งาน ธ.ค. → draft แรก 20 พ.ย.", dec?.firstDraft, "2026-11-20");
  is("งาน ธ.ค. → ไฟล์ Final 27 พ.ย.", dec?.finalAw, "2026-11-27");
  is("ไม่มีวันโพสต์ → ไม่มีรอบ", artworkScheduleFor(""), null);

  // บั๊กที่แก้: บรีฟงาน ม.ค. เคยได้วันส่ง artwork = 20 พ.ย. (วันปิดรับบรีฟ)
  const due = finalArtworkDue("2027-01-12", "2026-11-17", jan?.finalAw);
  is("ฟอร์มล็อกวันส่ง Final งาน ม.ค. = 25 ธ.ค.", due.iso, "2026-12-25");
  is("…และไม่นับเป็นงานเร่ง", due.rushed, false);
  // …ซึ่งทำให้เดดไลน์ส่งบรีฟของงานนั้น = 20 พ.ย. ตรงกับที่ประกาศ
  is("บรีฟงาน ม.ค. วันที่ 17 พ.ย. ยังไม่เลยเดดไลน์", codes(rushBreaches({
    graphicDueIso: due.iso, requestIso: "2026-11-17", cutoffDay: 20, minDueIso: "2026-11-24",
    capLimit: 0, capUsed: 0, capAdding: 1, kindLabel: "Graphic",
  })), "");

  is("due ศุกร์สุดท้าย ธ.ค. → เป็นงานเดือน ม.ค.", monthServedByArtworkDue("2026-12-25"), "2027-01");
  is("วันอื่นไม่ใช่วันของรอบ", monthServedByArtworkDue("2026-12-18"), null);
  is("drawer หาเดือนของงานจากวัน due ได้", monthServedByFinalAw("2026-12-25"), "2027-01");
}

console.log("\n— ขยายเดดไลน์บรีฟเฉพาะรอบ —");
{
  const ext = { "2026-11-20": "2026-11-27" };
  const rush = (requestIso: string, due: string, extensions?: Record<string, string>) => rushBreaches({
    graphicDueIso: due, requestIso, cutoffDay: 25, extensions, minDueIso: "2026-11-01",
    capLimit: 0, capUsed: 0, capAdding: 1, kindLabel: "Graphic",
  }).map((b) => b.code).join(",");
  is("ไม่ขยาย: บรีฟ 22 พ.ย. งานเดือน ม.ค. = งานเร่ง", rush("2026-11-22", "2026-12-25"), "deadline");
  is("ขยายถึง 27 พ.ย.: บรีฟ 22 พ.ย. ผ่าน", rush("2026-11-22", "2026-12-25", ext), "");
  is("…วันสุดท้ายที่ขยายยังผ่าน", rush("2026-11-27", "2026-12-25", ext), "");
  is("…เลยวันที่ขยาย = งานเร่งเหมือนเดิม", rush("2026-11-28", "2026-12-25", ext), "deadline");
  is("ไม่รั่วไปรอบอื่น (งานเดือน ก.พ. ยังเป็น 18 ธ.ค.)", briefDeadlineFor("2027-01-29", 25, ext), "2026-12-18");
  is("ปิดกฎรายเดือน = ไม่มีเดดไลน์ แม้มีการขยาย", briefDeadlineFor("2026-12-25", 0, ext), null);
  is("ค่าที่ย้อนให้เร็วขึ้นถูกทิ้ง", Object.keys(parseBriefExtensions('{"2026-11-20":"2026-11-10"}')).length, 0);
  is("ค่าที่อ่านไม่ได้ = ไม่มีการขยาย", Object.keys(parseBriefExtensions("not json")).length, 0);
  is("อ่านค่าที่ถูกต้องได้", parseBriefExtensions('{"2026-11-20":"2026-11-27"}')["2026-11-20"], "2026-11-27");
  is("ล้างการขยาย", Object.keys(withBriefExtension(ext, "2026-11-20", "")).length, 0);
  is("รอบของวันนี้ (22 พ.ย.) คือ 20 พ.ย.", currentBriefRound("2026-11-22"), "2026-11-20");
}

console.log("\n— วันหยุดทีม: เดดไลน์ของรอบขยับมาวันทำงานก่อนหน้า —");
{
  const xmas = ["2026-12-25"];
  is("ไม่มีวันหยุด: Final งาน ม.ค. = 25 ธ.ค.", artworkScheduleFor("2027-01")?.finalAw, "2026-12-25");
  is("หยุด 25 ธ.ค.: Final ขยับเป็นพฤหัส 24", artworkScheduleFor("2027-01", xmas)?.finalAw, "2026-12-24");
  is("…1st draft ไม่โดน (18 ธ.ค.)", artworkScheduleFor("2027-01", xmas)?.firstDraft, "2026-12-18");
  is("หยุดติดกัน 24–25: ถอยไปพุธ 23", artworkScheduleFor("2027-01", ["2026-12-24", "2026-12-25"])?.finalAw, "2026-12-23");
  is("ไม่ถอยไปตกเสาร์อาทิตย์", workingDayOnOrBefore("2026-12-28", ["2026-12-28"]), "2026-12-25");
  is("วันทำงานปกติไม่ขยับ", workingDayOnOrBefore("2026-12-18", xmas), "2026-12-18");
  is("เดดไลน์บรีฟตรงวันหยุดก็ขยับ", briefDeadlineFor("2026-12-25", 25, undefined, ["2026-11-20"]), "2026-11-19");
  is("…แต่วันที่ขยายเองไม่ถูกขยับ", briefDeadlineFor("2026-12-25", 25, { "2026-11-20": "2026-11-27" }, ["2026-11-27"]), "2026-11-27");
  is("วัน due ที่ขยับแล้วยังรู้ว่าเป็นงานเดือน ม.ค.", monthServedByArtworkDue("2026-12-24", xmas), "2027-01");
  is("ค่าที่อ่านไม่ได้ = ไม่มีวันหยุด", parseTeamHolidays("oops").length, 0);
  is("เก็บเฉพาะวันที่ถูกรูปแบบ ไม่ซ้ำ เรียงวัน", parseTeamHolidays('["2026-12-31","x","2026-12-25","2026-12-25"]').join(","), "2026-12-25,2026-12-31");
  is("เพิ่ม/ลบวันหยุด", withTeamHoliday(withTeamHoliday([], "2026-12-25", true), "2026-12-25", false).length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
