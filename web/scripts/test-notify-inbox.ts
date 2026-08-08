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

import { inboxKind, resolveTeam, teamFromLink, TEAM_FALLBACK } from "../src/lib/notifyRouting";

let pass = 0, fail = 0;
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
// Content left #05 on 7 ส.ค. 2026 — caption sign-off was burying the designers'
// own revision requests in a room they read for work assigned to them.
is("content แยกห้องแล้ว", teamFromLink("/content?post=c1"), "content");
is("kol", teamFromLink("/kol/5"), "kol");
// Content is the only team allowed to borrow a room, and only the one it came
// from — so a room that stops working never silently redirects somewhere odd.
is("content ยืมห้อง graphic ได้", TEAM_FALLBACK.content ?? "", "graphic");
is("ห้องอื่นไม่ยืมใคร", Object.keys(TEAM_FALLBACK).join(","), "content");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
