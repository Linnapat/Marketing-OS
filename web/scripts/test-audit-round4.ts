/* Audit 22 Nov 2026, round 4 — usability.
 * Run: node --import tsx scripts/test-audit-round4.ts */
import { focusMonthKey, DEFAULT_DATE_FILTER, type DateFilter } from "../src/components/ui/DateFilterBar";
import { tidyLabel } from "../src/lib/data/deadlinePolicy";
import { fetchAllRows } from "../src/lib/db/fetchAll";
import { stamp, DATE_LOCALE } from "../src/lib/format";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const f = (o: Partial<DateFilter>): DateFilter => ({ ...DEFAULT_DATE_FILTER, ...o });
const TODAY = "2026-11-22";

async function main() {
  console.log("\n— เดือนที่แบนเนอร์เดดไลน์และปฏิทินควรชี้ —");
  is("Month = เดือนที่เลือก", focusMonthKey(f({ mode: "month", year: 2027, month: 0 }), TODAY), "2027-01");
  is("Year ปีนี้ = เดือนนี้ (ไม่ใช่ ม.ค.)", focusMonthKey(f({ mode: "year", year: 2026 }), TODAY), "2026-11");
  is("Year ปีหน้า = ม.ค. ของปีนั้น (ไม่ใช่ ต.ค. 2026)", focusMonthKey(f({ mode: "year", year: 2027, start: "2026-10-01", end: "2026-10-31" }), TODAY), "2027-01");
  is("ทุกช่วงเวลา = เดือนนี้", focusMonthKey(f({ mode: "range", start: "", end: "" }), TODAY), "2026-11");
  is("ช่วงที่คร่อมวันนี้ = เดือนนี้", focusMonthKey(f({ mode: "range", start: "2026-10-01", end: "2026-12-31" }), TODAY), "2026-11");
  is("ช่วงในอดีต = เดือนที่เริ่ม", focusMonthKey(f({ mode: "range", start: "2026-08-01", end: "2026-08-31" }), TODAY), "2026-08");

  console.log("\n— ชื่อแถวปฏิทินที่มีสระเกิน —");
  is("ตัวอย่างจริง", tidyLabel("Final AW ฺBrief"), "Final AW Brief");
  is("ภาษาไทยที่สะกดถูกไม่ถูกแตะ", tidyLabel("ส่งบรีฟกราฟิก ครั้งที่ ๑"), "ส่งบรีฟกราฟิก ครั้งที่ ๑");
  is("สระบนตัวอักษรไทยยังอยู่", tidyLabel("เดดไลน์ปฏิทิน"), "เดดไลน์ปฏิทิน");
  is("ว่าง = ว่าง", tidyLabel(undefined), "");

  console.log("\n— รูปแบบวันที่แบบเดียว —");
  is("ใช้ปี ค.ศ. ไม่ใช่ พ.ศ.", stamp("2026-11-19T07:00:00Z").includes("2026"), true);
  is("…ไม่มี 2569", stamp("2026-11-19T07:00:00Z").includes("2569"), false);
  is("เดือนเป็นตัวย่ออังกฤษ", /Nov/.test(stamp("2026-11-19T07:00:00Z")), true);
  is("ค่าที่อ่านไม่ได้ = ว่าง", stamp("oops"), "");
  is("locale กลางตัวเดียว", DATE_LOCALE, "en-GB");

  console.log("\n— อ่านตารางใหญ่: หน้าแรกก่อน ที่เหลือพร้อมกัน —");
  const table = Array.from({ length: 3600 }, (_, i) => ({ id: i + 1 }));
  let inFlight = 0, peak = 0;
  const calls: number[] = [];
  const all = await fetchAllRows(async (from, to) => {
    calls.push(from); inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { data: table.slice(from, Math.min(to + 1, from + 1000)), error: null };
  });
  is("ได้ครบและเรียงตามเดิม", [all.data?.length, all.data?.[0].id, all.data?.[3599].id], [3600, 1, 3600]);
  is("ไม่มีแถวซ้ำ", new Set(all.data?.map((r) => r.id)).size, 3600);
  is("หน้าถัด ๆ ไปถูกอ่านพร้อมกัน", peak, 2);
  const small = await fetchAllRows((from) => { calls.push(-1 - from); return Promise.resolve({ data: [{ id: 1 }], error: null }); });
  is("ตารางเล็กยังยิงครั้งเดียว", [small.data?.length, calls.filter((c) => c < 0).length], [1, 1]);
  const midErr = await fetchAllRows((from) => Promise.resolve(from === 0 ? { data: table.slice(0, 1000), error: null } : { data: null, error: { message: "boom" } }));
  is("error กลางทาง = ไม่คืนข้อมูลครึ่ง ๆ", [midErr.data, midErr.error?.message], [null, "boom"]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
