/* The small shared helpers everything renders through: money/number formatting,
 * CSV export escaping, channel links, and the bucket→accounting-category maps.
 * Each is one line of code and used on nearly every page, so a regression here is
 * wide. Run: node --import tsx scripts/test-formatting.ts */

import { baht, num, mult, pct, barWidth, stamp } from "../src/lib/format";
import { csvEscape, buildCsv } from "../src/lib/data/finance";
import { channelUrl, platformIcon, PLATFORM_ICON } from "../src/lib/platforms";
import { canonicalBucket, canonicalAdsPlatform, BUCKET_TO_CATEGORY, ADS_PLATFORM_TO_CATEGORY } from "../src/lib/data/financeCategories";
import { campaignTone, kolTone, TONES, CAMPAIGN_STATUS_TONE, KOL_STATUS_TONE } from "../src/lib/status";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

console.log("— baht(): เงินแบบเต็มและแบบย่อ —");
is("ค่าปกติคั่นหลักพัน", baht(180000), "฿180,000");
is("ศูนย์", baht(0), "฿0");
is("ติดลบ (ยอดปรับปรุง)", baht(-5000), "฿-5,000");
is("ทศนิยมไม่ถูกตัด", baht(1234.5), "฿1,234.5");
is("compact: หลักล้านเป็น M ทศนิยม 2 ตำแหน่ง", baht(2840000, { compact: true }), "฿2.84M");
is("compact: หลักพันเป็น K ไม่มีทศนิยม", baht(180000, { compact: true }), "฿180K");
is("compact: ต่ำกว่าพันไม่ย่อ", baht(950, { compact: true }), "฿950");
is("compact: 1,000 พอดีย่อเป็น 1K", baht(1000, { compact: true }), "฿1K");
is("compact: 1,000,000 พอดีย่อเป็น 1.00M", baht(1000000, { compact: true }), "฿1.00M");
// Compacting must respect the magnitude of a negative, not its sign.
is("compact: ติดลบหลักล้าน", baht(-2840000, { compact: true }), "฿-2.84M");
is("compact: ติดลบหลักพัน", baht(-180000, { compact: true }), "฿-180K");
is("compact ต้องไม่เปลี่ยนค่าปกติ", baht(180000), baht(180000, { compact: false }));

console.log("\n— num / mult / pct / barWidth —");
is("num คั่นหลักพัน", num(12400), "12,400");
is("num ศูนย์", num(0), "0");
is("mult ทศนิยม 1 ตำแหน่ง + สัญลักษณ์ ×", mult(3.24), "3.2×");
is("mult ปัดขึ้น", mult(3.26), "3.3×");
is("mult จำนวนเต็มยังมี .0", mult(3), "3.0×");
is("pct ปัดเป็นจำนวนเต็ม", pct(86.6), "87%");
is("pct ปัดลง", pct(86.4), "86%");
is("pct ศูนย์", pct(0), "0%");
console.log("  · barWidth ต้องไม่หลุดกรอบ 0–100");
is("ค่าปกติ", barWidth(45), "45%");
is("เกิน 100 ถูกตัดที่ 100 (แถบไม่ทะลุการ์ด)", barWidth(180), "100%");
is("ติดลบถูกตัดที่ 0 (แถบไม่กลับด้าน)", barWidth(-20), "0%");
is("100 พอดี", barWidth(100), "100%");
is("0 พอดี", barWidth(0), "0%");

console.log("\n— stamp(): เวลาที่มีการอนุมัติ —");
// Never "Invalid Date" on a screen: rows approved before the timestamp column
// existed have to fall back to the name-only line, not shout at the reader.
is("ไม่มีค่า → ว่าง", stamp(undefined), "");
is("null → ว่าง", stamp(null), "");
is("ข้อความว่าง → ว่าง", stamp(""), "");
is("ค่าที่อ่านไม่ออก → ว่าง (ไม่ใช่ Invalid Date)", stamp("ไม่ใช่วันที่"), "");
{
  // Mid-day UTC so no timezone the team runs in can push it across a year.
  const out = stamp("2026-08-24T07:32:00.000Z");
  is("ปีเป็น พ.ศ.", out.includes("2569"), true);
  is("มีเวลาแบบ ชั่วโมง:นาที", /\d{1,2}:\d{2}/.test(out), true);
  is("เดือนเป็นตัวย่อภาษาไทย", out.includes("ส.ค."), true);
  is("เรียกซ้ำได้ผลเดิม", stamp("2026-08-24T07:32:00.000Z"), out);
}

console.log("\n— csvEscape: ไฟล์ export ต้องไม่พังเมื่อเจออักขระพิเศษ —");
is("ข้อความปกติไม่ต้องครอบ", csvEscape("Wagyu Festival"), "Wagyu Festival");
is("ตัวเลขแปลงเป็นข้อความ", csvEscape(12345), "12345");
// A comma inside a cell would otherwise split it into two columns.
is("มี comma → ครอบด้วย \"\"", csvEscape("Teppen, Omakase"), '"Teppen, Omakase"');
is("มี \" → escape เป็น \"\" และครอบ", csvEscape('เมนู "พิเศษ"'), '"เมนู ""พิเศษ"""');
is("มีขึ้นบรรทัดใหม่ → ครอบไว้ (ไม่กลายเป็นแถวใหม่)", csvEscape("บรรทัด1\nบรรทัด2"), '"บรรทัด1\nบรรทัด2"');
is("comma + quote พร้อมกัน", csvEscape('a,"b"'), '"a,""b"""');
is("ข้อความว่าง", csvEscape(""), "");
is("ภาษาไทยธรรมดาไม่ต้องครอบ", csvEscape("ค่าโฆษณา"), "ค่าโฆษณา");

console.log("\n— buildCsv —");
{
  const csv = buildCsv(["Vendor", "Amount"], [["Meta", 50000], ["Google", 30000]]);
  is("หัวตารางอยู่บรรทัดแรก", csv.split("\n")[0], "Vendor,Amount");
  is("แถวข้อมูลตามลำดับ", csv.split("\n").slice(1), ["Meta,50000", "Google,30000"]);
  is("จำนวนบรรทัด = หัว + ข้อมูล", csv.split("\n").length, 3);
}
{
  // A vendor name containing a comma must not shift the amount into a new column.
  const csv = buildCsv(["Vendor", "Amount"], [["Studio Nine, Ltd.", 12000]]);
  is("ชื่อที่มี comma ไม่ทำให้คอลัมน์เลื่อน", csv.split("\n")[1], '"Studio Nine, Ltd.",12000');
  is("ยังมีแค่ 2 บรรทัด", csv.split("\n").length, 2);
}
is("ไม่มีข้อมูล = เหลือแค่หัวตาราง", buildCsv(["A", "B"], []), "A,B");
is("หัวตารางก็ถูก escape ด้วย", buildCsv(["Name, full"], []), '"Name, full"');

console.log("\n— channelUrl: ลิงก์ช่องทางจาก @handle —");
is("Instagram", channelUrl("Instagram", "@nongaim.eats"), "https://instagram.com/nongaim.eats");
is("TikTok เก็บ @ ไว้ใน path", channelUrl("TikTok", "@bkkfoodie"), "https://tiktok.com/@bkkfoodie");
is("Facebook", channelUrl("Facebook", "@teppen"), "https://facebook.com/teppen");
is("YouTube เก็บ @ ไว้ใน path", channelUrl("YouTube", "@tokyotom"), "https://youtube.com/@tokyotom");
is("X", channelUrl("X", "@teppen"), "https://x.com/teppen");
is("handle ไม่มี @ ก็ใช้ได้", channelUrl("Instagram", "nongaim"), "https://instagram.com/nongaim");
is("มีช่องว่างหน้าหลัง ถูกตัดออก", channelUrl("Instagram", "  @nongaim  "), "https://instagram.com/nongaim");
// A full URL pasted into the handle field should be used as-is.
is("วาง URL เต็มมา ใช้ตามนั้น", channelUrl("Instagram", "https://instagram.com/p/abc"), "https://instagram.com/p/abc");
is("http ก็ถือเป็น URL เต็ม", channelUrl("TikTok", "http://tiktok.com/@x"), "http://tiktok.com/@x");
is("แพลตฟอร์มที่ไม่รู้จัก เดาเป็น Instagram", channelUrl("Threads", "@teppen"), "https://instagram.com/teppen");
console.log("  · ค่าที่ยังไม่กรอก ต้องไม่กลายเป็นลิงก์เสีย");
is("ค่าว่าง → null", channelUrl("Instagram", ""), null);
is("ช่องว่างล้วน → null", channelUrl("Instagram", "   "), null);
is("@tbd (ยังไม่รู้) → null", channelUrl("Instagram", "@tbd"), null);
is("@TBD ตัวใหญ่ → null", channelUrl("Instagram", "@TBD"), null);
is("มีแค่ @ เดี่ยวๆ → null", channelUrl("Instagram", "@"), null);

console.log("\n— platformIcon —");
is("Instagram ได้ IG", platformIcon("Instagram").icon, "IG");
is("LINE OA ได้ LN", platformIcon("LINE OA").icon, "LN");
is("แพลตฟอร์มที่ไม่รู้จักได้ ?? (ไม่ crash)", platformIcon("Threads").icon, "??");
is("ค่าว่างก็ยังคืน object ที่ใช้ได้", typeof platformIcon("").bg, "string");
is("ทุกไอคอนมีสีพื้นและสีตัวอักษรครบ",
  Object.values(PLATFORM_ICON).filter((p) => !p.bg || !p.fg || !p.icon), []);

console.log("\n— หมวดบัญชี: bucket / ads platform → Category ของ Finance —");
is("bucket ที่มีในตาราง ถูกแปลง", canonicalBucket(Object.keys(BUCKET_TO_CATEGORY)[0]), Object.values(BUCKET_TO_CATEGORY)[0]);
is("bucket ที่ไม่มีในตาราง คืนค่าเดิม", canonicalBucket("ค่าเช่าบูธ"), "ค่าเช่าบูธ");
is("ads platform ที่มีในตาราง ถูกแปลง",
  canonicalAdsPlatform(Object.keys(ADS_PLATFORM_TO_CATEGORY)[0]), Object.values(ADS_PLATFORM_TO_CATEGORY)[0]);
is("ads platform ที่ไม่มีในตาราง คืนค่าเดิม", canonicalAdsPlatform("Billboard"), "Billboard");
is("ค่าว่างคืนค่าว่าง (ไม่กลายเป็น undefined)", canonicalBucket(""), "");
is("แปลงซ้ำสองครั้งได้ผลเดิม (idempotent)",
  canonicalBucket(canonicalBucket("Production")), canonicalBucket("Production"));
is("ทุกค่าที่แปลงแล้วไม่เป็นค่าว่าง",
  Object.keys(BUCKET_TO_CATEGORY).filter((k) => !canonicalBucket(k)), []);

console.log("\n— สีสถานะ —");
is("ทุกสถานะแคมเปญที่ประกาศไว้ใช้ tone ที่มีจริง",
  Object.values(CAMPAIGN_STATUS_TONE).filter((t) => !(t in TONES)), []);
is("ทุกสถานะ KOL ที่ประกาศไว้ใช้ tone ที่มีจริง",
  Object.values(KOL_STATUS_TONE).filter((t) => !(t in TONES)), []);
is("สถานะแคมเปญที่ไม่รู้จัก → neutral (ไม่ใช่ undefined)", campaignTone("สถานะใหม่ที่ยังไม่มี"), "neutral");
is("สถานะ KOL ที่ไม่รู้จัก → neutral", kolTone("สถานะใหม่ที่ยังไม่มี"), "neutral");
is("ค่าว่าง → neutral", campaignTone(""), "neutral");
is("ทุก tone มีทั้ง fg และ bg", Object.values(TONES).filter((t) => !t.fg || !t.bg), []);
{
  const known = Object.keys(CAMPAIGN_STATUS_TONE)[0];
  is(`สถานะที่รู้จัก ('${known}') ได้ tone ตามที่ตั้งไว้`, campaignTone(known), CAMPAIGN_STATUS_TONE[known]);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
