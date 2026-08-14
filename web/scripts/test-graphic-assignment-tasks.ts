/* Who gets a My Tasks row when a Graphic Request is assigned.
 *
 * The bug this pins: a request models storyboard → shoot → artwork, but only
 * the artwork ever became a task, always assigned to `designer`. A Creative
 * Leader could name a shooter and a shoot date and the shooter's list stayed
 * empty — on 13 Aug that was 22 shoots assigned to Jeeno with no task between
 * them, and 25 storyboards owned by Pichayaporn with none at all.
 *
 * Slot ids matter as much as the rows: "01" must stay the artwork (52 live task
 * rows are keyed on it) and the three jobs must never collide, or re-assigning
 * a shooter would overwrite the designer's task. Run with: npm test */

import { todayIso } from "../src/lib/data/brief";
import { productionSteps, materialState, materialNote, MATERIAL_EXEMPT_TYPES, productionBlockers } from "../src/lib/data/graphic";
import { graphicAssignmentTasks, graphicTaskId, GRAPHIC_TASK_SLOT, shootOutstanding, storyboardOutstanding, underBriefRevision, briefRevisionReviewer, BRIEF_REVISION_BLOCKER, creativeBriefLink, initialNextAction, Graphic } from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

/** A request shaped like the real ones on production (Jeeno shooting a reel
 *  that Four will cut). Only the fields these rules read are meaningful. */
const req = (over: Partial<Graphic> = {}): Graphic => ({
  id: 1785155501760, stage: "In Progress", title: "0901_YOUR NIGHT AT TEPPEN — Reel",
  b: "teppen", campaign: "Seasonal menu", due: "Aug 25", dueIso: "2026-08-25",
  designer: "Four", requester: "Pupay", approver: "Pupay", type: "Reel", priority: "Med",
  fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "Pupay",
  blocker: null, waitingSince: null, nextAction: "", platform: "IG", size: "—",
  contentItem: "—", history: [],
  ...over,
} as Graphic);

const byType = (g: Graphic) => graphicAssignmentTasks(g).map((t) => `${t.type}:${t.assignee}`);
const find = (g: Graphic, type: string) => graphicAssignmentTasks(g).find((t) => t.type === type);

console.log("— งานอาร์ตเวิร์กต้องไม่เปลี่ยนพฤติกรรมเดิม —");
is("ใบงานเปล่า ๆ ได้แค่งานดีไซน์", byType(req()), ["Graphic:Four"]);
is("slot 01 ยังเป็นอาร์ตเวิร์ก (ห้ามเปลี่ยน — 52 แถวใช้อยู่)", find(req(), "Graphic")!.id, 178515550176001);
is("ไม่มีดีไซเนอร์ = Unassigned + quickWins", (() => { const t = find(req({ designer: "" }), "Graphic")!; return [t.assignee, t.group]; })(), ["Unassigned", "quickWins"]);
is("due ของอาร์ตเวิร์กคือเดดไลน์งาน", (() => { const t = find(req(), "Graphic")!; return [t.due, t.dueIso]; })(), ["Aug 25", "2026-08-25"]);

console.log("\n— การ์ดอาร์ตเวิร์กต้องบอกสิ่งที่ติดจริง ไม่ใช่ 'start design' เสมอ —");
// เคสจริง OMD_2609_007-C03-A01: Jeeno เป็นทั้งคนถ่ายและดีไซเนอร์ นัดถ่าย 18 ส.ค.
// แต่การ์ดใน My Task บอกว่า "Jeeno to start design" ทั้งที่ยังไม่มีฟุตเทจ
// storyboard อนุมัติแล้ว เหลือแค่การถ่าย — ตรงกับใบจริงเป๊ะ
const shot = (over: Partial<Graphic> = {}) => req({
  storyboardOwner: "Pichayaporn", storyboardStatus: "Approved",
  requiresShooting: true, shooter: "Jeeno", shootDate: "2026-08-18", designer: "Jeeno",
  ...over,
} as Partial<Graphic>);
is("ยังไม่มีฟุตเทจ = บอกว่ารอฟุตเทจ", find(shot(), "Graphic")!.nextAction, "รอ footage/ภาพจาก Jeeno");
is("ติดอยู่ = ไม่ควรอยู่ Do First", find(shot(), "Graphic")!.group, "waitingMe");
is("ส่งฟุตเทจแล้ว = เริ่มออกแบบได้", find(shot({ footageLink: "https://drive/f" }), "Graphic")!.nextAction, "Jeeno to start design");
is("ส่งฟุตเทจแล้ว = กลับมา Do First", find(shot({ footageLink: "https://drive/f" }), "Graphic")!.group, "doFirst");
// storyboard ก็เป็นตัวขวางเหมือนกัน และขวางก่อนการถ่าย
is("รอ storyboard ก็บอก", find(req({ storyboardOwner: "Pichayaporn", storyboardStatus: "Submitted" }), "Graphic")!.nextAction, "รอเจ้าของงานอนุมัติ storyboard");
is("ติดสองอย่างบอกทั้งคู่", find(req({ storyboardOwner: "Pichayaporn", requiresShooting: true, shooter: "Jeeno" }), "Graphic")!.nextAction.includes(" · "), true);
// งาน Photo ไม่ต้องมี storyboard ไม่ต้องถ่าย = ไม่มีอะไรขวาง
is("งานที่ไม่ติดอะไร ยังพูดเหมือนเดิม", find(req({ type: "Photo" }), "Graphic")!.nextAction, "Four to start design");
is("ยังไม่มีดีไซเนอร์ ยังบอกให้ไปหาคนก่อน", find(req({ designer: "" }), "Graphic")!.nextAction, "Creative leader to assign designer");

console.log("\n— คนถ่าย: เคสที่หายไปทั้งหมด —");
const shoot = req({ requiresShooting: true, shooter: "Jeeno", shootDate: "2026-08-20" });
is("มีคนถ่าย = ได้งานถ่ายเพิ่ม", byType(shoot), ["Graphic:Four", "Shoot:Jeeno"]);
is("งานถ่ายเป็นของคนถ่าย ไม่ใช่ดีไซเนอร์", find(shoot, "Shoot")!.assignee, "Jeeno");
// เดดไลน์ของคนถ่ายคือ "วันถ่าย" ไม่ใช่วันส่งอาร์ตเวิร์ก — คนละสัปดาห์กันเลย
is("due คือวันถ่าย ไม่ใช่วันส่งงาน", (() => { const t = find(shoot, "Shoot")!; return [t.due, t.dueIso]; })(), ["Aug 20", "2026-08-20"]);
is("บอกให้ส่งไฟล์ต่อให้ใคร", find(shoot, "Shoot")!.nextAction, "ถ่าย Aug 20 แล้วส่งไฟล์ให้ Four");
is("อยู่กลุ่ม Do First", find(shoot, "Shoot")!.group, "doFirst");
is("slot 02 ไม่ชนกับอาร์ตเวิร์ก", find(shoot, "Shoot")!.id !== find(shoot, "Graphic")!.id, true);
is("ยังไม่นัดวันถ่าย ก็ยังได้งาน", byType(req({ requiresShooting: true, shooter: "Jeeno" })), ["Graphic:Four", "Shoot:Jeeno"]);
is("ยังไม่นัดวัน = บอกให้ไปคุยกับผู้ขอ", find(req({ requiresShooting: true, shooter: "Jeeno" }), "Shoot")!.nextAction, "ยังไม่ได้นัดวันถ่าย — คุยกับ Pupay");
is("ไม่ต้องถ่าย = ไม่มีงานถ่าย", byType(req({ requiresShooting: false, shooter: "Jeeno" })), ["Graphic:Four"]);
is("ยังไม่ตัดสินใจว่าถ่ายไหม = ยังไม่มีงานถ่าย", byType(req({ shooter: "Jeeno" })), ["Graphic:Four"]);
is("ต้องถ่ายแต่ยังไม่ระบุคน = ไม่มีงานถ่าย", byType(req({ requiresShooting: true })), ["Graphic:Four"]);
// คนถ่ายเป็นคนเดียวกับดีไซเนอร์: ยังต้องได้ 2 งาน คนละวัน คนละสิ่งที่ต้องทำ
is("คนถ่าย = ดีไซเนอร์ ก็ยังได้ 2 งาน", byType(req({ requiresShooting: true, shooter: "Four" })), ["Graphic:Four", "Shoot:Four"]);
is("คนถ่าย = ดีไซเนอร์ ต้องไม่บอกให้ส่งไฟล์ให้ตัวเอง", find(req({ requiresShooting: true, shooter: "Four", shootDate: "2026-08-20" }), "Shoot")!.nextAction, "ถ่าย Aug 20 แล้วขึ้นงานต่อได้เลย");

console.log("\n— ถ่ายเสร็จแล้ว งานต้องปิด ไม่ค้างในลิสต์ —");
const shotDone = req({ requiresShooting: true, shooter: "Jeeno", shootDate: "2026-08-06", footageLink: "https://drive.example/footage" });
is("ส่งไฟล์แล้ว = Done", (() => { const t = find(shotDone, "Shoot")!; return [t.status, t.group]; })(), ["Done", "done"]);
is("shootOutstanding: ยังไม่ส่งไฟล์", shootOutstanding({ requiresShooting: true, shooter: "Jeeno", footageLink: "" }), true);
is("shootOutstanding: ส่งไฟล์แล้ว", shootOutstanding({ requiresShooting: true, shooter: "Jeeno", footageLink: "x" }), false);
is("shootOutstanding: ไม่มีคนถ่าย", shootOutstanding({ requiresShooting: true, shooter: "", footageLink: "" }), false);

console.log("\n— Storyboard: ของงานวิดีโอเท่านั้น —");
const sb = req({ storyboardOwner: "Pichayaporn", requiresShooting: true, shooter: "Jeeno", shootDate: "2026-08-20" });
is("ครบสามงาน เรียงตามลำดับ pipeline", byType(sb), ["Graphic:Four", "Storyboard:Pichayaporn", "Shoot:Jeeno"]);
is("slot ทั้งสามไม่ซ้ำกัน", new Set(graphicAssignmentTasks(sb).map((t) => t.id)).size, 3);
is("งาน Photo ไม่ต้องมี storyboard", byType(req({ type: "Photo", storyboardOwner: "Pichayaporn" })), ["Graphic:Four"]);
is("Reel ต้องมี", byType(req({ storyboardOwner: "Pichayaporn" })), ["Graphic:Four", "Storyboard:Pichayaporn"]);
is("ตีกลับมาแก้ = บอกว่าใครตีกลับ", find(req({ storyboardOwner: "Pichayaporn", storyboardStatus: "Revision" }), "Storyboard")!.nextAction, "แก้ storyboard ตามที่ Pupay ตีกลับ");
is("ส่งแล้วรออนุมัติ = ย้ายไป Waiting for Me", (() => { const t = find(req({ storyboardOwner: "Pichayaporn", storyboardStatus: "Submitted" }), "Storyboard")!; return [t.group, t.status]; })(), ["waitingMe", "Todo"]);
is("อนุมัติแล้ว = Done", (() => { const t = find(req({ storyboardOwner: "Pichayaporn", storyboardStatus: "Approved" }), "Storyboard")!; return [t.status, t.group]; })(), ["Done", "done"]);
is("storyboardOutstanding: อนุมัติแล้ว", storyboardOutstanding({ type: "Reel", storyboardOwner: "Pichayaporn", storyboardStatus: "Approved" }), false);
is("storyboardOutstanding: ยังไม่ส่ง", storyboardOutstanding({ type: "Reel", storyboardOwner: "Pichayaporn", storyboardStatus: "" }), true);

console.log("\n— slot คือตัวระบุตัวตน ไม่ใช่เลข id —");
// เลข id ชนกับ task ของโมดูลอื่นได้จริง (task 246 ของ KOL กินเลข <gid>02 ไปแล้ว)
// การจับคู่จึงต้องใช้ relatedGraphicId + graphicSlot เท่านั้น
is("ทุกงานติด slot มาด้วย", graphicAssignmentTasks(sb).map((t) => t.graphicSlot), ["artwork", "storyboard", "shoot"]);
is("slot ไม่ซ้ำกันในใบงานเดียว", new Set(graphicAssignmentTasks(sb).map((t) => t.graphicSlot)).size, 3);
is("อาร์ตเวิร์ก = slot artwork เสมอ", find(req(), "Graphic")!.graphicSlot, "artwork");

console.log("\n— ทุกงานผูกกลับไปที่ใบงานเดิม —");
is("relatedGraphicId ครบทุกงาน", graphicAssignmentTasks(sb).every((t) => t.relatedGraphicId === "1785155501760"), true);
is("แบรนด์ครบทุกงาน", new Set(graphicAssignmentTasks(sb).map((t) => t.brand)).size, 1);
is("graphicTaskId ประกอบ slot ถูก", [graphicTaskId(12, GRAPHIC_TASK_SLOT.artwork), graphicTaskId(12, GRAPHIC_TASK_SLOT.shoot), graphicTaskId(12, GRAPHIC_TASK_SLOT.storyboard)], [1201, 1202, 1203]);
// id ใบงาน 13 หลัก: ประกอบ slot แล้วยังอยู่ในช่วงที่ JS นับแม่น slot จึงไม่ชนกัน
is("id 13 หลัก ยังไม่เกิน MAX_SAFE_INTEGER", Number.isSafeInteger(graphicTaskId(1785155501760, "03")), true);
is("id 13 หลัก: สาม slot ได้คนละเลข", new Set(["01","02","03"].map((s) => graphicTaskId(1785155501760, s))).size, 3);
// id ใบงาน 16 หลัก (ชุด OMD_2609_007 ที่มีอยู่จริง 8 ใบ): `${id}01` ยาว 18 หลัก
// เกิน 2^53 ทั้งสาม slot จึงปัดลงเป็นเลขเดียวกัน — เลขใช้เป็นตัวระบุตัวตนไม่ได้
// ต้องพึ่ง graphicSlot อย่างเดียว และ freeTaskId ฝั่ง db จะออกเลขใหม่ให้
is("id 16 หลัก เกินช่วงที่นับแม่น", Number.isSafeInteger(graphicTaskId(1786515010324000, "01")), false);
is("id 16 หลัก: สาม slot ปัดเป็นเลขเดียวกัน", new Set(["01","02","03"].map((s) => graphicTaskId(1786515010324000, s))).size, 1);
is("แต่ slot ยังแยกกันได้", new Set(graphicAssignmentTasks(req({ id: 1786515010324000, storyboardOwner: "Pichayaporn", requiresShooting: true, shooter: "Jeeno" })).map((t) => t.graphicSlot)).size, 3);

console.log("\n— บรีฟที่ถูกส่งกลับแก้: ใครต้องตรวจซ้ำ —");
// Creative ส่งกลับ → ผู้ขอแก้ → ต้องเด้งกลับไปหา "คนที่ส่งกลับ" ไม่ใช่ดีไซเนอร์
// เพราะคนที่ตั้งคำถามคือคนเดียวที่ปลดป้ายได้ (Pichayaporn ส่งกลับ 9 ใน 12 ใบจริง
// บนใบงานของดีไซเนอร์ 4 คน)
const revised = (over: Partial<Graphic> = {}) => req({
  blocker: BRIEF_REVISION_BLOCKER,
  acceptedBy: "Pichayaporn", acceptedAt: "2026-08-01T00:00:00.000Z",
  history: [
    { type: "requested", at: "2026-07-01T00:00:00.000Z", by: "Pupay", note: "" },
    { type: "brief_revision_requested", at: "2026-08-02T00:00:00.000Z", by: "Jungjing", note: "ยังไม่มีลิงก์บรีฟ" },
    { type: "brief_revision_requested", at: "2026-08-10T00:00:00.000Z", by: "Pichayaporn", note: "ยังไม่มีลิงก์บรีฟ" },
  ],
  ...over,
} as Partial<Graphic>);
is("อยู่ระหว่างส่งกลับแก้", underBriefRevision(revised()), true);
is("ไม่มี blocker = ไม่ได้อยู่ระหว่างแก้", underBriefRevision(req()), false);
is("blocker อื่นไม่นับ", underBriefRevision(req({ blocker: "Brief incomplete" })), false);
is("คนตรวจ = คนที่ส่งกลับล่าสุด", briefRevisionReviewer(revised()), "Pichayaporn");
is("ไม่ใช่ดีไซเนอร์ที่ถือใบงาน", briefRevisionReviewer(revised()) === "Four", false);
is("ไม่มีประวัติ = ถอยไปหาคนรับงาน", briefRevisionReviewer(req({ acceptedBy: "Pichayaporn", designer: "Four" })), "Pichayaporn");
is("ไม่มีทั้งคู่ = ดีไซเนอร์", briefRevisionReviewer(req({ designer: "Four" })), "Four");
is("Unassigned ไม่ใช่ชื่อคน", briefRevisionReviewer(req({ designer: "Unassigned" })), null);

console.log("\n— วัสดุตั้งต้น: designer มีอะไรให้เริ่มไหม —");
const mat = (over: Partial<Graphic>) => materialState(req(over as Partial<Graphic>));
is("ต้องถ่าย + มี footage = พร้อม", mat({ requiresShooting: true, footageLink: "https://f" } as Partial<Graphic>), "ready");
is("ต้องถ่าย + ยังไม่มี footage", mat({ requiresShooting: true } as Partial<Graphic>), "waiting_footage");
is("ไม่ต้องถ่าย + มีลิงก์รูป = พร้อม", mat({ requiresShooting: false, designerPhotosLink: "https://p" } as Partial<Graphic>), "ready");
is("ไม่ต้องถ่าย + ไม่มีรูปเลย", mat({ requiresShooting: false } as Partial<Graphic>), "no_material");
// สามค่าของ requiresShooting ต้องต่างกันจริง — undefined ไม่ใช่ "ไม่ต้องถ่าย"
is("ยังไม่ตัดสิน ≠ ไม่ต้องถ่าย", mat({}), "undecided");
is("งานที่วาดเองจากบรีฟ ไม่ต้องมีวัสดุ", mat({ type: "Poster" } as Partial<Graphic>), "not_needed");
is("POSM ก็ยกเว้น", mat({ type: "POSM" } as Partial<Graphic>), "not_needed");
is("แต่ Photo ไม่ยกเว้น", mat({ type: "Photo" } as Partial<Graphic>), "undecided");
is("รายการยกเว้นครอบคลุม Artwork และ LINE Rich Message",
  MATERIAL_EXEMPT_TYPES.includes("Artwork") && MATERIAL_EXEMPT_TYPES.includes("LINE Rich Message"), true);

console.log("\n— ยังเป็นคำเตือน ยังไม่ล็อก (ทาง C) —");
// กันสับสวิตช์โดยไม่ตั้งใจ: ถ้าเผลอเอา materialNote ไปใส่ productionBlockers
// งาน 35 ใบจาก 60 ใบจะถูกล็อกทันทีตั้งแต่เช้าวันรุ่งขึ้น
is("ไม่มีรูป + ไม่ต้องถ่าย → ยังไม่บล็อก", productionBlockers(req({ type: "Photo", requiresShooting: false } as Partial<Graphic>)).length, 0);
is("ยังไม่ตัดสิน → ยังไม่บล็อก", productionBlockers(req({ type: "Photo" } as Partial<Graphic>)).length, 0);
is("แต่ 'ต้องถ่ายแล้วไม่มี footage' ต้องบล็อกเหมือนเดิม",
  productionBlockers(req({ type: "Photo", requiresShooting: true, shooter: "Jeeno" } as Partial<Graphic>)).length, 1);
is("คำเตือนโผล่ในลำดับขั้น",
  productionSteps(req({ type: "Photo", requiresShooting: false, briefLink: "https://b", keyMessage: "k" } as Partial<Graphic>))
    .find((s2) => s2.key === "asset")!.detail.startsWith("⚠"), true);
is("งานยกเว้นไม่ขึ้นคำเตือน", materialNote(req({ type: "Poster" } as Partial<Graphic>)), "");

console.log("\n— Flow 4 ขั้น: บรีฟ → Storyboard → ถ่าย → ตัดต่อ —");
const flow = (g: Graphic) => productionSteps(g).map((s2) => `${s2.label}/${s2.role}`);
const vdo = req({
  briefLink: "https://docs/brief", keyMessage: "Sit Done",
  storyboardOwner: "Pichayaporn", requiresShooting: true, shooter: "Jeeno", designer: "Four",
} as Partial<Graphic>);
is("งานวิดีโอได้ครบสี่ขั้นตามลำดับ", flow(vdo),
  ["บรีฟ/Marketing", "Storyboard/Creative", "ถ่าย Footage/คนถ่าย", "ตัดต่อ/คนตัดต่อ"]);
// งานภาพนิ่งไม่ต้องมี storyboard และขั้นสุดท้ายคือทำอาร์ตเวิร์ก ไม่ใช่ตัดต่อ
is("งานภาพไม่มี storyboard และเรียกว่าอาร์ตเวิร์ก",
  flow(req({ type: "Photo", briefLink: "https://x", keyMessage: "k", requiresShooting: true, shooter: "Jeeno" } as Partial<Graphic>)),
  ["บรีฟ/Marketing", "ถ่าย Footage/คนถ่าย", "ทำอาร์ตเวิร์ก/Designer"]);
is("ไม่ต้องถ่าย = ข้ามขั้นถ่าย", flow(req({ type: "Photo", briefLink: "https://x", keyMessage: "k" } as Partial<Graphic>)).length, 2);
// ขั้นบรีฟคือของใหม่ — เดิมไม่เคยแสดง ทำให้ใบที่บรีฟไม่ครบดู "active" ที่ storyboard
is("บรีฟครบ = ขั้นแรกผ่าน", productionSteps(vdo)[0].state, "done");
is("ขาดลิงก์บรีฟ = ขั้นแรกยังไม่ผ่าน และบอกว่าขาดอะไร",
  (() => { const s3 = productionSteps(req({ keyMessage: "k" } as Partial<Graphic>))[0]; return [s3.state, s3.detail]; })(),
  ["active", "ยังขาด ลิงก์บรีฟ"]);
is("ขาดทั้งสองอย่างบอกทั้งคู่", productionSteps(req())[0].detail, "ยังขาด ลิงก์บรีฟ · key message");
is("เจ้าของขั้นบรีฟคือผู้ขอ", productionSteps(req())[0].owner, "Pupay");

console.log("\n— งานเร่งด่วน: ต้องมีคนถือการตัดสิน —");
// การ์ดบอกว่า "รอ Creative Leader หรือ CMO ตัดสิน" แต่ไม่เคยมีใครถูกแจ้ง
// งานเลยค้างรอการตัดสินที่ไม่มีใครรู้ว่าเป็นของตัวเอง
const rush = (over: Partial<Graphic> = {}) => req({ rushStatus: "Pending", rushApprover: "Pichayaporn", rushReason: "ลูกค้าขอด่วน", ...over } as Partial<Graphic>);
is("งานเร่งรออนุมัติ = มี Task เพิ่ม", byType(rush()).includes("Rush:Pichayaporn"), true);
is("มอบให้คนที่ถูกขอให้ตัดสิน", find(rush(), "Rush")!.assignee, "Pichayaporn");
// todayIso ใช้เวลาท้องถิ่น ไม่ใช่ UTC — ช่วงเช้ามืดที่กรุงเทพสองอันนี้คนละวัน
is("ครบกำหนดวันนี้ — งานเร่งที่รอได้ไม่ใช่งานเร่ง", find(rush(), "Rush")!.dueIso, todayIso());
is("ขึ้น Do First และ High", (() => { const t = find(rush(), "Rush")!; return [t.group, t.priority]; })(), ["doFirst", "High"]);
is("บอกเหตุผลที่ขอเร่ง", find(rush(), "Rush")!.nextAction, "Pupay ขอเร่ง: ลูกค้าขอด่วน");
// ตัดสินแล้วต้องปิดตัวเอง ไม่ค้างเป็นคำถามที่ตอบไปแล้ว
is("อนุมัติแล้ว = Done", (() => { const t = find(rush({ rushStatus: "Approved", rushDecidedBy: "Gik" }), "Rush")!; return [t.status, t.group]; })(), ["Done", "done"]);
is("ไม่อนุมัติก็ Done", find(rush({ rushStatus: "Rejected" }), "Rush")!.status, "Done");
is("ไม่ใช่งานเร่ง = ไม่มี Task นี้", byType(req()).some((t) => t.startsWith("Rush:")), false);
is("เร่งแต่ยังไม่รู้ว่าใครตัดสิน = ไม่สร้างงานลอย", byType(req({ rushStatus: "Pending" } as Partial<Graphic>)).some((t) => t.startsWith("Rush:")), false);
is("slot rush ไม่ชนกับสามอันเดิม", new Set(graphicAssignmentTasks(rush({ storyboardOwner: "Pichayaporn", requiresShooting: true, shooter: "Jeeno" } as Partial<Graphic>)).map((t) => t.graphicSlot)).size, 4);

console.log("\n— ลิงก์บรีฟบนใบงาน: หาให้เจอไม่ว่าเก็บไว้ตรงไหน —");
const BRIEF = "https://docs.google.com/presentation/d/brief";
is("อยู่ใน briefLink", creativeBriefLink(req({ briefLink: BRIEF })), BRIEF);
// ใบงาน adhoc ที่สร้างก่อน 13 ส.ค. เก็บลิงก์ไว้ที่ deliverable อย่างเดียว
// (TPN_2609_002-A01 เป็นเคสจริง) — Overview ต้องยังหาเจอ
is("เหลือแต่ใน deliverable (เคส TPN_2609_002-A01)",
  creativeBriefLink(req({ deliverables: [{ platform: "In-store", size: "A5", refLink: BRIEF, assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] }] } as Partial<Graphic>)),
  BRIEF);
is("ช่องที่เลิกใช้ก็ยังอ่าน", creativeBriefLink(req({ driveLink: BRIEF } as Partial<Graphic>)), BRIEF);
is("ไม่มีเลย = ค่าว่าง (Overview จะบอกว่ายังไม่มีบรีฟ)", creativeBriefLink(req()), "");
is("briefLink ชนะ deliverable", creativeBriefLink(req({ briefLink: BRIEF, deliverables: [{ platform: "x", size: "y", refLink: "https://other", assetLink: "", sourceLink: "", status: "Not submitted", version: 0, submittedBy: "", submittedAt: "", feedback: [] }] } as Partial<Graphic>)), BRIEF);

console.log("\n— Next action ของใบงานใหม่: ต้องเป็นสิ่งที่ต้องทำ ไม่ใช่เนื้อบรีฟ —");
// เคสจริง 14 ส.ค.: fan-out เขียน `KV: <kvDirection> · Msg: <mainMessage>` ลง
// nextAction — แคมเปญหนึ่งใส่ playbook 2,626 ตัวอักษรไว้ในช่อง KV Direction
// ช่อง "Next action" เลยพ่น playbook ทั้งก้อนแทนที่จะบอกว่าต้องทำอะไร
is("Reel = ไปตั้งต้นที่ storyboard", initialNextAction({ type: "Reel", designer: "Unassigned" } as Graphic), "Creative Content ทำ storyboard แล้วส่งให้เจ้าของงานอนุมัติ");
is("งานภาพนิ่งยังไม่มีคนทำ = ให้ Creative Leader จ่ายงาน", initialNextAction({ type: "Photo", designer: "Unassigned" } as Graphic), "Creative leader to assign in-house or outsource designer");
is("มีคนทำแล้ว = เรียกชื่อคนนั้น", initialNextAction({ type: "Photo", designer: "Four" } as Graphic), "Four to start design");
is("งานเร่งรออนุมัติมาก่อนทุกอย่าง", initialNextAction({ type: "Reel", rushStatus: "Pending", designer: "Four" } as Graphic), "รอ Creative Leader อนุมัติงานเร่งด่วน");
is("ไม่มีทางออกเป็นเนื้อบรีฟยาว ๆ", ["Reel", "Photo", "Static"].every((type) => initialNextAction({ type, designer: "Four" } as Graphic).length <= 80), true);

console.log(`\n${fail === 0 ? "✅" : "❌"} graphic-assignment-tasks: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
