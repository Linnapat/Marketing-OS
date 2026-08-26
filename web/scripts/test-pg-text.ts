/* Runtime tests for pgSafeText — the paste cleaner.
 *
 * The bug it exists for: "เพิ่มโปรโมชั่นของ Mainichi ไม่ได้" with the message
 * "unsupported Unicode escape sequence". Postgres `text` cannot hold a NUL, and
 * one arrives invisibly with text copied out of Excel or a PDF, so the whole
 * write fails and the form looks broken.
 * Run with:  npm test */

import { pgSafeText, pgSafeDeep, hasUnstorableText } from "../src/lib/pgText";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);
const DEL = String.fromCharCode(127);

console.log("\n— ตัวอักษรที่ฐานข้อมูลเก็บไม่ได้ —");
is("NUL หลุดมากับการวาง → ตัดทิ้ง", pgSafeText(`WAGYU${NUL} SUSHI`), "WAGYU SUSHI");
is("อักขระควบคุมอื่นก็ตัด", pgSafeText(`A${BELL}B${DEL}C`), "ABC");
is("ข้อความไทยปกติไม่ถูกแตะ", pgSafeText("ถ่ายภาพ \" Lunch Moment \" +Tag ร้าน"), "ถ่ายภาพ \" Lunch Moment \" +Tag ร้าน");

console.log("\n— สิ่งที่ต้องเก็บไว้ —");
is("ขึ้นบรรทัดใหม่คือรูปแบบที่คนพิมพ์เอง", pgSafeText("UGC\nถ่ายภาพ"), "UGC\nถ่ายภาพ");
is("แท็บก็เก็บ", pgSafeText("a\tb"), "a\tb");
// วางจาก Windows ได้ \r\n มา — เป็นการขึ้นบรรทัด ไม่ใช่ขยะ
is("\\r\\n กลายเป็นขึ้นบรรทัดเดียว", pgSafeText("a\r\nb"), "a\nb");
is("\\r เดี่ยว ๆ ก็เป็นขึ้นบรรทัด", pgSafeText("a\rb"), "a\nb");
is("อีโมจิที่ครบคู่ไม่โดนตัด", pgSafeText("โปรดี 🔥🍣"), "โปรดี 🔥🍣");

console.log("\n— อีโมจิที่ขาดครึ่ง —");
{
  const loneHigh = "\uD83D";
  const loneLow = "\uDD25";
  is("ครึ่งบนลอย ๆ ตัดทิ้ง", pgSafeText(`ไฟ${loneHigh}แรง`), "ไฟแรง");
  is("ครึ่งล่างลอย ๆ ตัดทิ้ง", pgSafeText(`ไฟ${loneLow}แรง`), "ไฟแรง");
  is("คู่ที่ครบยังอยู่", pgSafeText(`ไฟ${loneHigh}${loneLow}แรง`), "ไฟ🔥แรง");
}

console.log("\n— บอกได้ว่ามีอะไรถูกตัดไหม —");
is("ข้อความสะอาด = ไม่มีอะไรถูกตัด", hasUnstorableText("โปรโมชั่นปกติ"), false);
is("มี NUL = มีอะไรถูกตัด", hasUnstorableText(`a${NUL}b`), true);
// ขึ้นบรรทัดแบบ Windows ไม่ใช่ "อักขระที่เก็บไม่ได้" — อย่าไปเตือนคนเรื่องนี้
is("\\r\\n อย่างเดียวไม่นับว่าโดนตัด", hasUnstorableText("a\r\nb"), false);
is("ค่าว่างไม่พัง", pgSafeText(""), "");

console.log("\n— ล้างทั้งก้อน (blob ที่เก็บเป็น jsonb) —");
{
  // แถวที่เก็บสำเนา jsonb ของตัวเองพังได้จาก NUL ในฟิลด์ *ไหนก็ได้* ไม่ใช่แค่ฟิลด์ที่กำลังแก้
  const post = {
    id: "c1",
    caption: `โปรดี${NUL} วันนี้`,
    hashtags: ["#a" + NUL, "#b"],
    day: 5,
    approved: true,
    nested: { cta: `จองเลย${BELL}`, when: null },
  };
  const clean = pgSafeDeep(post);
  is("ข้อความชั้นบนสะอาด", clean.caption, "โปรดี วันนี้");
  is("ในอาเรย์ก็สะอาด", clean.hashtags.join(","), "#a,#b");
  is("ซ้อนชั้นก็ตามไปล้าง", clean.nested.cta, "จองเลย");
  is("ตัวเลขไม่ถูกแตะ", clean.day, 5);
  is("boolean ไม่ถูกแตะ", clean.approved, true);
  is("null ไม่พัง", clean.nested.when, null);
  is("ของเดิมไม่ถูกแก้ (pure)", post.caption.includes(NUL), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
