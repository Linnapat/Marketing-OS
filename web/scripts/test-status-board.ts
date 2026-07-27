/* Status Dashboard aggregation. Every module speaks a different status
 * vocabulary and they all collapse onto five health states here, so a wrong
 * mapping quietly reports blocked work as fine on the CMO's board.
 * Run: node --import tsx scripts/test-status-board.ts */

import {
  UNASSIGNED,
  contentHealth,
  expenseHealth,
  graphicHealth,
  groupByCampaign,
  kolHealth,
  taskHealth,
  taskItems,
  worstHealth,
  type Health,
  type WorkItem,
} from "../src/lib/data/statusBoard";
import type { Task } from "../src/lib/data/tasks";

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
const wi = (id: string, campaignId: string, health: Health): WorkItem =>
  ({ id, module: "task", title: id, campaignId, health, rawStatus: "x" });

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
