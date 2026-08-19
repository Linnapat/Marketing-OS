/* Status Dashboard aggregation. Every module speaks a different status
 * vocabulary and they all collapse onto five health states here, so a wrong
 * mapping quietly reports blocked work as fine on the CMO's board.
 * Run: node --import tsx scripts/test-status-board.ts */

import {
  UNASSIGNED,
  contentHealth,
  expenseHealth,
  graphicHealth,
  graphicRowStatus,
  groupByCampaign,
  kolHealth,
  taskHealth,
  taskItems,
  worstHealth,
  urgencyOf,
  withUrgency,
  summarise,
  groupByOwner,
  recount,
  NO_OWNER,
  type Health,
  type WorkItem,
  storyboardHealth, shootingHealth, storyboardItems, shootingItems, graphicItems, MODULE_LABEL,
} from "../src/lib/data/statusBoard";
import type { Task } from "../src/lib/data/tasks";
import { GRAPHICS, type Graphic } from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

console.log("— worstHealth: ลำดับความร้ายแรง —");
is("blocked ชนะทุกอย่าง", worstHealth(["done", "active", "blocked", "waiting"]), "blocked");
is("waiting ชนะ active", worstHealth(["done", "active", "waiting"]), "waiting");
is("notStarted ชนะ active (งานที่ยังไม่แตะ = เสี่ยงกว่า)", worstHealth(["notStarted", "active"]), "notStarted");
is("เสร็จหมดจริงถึงเป็น done", worstHealth(["done", "done"]), "done");
is("ลิสต์ว่าง = ยังไม่เริ่ม ไม่ใช่เสร็จ", worstHealth([]), "notStarted");

console.log("\n— task status → health —");
is("Stuck = ติดปัญหา", taskHealth("Stuck"), "blocked");
is("Revision = ติดปัญหา", taskHealth("Revision"), "blocked");
is("Need Approval = รออนุมัติ", taskHealth("Need Approval"), "waiting");
is("In Progress = กำลังทำ", taskHealth("In Progress"), "active");
is("Todo = ยังไม่เริ่ม", taskHealth("Todo"), "notStarted");
is("Done = เสร็จ", taskHealth("Done"), "done");
is("ไม่รู้จัก ไม่ตกเป็น done", taskHealth("Zzz"), "active");
is("ตัวพิมพ์ใหญ่เล็กไม่สำคัญ", taskHealth("  IN PROGRESS "), "active");

console.log("\n— expense status → health —");
is("Paid = เสร็จ", expenseHealth("Paid"), "done");
is("Rejected = ติดปัญหา", expenseHealth("Rejected"), "blocked");
is("Unpaid = ติดปัญหา", expenseHealth("Unpaid"), "blocked");
is("Waiting Approval = รออนุมัติ", expenseHealth("Waiting Approval"), "waiting");
is("Draft = ยังไม่เริ่ม", expenseHealth("Draft"), "notStarted");
is("ไม่รู้จัก = รออนุมัติ (ฝั่งเงินไม่เดาว่าเสร็จ)", expenseHealth("???"), "waiting");

console.log("\n— KOL status → health —");
is("Posted = เสร็จ", kolHealth("Posted"), "done");
is("Paused = ติดปัญหา", kolHealth("Paused"), "blocked");
is("Revision Requested = ติดปัญหา", kolHealth("Revision Requested"), "blocked");
is("Waiting Review = รออนุมัติ", kolHealth("Waiting Review"), "waiting");
is("Negotiating = กำลังทำ", kolHealth("Negotiating"), "active");
is("Prospect = ยังไม่เริ่ม", kolHealth("Prospect"), "notStarted");
// 17 of the 18 live KOL rows sit in "Request"; before this it read as กำลังทำ.
is("Request = ยังไม่เริ่ม (ไม่ใช่กำลังทำ)", kolHealth("Request"), "notStarted");
is("Approved to Post = เสร็จ", kolHealth("Approved to Post"), "done");

console.log("\n— graphic: ชิ้นงานอ่อนสุดเป็นตัวตัดสิน —");
const del = (status: string) => ({ platform: "IG", size: "1:1", refLink: "", assetLink: "", sourceLink: "", status, version: 0, submittedBy: "", submittedAt: "", feedback: [] });
is(
  "approved 2 + not submitted 1 → ยังไม่เริ่ม (ไม่ใช่เสร็จ)",
  graphicHealth({ stage: "Producing", deliverables: [del("Approved"), del("Approved"), del("Not submitted")] } as never),
  "notStarted",
);
is(
  "approved ทุกชิ้น → เสร็จ",
  graphicHealth({ stage: "Producing", deliverables: [del("Approved"), del("Approved")] } as never),
  "done",
);

console.log("\n— graphic: ข้อความบนแถวต้องอธิบายป้าย ไม่ใช่ค้านกับป้าย —");
{
  // 20 แถวจริงเคยขึ้น "In Progress" คู่กับป้าย "ยังไม่เริ่ม" — ทั้งคู่จริง
  // (stage ขยับตั้งแต่มีคนรับงาน / ป้ายให้คะแนนจากชิ้นงานที่ส่ง) แต่วางคู่กัน
  // เฉย ๆ แล้วอ่านเหมือนมีอันหนึ่งโกหก ตัวเลขที่เติมเข้าไปคือคำอธิบาย
  const g = (stage: string, dels: string[]) => ({ stage, deliverables: dels.map(del) }) as never;
  is("มีชิ้นงาน → ต่อท้ายด้วยจำนวนที่ส่งแล้ว",
    graphicRowStatus(g("In Progress", ["Not submitted", "Not submitted", "Not submitted"])),
    "In Progress · ส่งแล้ว 0/3");
  is("ส่งบางชิ้นแล้ว", graphicRowStatus(g("In Progress", ["Approved", "Not submitted"])), "In Progress · ส่งแล้ว 1/2");
  is("ส่งครบ", graphicRowStatus(g("Waiting Feedback", ["Waiting review"])), "Waiting Feedback · ส่งแล้ว 1/1");
  // ใบที่ยังไม่มีชิ้นงานเลย ไม่มีอะไรให้เติม และป้ายก็อ่านจาก stage ตรง ๆ อยู่แล้ว
  is("ไม่มีชิ้นงาน → stage เปล่า ๆ", graphicRowStatus({ stage: "New Request" } as never), "New Request");
  // กันการกลับไปขัดกันอีก: ป้ายว่ายังไม่เริ่ม ข้อความต้องมีเหตุผลกำกับเสมอ
  const dels = ["Not submitted", "Not submitted"];
  is("ป้ายยังคงเป็นยังไม่เริ่ม", graphicHealth(g("In Progress", dels)), "notStarted");
  is("และข้อความบอกว่าทำไม", graphicRowStatus(g("In Progress", dels)).includes("0/2"), true);
}
is(
  "มีชิ้นรอรีวิว → รออนุมัติ",
  graphicHealth({ stage: "Producing", deliverables: [del("Approved"), del("Waiting review")] } as never),
  "waiting",
);
is(
  "ไม่มี deliverable → ใช้ stage ของ request",
  graphicHealth({ stage: "Draft", deliverables: [] } as never),
  "notStarted",
);
// Every live graphic request is stage "New Request".
is(
  "stage 'New Request' = ยังไม่เริ่ม",
  graphicHealth({ stage: "New Request", deliverables: [] } as never),
  "notStarted",
);

console.log("\n— content: 4 แกนยุบเหลือสถานะเดียว —");
const c = (caption: string, asset: string, approval: string, publish: string) =>
  ({ captionStatus: caption, assetStatus: asset, approvalStatus: approval, publishStatus: publish });
// The shape all 36 live posts are in.
is(
  "Waiting Design = ยังไม่เริ่ม (รอทีมออกแบบ ไม่ใช่รออนุมัติ)",
  contentHealth(c("Approved", "Waiting Design", "Approved", "Draft")).health,
  "notStarted",
);
is(
  "caption เสร็จแต่ยังไม่มีรูป → ติดที่ Asset",
  contentHealth(c("Approved", "No Asset", "Draft", "Draft")),
  { health: "notStarted", stage: "Asset" },
);
is(
  "ครบทุกแกน → เสร็จ",
  contentHealth(c("Approved", "Final", "Approved", "Published")),
  { health: "done", stage: "Caption" },
);
is(
  "โดนขอแก้ → ติดปัญหา และบอกว่าแกนไหน",
  contentHealth(c("Approved", "Final", "Revision Requested", "Draft")),
  { health: "blocked", stage: "Approval" },
);
is(
  "รออนุมัติชนะกำลังทำ",
  contentHealth(c("Approved", "Final", "Waiting Approval", "Scheduled in OS")),
  { health: "waiting", stage: "Approval" },
);

console.log("\n— groupByCampaign —");
const camps = [
  { id: "CAM-1", name: "Alpha", b: "teppen" as const, status: "Active" },
  { id: "CAM-2", name: "Beta", b: "mainichi" as const, status: "Active" },
];
const wi = (id: string, campaignId: string, health: Health, over: Partial<WorkItem> = {}): WorkItem =>
  ({ id, module: "task", title: id, campaignId, health, rawStatus: "x", urgency: "none", ...over });

{
  const g = groupByCampaign(camps, [wi("a", "CAM-1", "done"), wi("b", "CAM-1", "blocked"), wi("c", "CAM-2", "active")]);
  is("แคมเปญที่ติดปัญหาอยู่บนสุด", g[0].campaignId, "CAM-1");
  is("สถานะกลุ่ม = อันที่แย่ที่สุด", g[0].health, "blocked");
  is("นับแยกตามสถานะ", [g[0].counts.done, g[0].counts.blocked], [1, 1]);
  is("openCount ไม่นับงานที่เสร็จแล้ว", g[0].openCount, 1);
}
{
  const g = groupByCampaign(camps, []);
  is("แคมเปญที่ไม่มีงานยังมีแถว", g.length, 2);
  is("แคมเปญว่าง = ยังไม่เริ่ม ไม่ใช่เสร็จ", g[0].health, "notStarted");
  is("แคมเปญว่าง openCount = 0", g[0].openCount, 0);
}
{
  const g = groupByCampaign(camps, [wi("x", "CAM-GONE", "blocked"), wi("y", "", "waiting")]);
  const un = g.find((x) => x.campaignId === UNASSIGNED);
  is("งานที่ชี้ไปแคมเปญที่ไม่มี ไม่หายไป", un?.items.length, 2);
  is("กองรวมอยู่ล่างสุด ไม่ใช่บนสุดแม้จะ blocked", g[g.length - 1].campaignId, UNASSIGNED);
}
{
  const g = groupByCampaign(camps, [
    wi("a", "CAM-1", "waiting"),
    wi("b", "CAM-2", "waiting"), wi("c", "CAM-2", "waiting"),
  ]);
  is("สถานะเท่ากัน → เรียงตามจำนวนงานค้าง", [g[0].campaignId, g[1].campaignId], ["CAM-2", "CAM-1"]);
}

console.log("\n— taskItems: doneIds มีสิทธิ์เหนือ status —");
{
  const t = { id: 7, title: "T", status: "In Progress", assignee: "Ken", campaignId: "CAM-1" } as unknown as Task;
  is("อยู่ใน doneIds → เสร็จ แม้ status ยังเป็น In Progress", taskItems([t], new Set([7]))[0].health, "done");
  is("ไม่อยู่ใน doneIds → ตาม status", taskItems([t], new Set())[0].health, "active");
  is("task ที่ไม่มี campaignId → campaignId ว่าง (ไปกอง unassigned)",
     taskItems([{ ...t, campaignId: undefined } as Task], new Set())[0].campaignId, "");
}

console.log("\n— แกนเวลา: เลยกำหนด / ใกล้ครบ / ยังมีเวลา —");
{
  const today = "2026-07-28";
  is("เลยกำหนดเมื่อวาน", urgencyOf("2026-07-27", "notStarted", today), "overdue");
  is("ครบกำหนดวันนี้ = ยังไม่เลย", urgencyOf("2026-07-28", "notStarted", today), "dueSoon");
  is("อีก 7 วันพอดี ยังนับว่าใกล้", urgencyOf("2026-08-04", "notStarted", today), "dueSoon");
  is("อีก 8 วัน = ยังมีเวลา", urgencyOf("2026-08-05", "notStarted", today), "later");
  is("ไม่มีวันกำหนด = ไม่มีกำหนด", urgencyOf(undefined, "notStarted", today), "none");
  is("ค่าว่างก็เหมือนไม่มี", urgencyOf("", "notStarted", today), "none");
  // งานที่เสร็จแล้วต้องไม่ขึ้นแดง ไม่งั้นบอร์ดจะเต็มไปด้วยสีที่ไม่มีความหมาย
  is("เสร็จแล้วแม้เลยวันมานาน = ไม่นับว่าสาย", urgencyOf("2020-01-01", "done", today), "none");
  is("รับ timestamp เต็มได้ ตัดเอาเฉพาะวันที่", urgencyOf("2026-07-27T23:59:00Z", "notStarted", today), "overdue");
  // ข้ามเดือน/ปี
  is("ข้ามสิ้นเดือน", urgencyOf("2026-08-02", "notStarted", "2026-07-31"), "dueSoon");
  is("ข้ามปี", urgencyOf("2027-01-02", "notStarted", "2026-12-31"), "dueSoon");
  is("withUrgency ประทับค่าให้ทุกชิ้น", withUrgency([wi("a", "C", "notStarted", { dueIso: "2026-07-01" })], today)[0].urgency, "overdue");
}

console.log("\n— ตัวเลขสรุปบนสุด —");
{
  const today = "2026-07-28";
  const items = withUrgency([
    wi("late1", "C", "notStarted", { dueIso: "2026-07-01" }),
    wi("late2", "C", "blocked", { dueIso: "2026-07-02" }),
    wi("soon", "C", "waiting", { dueIso: "2026-07-30" }),
    wi("later", "C", "notStarted", { dueIso: "2026-12-01" }),
    wi("finished", "C", "done", { dueIso: "2026-01-01" }),
  ], today);
  const sum = summarise(items);
  is("นับทั้งหมด", sum.total, 5);
  is("งานที่ยังไม่จบ", sum.open, 4);
  is("เลยกำหนด", sum.overdue, 2);
  is("ใกล้ครบกำหนด", sum.dueSoon, 1);
  is("ติดปัญหา", sum.blocked, 1);
  is("รออนุมัติ", sum.waiting, 1);
}

console.log("\n— แคมเปญที่เลยกำหนดต้องมาก่อน แม้จะมีงานน้อยกว่า —");
{
  const today = "2026-07-28";
  // CAM-2 มีงานน้อยกว่ามาก แต่สายแล้ว 1 ชิ้น — ต้องอยู่เหนือ CAM-1 ที่มี 3 ชิ้นแต่ยังไม่ถึงกำหนด
  const items = withUrgency([
    wi("a", "CAM-1", "notStarted", { dueIso: "2026-12-01" }),
    wi("b", "CAM-1", "notStarted", { dueIso: "2026-12-02" }),
    wi("c", "CAM-1", "notStarted", { dueIso: "2026-12-03" }),
    wi("d", "CAM-2", "notStarted", { dueIso: "2026-07-01" }),
  ], today);
  const g = groupByCampaign(camps, items);
  is("แคมเปญที่สายอยู่บนสุด แม้งานน้อยกว่า", g[0].campaignId, "CAM-2");
  is("นับงานที่เลยกำหนดในกลุ่ม", g[0].overdueCount, 1);
  is("กลุ่มที่ยังไม่ถึงกำหนด overdueCount = 0", g[1].overdueCount, 0);
}

console.log("\n— งานค้างอยู่ที่ใคร —");
{
  const today = "2026-07-28";
  const items = withUrgency([
    wi("1", "C", "notStarted", { owner: "Jeeno", dueIso: "2026-07-01" }),
    wi("2", "C", "notStarted", { owner: "Jeeno", dueIso: "2026-07-02" }),
    wi("3", "C", "blocked", { owner: "Jeeno", dueIso: "2026-12-01" }),
    wi("4", "C", "notStarted", { owner: "Four", dueIso: "2026-07-03" }),
    wi("5", "C", "waiting", { owner: "Four", dueIso: "2026-07-30" }),
    wi("6", "C", "done", { owner: "Four", dueIso: "2026-01-01" }),
    wi("7", "C", "notStarted", { owner: "Unassigned", dueIso: "2026-07-04" }),
    wi("8", "C", "notStarted", { dueIso: "2026-07-05" }),
  ], today);
  const loads = groupByOwner(items);

  is("คนที่สายมากที่สุดอยู่บนสุด", loads[0].owner, "Jeeno");
  is("นับเฉพาะงานที่ยังไม่จบ", loads.find((l) => l.owner === "Four")?.total, 2);
  is("งานที่เสร็จแล้วไม่นับเข้าภาระใคร", loads.find((l) => l.owner === "Four")?.items.some((i) => i.id === "6"), false);
  is("นับงานสายของแต่ละคน", loads[0].overdue, 2);
  is("นับงานติดปัญหา", loads[0].blocked, 1);
  is("แยกตามโมดูลได้", loads[0].byModule.task, 3);
  // "Unassigned" กับช่องว่าง = กองเดียวกัน และต้องอยู่ล่างสุดเสมอ
  const noOwner = loads.find((l) => l.owner === NO_OWNER);
  is("งานไม่มีเจ้าของรวมเป็นกองเดียว", noOwner?.total, 2);
  is("กองไม่มีเจ้าของอยู่ล่างสุด", loads[loads.length - 1].owner, NO_OWNER);
  is("ไม่มีใครหาย", loads.reduce((n, l) => n + l.total, 0), 7);
}

console.log("\n— Story board / Shooting บน Status Board —");
{
  const g = (over: Partial<Graphic>): Graphic => ({ ...(GRAPHICS[0] as Graphic), campaignId: "CAM-1", ...over });
  const TODAY = "2026-08-10";

  // storyboard: ยังไม่ส่ง → ส่งแล้วรออนุมัติ → ตีกลับ → ผ่าน
  is("ยังไม่ส่ง = ยังไม่เริ่ม", storyboardHealth({ storyboardStatus: "" }), "notStarted");
  is("Waiting = ยังไม่เริ่ม", storyboardHealth({ storyboardStatus: "Waiting" }), "notStarted");
  is("ส่งแล้ว = รออนุมัติ", storyboardHealth({ storyboardStatus: "Submitted" }), "waiting");
  is("ตีกลับ = ติดปัญหา", storyboardHealth({ storyboardStatus: "Revision" }), "blocked");
  is("อนุมัติ = เสร็จ", storyboardHealth({ storyboardStatus: "Approved" }), "done");

  // shooting — สัญญาณสำคัญคือเลยวันถ่ายแล้วยังไม่มี footage
  is("ไม่มีอะไรเลย = ยังไม่เริ่ม", shootingHealth({ requiresShooting: true }, TODAY), "notStarted");
  is("มีคนถ่ายแล้ว = กำลังทำ", shootingHealth({ requiresShooting: true, shooter: "Four" }, TODAY), "active");
  is("นัดวันถ่ายในอนาคต = กำลังทำ", shootingHealth({ requiresShooting: true, shootDate: "2026-08-20" }, TODAY), "active");
  is("เลยวันถ่ายแล้วไม่มี footage = ติดปัญหา", shootingHealth({ requiresShooting: true, shootDate: "2026-08-01" }, TODAY), "blocked");
  is("มี footage แล้ว = เสร็จ แม้เลยวัน", shootingHealth({ requiresShooting: true, shootDate: "2026-08-01", footageLink: "http://x" }, TODAY), "done");

  // เฉพาะใบงานที่ต้องมีขั้นนั้นจริงเท่านั้นที่ขึ้นบอร์ด
  const rows = [
    g({ id: 1, type: "Reel", requiredVideo: true, requiresShooting: true, shooter: "Four", shootDate: "2026-08-20" }),
    g({ id: 2, type: "Poster", requiredVideo: false, requiresShooting: false }),
  ];
  is("Poster ไม่มีแถว storyboard", storyboardItems(rows).length, 1);
  is("Poster ไม่มีแถว shooting", shootingItems(rows, TODAY).length, 1);
  is("แถว storyboard ผูกแคมเปญเดิม", storyboardItems(rows)[0].campaignId, "CAM-1");
  is("เจ้าของ storyboard default = Creative Content", storyboardItems(rows)[0].owner, "Creative Content");
  is("เจ้าของ shooting = คนถ่าย", shootingItems(rows, TODAY)[0].owner, "Four");
  // เดดไลน์ของ shooting ต้องเป็น "วันถ่าย" ไม่ใช่วันส่ง artwork
  is("shooting ใช้วันถ่ายเป็นกำหนด", shootingItems(rows, TODAY)[0].dueIso, "2026-08-20");
  // id ต้องไม่ชนกับแถว graphic ของใบเดียวกัน
  is("id ไม่ชนกับ graphic", storyboardItems(rows)[0].id !== `graphic:1`, true);
  is("id storyboard กับ shooting ต่างกัน", storyboardItems(rows)[0].id !== shootingItems(rows, TODAY)[0].id, true);
  // ปฏิทินทีมเป็นคนกำหนดเดดไลน์ storyboard ถ้าผู้เรียกส่งมา
  is("ใช้เดดไลน์จากปฏิทินเมื่อมี", storyboardItems(rows, () => "2026-07-16")[0].dueIso, "2026-07-16");
  is("ไม่มีปฏิทินก็ถอยไปใช้ due เดิม", storyboardItems(rows, () => undefined)[0].dueIso, rows[0].dueIso);

  is("มีป้ายชื่อโมดูลครบ", [MODULE_LABEL.storyboard, MODULE_LABEL.shooting], ["Story board", "Shooting"]);
}

console.log("\n— แยกเลน Graphic / VDO ตัดต่อ —");
{
  const g = (over: Partial<Graphic>): Graphic => ({ ...(GRAPHICS[0] as Graphic), campaignId: "CAM-1", ...over });
  const laneOf = (over: Partial<Graphic>) => graphicItems([g(over)])[0].module;

  // งานอาร์ตเวิร์กอยู่เลน graphic เหมือนเดิม
  is("Poster = graphic", laneOf({ id: 1, type: "Poster" }), "graphic");
  is("Artwork = graphic", laneOf({ id: 2, type: "Artwork" }), "graphic");
  // Photo shoot ปิดจบที่รูป ไม่ใช่งานตัด — ยังเป็นเลน graphic (ขั้นถ่ายมีเลน Shooting ของตัวเองอยู่แล้ว)
  is("Photo shoot = graphic", laneOf({ id: 3, type: "Photo shoot" }), "graphic");

  // งานที่ชิ้นสุดท้ายเป็นวิดีโอ = เลน vdo
  is("Reel = vdo", laneOf({ id: 4, type: "Reel" }), "vdo");
  is("Short Video = vdo", laneOf({ id: 5, type: "Short Video" }), "vdo");
  is("VDO shooting = vdo (ถ่ายแล้วต้องตัด)", laneOf({ id: 6, type: "VDO shooting" }), "vdo");
  // ธงจาก Content Plan ชนะชื่อ type — โพสต์ที่ติ๊กว่าต้องมีวิดีโอคืองานตัด
  is("requiredVideo ชนะชื่อ type", laneOf({ id: 7, type: "Photo", requiredVideo: true }), "vdo");

  // ต้องตอบตรงกับ isVideoWork ที่ Slack routing / มุมโพสต์ ใช้ — ไม่งั้นชิปกับห้องแจ้งเตือนขัดกัน
  const rows = [g({ id: 8, type: "Poster" }), g({ id: 9, type: "Reel" })];
  is("ใบเดียวขึ้นเลนเดียว ไม่นับซ้ำ", graphicItems(rows).length, 2);
  is("id ยังเป็น graphic: เหมือนเดิม (ลิงก์เดิมไม่พัง)", graphicItems(rows)[1].id, "graphic:9");
  is("ป้ายเลน VDO", MODULE_LABEL.vdo, "VDO ตัดต่อ");
}

console.log("\n— ตัวเลขหัวแคมเปญต้องตรงกับรายการที่เห็น —");
{
  // บอร์ดกรอง items ของกลุ่ม "หลัง" จัดกลุ่มไปแล้ว ถ้าไม่นับใหม่ หัวแถวจะยังโชว์
  // ตัวเลขของงานที่เพิ่งถูกซ่อนไป — กรองเหลือเลน VDO แล้วหัวแถวยังนับงาน Graphic
  const it = (id: string, health: Health, urgency: WorkItem["urgency"] = "none"): WorkItem => ({
    id, module: "graphic", title: id, campaignId: "CAM-1", health,
    rawStatus: "", urgency,
  });
  const all = [it("a", "done"), it("b", "blocked", "overdue"), it("c", "notStarted", "dueSoon")];
  const full = recount({ items: all });
  is("นับครบเมื่อยังไม่กรอง", [full.counts.done, full.counts.blocked, full.openCount], [1, 1, 2]);
  is("สายกับใกล้ครบนับแยก", [full.overdueCount, full.dueSoonCount], [1, 1]);
  is("สุขภาพกลุ่ม = แย่สุด", full.health, "blocked");

  const filtered = recount({ items: all.filter((i) => i.id === "a") });
  is("กรองแล้วตัวเลขลดตาม", [filtered.counts.done, filtered.counts.blocked, filtered.openCount], [1, 0, 0]);
  is("กรองแล้วงานสายหายไปด้วย", filtered.overdueCount, 0);
  is("เหลือแต่งานเสร็จ = กลุ่มเสร็จ", filtered.health, "done");

  // groupByCampaign ต้องใช้ตัวเดียวกัน ไม่งั้นสองที่นับไม่ตรงกัน
  const grouped = groupByCampaign([{ id: "CAM-1", name: "C1" }], all)[0];
  is("groupByCampaign ใช้ recount ตัวเดียวกัน", [grouped.counts, grouped.health, grouped.openCount], [full.counts, full.health, full.openCount]);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
