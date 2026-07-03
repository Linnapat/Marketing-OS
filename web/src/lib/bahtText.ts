// Thai baht amount → Thai words (ported verbatim from Payment Voucher.dc.html).

const ONES = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function conv(n: number): string {
  if (!n) return "";
  const s = String(n).padStart(6, "0");
  let r = "";
  for (let i = 0; i < 6; i++) {
    const d = parseInt(s[i]);
    const p = 5 - i;
    if (!d) continue;
    if (p === 1 && d === 1) r += "สิบ";
    else if (p === 1 && d === 2) r += "ยี่สิบ";
    else r += ONES[d] + POS[p];
  }
  return r;
}

export function bahtText(amount: number): string {
  if (!amount || amount === 0) return "ศูนย์บาทถ้วน";
  const intPart = Math.floor(amount);
  const dec = Math.round((amount - intPart) * 100);
  let text = "";
  if (intPart >= 1000000) {
    text += conv(Math.floor(intPart / 1000000)) + "ล้าน";
    text += conv(intPart % 1000000);
  } else {
    text += conv(intPart);
  }
  text += "บาท";
  if (dec === 0) {
    text += "ถ้วน";
  } else {
    const d1 = Math.floor(dec / 10);
    const d2 = dec % 10;
    if (d1 === 1) text += "สิบ";
    else if (d1 === 2) text += "ยี่สิบ";
    else if (d1 > 0) text += ONES[d1] + "สิบ";
    if (d2 > 0) text += ONES[d2];
    text += "สตางค์";
  }
  return text;
}

/** 12,345.00 in th-TH grouping */
export function thb(v: number | null): string {
  if (v === null || v === 0) return "";
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
