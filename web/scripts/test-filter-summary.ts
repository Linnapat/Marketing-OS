/* filterWithReasons — the counting behind "แสดง 8 จาก 11 · ซ่อนอยู่ 3".
 *
 * The numbers on that line are the whole point: if they don't add up, the line
 * is worse than no line, because it claims to account for everything that left
 * the screen. Pinned here: attribution goes to the FIRST failing test, the
 * per-reason counts always sum to hiddenTotal, and a reason that hid nothing
 * never appears. Run with: npm test */

import { filterWithReasons } from "../src/components/ui/FilterSummary";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

interface Row { id: string; month: number; brand: string; name: string }
const rows: Row[] = [
  { id: "a", month: 10, brand: "teppen", name: "Party" },
  { id: "b", month: 10, brand: "omakase", name: "Kaisen" },
  { id: "c", month: 11, brand: "teppen", name: "Halloween" },
  { id: "d", month: 11, brand: "omakase", name: "Tofu" },
  { id: "e", month: 10, brand: "teppen", name: "Lunch" },
];
const inMonth = (m: number) => ({ label: "นอกช่วงเวลา", pass: (r: Row) => r.month === m });
const isBrand = (b: string) => ({ label: "คนละแบรนด์", pass: (r: Row) => b === "all" || r.brand === b });
const matches = (q: string) => ({ label: "ไม่ตรงคำค้น", pass: (r: Row) => !q || r.name.toLowerCase().includes(q) });

console.log("— ไม่มีอะไรถูกซ่อน —");
const none = filterWithReasons(rows, [inMonth(10), isBrand("all"), matches("")]);
is("แถวที่ผ่านทั้งหมด", none.rows.map((r) => r.id), ["a", "b", "e"]);
is("ซ่อน 2 (เดือน)", none.hiddenTotal, 2);
const clean = filterWithReasons(rows, []);
is("ไม่มีตัวกรองเลย = ไม่ซ่อนอะไร", { n: clean.rows.length, hidden: clean.hidden, t: clean.hiddenTotal }, { n: 5, hidden: [], t: 0 });

console.log("\n— นับเหตุผลถูกต้อง —");
const two = filterWithReasons(rows, [inMonth(10), isBrand("teppen"), matches("")]);
is("เหลือเฉพาะ teppen เดือน 10", two.rows.map((r) => r.id), ["a", "e"]);
is("ซ่อนรวม 3", two.hiddenTotal, 3);
// c และ d ตกเดือน (c เป็น teppen, d เป็น omakase) — ทั้งคู่ถูกนับที่ "นอกช่วงเวลา"
// เพราะเป็นเงื่อนไขแรกที่ไม่ผ่าน; เหลือ b ที่ตกเพราะแบรนด์
is("แยกตามเงื่อนไขแรกที่ไม่ผ่าน", two.hidden, [{ label: "นอกช่วงเวลา", count: 2 }, { label: "คนละแบรนด์", count: 1 }]);
is("ผลรวมเหตุผล = ยอดที่ซ่อน", two.hidden.reduce((s, r) => s + r.count, 0), two.hiddenTotal);
is("total คือจำนวนที่ส่งเข้ามา", two.total, 5);

console.log("\n— สลับลำดับ = เปลี่ยนการให้เหตุผล ไม่เปลี่ยนผลลัพธ์ —");
const flipped = filterWithReasons(rows, [isBrand("teppen"), inMonth(10), matches("")]);
is("แถวที่เหลือเหมือนเดิม", flipped.rows.map((r) => r.id), two.rows.map((r) => r.id));
is("ยอดซ่อนเท่าเดิม", flipped.hiddenTotal, two.hiddenTotal);
is("แต่เหตุผลย้ายไปเงื่อนไขแรก", flipped.hidden, [{ label: "คนละแบรนด์", count: 2 }, { label: "นอกช่วงเวลา", count: 1 }]);
is("ผลรวมยังตรง", flipped.hidden.reduce((s, r) => s + r.count, 0), flipped.hiddenTotal);

console.log("\n— เหตุผลที่ไม่ได้ซ่อนอะไร ต้องไม่โผล่ —");
const oneReason = filterWithReasons(rows, [inMonth(10), isBrand("all"), matches("")]);
is("มีเหตุผลเดียว", oneReason.hidden, [{ label: "นอกช่วงเวลา", count: 2 }]);
is("คำค้นที่ไม่เจออะไรเลย ซ่อนหมด", filterWithReasons(rows, [matches("ไม่มีจริง")]).hiddenTotal, 5);

console.log("\n— ขอบ —");
const empty = filterWithReasons([] as Row[], [inMonth(10)]);
is("ลิสต์ว่าง", { rows: empty.rows.length, hidden: empty.hidden, total: empty.total, hiddenTotal: empty.hiddenTotal }, { rows: 0, hidden: [], total: 0, hiddenTotal: 0 });
// เคสจริงที่ทำให้ต้องมีฟีเจอร์นี้: ทุกแถวถูกตัวกรองเดือนซ่อนหมด หน้าจอว่าง
// แต่ต้องบอกได้ว่าว่างเพราะอะไร ไม่ใช่เพราะไม่มีข้อมูล
const allHidden = filterWithReasons(rows, [inMonth(12)]);
is("ซ่อนหมดแต่ยังรายงานได้", { shown: allHidden.rows.length, total: allHidden.total, why: allHidden.hidden }, { shown: 0, total: 5, why: [{ label: "นอกช่วงเวลา", count: 5 }] });

console.log(`\n${fail === 0 ? "✅" : "❌"} filter-summary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
