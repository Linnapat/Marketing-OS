/* UX/UI test 22 Nov 2026, round 3.
 * Run: node --import tsx scripts/test-uxui-round3.ts */
import { fmtDate, fmtDateTime, fmtMonth, fmtRange, distinctLabels, stamp } from "../src/lib/format";
import { fmtDisplay } from "../src/components/ui/DatePicker";
import { shortPostDate } from "../src/lib/usePostDates";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("\n— 3.1 รูปแบบวันที่แบบเดียว —");
is("วันที่: 19 Nov 2026", fmtDate("2026-11-19"), "19 Nov 2026");
is("กันยายนคือ Sep ไม่ใช่ Sept", fmtDate("2026-09-21"), "21 Sep 2026");
is("วันที่ล้วนไม่ถูกเลื่อนข้ามเที่ยงคืน", fmtDate("2027-01-01"), "1 Jan 2027");
is("เดือน: Nov 2026", fmtMonth("2026-11"), "Nov 2026");
is("เดือนจากวันที่เต็ม", fmtMonth("2026-11-27"), "Nov 2026");
is("ช่วงในปีเดียวกันบอกปีครั้งเดียว", fmtRange("2026-08-01", "2026-12-31"), "1 Aug – 31 Dec 2026");
is("ช่วงข้ามปีบอกปีทั้งสองฝั่ง", fmtRange("2026-12-28", "2027-01-03"), "28 Dec 2026 – 3 Jan 2027");
is("วันที่อย่างเดียวไม่มีเวลาแปะท้าย", fmtDateTime("2026-11-19"), "19 Nov 2026");
is("วันเวลา: มีเวลา ชั่วโมง:นาที", /^\d{1,2} Nov 2026, \d{2}:\d{2}$/.test(fmtDateTime("2026-11-19T07:32:00Z")), true);
is("stamp ใช้ตัวแปลงเดียวกัน", stamp("2026-11-19T07:32:00Z"), fmtDateTime("2026-11-19T07:32:00Z"));
is("ช่องเลือกวันที่แสดงแบบเดียวกัน (ไม่ใช่ 27/11/2026)", fmtDisplay("2026-11-27"), "27 Nov 2026");
is("คอลัมน์ Post date มีปี", shortPostDate("2026-11-27"), "27 Nov 2026");
is("ค่าที่อ่านไม่ได้ = ว่าง", [fmtDate("oops"), fmtDate(""), fmtDate(null), fmtMonth("x")], ["", "", "", ""]);
is("เดือนที่ไม่มีจริง = ว่าง", fmtDate("2026-13-01"), "");

console.log("\n— 3.4 ชุด hashtag ที่ขึ้นต้นเหมือนกัน —");
{
  const sets = ["#OMDbyTEPPEN #SITDONE #LunchSet", "#OMDbyTEPPEN #SITDONE #Sathorn #Dinner", "#OMDbyTEPPEN #SITDONE"];
  is("แสดงส่วนที่ต่าง", distinctLabels(sets), ["… #LunchSet", "… #Sathorn #Dinner", "#OMDbyTEPPEN #SITDONE"]);
  is("ชุดเดียวแสดงเต็ม", distinctLabels(["#A #B"]), ["#A #B"]);
  is("ไม่มีส่วนร่วม = แสดงเต็ม", distinctLabels(["#A #B", "#C #D"]), ["#A #B", "#C #D"]);
  is("ขึ้นบรรทัดใหม่ถูกแปลงเป็นจุดคั่น", distinctLabels(["สั่งเลย\nโทร 02"]), ["สั่งเลย · โทร 02"]);
}

console.log(`\n${pass} passed, ${fail} failed`);
// The imports above pull in the data layer, which keeps Node alive for a
// while after the last assertion; exit explicitly so the suite does not wait.
process.exit(fail ? 1 : 0);
