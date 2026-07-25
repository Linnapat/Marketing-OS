// Thai baht amount → Thai words (ported verbatim from Payment Voucher.dc.html).

const ONES = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/* A unit digit of 1 is read "เอ็ด" — not "หนึ่ง" — whenever something precedes it
 * (สิบเอ็ด, ยี่สิบเอ็ด, หนึ่งร้อยเอ็ด, หนึ่งล้านเอ็ด). `led` says whether an
 * earlier group already emitted words, which is how 1,000,001 gets it right. */
function conv(n: number, led = false): string {
  if (!n) return "";
  const s = String(n).padStart(6, "0");
  let r = "";
  for (let i = 0; i < 6; i++) {
    const d = parseInt(s[i]);
    const p = 5 - i;
    if (!d) continue;
    if (p === 1 && d === 1) r += "สิบ";
    else if (p === 1 && d === 2) r += "ยี่สิบ";
    else if (p === 0 && d === 1 && (led || r)) r += "เอ็ด";
    else r += ONES[d] + POS[p];
  }
  return r;
}

/** Satang (00–99) in words, following the same เอ็ด rule. */
function satangText(dec: number): string {
  const d1 = Math.floor(dec / 10);
  const d2 = dec % 10;
  let t = "";
  if (d1 === 1) t += "สิบ";
  else if (d1 === 2) t += "ยี่สิบ";
  else if (d1 > 0) t += ONES[d1] + "สิบ";
  if (d2 === 1 && d1 > 0) t += "เอ็ด";
  else if (d2 > 0) t += ONES[d2];
  return t;
}

/** Satang is the smallest unit the voucher deals in, so round ONCE to satang and
 *  derive both parts from that integer. Rounding the fraction on its own instead
 *  (`(amount - intPart) * 100`) breaks twice: 1.999 rounds to 100 satang and
 *  reads "หนึ่งบาท…สิบสตางค์" off the end of the digit table, and the words end up
 *  rounded differently from the figure printed beside them. */
function toSatang(amount: number): number {
  return Math.round(amount * 100);
}

export function bahtText(amount: number): string {
  if (!amount || amount === 0) return "ศูนย์บาทถ้วน";
  const satang = toSatang(amount);
  if (satang === 0) return "ศูนย์บาทถ้วน"; // rounds away to nothing (0.001)
  const intPart = Math.floor(satang / 100);
  const dec = satang % 100;
  let text = "";
  if (intPart >= 1000000) {
    text += conv(Math.floor(intPart / 1000000)) + "ล้าน";
    text += conv(intPart % 1000000, true);
  } else {
    text += conv(intPart);
  }
  // An amount under one baht (0.50) still needs the baht figure spelled out, or
  // the voucher reads "บาทห้าสิบสตางค์" with no number in front of บาท.
  text = (text || "ศูนย์") + "บาท";
  text += dec === 0 ? "ถ้วน" : satangText(dec) + "สตางค์";
  return text;
}

/** 12,345.00 in th-TH grouping. Formats from the same satang rounding bahtText
 *  uses, so the figure and the words on one voucher can never disagree. */
export function thb(v: number | null): string {
  if (v === null || v === 0) return "";
  const rounded = toSatang(v) / 100;
  return rounded.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
