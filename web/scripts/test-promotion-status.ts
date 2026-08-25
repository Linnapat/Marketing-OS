/* The Status column on Promotion Summary Print — the sheet that goes on a wall.
 * Store staff read it to decide whether a promotion is on today, so the one
 * thing it must never say is that something ended before it started. That is
 * exactly what it said: a campaign someone had marked "Completed" printed
 * "จบแล้ว" while its flight was still a week out, because the column trusted
 * the campaign's workflow state instead of its dates.
 * Run with:  npm test   (chained after test-flows.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { printedStatus, OMD_STORE_CATEGORY_META, type OmdStorePromotion, type OmdStorePromotionStatus } from "../src/lib/data/omdStorePromotions";
import { fitZoom, pagesWhenPrinted, pagesAtFullSize, fitBudget, MIN_FIT_ZOOM, PAGE_H_PX } from "../src/lib/data/printFit";

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

console.log("\n— หัวข้อหมวด: ใบเดียวใช้ทุกแบรนด์ —");
{
  // A Teppen CRM promotion printed under a heading that says OMD reads as the
  // wrong brand's offer to whoever is holding the sheet. No category heading
  // may name a brand — the Brand column and the row tint carry that.
  const brandWords = /\b(omd|teppen|omakase|mainichi|touka|takao)\b/i;
  const offenders = Object.entries(OMD_STORE_CATEGORY_META)
    .filter(([, meta]) => brandWords.test(meta.printLabel) || brandWords.test(meta.label))
    .map(([key]) => key);
  is("ไม่มีหมวดไหนใส่ชื่อแบรนด์ไว้ในหัวข้อ", offenders.join(",") || "none", "none");
  is("หมวด CRM ใช้ชื่อกลาง", OMD_STORE_CATEGORY_META.crm.printLabel, "Member / CRM");
}

console.log("\n— ย่อให้พอดี 1 หน้า —");
{
  const B = fitBudget();
  // Already fits: never blow a short sheet up to fill the paper.
  is("สั้นกว่าหนึ่งหน้า = ไม่ย่อ ไม่ขยาย", fitZoom(B * 0.5), 1);
  is("พอดีเป๊ะ = ไม่ย่อ", fitZoom(B), 1);
  is("ปิดสวิตช์ = ไม่ย่อ แม้จะยาว", fitZoom(B * 2, false), 1);

  // Rounding always errs small — a zoom rounded UP is the one that prints
  // page two.
  is("ปัดลงเสมอ ไม่ปัดขึ้น", fitZoom(B / 0.815) <= 0.815, true);
  is("ทศนิยม 2 ตำแหน่ง", Math.round(fitZoom(B / 0.8157) * 1000) % 10, 0);

  // The floor, and the honesty that has to come with it.
  is("ยาวมาก = หยุดที่พื้น ไม่ย่อต่อ", fitZoom(B * 5), MIN_FIT_ZOOM);
  is("ที่พื้นแล้วยังไม่พอ ต้องบอกว่ากี่หน้า", pagesWhenPrinted(B * 5, MIN_FIT_ZOOM), 4);
  is("ยาว 2 หน้านิด ๆ ย่อแล้วเหลือหน้าเดียว", pagesWhenPrinted(B * 1.2, fitZoom(B * 1.2)), 1);
  is("ยาว 1.4 หน้า ย่อแล้วเหลือหน้าเดียว", pagesWhenPrinted(B * 1.4, fitZoom(B * 1.4)), 1);
  // 1/0.7 ≈ 1.428 is exactly where the floor stops being enough.
  is("เกิน 1/0.7 เท่า = ย่อสุดแล้วก็ยังสองหน้า", pagesWhenPrinted(B * 1.6, fitZoom(B * 1.6)), 2);

  is("ความสูงเป็นศูนย์ ไม่พัง", fitZoom(0), 1);
  is("ค่าประหลาด ไม่พัง", fitZoom(Number.NaN), 1);
  is("นับหน้าเมื่อความสูงเป็นศูนย์ = 1 หน้า", pagesWhenPrinted(0, 1), 1);

  // The safety margin is real: a sheet that exactly fills the raw page height
  // must still be treated as too tall.
  is("เต็มหน้าพอดีแบบไม่เผื่อ = ยังถือว่าเกิน", fitZoom(PAGE_H_PX) < 1, true);
  is("นับหน้าเต็มขนาด", pagesAtFullSize(B * 2.2), 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
