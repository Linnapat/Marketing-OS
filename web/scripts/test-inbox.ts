/* Runtime tests for grouping the bell's rows into per-job conversations.
 * Run with:  npm test */

import { conversationThreads, jobTitleOf, splitSaid, threadHref, canonicalLink, graphicIdOf, type InboxItem } from "../src/lib/data/inbox";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

let seq = 0;
const row = (over: Partial<InboxItem>): InboxItem => ({
  id: ++seq, event: "comment", title: "💬 Kani Last Chance — Reel",
  detail: "Pichayaporn: 0:40 จิ้มช่วงเดดแอร์", link: "/graphic?open=88",
  actor: null, createdAt: "2026-08-25T16:00:00Z", readAt: null, ...over,
});

console.log("\n— ชื่องานจากหัวข้อแจ้งเตือน —");
is("ตัดไอคอนหน้าออก", jobTitleOf("💬 Kani Last Chance — Reel"), "Kani Last Chance — Reel");
is("ตัดคำนำหน้าที่ลงท้ายด้วย :", jobTitleOf("↩ 👀 รอตรวจอีกหนึ่งด้าน: Kani Last Chance — Reel"), "Kani Last Chance — Reel");
is("ชื่อที่ไม่มีคำนำหน้าไม่ถูกแตะ", jobTitleOf("Kani seasonal Launch — Reel"), "Kani seasonal Launch — Reel");
is("หางสั้นเกินไป ไม่นับเป็นชื่องาน", jobTitleOf("งานเสร็จ: ok"), "งานเสร็จ: ok");

console.log("\n— คนพูดกับสิ่งที่พูด —");
is("แยกชื่อคนพูดออกจากข้อความ", splitSaid("Pichayaporn: 0:28ตัดtextออก").by, "Pichayaporn");
is("ข้อความที่เหลือไม่ติดชื่อ", splitSaid("Pichayaporn: 0:28ตัดtextออก").text, "0:28ตัดtextออก");
is("ไม่มีชื่อนำหน้า → ไม่เดา", splitSaid("โลโก้เล็กไป ขอใหญ่ขึ้น").by, null);
// คำนำหน้ายาว ๆ คือประโยค ไม่ใช่ชื่อคน
is("ประโยคยาวก่อน : ไม่ใช่ชื่อคน", splitSaid("ขอแก้ตรงนี้ก่อนนะเพราะลูกค้าเพิ่งส่งราคามาใหม่เมื่อเช้านี้: ราคาผิด").by, null);

console.log("\n— รวมเป็นบทสนทนารายงาน —");
{
  const threads = conversationThreads([
    row({ id: 1, createdAt: "2026-08-25T15:56:00Z", event: "revision", title: "↩ ✏️ งานกราฟฟิกถูกส่งกลับแก้: Kani seasonal Launch — Reel", detail: "Facebook — 0:28ตัดtextออก", link: "/graphic?open=90" }),
    row({ id: 2, createdAt: "2026-08-25T15:58:00Z", title: "💬 Kani seasonal Launch — Reel", detail: "Pichayaporn: 0:28ตัดtextออก", link: "/graphic?open=90" }),
    row({ id: 3, createdAt: "2026-08-25T16:01:00Z", title: "💬 Kani Last Chance — Reel", detail: "Pichayaporn: 0:40 จิ้มช่วงเดดแอร์", link: "/graphic?open=88" }),
    row({ id: 4, createdAt: "2026-08-25T16:03:00Z", event: "revision", title: "↩ 👀 รอตรวจอีกหนึ่งด้าน: Kani Last Chance — Reel", detail: "Facebook — [CI] ขอให้แก้", link: "/graphic?open=88", readAt: "2026-08-25T16:04:00Z" }),
  ]);
  is("สองงาน = สองบทสนทนา", threads.length, 2);
  is("งานที่มีคนพูดล่าสุดอยู่บนสุด", threads[0].title, "Kani Last Chance — Reel");
  is("นับเฉพาะข้อความเป็น messages", threads[0].messages, 1);
  is("แจ้งเตือนอื่นบนงานเดียวกันนับเป็น notices", threads[0].notices, 1);
  is("นับที่ยังไม่อ่านทั้งเธรด", threads[0].unread, 1);
  is("เก็บ id ทั้งเธรดไว้กดอ่านทีเดียว", threads[0].ids.length, 2);
  is("ข้อความล่าสุดคือคำพูด ไม่ใช่ป้ายแจ้งเตือน", threads[0].lastText, "0:40 จิ้มช่วงเดดแอร์");
  is("ขึ้นชื่อคนพูดล่าสุด", threads[0].lastBy, "Pichayaporn");
  is("ลิงก์ไปที่ใบงานนั้น", threads[0].link, "/graphic?open=88");
  // หัวข้อจาก notice ("รอตรวจอีกหนึ่งด้าน: …") ต้องรวมกับข้อความของงานเดียวกัน ไม่แตกเป็นสองแถว
  is("งานที่สองไม่ถูกแยกเพราะคำนำหน้าต่างกัน", threads[1].messages, 1);
  is("งานที่สองนับ notice ด้วย", threads[1].notices, 1);
}

console.log("\n— งานที่ยังไม่มีใครพูด ไม่ใช่บทสนทนา —");
{
  const onlyNotices = conversationThreads([
    row({ id: 10, event: "assigned", title: "📌 งานใหม่ถึงคุณ: Songkran key visual", detail: null, link: "/graphic?open=5" }),
  ]);
  is("มีแต่แจ้งเตือน ไม่มีข้อความ → ไม่ขึ้นเป็นบทสนทนา", onlyNotices.length, 0);
}

console.log("\n— แถวที่ไม่มีลิงก์ —");
{
  const noLink = conversationThreads([
    row({ id: 20, title: "💬 Wagyu key visual", link: null, detail: "Ken S.: เช็คราคาสไลด์ 2" }),
    row({ id: 21, title: "💬 Wagyu key visual", link: null, detail: "Boss: แก้แล้ว", createdAt: "2026-08-25T17:00:00Z" }),
  ]);
  is("ไม่มีลิงก์ก็ยังจับกลุ่มด้วยชื่องาน", noLink.length, 1);
  is("นับข้อความครบ", noLink[0].messages, 2);
  is("ไม่มีลิงก์ให้กด", noLink[0].link, null);
}

console.log("\n— งานเดียวกันแต่ลิงก์คนละแท็บ —");
{
  // ข้อความส่งลิงก์ &tab=feedback ส่วนแจ้งเตือนรีวิวส่งลิงก์เปล่า — ต้องเป็นงานใบเดียวกัน
  const mixed = conversationThreads([
    row({ id: 30, event: "revision", title: "↩ รอตรวจอีกหนึ่งด้าน: Kani Last Chance — Reel", link: "/graphic?open=88", detail: "Facebook — [CI] ขอให้แก้" }),
    row({ id: 31, title: "💬 Kani Last Chance — Reel", link: "/graphic?open=88&tab=feedback", detail: "Pichayaporn: 0:40 จิ้ม", createdAt: "2026-08-25T16:10:00Z" }),
  ]);
  is("ลิงก์คนละแท็บไม่ทำให้แตกเป็นสองแถว", mixed.length, 1);
  is("นับข้อความถูก", mixed[0].messages, 1);
  is("นับแจ้งเตือนอื่นถูก", mixed[0].notices, 1);
  is("ลิงก์ที่เก็บไว้ไม่มี tab ติดมา", mixed[0].link, "/graphic?open=88");
}
is("ตัด tab ออกจากลิงก์", canonicalLink("/graphic?open=88&tab=feedback"), "/graphic?open=88");
is("ลิงก์ที่มีแต่ tab เหลือแค่ path", canonicalLink("/my-tasks?tab=approval"), "/my-tasks");
is("ลิงก์ที่ไม่มี query ไม่ถูกแตะ", canonicalLink("/campaigns/12"), "/campaigns/12");

console.log("\n— ลิงก์ของแถวบทสนทนา —");
is("ลิงก์ใบงานเก่า → พาไปแท็บ Feedback", threadHref("/graphic?open=88"), "/graphic?open=88&tab=feedback");
is("ลิงก์ที่ระบุแท็บมาแล้ว ไม่ยัดซ้ำ", threadHref("/graphic?open=88&tab=feedback"), "/graphic?open=88&tab=feedback");
is("ลิงก์โมดูลอื่นไม่ถูกแตะ", threadHref("/content?post=c01"), "/content?post=c01");
is("ไม่มีลิงก์ → ไม่มีที่ให้ไป", threadHref(null), null);

console.log("\n— ใบงานที่เธรดนี้ห้อยอยู่ —");
is("อ่าน id ใบงานจากลิงก์", graphicIdOf("/graphic?open=1784451899630"), 1784451899630);
is("อ่าน id ได้แม้มีพารามิเตอร์อื่นต่อท้าย", graphicIdOf("/graphic?open=88&tab=feedback"), 88);
is("ลิงก์โมดูลอื่น → ไม่ใช่ใบงานกราฟิก", graphicIdOf("/content?post=c01"), null);
is("ไม่มีลิงก์ → null", graphicIdOf(null), null);
is("id ไม่ใช่ตัวเลข → null", graphicIdOf("/graphic?open=abc"), null);
is("ลิงก์กราฟิกที่ไม่มี open= → null", graphicIdOf("/graphic?brief=1"), null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
