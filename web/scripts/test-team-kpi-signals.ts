/* Rework and lateness pulled from Graphic Requests for the KPI review. These
 * numbers sit next to a person's rating, so a miscount argues for the wrong
 * score — and "no data yet" must never arrive looking like 0%.
 * Run: node --import tsx scripts/test-team-kpi-signals.ts */

import { Graphic } from "../src/lib/data/graphic";
import { approvedAt, daysLate, kpiSignals, nameKey, signalsFor, totalSignals } from "../src/lib/data/teamKpiSignals";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const round = (v: number | null, d = 1) => (v === null ? null : Number(v.toFixed(d)));
const TODAY = "2026-07-20";

/** A request with one deliverable. `approved` empty = still open. */
function req(id: number, designer: string, dueIso: string | undefined, approved: string, revisions = 0, size = "1:1"): Graphic {
  const key = `Instagram::${size}`;
  return {
    id, stage: approved ? "Approved" : "In Progress", title: `งาน ${id}`, b: "teppen", campaign: "C",
    due: "", dueIso, designer, requester: "R", approver: "A", type: "Social Media", priority: "Med",
    fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—",
    blocker: null, waitingSince: null, nextAction: "—", platform: "Instagram", size, contentItem: "—",
    deliverables: [{ platform: "Instagram", size, status: approved ? "Approved" : "In Progress" }],
    history: [
      ...Array.from({ length: revisions }, () => ({ type: "revision_requested" as const, at: "2026-07-02T00:00:00Z", by: "R", deliverableKey: key })),
      ...(approved ? [{ type: "approved" as const, at: approved, by: "A", deliverableKey: key }] : []),
    ],
  } as Graphic;
}

console.log("— daysLate —");
is("ส่งตรงวัน = 0", daysLate("2026-07-10", "2026-07-10T09:00:00Z"), 0);
is("ส่งก่อนกำหนด = 0 (ไม่ติดลบ)", daysLate("2026-07-10", "2026-07-08T09:00:00Z"), 0);
is("สาย 3 วัน", daysLate("2026-07-10", "2026-07-13T09:00:00Z"), 3);
is("ไม่มี due = null", daysLate(undefined, "2026-07-13T09:00:00Z"), null);
is("ข้ามเดือนนับถูก", daysLate("2026-06-28", "2026-07-02T00:00:00Z"), 4);

console.log("— approvedAt: วันที่งานจบ —");
is("เอา approval แรก", approvedAt(req(1, "A", "2026-07-01", "2026-07-05T00:00:00Z")), "2026-07-05T00:00:00Z");
is("ยังไม่จบ = ว่าง", approvedAt(req(2, "A", "2026-07-01", "")), "");

console.log("— rework: นับจากชิ้นที่อนุมัติ ตามเดือนที่อนุมัติ —");
const rework = kpiSignals([
  req(1, "Aom", "2026-07-05", "2026-07-05T02:00:00Z", 0),
  req(2, "Aom", "2026-07-08", "2026-07-11T02:00:00Z", 2),
  req(3, "Aom", "2026-06-20", "2026-06-25T02:00:00Z", 3),   // เดือนก่อน
], "2026-07", TODAY);
const aom = signalsFor("Aom", rework)!;
is("ชิ้นงานที่อนุมัติในเดือนนี้", aom.pieces, 2);
is("จำนวนครั้งที่ถูกขอแก้", aom.revisions, 2);
is("ชิ้นที่ต้องแก้อย่างน้อย 1 รอบ", aom.piecesRevised, 1);
is("ผ่านรวดเดียว 50%", round(aom.cleanRate), 50);
is("งานเดือนก่อนไม่ปนเข้ามา", aom.revisions !== 5, true);

console.log("— lateness: นับจากเดือนที่ครบกำหนด —");
const late = kpiSignals([
  req(10, "Four", "2026-07-03", "2026-07-03T02:00:00Z"),   // ตรงเวลา
  req(11, "Four", "2026-07-05", "2026-07-09T02:00:00Z"),   // สาย 4 วัน
  req(12, "Four", "2026-07-10", ""),                        // เลยกำหนด ยังไม่จบ (สาย 10 วัน ณ 20 ก.ค.)
  req(13, "Four", "2026-07-28", ""),                        // ยังไม่ถึงกำหนด
  req(14, "Four", "2026-08-02", ""),                        // เดือนหน้า
], "2026-07", TODAY);
const four = signalsFor("Four", late)!;
is("งานที่ครบกำหนดเดือนนี้", four.due, 4);
is("ตรงเวลา 1", four.onTime, 1);
is("สาย 2 (จบแล้วสาย + ค้างเลยกำหนด)", four.late, 2);
is("ในนั้นยังไม่จบ 1", four.stillOpen, 1);
is("ยังไม่ถึงกำหนด 1 ไม่นับว่าสาย", four.pending, 1);
is("ตรงเวลา 33.3% จากงานที่สรุปได้", round(four.onTimeRate), 33.3);
is("สายเฉลี่ย (4 + 10) ÷ 2", round(four.avgDaysLate), 7);
is("สายมากสุด 10 วัน", four.maxDaysLate, 10);

console.log("— ไม่มีข้อมูล ≠ ศูนย์ —");
const openOnly = signalsFor("Four", kpiSignals([req(20, "Four", "2026-07-28", "")], "2026-07", TODAY))!;
is("มีแต่งานที่ยังไม่ถึงกำหนด → onTimeRate = null", openOnly.onTimeRate, null);
is("แต่ยังบอกได้ว่ามีงานครบกำหนดกี่ชิ้น", openOnly.due, 1);
is("ชื่อที่ไม่มีงาน → null", signalsFor("Nite", late), null);
is("เดือนที่ไม่มีงานเลย → ลิสต์ว่าง", kpiSignals(late as never as Graphic[], "2026-05", TODAY), []);

console.log("— งานที่ยังไม่มีคนรับ ไม่เป็นของใคร —");
const unassigned = kpiSignals([
  req(30, "Unassigned", "2026-07-01", ""),
  req(31, "—", "2026-07-01", ""),
  req(32, "Jino", "2026-07-01", ""),
], "2026-07", TODAY);
is("นับเฉพาะคนจริง", unassigned.map((r) => r.designer), ["Jino"]);

console.log("— ชื่อพิมพ์ต่างกันถือเป็นคนเดียวกัน —");
is("ตัดช่องว่าง + ไม่สนตัวพิมพ์", nameKey("  BOSS "), "boss");
is("จับคู่ชื่อแบบไม่สนตัวพิมพ์", signalsFor("four", late)?.due, 4);

console.log("— totalSignals: รวมทีมจากตัวเลขดิบ ไม่ใช่เฉลี่ยเปอร์เซ็นต์ —");
const team = totalSignals([...rework, ...late]);
// Aom: ครบกำหนด 2 (ตรง 1 · สาย 3 วัน 1) · Four: ครบกำหนด 4 (ตรง 1 · สาย 4 และ 10 วัน)
is("รวมงานที่ครบกำหนดของทุกคน", team.due, 6);
is("รวมงานสาย", team.late, 3);
is("อัตราตรงเวลา = 2 ตรง จาก 5 ที่สรุปได้", round(team.onTimeRate), 40);
is("สายเฉลี่ย = (3+4+10) ÷ 3 ไม่ใช่เฉลี่ยของค่าเฉลี่ย", round(team.avgDaysLate), 5.7);
is("สายมากสุดของทีม", team.maxDaysLate, 10);
is("ทีมที่ยังไม่มีข้อมูล → null", totalSignals([]).onTimeRate, null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
