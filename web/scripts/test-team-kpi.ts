/* Team KPI scoring — the review screen turns these numbers into a person's
 * rating, so an off-by-one here misjudges someone's month. Mirrors the rules the
 * Marketing KPI Bonus Calculator sheet documents (cap 120%, multiplier bands).
 * Run: node --import tsx scripts/test-team-kpi.ts */

import {
  ACHIEVEMENT_CAP,
  ALL_POSITIONS,
  CREATIVE_POSITIONS,
  KPI_TEMPLATE,
  KpiDef,
  KpiInput,
  achievement,
  band,
  emptyMonth,
  inputKey,
  kpisFor,
  multiplier,
  parseMonth,
  recentMonths,
  scorePerson,
  summarize,
  weighted,
} from "../src/lib/data/teamKpi";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}
const round = (value: number | null, digits = 2) =>
  value === null ? null : Number(value.toFixed(digits));

const def = (position: string, name: string): KpiDef =>
  KPI_TEMPLATE.find((k) => k.position === position && k.name === name)!;

console.log("— KPI_Template: น้ำหนักต้องรวมเป็น 100% ต่อตำแหน่ง —");
for (const position of ALL_POSITIONS) {
  const total = kpisFor(position).reduce((s, k) => s + k.weight, 0);
  is(`${position} รวม 100%`, round(total, 4), 1);
}
is("ทุกตำแหน่งมี KPI อย่างน้อย 1 ตัว", ALL_POSITIONS.every((p) => kpisFor(p).length > 0), true);
is("KOL Specialist ไม่ถูกนับเป็นทีม Creative", CREATIVE_POSITIONS.includes("KOL Specialist" as never), false);

console.log("— achievement: Higher / Lower / Manual —");
const hook = def("Video Creator", "Hook Rate");           // Higher
const onTime = def("Video Creator", "On-time");           // Manual
is("Higher = actual ÷ target", round(achievement(hook, { target: 30, actual: 31 })), 103.33);
is("Manual อ่านจากช่อง score", achievement(onTime, { score: 94 }), 94);
is("Lower = target ÷ actual (ต้นทุนยิ่งต่ำยิ่งดี)",
  round(achievement({ ...hook, direction: "Lower" }, { target: 10, actual: 9.5 })), 105.26);

console.log("— ช่องว่าง = ยังไม่ประเมิน ไม่ใช่ศูนย์ —");
is("ไม่มี input เลย → null", achievement(hook, undefined), null);
is("Higher ที่ไม่มี actual → null", achievement(hook, { target: 30 }), null);
is("Manual ที่ยังไม่ให้คะแนน → null", achievement(onTime, {}), null);
is("target = 0 ไม่หารศูนย์", achievement(hook, { target: 0, actual: 10 }), null);
is("Lower ที่ actual = 0 ไม่หารศูนย์", achievement({ ...hook, direction: "Lower" }, { target: 10, actual: 0 }), null);

console.log(`— cap ที่ ${ACHIEVEMENT_CAP}% ก่อนคูณน้ำหนัก —`);
is("ทำได้ 200% ถูก cap เหลือ 120%", round(weighted(hook, { target: 10, actual: 20 })), round(120 * 0.6));
is("ต่ำกว่า cap คูณตามจริง", round(weighted(hook, { target: 30, actual: 31 })), 62);
is("cap ใช้กับ Manual ด้วย", round(weighted(onTime, { score: 150 })), 24);

console.log("— multiplier ตามตารางในชีท —");
is("89.9% = 0", multiplier(89.9), 0);
is("90% = 0.25", multiplier(90), 0.25);
is("94.9% = 0.25", multiplier(94.9), 0.25);
is("95% = 0.5", multiplier(95), 0.5);
is("99.9% = 0.5", multiplier(99.9), 0.5);
is("100% = 1", multiplier(100), 1);
is("109.9% = 1", multiplier(109.9), 1);
is("110% = 1.1", multiplier(110), 1.1);
is("120% = 1.2", multiplier(120), 1.2);
is("เกิน 120% ก็ยัง 1.2", multiplier(180), 1.2);

console.log("— band สำหรับแถบสี —");
is("ยังไม่กรอกเลย = none", band(0, false), "none");
is("ต่ำกว่า 90 = low", band(85, true), "low");
is("90-99.9 = near", band(95, true), "near");
is("100-109.9 = on", band(100, true), "on");
is("110+ = over", band(112, true), "over");

console.log("— scorePerson: รวมคะแนนรายคน —");
const person = { id: "p1", name: "ทดสอบ", position: "Video Creator" };
const full: Record<string, KpiInput> = {
  [inputKey("p1", "Hook Rate")]: { target: 30, actual: 31 },
  [inputKey("p1", "Watch Time")]: { target: 14, actual: 15 },
  [inputKey("p1", "On-time")]: { score: 94 },
};
const result = scorePerson(person, full);
is("KPI Score = ผลรวม weighted", round(result.score, 1), 102.2);
is("ครบทุก KPI = complete", result.complete, true);
is("multiplier ตามคะแนน", result.multiplier, 1);
is("band = on", result.band, "on");

const partial = scorePerson(person, { [inputKey("p1", "Hook Rate")]: { target: 30, actual: 31 } });
is("กรอกไม่ครบ → complete = false", partial.complete, false);
is("กรอกไม่ครบ → นับน้ำหนักเฉพาะที่กรอก", round(partial.filledWeight, 2), 0.6);
is("กรอกไม่ครบ ยังไม่เอาไปเทียบเกณฑ์เต็ม", round(partial.score, 0), 62);

console.log("— summarize: ภาพรวมทีม —");
const a = scorePerson({ id: "a", name: "A", position: "Video Creator" }, {
  [inputKey("a", "Hook Rate")]: { target: 30, actual: 33 },
  [inputKey("a", "Watch Time")]: { target: 14, actual: 15 },
  [inputKey("a", "On-time")]: { score: 100 },
});
const b = scorePerson({ id: "b", name: "B", position: "Graphic Designer" }, {
  [inputKey("b", "Design Quality")]: { score: 80 },
  [inputKey("b", "On-time")]: { score: 80 },
  [inputKey("b", "Performance Support")]: { score: 80 },
});
const c = scorePerson({ id: "c", name: "C", position: "Creative Leader" }, {});
const team = summarize([a, b, c]);
is("นับคนทั้งหมด", team.people, 3);
is("นับเฉพาะคนที่ประเมินครบ", team.scored, 2);
is("คนที่ยังไม่ครบ", team.incomplete, 1);
is("ผ่าน 100%", team.onTarget, 1);
is("ต่ำกว่า 90%", team.atRisk, 1);
is("completeness นับรายแถว", round(team.completeness, 2), 0.67);
is("byFocus เรียงจากสูงไปต่ำ", team.byFocus[0].avg >= team.byFocus[team.byFocus.length - 1].avg, true);
is("คนที่ยังไม่กรอกไม่ดึงค่าเฉลี่ยลง", round(summarize([c]).avgScore, 0), 0);

console.log("— parseMonth: ข้อมูลเพี้ยนต้องไม่ทำหน้าพัง —");
is("ค่า null → เดือนว่าง", parseMonth("2026-07", null), emptyMonth("2026-07"));
is("ตัดคนที่ตำแหน่งไม่อยู่ในเทมเพลต",
  parseMonth("2026-07", { people: [{ id: "x", name: "X", position: "CEO" }] }).people.length, 0);
is("เก็บคนที่ตำแหน่งถูกต้อง",
  parseMonth("2026-07", { people: [{ id: "x", name: "X", position: "Video Creator" }] }).people.length, 1);
is("ค่าที่ไม่ใช่ตัวเลขกลายเป็น null",
  parseMonth("2026-07", { inputs: { k: { target: "สามสิบ", actual: 31 } } }).inputs.k,
  { target: null, actual: 31, score: null, note: "" });

console.log("— recentMonths —");
is("เดือนล่าสุดอยู่หัวลิสต์", recentMonths(new Date(2026, 6, 28), 3), ["2026-07", "2026-06", "2026-05"]);
is("ข้ามปีถอยหลังได้ถูก", recentMonths(new Date(2026, 0, 15), 2), ["2026-01", "2025-12"]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
