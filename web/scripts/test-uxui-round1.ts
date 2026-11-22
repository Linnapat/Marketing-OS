/* UX/UI test 22 Nov 2026, round 1.
 * Run: node --import tsx scripts/test-uxui-round1.ts */
import { jobHolder, acceptedByOther } from "../src/lib/data/graphic";
import { openBriefRounds } from "../src/lib/data/briefDeadline";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("\n— 1.1 ผู้ถืองานชื่อเดียวทุกจุด —");
{
  // ใบ OMD_2611_002-A01: Creative Leader กดรับงาน แล้วมอบให้ designer
  const g = { designer: "Jungjing", acceptedBy: "Pichayaporn", deliverables: [] };
  is("ผู้ถืองานคือ designer ที่ถูกระบุ", jobHolder(g), "Jungjing");
  is("คนกดรับงานแสดงแยก", acceptedByOther(g), "Pichayaporn");
  is("ยังไม่ระบุ designer → คนที่รับงานคือผู้ถือ", jobHolder({ designer: "Unassigned", acceptedBy: "Four", deliverables: [] }), "Four");
  is("…และไม่ต้องพูดซ้ำว่าใครรับ", acceptedByOther({ designer: "Unassigned", acceptedBy: "Four", deliverables: [] }), null);
  is("คนเดียวกันทั้งสองช่อง → ไม่พูดซ้ำ", acceptedByOther({ designer: "Jungjing", acceptedBy: "Jungjing", deliverables: [] }), null);
  is("ไม่มีใครเลย → ไม่มีผู้ถือ", jobHolder({ designer: "Unassigned", deliverables: [] }), null);
}

console.log("\n— 1.6 เดดไลน์บรีฟ: บอกว่าเป็นของงานเดือนไหน —");
{
  const ext = { cutoffDay: 25, extensions: { "2026-11-20": "2026-11-27" }, holidays: [] };
  const plain = { cutoffDay: 25, extensions: {}, holidays: [] };
  const open = openBriefRounds("2026-11-22", ext);
  is("รอบที่ยังเปิด: งานเดือน ม.ค. 2027 ภายใน 27 พ.ย.", [open[0]?.forMonth, open[0]?.iso, open[0]?.extendedFrom], ["2027-01", "2026-11-27", "2026-11-20"]);
  is("รอบถัดไป: งานเดือน ก.พ. 2027 ภายใน 18 ธ.ค.", [open[1]?.forMonth, open[1]?.iso], ["2027-02", "2026-12-18"]);
  is("ไม่ขยาย: 22 พ.ย. รอบ ม.ค. ปิดแล้ว รอบแรกที่เปิดคือ ก.พ.", openBriefRounds("2026-11-22", plain)[0]?.forMonth, "2027-02");
  is("วันสุดท้ายยังนับว่าเปิด", openBriefRounds("2026-11-20", plain)[0]?.forMonth, "2027-01");
  is("ปิดกฎ = ไม่มีรอบ", openBriefRounds("2026-11-22", { ...plain, cutoffDay: 0 }).length, 0);
  is("กฎศุกร์ที่ 3 ไม่เปลี่ยน", openBriefRounds("2026-12-01", plain)[0]?.iso, "2026-12-18");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
