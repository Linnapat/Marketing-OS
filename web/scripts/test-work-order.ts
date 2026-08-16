/* ลำดับงานในลิสต์ของ My Tasks และ Agency Portal
 *
 * ลิสต์นี้เคยแสดงตามลำดับที่หน้าเพจบังเอิญสร้างขึ้นมา ไม่ได้เรียงอะไรเลย —
 * กลุ่ม Todo ของ designer จริงออกมาเป็น Aug 7 · Jul 28 · Aug 7 · Aug 8 ·
 * Aug 20 · Aug 10 … งานที่เลยกำหนดกระจายอยู่กลางลิสต์ และไม่มีอะไรบอกว่า
 * ชิ้นไหนต้องทำก่อน
 * Run: node --import tsx scripts/test-work-order.ts */

import { byDueDate, workDueDate, type WorkItem } from "../src/components/work/WorkViews";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const w = (title: string, dueIso?: string, priority: WorkItem["priority"] = "Med"): WorkItem => ({
  key: title, title, moduleIcon: "🎨", moduleColor: "#000", type: "Graphic", brand: "omakase",
  campaign: "c", status: "Todo", priority, group: "g", due: dueIso ?? "", dueIso,
  nextAction: "", assignee: "Jungjing",
});

const order = (list: WorkItem[]) => list.slice().sort(byDueDate).map((x) => x.title);

console.log("\n— เรียงจากใกล้ครบกำหนดที่สุด —");
{
  is("วันที่น้อยกว่ามาก่อน", order([w("b", "2026-08-20"), w("a", "2026-08-07")]), ["a", "b"]);
  is("ข้ามเดือนก็เรียงถูก", order([w("ก.ย.", "2026-09-01"), w("ก.ค.", "2026-07-28")]), ["ก.ค.", "ก.ย."]);
}

console.log("\n— งานไม่มีกำหนดไปท้าย ไม่ใช่ขึ้นหัว —");
{
  // ไม่มีวันที่ ≠ ด่วน แต่แปลว่ายังไม่ได้วางแผน ถ้าปล่อยขึ้นหัวลิสต์
  // มันจะทับงานที่มีเดดไลน์จริง
  is("ไม่มีวันที่ตกท้าย", order([w("ไม่มีกำหนด"), w("มีกำหนด", "2026-12-31")]), ["มีกำหนด", "ไม่มีกำหนด"]);
  is("ไม่มีวันที่ทั้งคู่ → เรียงตามชื่อ", order([w("ข"), w("ก")]), ["ก", "ข"]);
}

console.log("\n— วันเดียวกัน: ตัดสินด้วย priority แล้วชื่อ —");
{
  is("High มาก่อน Med มาก่อน Low",
    order([w("low", "2026-09-01", "Low"), w("high", "2026-09-01", "High"), w("med", "2026-09-01", "Med")]),
    ["high", "med", "low"]);
  is("priority เท่ากัน → ชื่อ (ลำดับคงที่ทุกครั้งที่ render)",
    order([w("Zebra", "2026-09-01"), w("Apple", "2026-09-01")]), ["Apple", "Zebra"]);
}

console.log("\n— รับได้ทั้ง dueIso และข้อความแบบ \"Aug 7\" —");
{
  // แถวเก่าบางแถวไม่มี dueIso มีแต่ป้ายที่โชว์ workDueDate อ่านได้ทั้งสองแบบ
  const y = new Date().getFullYear();
  const txt: WorkItem = { ...w("ข้อความ"), due: "Aug 7", dueIso: undefined };
  is("อ่าน 'Aug 7' ออก", workDueDate(txt)?.getTime(), new Date(y, 7, 7).getTime());
  is("เรียงปนกันได้", order([w("iso", `${y}-08-20`), txt]), ["ข้อความ", "iso"]);
}

console.log("\n— เคสจริงจากหน้าจอ designer (กลุ่ม Todo) —");
{
  const y = new Date().getFullYear();
  const todo = [
    w("0902_ Seasonal Menu (Iwagaki Oyster) — Poster", `${y}-08-07`),
    w("TO_0808_CELEBRATING — Photo", `${y}-07-28`),
    w("Exclusive Menu — Artwork", `${y}-08-07`),
    w("THX For Coming — Artwork", `${y}-08-08`),
    w("0901__Lunch Sathorn — Photo", `${y}-08-20`),
    w("08_Otsukaresama_AW — Artwork", `${y}-08-10`),
    w("Pinklao Location Guide — Carousel", `${y}-09-01`),
    w("Order Now, Pick Up Later — Carousel", `${y}-09-04`),
    w("Payday Delivery Push — Story", `${y}-09-16`),
  ];
  is("งานที่เลยกำหนดนานสุดขึ้นหัว", order(todo)[0], "TO_0808_CELEBRATING — Photo");
  is("งานไกลสุดอยู่ท้าย", order(todo).at(-1), "Payday Delivery Push — Story");
  is("ทั้งลิสต์เรียงจากน้อยไปมากจริง",
    order(todo).map((t) => todo.find((x) => x.title === t)!.dueIso),
    [`${y}-07-28`, `${y}-08-07`, `${y}-08-07`, `${y}-08-08`, `${y}-08-10`, `${y}-08-20`, `${y}-09-01`, `${y}-09-04`, `${y}-09-16`]);
}

console.log("\n— ไม่แก้ของเดิม —");
{
  const list = [w("b", "2026-09-01"), w("a", "2026-08-01")];
  const before = list.map((x) => x.title);
  order(list);
  is("อาเรย์ต้นทางไม่ถูกจัดเรียงทับ", list.map((x) => x.title), before);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
