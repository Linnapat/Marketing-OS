/* The amount-in-words line on a Payment Voucher, and the figure beside it.
 * This text is what the finance team signs off on, so a wrong reading is a wrong
 * document — not a cosmetic bug. Run with: node --import tsx scripts/test-baht-text.ts */

import { bahtText, thb } from "../src/lib/bahtText";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${actual}\n      expected: ${expected}`); }
}

console.log("— plain amounts —");
is("ศูนย์", bahtText(0), "ศูนย์บาทถ้วน");
is("หนึ่งบาท", bahtText(1), "หนึ่งบาทถ้วน");
is("สองบาท", bahtText(2), "สองบาทถ้วน");
is("สิบ", bahtText(10), "สิบบาทถ้วน");
is("ยี่สิบ (ไม่ใช่ สองสิบ)", bahtText(20), "ยี่สิบบาทถ้วน");
is("หนึ่งร้อย", bahtText(100), "หนึ่งร้อยบาทถ้วน");
is("หนึ่งพัน", bahtText(1000), "หนึ่งพันบาทถ้วน");
is("หนึ่งหมื่น", bahtText(10000), "หนึ่งหมื่นบาทถ้วน");
is("หนึ่งแสน", bahtText(100000), "หนึ่งแสนบาทถ้วน");
is("หนึ่งล้าน", bahtText(1000000), "หนึ่งล้านบาทถ้วน");

console.log("\n— หลักหน่วยที่เป็น 1 ต้องอ่าน 'เอ็ด' ไม่ใช่ 'หนึ่ง' —");
is("11 = สิบเอ็ด", bahtText(11), "สิบเอ็ดบาทถ้วน");
is("21 = ยี่สิบเอ็ด", bahtText(21), "ยี่สิบเอ็ดบาทถ้วน");
is("31 = สามสิบเอ็ด", bahtText(31), "สามสิบเอ็ดบาทถ้วน");
is("91 = เก้าสิบเอ็ด", bahtText(91), "เก้าสิบเอ็ดบาทถ้วน");
is("101 = หนึ่งร้อยเอ็ด", bahtText(101), "หนึ่งร้อยเอ็ดบาทถ้วน");
is("111 = หนึ่งร้อยสิบเอ็ด", bahtText(111), "หนึ่งร้อยสิบเอ็ดบาทถ้วน");
is("1,001 = หนึ่งพันเอ็ด", bahtText(1001), "หนึ่งพันเอ็ดบาทถ้วน");
// The หลักหน่วย sits in the second group, so the 'เอ็ด' rule has to survive
// the split at ล้าน — this is the case a per-group reading gets wrong.
is("1,000,001 = หนึ่งล้านเอ็ด (ข้ามหลักล้าน)", bahtText(1000001), "หนึ่งล้านเอ็ดบาทถ้วน");
is("1,000,101 = หนึ่งล้านหนึ่งร้อยเอ็ด", bahtText(1000101), "หนึ่งล้านหนึ่งร้อยเอ็ดบาทถ้วน");
is("21 ล้าน = ยี่สิบเอ็ดล้าน", bahtText(21000000), "ยี่สิบเอ็ดล้านบาทถ้วน");

console.log("\n— สตางค์ —");
is("1.50", bahtText(1.5), "หนึ่งบาทห้าสิบสตางค์");
is("20.25", bahtText(20.25), "ยี่สิบบาทยี่สิบห้าสตางค์");
is("100.01 = หนึ่งสตางค์ (โดดๆ ไม่ใช่ เอ็ด)", bahtText(100.01), "หนึ่งร้อยบาทหนึ่งสตางค์");
is("11 สตางค์ = สิบเอ็ดสตางค์", bahtText(5.11), "ห้าบาทสิบเอ็ดสตางค์");
is("21 สตางค์ = ยี่สิบเอ็ดสตางค์", bahtText(5.21), "ห้าบาทยี่สิบเอ็ดสตางค์");
is("90 สตางค์", bahtText(5.9), "ห้าบาทเก้าสิบสตางค์");
is("99 สตางค์", bahtText(5.99), "ห้าบาทเก้าสิบเก้าสตางค์");
// Under one baht the integer part is empty; without a "ศูนย์" the voucher would
// print "บาทห้าสิบสตางค์" — a บาท with no number in front of it.
is("0.50 ต้องมี ศูนย์บาท นำหน้า", bahtText(0.5), "ศูนย์บาทห้าสิบสตางค์");
is("0.01", bahtText(0.01), "ศูนย์บาทหนึ่งสตางค์");
is("0.75", bahtText(0.75), "ศูนย์บาทเจ็ดสิบห้าสตางค์");

console.log("\n— ยอดจริงจากใบสำคัญจ่าย —");
is("12,345.00", bahtText(12345), "หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทถ้วน");
is("1,234,567.89", bahtText(1234567.89),
  "หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์");
is("53,500.00 (ค่า KOL)", bahtText(53500), "ห้าหมื่นสามพันห้าร้อยบาทถ้วน");
is("7,000.00", bahtText(7000), "เจ็ดพันบาทถ้วน");

console.log("\n— เศษสตางค์ที่ปัดขึ้นเต็ม 100 ต้องทดขึ้นหลักบาท —");
// dec used to be rounded on its own, so .999 gave 100 satang and read straight
// off the end of the digit table: "หนึ่งบาทundefinedสิบสตางค์" on a real voucher.
is("1.999 ทดเป็น สองบาทถ้วน", bahtText(1.999), "สองบาทถ้วน");
is("0.999 ทดเป็น หนึ่งบาทถ้วน", bahtText(0.999), "หนึ่งบาทถ้วน");
is("999.999 ทดข้ามหลักพัน", bahtText(999.999), "หนึ่งพันบาทถ้วน");
is("ไม่มีคำว่า undefined หลุดออกมา", /undefined/.test(bahtText(1.999)), false);
is("1.004 ปัดลงเป็นถ้วน", bahtText(1.004), "หนึ่งบาทถ้วน");
is("0.001 ปัดหายเป็นศูนย์", bahtText(0.001), "ศูนย์บาทถ้วน");
// Float noise must not leak a 99-satang tail into a whole-baht voucher.
is("0.1+0.2 ไม่ทำให้ 0.30 เพี้ยน", bahtText(0.1 + 0.2), "ศูนย์บาทสามสิบสตางค์");

console.log("\n— ตัวหนังสือกับตัวเลขบนใบเดียวกันต้องตรงกัน —");
// Both sides must round on the same basis, or the voucher shows 1.02 next to
// words reading one satang.
const satangOf = (words: string): number => {
  if (/ถ้วน$/.test(words)) return 0;
  const map: Record<string, number> = { หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
  const tail = words.slice(words.indexOf("บาท") + 3).replace(/สตางค์$/, "");
  const [tens, ones] = tail.split("สิบ");
  if (ones === undefined) return map[tens] ?? 0;                       // n สตางค์
  const t = tens === "" ? 1 : tens === "ยี่" ? 2 : map[tens] ?? 0;      // สิบ / ยี่สิบ / nสิบ
  return t * 10 + (ones === "เอ็ด" ? 1 : map[ones] ?? 0);
};
for (const v of [1.005, 1.015, 2.675, 1.999, 12345.678, 53500, 1234.5, 0.75]) {
  const figure = thb(v);
  const decimals = Number(figure.split(".")[1] ?? "0");
  is(`${v}: คำอ่าน (${satangOf(bahtText(v))} สตางค์) ตรงกับตัวเลข ${figure}`, satangOf(bahtText(v)), decimals);
}

console.log("\n— thb(): ตัวเลขข้างๆ ตัวหนังสือ —");
is("คั่นหลักพัน + ทศนิยมสองตำแหน่งเสมอ", thb(12345), "12,345.00");
is("เติม .00 ให้จำนวนเต็ม", thb(7000), "7,000.00");
is("เติมศูนย์ท้ายทศนิยมตำแหน่งเดียว", thb(1234.5), "1,234.50");
is("ตัดทศนิยมตำแหน่งที่สาม", thb(1234.567), "1,234.57");
// A voucher line with no amount should be blank, not "0.00".
is("null = ช่องว่าง", thb(null), "");
is("ศูนย์ = ช่องว่าง", thb(0), "");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
