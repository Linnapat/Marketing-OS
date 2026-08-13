/* Campaign flight dates that cross New Year.
 *
 * The bug this pins: campaigns.dates is a year-less label ("Oct 1 – Jan 31"),
 * and every list that filters by period parses it back. Both ends were read as
 * the CURRENT year, so a flight crossing New Year came back ending before it
 * started — an empty range that overlaps no month. PARTY COURSE (Oct 1 2026 –
 * Jan 31 2027) and Brand Awareness (Sep 1 2026 – Mar 31 2027) were sitting in
 * the database untouched and showed up nowhere.
 *
 * Two halves are covered: fmtRange now writes the years when a flight crosses
 * one, and parseRowRange rolls a year-less end forward so rows written before
 * the fix still resolve. Run with: npm test */

import { fmtRange } from "../src/lib/data/brief";
import { campaignPeriod } from "../src/lib/data/campaigns";
import { parseRowRange, rangeInFilter, rangeOverlapFraction, DateFilter } from "../src/components/ui/DateFilterBar";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const YEAR = new Date().getFullYear();
const month = (m: number, y = YEAR): DateFilter => ({ mode: "month", month: m, year: y, start: "", end: "" });
const year = (y = YEAR): DateFilter => ({ mode: "year", month: 0, year: y, start: "", end: "" });
const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

console.log("— fmtRange(): ปีติดมาด้วยเมื่อแคมเปญข้ามปี —");
is("อยู่ในปีเดียวกัน ไม่ต้องมีปี", fmtRange("2026-10-01", "2026-10-31"), "Oct 1 – Oct 31");
is("ข้ามปี ต้องบอกปีทั้งสองฝั่ง", fmtRange("2026-10-01", "2027-01-31"), "Oct 1 2026 – Jan 31 2027");
is("ข้ามปียาว (Brand Awareness)", fmtRange("2026-09-01", "2027-03-31"), "Sep 1 2026 – Mar 31 2027");
is("ไม่มีวันจบ", fmtRange("2026-10-01", ""), "Oct 1");
is("ไม่มีวันเลย", fmtRange("", ""), "TBD");

console.log("\n— parseRowRange(): แถวเก่าที่ไม่มีปี ต้องเดาปีถัดไปให้ —");
is("ในปีเดียวกัน ปล่อยตามเดิม", iso(parseRowRange("Oct 1 – Oct 31").end), `${YEAR}-10-31`);
is("ข้ามปี: วันจบขยับไปปีหน้า", iso(parseRowRange("Oct 1 – Jan 31").end), `${YEAR + 1}-01-31`);
is("ข้ามปี: วันเริ่มไม่ขยับ", iso(parseRowRange("Oct 1 – Jan 31").start), `${YEAR}-10-01`);
is("ป้ายที่มีปีอยู่แล้ว เชื่อป้าย ไม่เดา", iso(parseRowRange("Oct 1 2026 – Jan 31 2027").end), "2027-01-31");
is("ไม่มีวันจบ ใช้วันเริ่มเป็นวันจบ", iso(parseRowRange("Oct 1").end), `${YEAR}-10-01`);
is("อ่านไม่ออก = ไม่มีช่วงเวลา", parseRowRange("TBD"), { start: null, end: null });

console.log("\n— rangeInFilter(): เดือนไหนควรเห็นแคมเปญข้ามปี —");
// PARTY COURSE — the campaign Pupay could not find.
const party = "Oct 1 – Jan 31";
is("ต.ค. เห็น", rangeInFilter(month(9), party), true);
is("พ.ย. เห็น", rangeInFilter(month(10), party), true);
is("ธ.ค. เห็น", rangeInFilter(month(11), party), true);
is("ม.ค. ปีหน้า เห็น", rangeInFilter(month(0, YEAR + 1), party), true);
is("ก.ย. (ก่อนเริ่ม) ไม่เห็น", rangeInFilter(month(8), party), false);
is("ก.พ. ปีหน้า (หลังจบ) ไม่เห็น", rangeInFilter(month(1, YEAR + 1), party), false);
is("มุมมองรายปี เห็น", rangeInFilter(year(), party), true);
// Brand Awareness — the campaign Pichayaporn could not find.
const awareness = "Sep 1 – Mar 31";
is("Awareness: ก.ย. เห็น", rangeInFilter(month(8), awareness), true);
is("Awareness: ม.ค. ปีหน้า เห็น", rangeInFilter(month(0, YEAR + 1), awareness), true);
is("Awareness: มี.ค. ปีหน้า เห็น", rangeInFilter(month(2, YEAR + 1), awareness), true);
is("Awareness: ส.ค. ไม่เห็น", rangeInFilter(month(7), awareness), false);
// A row written after the fix carries its years and must behave the same.
is("ป้ายมีปี: ต.ค. 2026 เห็น", rangeInFilter(month(9, 2026), "Oct 1 2026 – Jan 31 2027"), true);
is("ป้ายมีปี: ม.ค. 2027 เห็น", rangeInFilter(month(0, 2027), "Oct 1 2026 – Jan 31 2027"), true);
is("ป้ายมีปี: ก.ย. 2026 ไม่เห็น", rangeInFilter(month(8, 2026), "Oct 1 2026 – Jan 31 2027"), false);
// Unchanged behaviour: a row with no readable flight never hides itself.
is("แถวไม่มีวันที่ ยังเห็นเสมอ", rangeInFilter(month(0), "TBD"), true);

console.log("\n— rangeOverlapFraction(): งบต้องไม่กลายเป็นศูนย์ —");
// 123 days Oct 1 → Jan 31; October contributes 31 of them.
is("ต.ค. ได้สัดส่วนตามจำนวนวัน", Math.round(rangeOverlapFraction(month(9), party) * 1000) / 1000, Math.round((31 / 123) * 1000) / 1000);
is("ม.ค. ปีหน้าได้สัดส่วน ไม่ใช่ 0", Math.round(rangeOverlapFraction(month(0, YEAR + 1), party) * 1000) / 1000, Math.round((31 / 123) * 1000) / 1000);
is("ทั้งปีที่เริ่ม ได้ไม่เกิน 1", rangeOverlapFraction(year(), party) <= 1, true);
is("เดือนนอกช่วง ได้ 0", rangeOverlapFraction(month(8), party), 0);
is("อยู่ในเดือนเดียวได้เต็ม 1", rangeOverlapFraction(month(9), "Oct 1 – Oct 31"), 1);

console.log("\n— campaignPeriod(): วันที่ที่เก็บไว้ต้องชนะป้าย —");
// The label is deliberately WRONG here (a year-less cross-year range, the exact
// shape that caused the bug). Stored dates must win, so the label never gets a
// chance to be parsed — no guessing, right answer.
const stored = { dates: "Oct 1 – Jan 31", startDate: "2026-10-01", endDate: "2027-01-31" };
is("มีคอลัมน์วันที่ = ใช้คอลัมน์", campaignPeriod(stored), { start: "2026-10-01", end: "2027-01-31" });
is("ไม่มีคอลัมน์ = ถอยไปอ่านป้าย", campaignPeriod({ dates: "Oct 1 – Oct 31" }), "Oct 1 – Oct 31");
is("มีแค่ข้างเดียว = ยังถอยไปอ่านป้าย", campaignPeriod({ dates: "Oct 1 – Oct 31", startDate: "2026-10-01" }), "Oct 1 – Oct 31");
is("อ่านช่วงจากคอลัมน์ได้ถูก", iso(parseRowRange(campaignPeriod(stored)).end), "2027-01-31");
is("ต.ค. 2026 เห็น", rangeInFilter(month(9, 2026), campaignPeriod(stored)), true);
is("ม.ค. 2027 เห็น", rangeInFilter(month(0, 2027), campaignPeriod(stored)), true);
is("ก.พ. 2027 ไม่เห็น", rangeInFilter(month(1, 2027), campaignPeriod(stored)), false);
// Whatever year it is when this runs, stored dates give the same answer —
// the year-less label cannot promise that, which is the point of the columns.
is("ผลไม่ขึ้นกับปีปัจจุบัน", rangeInFilter(month(9, 2026), campaignPeriod(stored)), rangeInFilter(month(9, 2026), { start: "2026-10-01", end: "2027-01-31" }));
is("แคมเปญไม่มีวันที่เลย ยังเห็นเสมอ", rangeInFilter(month(0), campaignPeriod({ dates: "TBD" })), true);

console.log(`\n${fail === 0 ? "✅" : "❌"} date-range: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
