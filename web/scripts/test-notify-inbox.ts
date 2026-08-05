/* Does a notification reach the person's own bell, or only Slack?
 *
 * It only reached Slack. notify() had forty-two call sites and the in-app inbox
 * had four, so on 2 Aug 2026 the production `notifications` table held zero
 * rows while twenty-two Slack messages had gone out that same day — and the
 * bell read "ไม่มีอะไรค้างอยู่" to someone with work waiting on them.
 *
 * That is the failure this pins down: an event the inbox has no word for must
 * still land somewhere, and money must never land in a bell at all.
 * Run: node --import tsx scripts/test-notify-inbox.ts */

import { inboxKind, resolveTeam, teamFromLink, hasChannel } from "../src/lib/notifyRouting";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("\nทุก event ของ notify() มีที่ลงในกล่องแจ้งเตือน");
// The seven NotifyEvent values in lib/notify. If someone adds an eighth and
// forgets the map, it must still be delivered — see the fallback test below.
is("newTask", inboxKind("newTask"), "assigned");
is("approval", inboxKind("approval"), "approval");
is("mention", inboxKind("mention"), "comment");
is("feedback", inboxKind("feedback"), "revision");
is("approved", inboxKind("approved"), "approved");
is("rejected → ตีกลับ", inboxKind("rejected"), "revision");
is("launch", inboxKind("launch"), "launch");

console.log("\nevent ที่ไม่รู้จักต้องไม่หายไปเฉย ๆ");
// Dropping the unrecognised is exactly how the inbox went empty in the first
// place, so an unknown event is filed, not discarded.
is("event ใหม่ที่ยังไม่ได้ map", inboxKind("somethingNew"), "assigned");
is("ไม่ส่ง event มาเลย", inboxKind(undefined), "assigned");
is("event ว่าง", inboxKind(""), "assigned");

console.log("\nเรื่องเงินไม่เข้ากล่องของใคร");
// The rule the route enforces: finance is DM'd to one person and reaches no
// channel — so it must not become a bell row for the requester either.
is("ลิงก์ /expenses = finance", teamFromLink("/expenses"), "finance");
is("ลิงก์ /finance = finance", teamFromLink("/finance"), "finance");
is("team ระบุมาเป็น finance", resolveTeam("finance", "/my-tasks"), "finance");
// …while the queue link that money notifications now use is NOT finance-routed,
// because it points at My Tasks. The route keys the exclusion off `team`, which
// is why that call site passes no team and lands on general.
is("คิวอนุมัติเป็น general", teamFromLink("/my-tasks?tab=approval"), "general");

console.log("\nงานแต่ละแบบยังเข้าห้อง Slack เดิม");
is("graphic", teamFromLink("/graphic?open=1"), "graphic");
is("content", teamFromLink("/content?post=c1"), "graphic");
is("kol", teamFromLink("/kol/5"), "kol");

console.log("\nCaption sign-off ต้องไม่หลุดเข้าห้อง Slack");
// 5 ส.ค. 69: อนุมัติ caption รวดเดียว 10 อัน → ขึ้นห้อง #05_marketing_graphic
// 10 ข้อความ เพราะตัวแจ้งไม่ได้ระบุ team จึง route ตามลิงก์ /content ซึ่งมีห้อง
// และไม่มีใครให้ DM (คนเขียนเป็น inform) route เลยตกไปเข้าห้องแทน
is("ลิงก์ /content ยังชี้ห้อง graphic (จึงต้องระบุ team ทับ)", teamFromLink("/content?post=c1"), "graphic");
is("ระบุ general ต้องชนะลิงก์", resolveTeam("general", "/content?post=c1"), "general");
check("general ไม่มีห้อง Slack — ต่อให้ไม่มีใครให้ DM ก็ไม่หลุดเข้าห้อง", !hasChannel("general"));
// ทางอื่นยังมีห้องเหมือนเดิม จะได้รู้ว่าปิดเฉพาะ caption ไม่ได้ปิดทั้งระบบ
check("graphic ยังมีห้อง", hasChannel("graphic"));
check("vdo ยังมีห้อง", hasChannel("vdo"));
check("kol ยังมีห้อง", hasChannel("kol"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
