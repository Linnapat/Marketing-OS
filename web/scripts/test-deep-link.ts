/* Where a notification points.
 *
 * Every Slack DM and email carries one "เปิดใน Marketing OS" link, and the two
 * ways it can be wrong are both silent. A link that names no item still opens a
 * page, so nobody reports it — they just scroll. And a link the page cannot
 * read still LOOKS specific in the message: the recipient clicks it, lands on
 * an unfiltered board, and concludes the notification was noise.
 *
 * So this pins both halves together: the builders produce the param each page
 * reads, and the resolver waits for real data before it declares an id missing.
 * Run: node --import tsx scripts/test-deep-link.ts */

import { OPEN_PARAM, workLink, resolveOpenTarget } from "../src/lib/deepLink";
import { GRAPHIC_OPEN_PARAM } from "../src/lib/data/graphic";
import { teamFromLink, resolveTeam } from "../src/lib/notifyRouting";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("\nลิงก์ชี้ไปที่งานชิ้นนั้นจริง");
is("graphic", workLink.graphic(42), "/graphic?open=42");
is("task", workLink.task(7), "/my-tasks?task=7");
is("post", workLink.post("c-9"), "/content?post=c-9");
is("campaign", workLink.campaign("CAM-1"), "/campaigns/CAM-1");
is("campaign + tab", workLink.campaign("CAM-1", "approval"), "/campaigns/CAM-1?tab=approval");
is("kol", workLink.kol(5), "/kol/5");
// Money has no record page; the queue holding the Approve button is the closest
// honest destination, and it is a tab the recipient would otherwise have to find.
is("approvals queue", workLink.approvals(), "/my-tasks?tab=approval");

console.log("\nparam ที่ลิงก์ใช้ = param ที่หน้าอ่าน");
// The failure this prevents: renaming a param on the page while the builder
// keeps emitting the old one. Both sides read these constants, so a rename that
// misses one side cannot compile past here.
is("graphic ใช้ตัวเดียวกับ data/graphic", GRAPHIC_OPEN_PARAM, OPEN_PARAM.graphic);
is("ลิงก์ graphic มี param จริง", workLink.graphic(1).includes(`${OPEN_PARAM.graphic}=`), true);
is("ลิงก์ task มี param จริง", workLink.task(1).includes(`${OPEN_PARAM.task}=`), true);
is("ลิงก์ post มี param จริง", workLink.post(1).includes(`${OPEN_PARAM.post}=`), true);

console.log("\nid แปลก ๆ ไม่ทำลิงก์พัง");
// Ids come from Supabase and from campaign codes; a slash or space in one used
// to walk the path somewhere else entirely.
is("เว้นวรรค", workLink.post("a b"), "/content?post=a%20b");
is("ทับ", workLink.campaign("a/b"), "/campaigns/a%2Fb");
is("เครื่องหมายคำถาม", workLink.task("1?x=2"), "/my-tasks?task=1%3Fx%3D2");

console.log("\nลิงก์เจาะจงแล้วยังส่งเข้าห้องเดิม");
// Routing reads the path, so adding a query must not move a message to another
// team's channel (or, worse, to no channel).
is("graphic + param", teamFromLink(workLink.graphic(1)), "graphic");
is("content + param", teamFromLink(workLink.post("c-1")), "graphic");
is("kol รายคน", teamFromLink(workLink.kol(1)), "kol");
is("campaign รายตัว", teamFromLink(workLink.campaign("CAM-1")), "general");
is("campaign + tab", teamFromLink(workLink.campaign("CAM-1", "approval")), "general");
is("my-tasks + param", teamFromLink(workLink.task(1)), "general");
is("team ที่ระบุมาชนะ path", resolveTeam("vdo", workLink.graphic(1)), "vdo");
is("คิวอนุมัติยังเป็น general", teamFromLink(workLink.approvals()), "general");

console.log("\nรอข้อมูลจริงก่อนค่อยบอกว่าไม่เจอ");
const ROWS = [{ id: 1 }, { id: 2 }];
is("ยังไม่มี param → ไม่ทำอะไร", resolveOpenTarget(null, ROWS, true, null).action, "idle");
is("ยังโหลดไม่เสร็จ → รอ", resolveOpenTarget("1", [], false, null).action, "wait");
// The bug this is really about: the page seeds itself with demo rows, so a
// non-empty list is no proof the real ones are in. Deciding early told people
// their work was deleted a beat before it loaded.
is("ลิสต์ยังเป็น seed ก็ยังต้องรอ", resolveOpenTarget("999", ROWS, false, null).action, "wait");
is("โหลดเสร็จแล้วเจอ → เปิด", resolveOpenTarget("2", ROWS, true, null).action, "open");
is("เปิดแล้วได้แถวที่ถูก", resolveOpenTarget("2", ROWS, true, null).item?.id, 2);
is("โหลดเสร็จแล้วไม่เจอ → บอกว่าหาย", resolveOpenTarget("999", ROWS, true, null).action, "missing");
is("ลิสต์ว่างหลังโหลด → หาย", resolveOpenTarget("1", [], true, null).action, "missing");
is("เปิดไปแล้ว ห้ามเปิดซ้ำ", resolveOpenTarget("1", ROWS, true, "1").action, "idle");
// บั๊กจริง: latch เดิมเป็น boolean เลยล็อกตลอดกาล — คลิกลิงก์จาก Slack อันแรก
// เปิดได้ อันที่สองในแท็บเดิมเงียบสนิท ต้องแยกตาม id
is("ลิงก์คนละงานในแท็บเดิมต้องเปิดได้", resolveOpenTarget("2", ROWS, true, "1").action, "open");
is("และได้แถวที่ถูก", resolveOpenTarget("2", ROWS, true, "1").item?.id, 2);
// Task ids are numbers, post ids are strings, and the param is always a string.
is("string param เทียบกับ number id ได้", resolveOpenTarget("1", ROWS, true, null).action, "open");
is('id เป็น string ก็ยังเจอ', resolveOpenTarget("c-1", [{ id: "c-1" }], true, null).action, "open");

console.log("\nลิงก์คำขอเบิกงบต้องชี้ที่ใบ ไม่ใช่หน้าโมดูล");
is("มี ref → ชี้ที่ใบนั้น", workLink.expense("EXP-2026-014"), "/expenses?ref=EXP-2026-014");
is("เว้นวรรครอบ ๆ ตัดทิ้ง", workLink.expense("  EXP-2026-014 "), "/expenses?ref=EXP-2026-014");
// ยังไม่มี ref (draft ที่เปิดจากงบแคมเปญ) → ชี้หน้าโมดูลตามตรง ดีกว่าลิงก์ที่พาไปหาอะไรไม่เจอ
is("ไม่มี ref → หน้าโมดูล", workLink.expense(""), "/expenses");
is("null ก็หน้าโมดูล", workLink.expense(null), "/expenses");
is("ref ที่มีอักขระพิเศษต้อง encode", workLink.expense("EXP/2026 #14"), "/expenses?ref=EXP%2F2026%20%2314");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
