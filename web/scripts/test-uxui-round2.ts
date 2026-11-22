/* UX/UI test 22 Nov 2026, round 2.
 * Run: node --import tsx scripts/test-uxui-round2.ts */
import { captionStage, captionBadge } from "../src/lib/data/content";
import { byDue } from "../src/lib/data/graphic";
import { orderForReview } from "../src/lib/data/statusBoard";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log("\n— 2.1 Caption: ยังไม่มี กับ มีร่าง ยังไม่ส่ง —");
is("Missing + ไม่มีข้อความ = ยังไม่มี", captionStage({ captionStatus: "Missing", caption: "" }), "none");
is("Missing + มีข้อความ 191 ตัว = มีร่าง", captionStage({ captionStatus: "Missing", caption: "x".repeat(191) }), "draft");
is("ช่องว่างล้วน ๆ ไม่นับว่ามีร่าง", captionStage({ captionStatus: "Missing", caption: "   \n " }), "none");
is("Draft + มีข้อความ = มีร่าง", captionStage({ captionStatus: "Draft", caption: "ร่าง" }), "draft");
is("Ready ไม่ถูกแตะ", captionStage({ captionStatus: "Ready", caption: "x" }), "ready");
is("Approved ไม่ถูกแตะ", captionStage({ captionStatus: "Approved", caption: "x" }), "approved");
is("ป้าย: มีร่าง ยังไม่ส่ง", captionBadge({ captionStatus: "Missing", caption: "ร่าง" }).label, "มีร่าง ยังไม่ส่ง");
is("ป้าย: ยังไม่มี (แดง)", [captionBadge({ captionStatus: "Missing", caption: "" }).label, captionBadge({ captionStatus: "Missing", caption: "" }).tone], ["ยังไม่มี", "red"]);
is("ป้าย Ready ใช้คำเดิม", captionBadge({ captionStatus: "Ready", caption: "x" }).label, "Ready");

console.log("\n— 2.2 Graphic list: Due ใกล้สุดก่อน —");
{
  const rows = [
    { id: "late", due: "Dec 23", dueIso: "2026-12-23" }, { id: "tbd", due: "TBD" },
    { id: "soon", due: "Nov 27", dueIso: "2026-11-27" }, { id: "jan", due: "Jan 4", dueIso: "2027-01-04" },
  ];
  is("ใกล้สุดก่อน ไม่มี Due ไว้ท้าย", rows.slice().sort((a, b) => byDue(a, b)).map((r) => r.id), ["soon", "late", "jan", "tbd"]);
  is("กลับลำดับ: ไกลสุดก่อน ไม่มี Due ยังอยู่ท้าย", rows.slice().sort((a, b) => byDue(a, b, "desc")).map((r) => r.id), ["jan", "late", "soon", "tbd"]);
}

console.log("\n— 2.3 Status Board: งานที่ต้องดูขึ้นก่อน งานเสร็จแยกไว้ —");
{
  const items = [
    { id: "d1", health: "done" as const, urgency: "none" as const },
    { id: "act", health: "active" as const, urgency: "later" as const, dueIso: "2026-12-10" },
    { id: "blk", health: "blocked" as const, urgency: "later" as const, dueIso: "2026-12-01" },
    { id: "lateActive", health: "active" as const, urgency: "overdue" as const, dueIso: "2026-11-10" },
    { id: "wait", health: "waiting" as const, urgency: "dueSoon" as const, dueIso: "2026-11-24" },
    { id: "d2", health: "done" as const, urgency: "none" as const },
  ];
  const out = orderForReview(items);
  is("เลยกำหนดขึ้นก่อน แล้วใกล้กำหนด แล้วติดปัญหา", out.open.map((i) => i.id), ["lateActive", "wait", "blk", "act"]);
  is("งานเสร็จถูกแยกไว้ท้าย", out.done.map((i) => i.id), ["d1", "d2"]);
  is("ไม่มีงานหาย", out.open.length + out.done.length, items.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
