/* Work Tracker — แคมเปญ → โพสต์ → งาน Graphic/VDO
 *
 * หน้านี้มีไว้ตอบคำถามเดียว: "งานกราฟฟิก/วิดีโอของโพสต์นี้ถึงไหนแล้ว"
 * ถ้ามันตอบผิด มันผิดแบบเงียบ ๆ — การ์ดยังขึ้นสวย ๆ ครบทุกใบ แค่บอกสถานะที่
 * ไม่ตรงกับความจริง แล้วคนอ่านก็วางแผนจากมัน เทสต์ชุดนี้จึงเน้นกฎที่ผิดแล้ว
 * ไม่มีใครเห็น มากกว่าการเช็คว่ารันไม่พัง
 * Run: node --import tsx scripts/test-tracker.ts */

import type { ContentItem } from "../src/lib/data/content";
import type { Graphic } from "../src/lib/data/graphic";
import {
  UNASSIGNED, buildTracker, filterMonth, hasDesigner, leadJob, postHealth,
  summarise, toJob, toPost,
} from "../src/lib/data/tracker";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const TODAY = "2026-08-16";

const g = (over: Partial<Graphic> = {}): Graphic => ({
  id: 900, stage: "New Request", title: "Hero Don + Comfort Set — Carousel", b: "omakase",
  campaign: "RESET YOUR DAY with OMD", campaignId: "CAM-2026-4610", due: "Sep 1",
  dueIso: "2026-09-01", designer: "Jeeno", requester: "Gik", approver: "Gik",
  type: "Carousel", priority: "Med", fb: 0, openFb: 0, isOverdue: false,
  briefComplete: true, pendingApprover: "—", blocker: null, waitingSince: "",
  nextAction: "", platform: "Facebook", size: "4:5", contentItem: "Hero Don + Comfort Set",
  briefLink: "https://drive/x", keyMessage: "รีเซ็ตวันของคุณ", ...over,
});

const c = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: "c-1", day: 10, dateIso: "2026-09-10", time: "10:00", title: "Hero Don + Comfort Set",
  b: "omakase", plat: "Facebook", status: "Planned", campaign: "RESET YOUR DAY with OMD",
  campaignId: "CAM-2026-4610", owner: "Gik", requester: "Gik", caption: "x", hashtags: "",
  cta: "", captionStatus: "Approved", assetStatus: "Waiting Design",
  approvalStatus: "Draft", publishStatus: "Draft", ...over,
});

const CAMPAIGNS = [
  { id: "CAM-2026-4610", name: "RESET YOUR DAY with OMD", b: "omakase" as const, status: "Approved" },
  { id: "CAM-2026-4856", name: "Kani Seasonal", b: "omakase" as const, status: "Draft" },
];

console.log("\n— 1. แกน Asset ต้องอ่านจากใบงานจริง ไม่ใช่ช่อง assetStatus —");
{
  // นี่คือเหตุผลที่หน้านี้มีอยู่ 21 จาก 23 โพสต์ของ OMD ก.ย. ค้างคำว่า
  // "Waiting Design" ในช่อง assetStatus ทั้งที่ใบงานเดินไปแล้ว ถ้าเอาช่องนั้น
  // มาคิด health การ์ดทุกใบจะขึ้น "ยังไม่เริ่ม" เหมือนกันหมด = ตาบอดเหมือนเดิม
  const done = toJob(g({ stage: "Delivered", deliverables: [{ platform: "FB", size: "1:1", status: "Approved" }] } as Partial<Graphic>), TODAY);
  const post = c({ assetStatus: "Waiting Design", captionStatus: "Approved", approvalStatus: "Approved", publishStatus: "Published" });
  is("ใบงานอนุมัติครบ แต่ช่องเขียน Waiting Design → Asset = done", postHealth(post, [done]).health, "done");

  const stale = c({ assetStatus: "Delivered" });
  is("ช่องเขียน Delivered แต่ไม่มีใบงานเลย → ยังไม่เริ่ม", postHealth(stale, []).health, "notStarted");
  is("และบอกได้ว่าแกนไหนตัดสิน", postHealth(stale, []).decidedBy, "Asset");
}

console.log("\n— 2. โพสต์ที่ไม่มีใบงาน คือจุดบอดที่ต้องเห็น ไม่ใช่ช่องว่าง —");
{
  const post = toPost(c({ captionStatus: "Ready" }), [], TODAY);
  is("noJob = true", post.noJob, true);
  is("ไม่มีใบงาน = ไม่มีใครถือ ไม่ต้องเดาชื่อคน", post.waitingOn, undefined);
  is("health ตกที่ Asset", post.decidedBy, "Asset");
}

console.log("\n— 3. current = ขั้นแรกที่ยังไม่เสร็จ ไม่ใช่ขั้นที่ state=active —");
{
  // productionSteps ปล่อยให้หลายขั้น active พร้อมกันได้: บรีฟยังขาด key message
  // (active) และ designer ก็ลงมือทำอาร์ตเวิร์กแล้ว (active) ถ้าอ่าน active ตัวแรก
  // เจอบ้างไม่เจอบ้างขึ้นกับลำดับ — "ขั้นแรกที่ยังไม่ done" ตอบถูกเสมอ
  const job = toJob(g({ briefLink: "", keyMessage: "" }), TODAY);
  is("บรีฟยังไม่ครบ → คอขวดคือบรีฟ", job.current?.key, "brief");
  is("และรอที่ผู้ขอเปิดงาน", job.current?.owner, "Gik");

  const ready = toJob(g({ type: "Reel", requiredVideo: true }), TODAY);
  is("งานวิดีโอ บรีฟครบ → คอขวดคือ Storyboard", ready.current?.key, "storyboard");
}

console.log("\n— 4. โพสต์มีหลายใบงาน → พูดแทนด้วยใบที่สายที่สุด —");
{
  // ใบที่เลยกำหนดแต่ "กำลังทำ" เร่งด่วนกว่าใบที่ยังไม่เริ่มแต่มีเวลาอีกเดือน
  // ถ้าเรียงด้วย health อย่างเดียว ใบที่ยังไม่เริ่มจะชนะ แล้วการ์ดจะชี้ไปผิดคน
  const late = toJob(g({ id: 1, dueIso: "2026-08-01", stage: "In Progress", designer: "Jeeno" }), TODAY);
  const later = toJob(g({ id: 2, dueIso: "2026-12-01", stage: "New Request", designer: "Jungjing" }), TODAY);
  is("ใบสายมาก่อน", leadJob([later, late])?.id, "1");
  is("ใบสายคือ overdue จริง", late.urgency, "overdue");
}

console.log("\n— 4b. ใบงานเลยกำหนด ทั้งที่โพสต์ยังไม่ถึงวันลง —");
{
  // จุดบอดตัวจริง: ชุด Brand Awareness ก.ย. 2569 มีใบงาน 7 ใบ due 10 ส.ค.
  // เลยมาแล้ว 6 วัน แต่โพสต์ลง 5–19 ก.ย. ทุกมุมมองที่วัดจากวันโพสต์บอกว่า
  // "ยังมีเวลา" แล้วความจริงจะโผล่เอาตอนที่แก้ไม่ทันแล้ว
  const post = c({ dateIso: "2026-09-08" });
  const job = g({ dueIso: "2026-08-10", stage: "New Request" });
  const card = toPost(post, [toJob(job, TODAY)], TODAY);
  is("โพสต์เองยังไม่สาย", card.urgency, "later");
  is("แต่ใบงานสายแล้ว และการ์ดบอกได้", card.jobsOverdue, 1);

  const groups = buildTracker(CAMPAIGNS, [post], [job], TODAY);
  is("แคมเปญนับใบงานสายแยกจากโพสต์สาย", groups[0]?.jobsOverdue, 1);
  is("โพสต์สาย = 0 ตามความจริง ไม่ปนกัน", groups[0]?.overdue, 0);
  is("summary แยกสองตัวเลข", summarise(groups).jobsOverdue, 1);

  // และแคมเปญแบบนี้ต้องลอยขึ้นบนสุด ไม่ใช่จมอยู่กลางลิสต์เพราะโพสต์ยังไม่สาย
  const calm = c({ id: "c-calm", campaignId: "CAM-2026-4856", campaign: "Kani Seasonal", dateIso: "2026-09-01" });
  const sorted = buildTracker(CAMPAIGNS, [calm, post], [job], TODAY);
  is("แคมเปญที่ใบงานสายขึ้นก่อน แม้โพสต์จะลงทีหลัง", sorted[0]?.campaignId, "CAM-2026-4610");
}

console.log("\n— 5. โพสต์ที่ลงไปแล้ว ไม่ต้องขึ้นว่ารอใคร —");
{
  const published = c({ publishStatus: "Published", approvalStatus: "Approved", captionStatus: "Approved" });
  const post = toPost(published, [toJob(g({ stage: "Delivered" }), TODAY)], TODAY);
  is("โพสต์แล้ว → ไม่มี waitingOn", post.waitingOn, undefined);
}

console.log("\n— 6. ใบงานที่ผูกโพสต์ไม่ได้ ต้องไม่หาย —");
{
  // ใบงานที่หลุดจากแผนคอนเทนต์คือของจริงที่มีคนทำอยู่ การกรองทิ้งเพราะจับคู่
  // ไม่ได้ = งานหายจากสายตาทั้งที่มีคนถืออยู่
  const orphan = g({ id: 63, title: "ไม่ตรงกับโพสต์ไหนเลย", contentItem: "ไม่ตรงกับโพสต์ไหนเลย" });
  const groups = buildTracker(CAMPAIGNS, [c()], [orphan], TODAY);
  const reset = groups.find((x) => x.campaignId === "CAM-2026-4610");
  is("ใบลอยอยู่ใต้แคมเปญของตัวเอง", reset?.looseJobs.length, 1);
  is("โพสต์ยังอยู่ครบ", reset?.posts.length, 1);
  is("นับรวมใน summary", summarise(groups).jobs, 1);
}

console.log("\n— 7. งานที่หาแคมเปญไม่เจอ ก็ต้องไม่หาย —");
{
  const groups = buildTracker([], [c({ campaignId: "" })], [], TODAY);
  is("ตกลงถัง UNASSIGNED", groups[0]?.campaignId, UNASSIGNED);
  is("มีชื่อกำกับให้อ่านออก", groups[0]?.name, "ยังไม่ผูกกับแคมเปญ");
}

console.log("\n— 8. \"Unassigned\" คือช่องว่าง ไม่ใช่ชื่อคน —");
{
  is("Unassigned → ยังไม่มีคนถือ", hasDesigner(toJob(g({ designer: "Unassigned" }), TODAY)), false);
  is("ช่องว่าง → ยังไม่มีคนถือ", hasDesigner(toJob(g({ designer: "  " }), TODAY)), false);
  is("มีชื่อจริง → มีคนถือ", hasDesigner(toJob(g({ designer: "Jeeno" }), TODAY)), true);

  const groups = buildTracker(CAMPAIGNS, [c()], [g({ designer: "Unassigned" })], TODAY);
  is("โพสต์ที่ทุกใบยังไม่มีคนถือ ถูกนับไว้", summarise(groups).unassigned, 1);
}

console.log("\n— 9. กรองตามเดือน —");
{
  const sep = c({ id: "c-sep", dateIso: "2026-09-10" });
  const oct = c({ id: "c-oct", dateIso: "2026-10-10", title: "เดือนหน้า" });
  const groups = buildTracker(CAMPAIGNS, [sep, oct], [], TODAY);
  is("ก.ย. เหลือโพสต์เดียว", filterMonth(groups, "2026-09").flatMap((x) => x.posts).length, 1);
  is("แคมเปญที่ไม่เหลืออะไรถูกตัดทิ้ง", filterMonth(groups, "2026-11").length, 0);
  is("ไม่ใส่เดือน = ไม่กรอง", filterMonth(groups, "").flatMap((x) => x.posts).length, 2);
}

console.log("\n— 10. แคมเปญที่มีของสายขึ้นก่อน —");
{
  const late = c({ id: "c-late", campaignId: "CAM-2026-4856", campaign: "Kani Seasonal", dateIso: "2026-08-02", captionStatus: "Missing" });
  const fine = c({ id: "c-fine", dateIso: "2026-09-30" });
  const groups = buildTracker(CAMPAIGNS, [fine, late], [], TODAY);
  is("แคมเปญที่สายมาก่อน", groups[0]?.campaignId, "CAM-2026-4856");
  is("นับ overdue ถูก", groups[0]?.overdue, 1);
}

console.log("\n— 11. summary: ตัวเลขหัวหน้าต้องตรงกับที่เห็นบนจอ —");
{
  const withJob = c({ id: "c-1" });
  const without = c({ id: "c-2", dateIso: "2026-09-11", title: "ไม่มีใบงาน" });
  const groups = buildTracker(CAMPAIGNS, [withJob, without], [g({ contentPostId: "c-1" })], TODAY);
  const s = summarise(groups);
  is("นับโพสต์", s.posts, 2);
  is("นับใบงาน", s.jobs, 1);
  is("นับโพสต์ที่ยังไม่มีใบงาน", s.noJob, 1);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
