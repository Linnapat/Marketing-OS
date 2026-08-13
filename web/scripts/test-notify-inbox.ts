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

import { inboxKind, resolveTeam, teamFromLink, hasChannel, dmTargetsFor, TEAM_FALLBACK } from "../src/lib/notifyRouting";
import { NOTIF_TRIGGERS } from "../src/lib/data/settings";

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
// The eight NotifyEvent values in lib/notify. If someone adds a ninth and
// forgets the map, it must still be delivered — see the fallback test below.
is("newTask", inboxKind("newTask"), "assigned");
is("approval", inboxKind("approval"), "approval");
is("mention", inboxKind("mention"), "comment");
is("feedback", inboxKind("feedback"), "revision");
is("approved", inboxKind("approved"), "approved");
is("rejected → ตีกลับ", inboxKind("rejected"), "revision");
is("published", inboxKind("published"), "launch");
is("launch", inboxKind("launch"), "launch");

console.log("\npublish แยกสวิตช์จาก 'แคมเปญใกล้ live'");
// One key gated both, and the row on screen said "48h before campaign live
// date" — so a switch nobody thought applied to publishing silenced every
// "โพสต์ถูก publish" in the app, Slack and bell alike, with no hint why.
const trig = Object.fromEntries(NOTIF_TRIGGERS.map((t) => [t.key, t]));
is("มีสวิตช์ published", Boolean(trig.published), true);
is("published เปิดมาแต่แรก", trig.published?.def, true);
is("launch ยังปิดตามเดิม", trig.launch?.def, false);
is("คนละ key กัน", trig.published?.key !== trig.launch?.key, true);

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

console.log("\nเรื่องเงินถึงทั้งคนดูแลเงินและคนขอ");
// The standing recipient is ADDED to the named people, not swapped in: naming
// nobody used to mean the request itself went out to nobody, and naming the
// requester used to drop them.
const gik = "Gik", req = "Ploy";
is("ไม่ระบุชื่อ = ถึงคนดูแลเงินคนเดียว", dmTargetsFor("finance", [], gik).join(","), "Gik");
is("ระบุคนขอ = ถึงทั้งคู่", dmTargetsFor("finance", [req], gik).join(","), "Gik,Ploy");
// Same person twice — once from the env, once because the call site named them
// — is one message, not two.
is("คนเดียวกันไม่ได้สองครั้ง", dmTargetsFor("finance", ["gik"], gik).join(","), "Gik");
// Without SLACK_FINANCE_DM set, the named people still get theirs; the empty
// string must not become a recipient nobody can resolve.
is("ยังไม่ตั้ง SLACK_FINANCE_DM", dmTargetsFor("finance", [req], "").join(","), "Ploy");
// Everything else is untouched: no finance recipient smuggled into other teams.
is("ทีมอื่นไม่มีคนดูแลเงินแถมมา", dmTargetsFor("graphic", [req], gik).join(","), "Ploy");

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

console.log("\nCaption sign-off ต้องไม่หลุดเข้าห้อง Slack");
// 5 ส.ค. 69: อนุมัติ caption รวดเดียว 10 อัน → ขึ้นห้อง #05_marketing_graphic
// 10 ข้อความ เพราะตัวแจ้งไม่ได้ระบุ team จึง route ตามลิงก์ /content ซึ่งมีห้อง
// และไม่มีใครให้ DM (คนเขียนเป็น inform) route เลยตกไปเข้าห้องแทน
//
// ตอนนั้น /content ยืมห้อง graphic อยู่ ตอนนี้มีห้องของตัวเองแล้ว (#07) — ห้อง
// เปลี่ยนแต่ข้อสรุปเหมือนเดิมและแรงกว่าเดิม: ลิงก์นี้ route เข้าห้องได้เสมอ
// การแจ้ง caption จึงต้องระบุ team ทับทุกครั้ง ไม่ใช่ปล่อยให้เดาจากลิงก์
check("ลิงก์ /content route เข้าห้องได้ (จึงต้องระบุ team ทับ)", hasChannel(teamFromLink("/content?post=c1")));
is("ระบุ general ต้องชนะลิงก์", resolveTeam("general", "/content?post=c1"), "general");
check("general ไม่มีห้อง Slack — ต่อให้ไม่มีใครให้ DM ก็ไม่หลุดเข้าห้อง", !hasChannel("general"));
// ทางอื่นยังมีห้องเหมือนเดิม จะได้รู้ว่าปิดเฉพาะ caption ไม่ได้ปิดทั้งระบบ
check("graphic ยังมีห้อง", hasChannel("graphic"));
check("vdo ยังมีห้อง", hasChannel("vdo"));
check("kol ยังมีห้อง", hasChannel("kol"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
