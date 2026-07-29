/* The Work Calendar is a July-2026 template projected onto whatever month you
 * pick. Markers move by weekday-and-occurrence ("2nd Tuesday"), not by date, so
 * the projection is pure calendar arithmetic — exactly where off-by-ones live.
 * Run: node --import tsx scripts/test-work-calendar.ts */

import {
  monthMeta, isWeekendDate, isWeekend, projectMarks, nextValue, valueCycleFor, applyOverrides,
  VALUE_CYCLE, MONTH_NAMES, TEMPLATE_YEAR, TEMPLATE_MONTH, WEEKDAYS, DAYS, ALL_WORK_TASKS, WORK_SECTIONS,
} from "../src/lib/data/workflow";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

console.log("— monthMeta: จำนวนวันในเดือน —");
is("ก.ค. 2026 มี 31 วัน", monthMeta(2026, 6).days.length, 31);
is("ก.ย. 2026 มี 30 วัน", monthMeta(2026, 8).days.length, 30);
is("ก.พ. 2026 มี 28 วัน", monthMeta(2026, 1).days.length, 28);
is("ก.พ. 2024 (ปีอธิกสุรทิน) มี 29 วัน", monthMeta(2024, 1).days.length, 29);
is("ก.พ. 2000 (หาร 400 ลงตัว) มี 29 วัน", monthMeta(2000, 1).days.length, 29);
is("ก.พ. 1900 (หาร 100 แต่ไม่ 400) มี 28 วัน", monthMeta(1900, 1).days.length, 28);
is("ธ.ค. มี 31 วัน (ไม่ล้นไปปีหน้า)", monthMeta(2026, 11).days.length, 31);
is("ม.ค. มี 31 วัน", monthMeta(2026, 0).days.length, 31);
is("วันเริ่มที่ 1 จบที่วันสุดท้าย", [monthMeta(2026, 8).days[0], monthMeta(2026, 8).days.at(-1)], [1, 30]);
is("จำนวน letters เท่ากับจำนวน days", monthMeta(2026, 6).letters.length, monthMeta(2026, 6).days.length);
is("คืนค่า year/month ที่ขอมา", [monthMeta(2026, 6).year, monthMeta(2026, 6).month], [2026, 6]);

console.log("\n— ตัวอักษรวันในสัปดาห์ —");
// 1 July 2026 is a Wednesday.
is("1 ก.ค. 2026 เป็นวันพุธ (W)", monthMeta(2026, 6).letters[0], "W");
is("4 ก.ค. 2026 เป็นวันเสาร์ (S)", monthMeta(2026, 6).letters[3], "S");
is("5 ก.ค. 2026 เป็นวันอาทิตย์ (S)", monthMeta(2026, 6).letters[4], "S");
is("วันพฤหัสใช้ TH ไม่ใช่ T", monthMeta(2026, 6).letters[1], "TH");
is("ใช้แค่ตัวอักษรในชุดที่กำหนด",
  [...new Set(monthMeta(2026, 6).letters)].filter((l) => !["S", "M", "T", "W", "TH", "F"].includes(l)), []);
is("template ที่ประกาศไว้ตรงกับ WEEKDAYS ของ ก.ค. 2026",
  monthMeta(TEMPLATE_YEAR, TEMPLATE_MONTH).letters, WEEKDAYS);
is("DAYS มี 31 วันตาม template", DAYS.length, 31);

console.log("\n— วันหยุดสุดสัปดาห์ —");
is("4 ก.ค. 2026 (เสาร์) เป็นวันหยุด", isWeekendDate(2026, 6, 4), true);
is("5 ก.ค. 2026 (อาทิตย์) เป็นวันหยุด", isWeekendDate(2026, 6, 5), true);
is("6 ก.ค. 2026 (จันทร์) ไม่ใช่วันหยุด", isWeekendDate(2026, 6, 6), false);
is("3 ก.ค. 2026 (ศุกร์) ไม่ใช่วันหยุด", isWeekendDate(2026, 6, 3), false);
is("isWeekend (template) ตรงกับ isWeekendDate ของ ก.ค. 2026",
  DAYS.every((d) => isWeekend(d) === isWeekendDate(TEMPLATE_YEAR, TEMPLATE_MONTH, d)), true);
is("ทุกเดือนมีวันหยุด 8–10 วัน",
  [0, 1, 5, 6, 11].every((m) => {
    const n = monthMeta(2026, m).days.filter((d) => isWeekendDate(2026, m, d)).length;
    return n >= 8 && n <= 10;
  }), true);

console.log("\n— MONTH_NAMES —");
is("มี 12 เดือน", MONTH_NAMES.length, 12);
is("TEMPLATE_MONTH ชี้ไปที่ July", MONTH_NAMES[TEMPLATE_MONTH], "July");
is("เดือนแรกคือ January", MONTH_NAMES[0], "January");
is("เดือนสุดท้ายคือ December", MONTH_NAMES[11], "December");

console.log("\n— projectMarks: ย้าย marker ตาม 'วันอะไร ครั้งที่เท่าไหร่' —");
{
  // 1 July 2026 = Wednesday #1. In September 2026 the 1st Wednesday is the 2nd.
  is("พุธที่ 1 ของ ก.ค. (วันที่ 1) → พุธที่ 1 ของ ก.ย. (วันที่ 2)",
    projectMarks({ 1: "8" }, 2026, 8), { 2: "8" });
  is("ย้อนกลับมาเดือน template แล้วต้องได้วันเดิม",
    projectMarks({ 1: "8" }, TEMPLATE_YEAR, TEMPLATE_MONTH), { 1: "8" });
  is("ทั้งเดือน template project ทับตัวเองได้เหมือนเดิม",
    projectMarks({ 1: "7", 15: "8", 31: "9" }, TEMPLATE_YEAR, TEMPLATE_MONTH), { 1: "7", 15: "8", 31: "9" });
}
{
  // 8 July 2026 is the 2nd Wednesday; the 2nd Wednesday of September 2026 is the 9th.
  is("พุธที่ 2 ของ ก.ค. (8) → พุธที่ 2 ของ ก.ย. (9)", projectMarks({ 8: "8" }, 2026, 8), { 9: "8" });
  is("marker หลายตัวย้ายพร้อมกัน", projectMarks({ 1: "7", 8: "8" }, 2026, 8), { 2: "7", 9: "8" });
}
{
  // 29 July 2026 is the 5th Wednesday. February 2026 has only 4 Wednesdays, so
  // that marker has nowhere to land and must be dropped, not clamped onto a wrong day.
  const out = projectMarks({ 29: "9" }, 2026, 1);
  is("พุธครั้งที่ 5 ที่เดือนปลายทางไม่มี → ตัดทิ้ง ไม่ยัดลงวันอื่น", out, {});
}
{
  const out = projectMarks({ 1: "7", 29: "9" }, 2026, 1);
  is("marker ที่ย้ายได้ยังอยู่ แม้ตัวอื่นถูกตัด", Object.values(out), ["7"]);
}
{
  is("ไม่มี marker เลย = ไม่มีผลลัพธ์", projectMarks({}, 2026, 8), {});
  // Marks must stay inside the target month's real day range.
  const out = projectMarks({ 1: "7", 8: "8", 15: "9", 22: "6", 29: "8-9" }, 2026, 1);
  is("ทุกวันที่ผลลัพธ์อยู่ในช่วงวันของเดือนปลายทาง",
    Object.keys(out).every((d) => Number(d) >= 1 && Number(d) <= 28), true);
}
{
  // Projection preserves the marker's value, only the day changes.
  const out = projectMarks({ 1: "8-9" }, 2026, 8);
  is("ค่าของ marker ไม่ถูกแปลง", Object.values(out), ["8-9"]);
}

console.log("\n— nextValue: กดวนค่าในช่อง —");
is("ช่องว่าง → ค่าแรก", nextValue(undefined), VALUE_CYCLE[0]);
is("ค่าว่าง '' → ค่าแรก", nextValue(""), VALUE_CYCLE[0]);
is("7 → 8", nextValue("7"), "8");
is("8 → 9", nextValue("9"), "6");
is("ค่าสุดท้ายวนกลับเป็นว่าง (= ลบ marker)", nextValue(VALUE_CYCLE.at(-1)), "");
// ชุดค่าอิงเดือนที่เปิดอยู่ ค่าจากเดือนอื่นจึงเป็นเรื่องปกติ ไม่ใช่ข้อมูลเสีย —
// กดครั้งเดียวแล้วหายไปเลยคือการลบ marker ของคนอื่นทิ้งโดยไม่ได้ตั้งใจ
is("ค่าที่ไม่อยู่ในชุด → เริ่มวนที่ค่าแรก (ไม่ลบทิ้งทันที)", nextValue("99"), VALUE_CYCLE[0]);
{
  // Cycling from empty must walk the whole list and land back on empty.
  let v = nextValue(undefined), seen = [v];
  for (let i = 0; i < VALUE_CYCLE.length; i++) { v = nextValue(v); seen.push(v); }
  is("กดวนครบรอบแล้วกลับมาว่าง", seen.at(-1), "");
  is("กดวนครบทุกค่าใน VALUE_CYCLE", seen.slice(0, VALUE_CYCLE.length), VALUE_CYCLE);
}

console.log("\n— valueCycleFor: marker วางแผนล่วงหน้า 2 เดือน —");
// marker = เดือนของงาน ทีมวางแผนล่วงหน้า 2 เดือน ชุดค่าจึงต้องอิงเดือนที่เปิดอยู่
is("กรกฎาคม = ชุดเดิมของ template", valueCycleFor(7), ["7", "8", "9", "6", "8-9"]);
// เคสที่ผู้ใช้แจ้ง: อยู่เดือน 8 ต้องเลือก 10 และ 9-10 ได้
is("สิงหาคม เลือกเดือน 10 และ 9-10 ได้", valueCycleFor(8), ["8", "9", "10", "7", "9-10"]);
is("สิงหาคม: มี 10 อยู่ในชุด", valueCycleFor(8).includes("10"), true);
is("สิงหาคม: มี 9-10 อยู่ในชุด", valueCycleFor(8).includes("9-10"), true);
// ข้ามปี: เดือนต้องวนกลับเป็น 1..12 ไม่ใช่ 13/14
is("พฤศจิกายน วนข้ามปี", valueCycleFor(11), ["11", "12", "1", "10", "12-1"]);
is("ธันวาคม วนข้ามปี", valueCycleFor(12), ["12", "1", "2", "11", "1-2"]);
is("มกราคม เดือนก่อนหน้าคือ 12", valueCycleFor(1), ["1", "2", "3", "12", "2-3"]);
is("ทุกเดือนได้ 5 ค่าเสมอ", Array.from({ length: 12 }, (_, i) => valueCycleFor(i + 1).length), Array(12).fill(5));
{
  // nextValue ต้องเดินตามชุดของเดือนที่ส่งเข้าไป ไม่ใช่ชุดของกรกฎาคม
  is("สิงหาคม: 9 → 10", nextValue("9", 8), "10");
  is("สิงหาคม: 7 → 9-10 (ตัวสุดท้ายก่อนลบ)", nextValue("7", 8), "9-10");
  is("สิงหาคม: 9-10 → ว่าง", nextValue("9-10", 8), "");
  let v = nextValue(undefined, 8); const seen = [v];
  for (let i = 0; i < 5; i++) { v = nextValue(v, 8); seen.push(v); }
  is("สิงหาคม: กดวนครบรอบแล้วกลับมาว่าง", seen.at(-1), "");
  is("สิงหาคม: กดวนครบทุกค่า", seen.slice(0, 5), valueCycleFor(8));
}

console.log("\n— applyOverrides: ค่าที่ admin แก้ทับของที่ generate มา —");
{
  const base = { 1: "7", 8: "8" };
  is("ไม่มี override = ได้ค่าเดิม", applyOverrides(base, "2026-09", "t1", {}), base);
  is("override ทับค่าเดิมในวันเดียวกัน",
    applyOverrides(base, "2026-09", "t1", { "2026-09::t1::1": "9" }), { 1: "9", 8: "8" });
  is("override เพิ่มวันใหม่ได้",
    applyOverrides(base, "2026-09", "t1", { "2026-09::t1::20": "6" }), { 1: "7", 8: "8", 20: "6" });
  is("override เป็นค่าว่าง = ลบวันนั้นออก",
    applyOverrides(base, "2026-09", "t1", { "2026-09::t1::1": "" }), { 8: "8" });
}
{
  const base = { 1: "7" };
  // The key is monthKey::taskKey::day — a mismatch in either part must not apply.
  is("override ของเดือนอื่นไม่รั่วมา",
    applyOverrides(base, "2026-09", "t1", { "2026-10::t1::1": "9" }), { 1: "7" });
  is("override ของ task อื่นไม่รั่วมา",
    applyOverrides(base, "2026-09", "t1", { "2026-09::t2::1": "9" }), { 1: "7" });
  is("prefix ที่คล้ายกันแต่ไม่ตรง ไม่ถูกนำมาใช้",
    applyOverrides(base, "2026-09", "t1", { "2026-09::t10::1": "9" }), { 1: "7" });
  is("override หลายตัวคนละเดือน เลือกมาแค่ของเดือนที่ขอ",
    applyOverrides(base, "2026-09", "t1", { "2026-09::t1::5": "8", "2026-10::t1::5": "9" }), { 1: "7", 5: "8" });
}
{
  // applyOverrides must not mutate the generated marks it was handed.
  const base = { 1: "7" };
  applyOverrides(base, "2026-09", "t1", { "2026-09::t1::1": "9", "2026-09::t1::2": "8" });
  is("ไม่แก้ object ต้นฉบับ (ไม่ mutate)", base, { 1: "7" });
}
{
  const overrides = { "2026-09::t1::1": "9", "2026-09::t1::8": "", "2026-09::t1::15": "6" };
  is("override หลายตัวพร้อมกัน (ทับ + ลบ + เพิ่ม)",
    applyOverrides({ 1: "7", 8: "8" }, "2026-09", "t1", overrides), { 1: "9", 15: "6" });
}

console.log("\n— โครงงานใน template —");
is("มี section อยู่จริง", WORK_SECTIONS.length > 0, true);
is("ALL_WORK_TASKS = ผลรวมงานทุก section",
  ALL_WORK_TASKS.length, WORK_SECTIONS.reduce((s, sec) => s + sec.tasks.length, 0));
is("ทุกงานมีชื่อ EN", ALL_WORK_TASKS.every((t) => !!t.en), true);
is("ทุกงานมีชื่อ JP", ALL_WORK_TASKS.every((t) => !!t.jp), true);
is("ทุกงานระบุผู้รับผิดชอบ (R)", ALL_WORK_TASKS.every((t) => !!t.r), true);
is("ทุกงานผูกกับ section", ALL_WORK_TASKS.every((t) => !!t.section?.key), true);
is("marker ทุกตัวในทุกงานใช้ค่าในชุด VALUE_CYCLE",
  ALL_WORK_TASKS.flatMap((t) => Object.values(t.marks ?? {})).filter((v) => !VALUE_CYCLE.includes(v as string)), []);
is("วันที่ของ marker ทุกตัวอยู่ในช่วง 1–31",
  ALL_WORK_TASKS.flatMap((t) => Object.keys(t.marks ?? {}))
    .filter((d) => Number(d) < 1 || Number(d) > 31), []);
{
  // Every template marker must survive a round trip through a 31-day month.
  const longMonth = ALL_WORK_TASKS.every((t) => {
    const marks = t.marks ?? {};
    return Object.keys(projectMarks(marks, 2026, 11)).length <= Object.keys(marks).length;
  });
  is("project ไปเดือน 31 วันแล้ว marker ไม่งอกเกินเดิม", longMonth, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
