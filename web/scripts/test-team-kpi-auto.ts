/* Auto-filled KPI values. These land in someone's score without anyone typing
 * them, so the rules for WHEN they apply — and when a typed value must win —
 * matter as much as the arithmetic.
 * Run: node --import tsx scripts/test-team-kpi-auto.ts */

import { KpiInput, inputKey, kpisFor, scorePerson } from "../src/lib/data/teamKpi";
import { KpiSignals } from "../src/lib/data/teamKpiSignals";
import { autoInputs, isOverridden, mergeInputs } from "../src/lib/data/teamKpiAuto";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const signals = (patch: Partial<KpiSignals>): KpiSignals => ({
  designer: "Jino", month: "2026-07",
  pieces: 0, revisions: 0, piecesRevised: 0, cleanRate: null,
  due: 0, onTime: 0, late: 0, stillOpen: 0, pending: 0,
  onTimeRate: null, avgDaysLate: 0, maxDaysLate: 0,
  ...patch,
});

const full = signals({
  pieces: 10, revisions: 3, piecesRevised: 2, cleanRate: 80,
  due: 8, onTime: 6, late: 2, onTimeRate: 75,
});

console.log("— เติมเฉพาะ KPI ที่มีแหล่งข้อมูลจริง —");
const gd = autoInputs("p1", kpisFor("Graphic Designer"), full);
is("On-time เติมจากอัตราส่งตรงเวลา", gd[inputKey("p1", "On-time")].input, { score: 75 });
is("Design Quality เติมจากผ่านรวดเดียว", gd[inputKey("p1", "Design Quality")].input, { score: 80 });
is("Design Quality ถูกทำเครื่องหมายว่าเป็น proxy", gd[inputKey("p1", "Design Quality")].proxy, true);
is("Performance Support ไม่มีข้อมูล → ไม่เติม", gd[inputKey("p1", "Performance Support")], undefined);
is("ทุกค่าที่เติมมีที่มากำกับ", Object.values(gd).every((v) => !!v.source && !!v.basis), true);

const leader = autoInputs("p2", kpisFor("Creative Leader"), full);
is("Approval Rate เติมเป็นแบบ Higher เทียบ 100", leader[inputKey("p2", "Approval Rate")].input, { target: 100, actual: 80 });
is("Reach Engagement Index ไม่มีที่มาต่อคน → ไม่เติม", leader[inputKey("p2", "Reach Engagement Index")], undefined);

const creator = autoInputs("p3", kpisFor("Video Creator"), full);
is("Hook Rate ไม่มี creator ในข้อมูล performance → ไม่เติม", creator[inputKey("p3", "Hook Rate")], undefined);
is("Watch Time เช่นกัน", creator[inputKey("p3", "Watch Time")], undefined);
is("แต่ On-time ของ Video Creator ยังเติมได้", creator[inputKey("p3", "On-time")].input, { score: 75 });

console.log("— ไม่มีข้อมูล = ไม่เติม (ไม่ใช่เติมศูนย์) —");
is("ไม่มี signals เลย → ว่าง", autoInputs("p1", kpisFor("Graphic Designer"), null), {});
is("ยังสรุปความตรงเวลาไม่ได้ → ไม่เติม On-time",
  autoInputs("p1", kpisFor("Graphic Designer"), signals({ pieces: 2, cleanRate: 100 }))[inputKey("p1", "On-time")], undefined);
is("ยังไม่มีชิ้นอนุมัติ → ไม่เติม Design Quality",
  autoInputs("p1", kpisFor("Graphic Designer"), signals({ due: 3, onTime: 3, onTimeRate: 100 }))[inputKey("p1", "Design Quality")], undefined);

console.log("— ค่าที่คนกรอกเองต้องชนะเสมอ —");
const manual: Record<string, KpiInput> = { [inputKey("p1", "Design Quality")]: { score: 95 } };
const merged = mergeInputs(gd, manual);
is("คะแนนที่กรอกเองทับค่าอัตโนมัติ", merged[inputKey("p1", "Design Quality")].score, 95);
is("แถวอื่นยังใช้ค่าอัตโนมัติ", merged[inputKey("p1", "On-time")].score, 75);
is("ช่องว่างไม่ไปลบค่าอัตโนมัติทิ้ง",
  mergeInputs(gd, { [inputKey("p1", "On-time")]: { score: null } })[inputKey("p1", "On-time")].score, 75);
is("แก้ target เอง แต่ actual ที่นับให้ยังอยู่",
  mergeInputs(leader, { [inputKey("p2", "Approval Rate")]: { target: 90 } })[inputKey("p2", "Approval Rate")],
  { target: 90, actual: 80 });

console.log("— รู้ว่าแถวไหนถูกแก้เอง —");
is("ค่าตรงกับอัตโนมัติ = ไม่ถือว่าแก้", isOverridden(gd[inputKey("p1", "On-time")], { score: 75 }), false);
is("ค่าต่างจากอัตโนมัติ = แก้เอง", isOverridden(gd[inputKey("p1", "On-time")], { score: 60 }), true);
is("ยังไม่กรอกอะไร = ไม่ถือว่าแก้", isOverridden(gd[inputKey("p1", "On-time")], { score: null }), false);
is("ไม่มีค่าอัตโนมัติให้เทียบ = ไม่ถือว่าแก้", isOverridden(undefined, { score: 60 }), false);

console.log("— คะแนนออกมาได้โดยไม่ต้องกรอกอะไรเลย —");
const person = { id: "p1", name: "Jino", position: "Graphic Designer" };
const auto = scorePerson(person, mergeInputs(gd, {}));
// Design Quality 80×0.5 + On-time 75×0.3 = 62.5 · Performance Support ยังไม่มีข้อมูล
is("คิดคะแนนจากค่าอัตโนมัติล้วน", Number(auto.score.toFixed(1)), 62.5);
is("แต่ยังไม่ครบ เพราะเหลือ KPI ที่ต้องให้คะแนนเอง", auto.complete, false);
const withManual = scorePerson(person, mergeInputs(gd, { [inputKey("p1", "Performance Support")]: { score: 90 } }));
is("กรอกตัวที่เหลือแล้วครบ", withManual.complete, true);
is("คะแนนรวม = 62.5 + 90×0.2", Number(withManual.score.toFixed(1)), 80.5);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
