/* ค้น KOL Library ด้วยลิงก์โปรไฟล์ — ชื่อในทะเบียนมีทั้งไทยและอังกฤษ พิมพ์ชื่อ
 * ให้ตรงกับที่คนอิมพอร์ตสะกดไว้แทบไม่ได้ แต่ลิงก์ไม่กำกวม
 * Run: node --import tsx scripts/test-kol-search.ts */

import { kolSearchNeedle, handleFromUrl, normaliseProfileUrl, profileLinkKey, sameProfileLink } from "../src/lib/data/kolSearch";
import { KOL_CATEGORIES, categoryOptions, categoryTone } from "../src/lib/kolTier";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("— normaliseProfileUrl: ลิงก์เดียวกันเขียนได้หลายแบบ —");
is("ตัด scheme/www/ท้ายสแลช", normaliseProfileUrl("https://www.instagram.com/orn.thetable/"), "instagram.com/orn.thetable");
is("ตัด query", normaliseProfileUrl("https://instagram.com/orn.thetable?hl=th"), "instagram.com/orn.thetable");
is("ตัด fragment", normaliseProfileUrl("https://instagram.com/orn.thetable#bio"), "instagram.com/orn.thetable");
is("ไม่มี scheme ก็ได้", normaliseProfileUrl("www.instagram.com/orn.thetable"), "instagram.com/orn.thetable");
is("ค่าว่าง", normaliseProfileUrl("   "), "");

console.log("\n— handleFromUrl: หา @handle จากลิงก์จริงที่ทีมใช้ —");
// รูปแบบที่มีจริงใน kol_channels บน production
is("instagram ธรรมดา", handleFromUrl("https://www.instagram.com/eatwithpanida"), "eatwithpanida");
is("instagram + /reels/ (เก็บไว้แบบนี้ 213 แถว)", handleFromUrl("https://www.instagram.com/eatwithpanida/reels/"), "eatwithpanida");
is("tiktok @handle", handleFromUrl("https://www.tiktok.com/@ginleawgineek"), "ginleawgineek");
is("tiktok ลิงก์คลิป — ต้องได้ handle ไม่ใช่เลขคลิป", handleFromUrl("https://www.tiktok.com/@ginleawgineek/video/7557715905493484049"), "ginleawgineek");
// handle ถูกทำเป็นตัวพิมพ์เล็กทั้งหมด — การเทียบใช้ ilike อยู่แล้ว จึงไม่ต้องรักษาตัวพิมพ์
is("youtube @handle (พิมพ์เล็กหมด)", handleFromUrl("https://www.youtube.com/@FinedineHunter"), "finedinehunter");
is("facebook", handleFromUrl("https://www.facebook.com/boyfriendeatt"), "boyfriendeatt");
is("lemon8 ลิงก์โพสต์", handleFromUrl("https://www.lemon8-app.com/@ginleawgineek/7557715905493484049"), "ginleawgineek");
is("โดเมนเปล่า = ไม่มี handle", handleFromUrl("https://www.instagram.com"), "");

console.log("\n— kolSearchNeedle: กล่องค้นหาเดียว รับได้ทั้งชื่อ / @handle / ลิงก์ —");
{
  const name = kolSearchNeedle("melaqo");
  is("พิมพ์ชื่อ = ค้นชื่ออย่างเดียว", `${name.text}|${name.handle}|${name.url}`, "melaqo||");

  const at = kolSearchNeedle("@ginleawgineek");
  is("พิมพ์ @handle = ค้นทั้งชื่อและลิงก์ช่องทาง", `${at.text}|${at.handle}`, "ginleawgineek|ginleawgineek");

  const url = kolSearchNeedle("https://www.tiktok.com/@ginleawgineek/video/755771590");
  is("วางลิงก์ = ได้ handle มาค้นชื่อด้วย", url.text, "ginleawgineek");
  is("วางลิงก์ = เก็บ url ไว้เทียบกับ handle_url", url.url, "tiktok.com/@ginleawgineek/video/755771590");

  // ลิงก์ที่อ่าน handle ไม่ออก ต้องไม่เอา "https" ไปค้นชื่อ — จะได้ผลลัพธ์ว่างแล้ว
  // บังหน้าผลลัพธ์ที่ match จาก url จริง ๆ
  const bare = kolSearchNeedle("https://www.instagram.com");
  is("ลิงก์ที่ไม่มี handle = ไม่เอาไปค้นชื่อ", bare.text, "");
  is("…แต่ยังเทียบ url ได้", bare.url, "instagram.com");

  const blank = kolSearchNeedle("   ");
  is("ค่าว่าง = ไม่ค้นอะไรเลย", `${blank.text}|${blank.handle}|${blank.url}`, "||");
}

console.log("\n— Category เป็น dropdown: ต้องไม่ทำให้ค่าเดิมที่ไม่อยู่ในลิสต์หายไป —");
{
  // ทะเบียนจริงมี 24 โปรไฟล์ที่ category ไม่อยู่ในลิสต์ใหม่ (Coach 13 · Japanese
  // Community 5 · Athlete 3 · Nightlife/Food/Foodie อย่างละ 1) — เขียนไว้ก่อนมี
  // ลิสต์ ถ้า dropdown มีแต่ค่าทางการ เปิดฟอร์มแก้เรตครั้งเดียวก็เปลี่ยนหมวดให้เขาเงียบ ๆ
  is("ลิสต์ทางการมี 7 หมวดตามที่ทีมขอ", KOL_CATEGORIES.join(" · "),
    "Food Review · Lifestyle · Family · Celebrity · KOC / Staff · Coaching · Inter Kol");
  is("ไม่มีค่าเดิม = ลิสต์ทางการล้วน", categoryOptions("").length, KOL_CATEGORIES.length);
  is("ค่าเดิมอยู่ในลิสต์แล้ว = ไม่เพิ่มซ้ำ", categoryOptions("Lifestyle").length, KOL_CATEGORIES.length);
  is("ค่าเดิมนอกลิสต์ = ถูกเก็บไว้เป็นตัวเลือก", categoryOptions("Japanese Community").includes("Japanese Community"), true);
  is("…และต่อท้าย ไม่แทรกกลางลิสต์ทางการ", categoryOptions("Coach").slice(-1)[0], "Coach");
  is("null ก็ไม่พัง", categoryOptions(null).length, KOL_CATEGORIES.length);

  // ทุกหมวดทางการต้องมีสีของตัวเอง ไม่งั้นแยกด้วยตาไม่ออกในตาราง
  const grey = categoryTone("ไม่มีหมวดนี้แน่ ๆ 12345");
  is("หมวดใหม่ Family มีสีเฉพาะ", categoryTone("Family").fg !== grey.fg, true);
  is("หมวดใหม่ Coaching มีสีเฉพาะ", categoryTone("Coaching").fg !== grey.fg, true);
  is("หมวดใหม่ Inter Kol มีสีเฉพาะ", categoryTone("Inter Kol").fg !== grey.fg, true);
}

console.log("\n— กันบันทึกซ้ำ: ลิงก์คือตัวตน ไม่ใช่ชื่อ —");
{
  // ในทะเบียนจริงมีคนเดียวกันถูกบันทึกซ้ำ 10 คู่ เพราะสะกดชื่อคนละภาษา
  // เช่น "dear.rari" / "dearari7 เดียราริ" / "เดียราริ" = คนเดียวกัน 3 แถว
  is("ลิงก์เดียวกันคนละรูปแบบ = คนเดียวกัน",
    sameProfileLink("https://www.tiktok.com/@dearari7", "tiktok.com/@dearari7/video/123"), true);
  is("มี query/ท้ายสแลชต่างกัน ก็ยังคนเดียวกัน",
    sameProfileLink("https://instagram.com/dear.rari/?hl=th", "https://www.instagram.com/dear.rari/"), true);
  is("ตัวพิมพ์ใหญ่เล็กไม่เกี่ยว (henmuntookdee vs Henmuntookdee)",
    sameProfileLink("instagram.com/Henmuntookdee", "instagram.com/henmuntookdee"), true);
  is("คนละคน = ไม่ซ้ำ", sameProfileLink("instagram.com/dear.rari", "instagram.com/orn_the.table"), false);
  is("ลิงก์ IG กับ TikTok ของ handle เดียวกัน ถือว่าชี้คนเดียวกัน",
    sameProfileLink("instagram.com/nhaireview", "tiktok.com/@nhaireview"), true);

  // Facebook profile.php — ตัวตนอยู่ใน query string ซึ่ง normalise ตัดทิ้ง
  // ถ้าไม่อ่านก่อน 9 โปรไฟล์ที่ใช้รูปแบบนี้จะกลายเป็นคนเดียวกันหมด
  is("profile.php คนละ id = คนละคน",
    sameProfileLink("https://www.facebook.com/profile.php?id=61550000001", "https://www.facebook.com/profile.php?id=61550000002"), false);
  is("profile.php id เดียวกัน = คนเดียวกัน",
    sameProfileLink("facebook.com/profile.php?id=61550000001", "https://www.facebook.com/profile.php?id=61550000001&sk=about"), true);
  is("profile.php ไม่ถูกอ่านเป็น handle", profileLinkKey("https://www.facebook.com/profile.php?id=615500001"), "fb:615500001");

  // พิมพ์ @handle เปล่า ๆ ก็เป็นตัวตนได้ (ช่อง Page / Handle ในฟอร์ม)
  is("@handle เปล่า ๆ ใช้เทียบได้", profileLinkKey("@dearari7"), "dearari7");
  is("@handle ตรงกับลิงก์", sameProfileLink("@dearari7", "https://www.tiktok.com/@dearari7"), true);

  // สิ่งที่ไม่ควรนับว่าเป็นตัวตน — ไม่งั้นเตือนซ้ำมั่วไปหมด
  is("ค่าว่าง", profileLinkKey("   "), "");
  is("ตัวอักษรเดียว สั้นเกินกว่าจะเป็น handle", profileLinkKey("@a"), "");
  is("ชื่อไทยเปล่า ๆ ไม่ใช่ handle", profileLinkKey("แก้วใบใหญ่กินอะไรวันนี้"), "");
  is("โดเมนเปล่า", profileLinkKey("https://www.instagram.com"), "");
  is("เทียบกับค่าว่าง = ไม่ซ้ำ", sameProfileLink("", "instagram.com/dear.rari"), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
