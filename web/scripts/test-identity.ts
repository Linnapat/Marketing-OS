/* Runtime tests for lib/identity — the "who counts as me" rule.
 *
 * The bug behind it: one manager's work was filed as "Pupay", "Orapan" and
 * "orapan.ch@teppenthailand.co.th". My Tasks matched the member name exactly,
 * so she saw 9 of 27 items and nothing said the rest existed. An empty list
 * would have been noticed; a plausible-looking short one was not.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { personKeys, isSamePerson, sameName } from "../src/lib/identity";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const her = personKeys({ name: "Pupay", email: "orapan.ch@teppenthailand.co.th" }, { email: "orapan.ch@teppenthailand.co.th" });

console.log("\n— คนเดียวกันที่ถูกบันทึกหลายแบบ —");
is("ชื่อในระบบสมาชิก", isSamePerson("Pupay", her), true);
is("อีเมลเต็ม", isSamePerson("orapan.ch@teppenthailand.co.th", her), true);
is("ส่วนหน้า @ ของอีเมล (ที่งานเก่าเก็บไว้)", isSamePerson("orapan.ch", her), true);
is("ตัวพิมพ์/เว้นวรรคไม่สำคัญ", isSamePerson("  PUPAY ", her), true);

console.log("\n— ต้องไม่เดาเกินข้อมูล —");
// "Orapan" ไม่อยู่ในชุดคีย์ (ไม่ใช่ทั้งชื่อ ไม่ใช่ส่วนหน้าอีเมล) — จงใจไม่ fuzzy
// เพราะเดาผิดแล้วเอางานคนอื่นมาโชว์ แย่กว่าตกหล่น · เคสนี้แก้ที่ข้อมูลแทน
is("ชื่อเล่นอื่นที่ระบบไม่รู้จัก → ไม่แมตช์", isSamePerson("Orapan", her), false);
is("คนละคน", isSamePerson("Ken S.", her), false);
is("ค่าว่าง", isSamePerson("", her), false);
is("null", isSamePerson(null, her), false);
is("ไม่มีคีย์เลย → ไม่แมตช์อะไร (fail closed)", isSamePerson("Pupay", personKeys(null, null)), false);

console.log("\n— personKeys —");
is("เก็บทั้งชื่อ อีเมล และส่วนหน้าอีเมล", [...her].sort().join(","), "orapan.ch,orapan.ch@teppenthailand.co.th,pupay");
is("ไม่มีข้อมูล → ชุดว่าง", personKeys(undefined, undefined).size, 0);
is("ชื่อเว้นวรรคล้วนไม่ถูกนับ", personKeys({ name: "   " }).size, 0);

console.log("\n— sameName: เทียบสองค่าที่เก็บไว้ —");
is("ชื่อเดียวกัน", sameName("Boss", "boss"), true);
is("อีเมลกับส่วนหน้าอีเมล", sameName("orapan.ch@teppenthailand.co.th", "orapan.ch"), true);
is("คนละคน", sameName("Boss", "Aom"), false);
is("ค่าว่างไม่เท่ากับอะไรเลย", sameName("", ""), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
