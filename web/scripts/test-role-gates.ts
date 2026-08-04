/* Runtime tests for lib/roleGates — pinned to the Settings → Permissions
 * matrix, the source of truth QA verifies against. The earlier gate hardcoded
 * role names and "Content Creator" slipped through; now every role's Campaign
 * level decides, and these tests read the SAME seed matrix the app ships.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { campaignReleasedForWork, campaignAwaitsMe } from "../src/lib/data/campaigns";
import { canEditBriefNow, canReleaseBriefEdit, consumeBriefUnlock, briefUnlockState, releaseBriefForRevision, revisionAssignee, type Graphic } from "../src/lib/data/graphic";
import { canCreateCampaign, canSeePlatformPerformance, isCreativeSideRole, seedPermMatrix, campaignPermLevel, canEditContentPlan, canApproveExpense, canSeeAllSpending, canMarkPaid, canAssignCaption, canApproveCampaign } from "../src/lib/roleGates";

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("\n— campaign creation follows the Permissions matrix (Campaign ≥ Edit) —");
for (const role of ["CMO", "Marketing Manager / BGL", "Marketing Executive"]) {
  is(`${role} สร้างแคมเปญได้ (${campaignPermLevel(role)})`, canCreateCampaign(role), true);
}
// ยืนยันจากตาราง Permissions จริง 18 ก.ค.: สาม role นี้ Campaign = View → สร้างไม่ได้
for (const role of ["Co-ordinator", "KOL Specialist", "Content Creator", "Creative Leader", "VDO Editor", "Senior Graphic Designer", "Agency (External)"]) {
  is(`${role} สร้างแคมเปญไม่ได้ (${campaignPermLevel(role) ?? "ไม่อยู่ใน matrix"})`, canCreateCampaign(role), false);
}

console.log("\n— the SAVED matrix overrides the seed —");
{
  const custom = { ...seedPermMatrix(), "Co-ordinator": { Campaign: "Edit" } };
  is("admin ยกระดับ Co-ordinator เป็น Edit → สร้างได้", canCreateCampaign("Co-ordinator", custom), true);
  const demoted = { ...seedPermMatrix(), "Marketing Executive": { Campaign: "View" } };
  is("admin ลด Marketing Executive เป็น View → สร้างไม่ได้", canCreateCampaign("Marketing Executive", demoted), false);
}

console.log("\n— unknown roles fail closed on the production side —");
is("role ใหม่สายกราฟฟิกที่ matrix ไม่รู้จัก → สร้างไม่ได้", canCreateCampaign("Junior Motion Graphic"), false);
is("role ว่าง (demo) ยังทำงานได้", canCreateCampaign(""), true);

console.log("\n— platform performance: money stays with planning/management —");
for (const role of ["CMO", "Marketing Manager / BGL", "Marketing Executive", "Co-ordinator"]) {
  is(`${role} เห็น Platform Performance`, canSeePlatformPerformance(role), true);
}
for (const role of ["KOL Specialist", "VDO Editor", "Content Creator", "Creative Leader", "Agency (External)"]) {
  is(`${role} ไม่เห็น Platform Performance`, canSeePlatformPerformance(role), false);
}

// artwork sign-off ย้ายไปที่ scripts/test-deliverable-review.ts แล้ว —
// กติกาเปลี่ยนเป็นตรวจ 2 ด้านโดยคนละคน ซึ่งต้องดูตัว deliverable ไม่ใช่แค่ role string

console.log("\n— edges —");
is("role ว่างไม่ถือเป็น creative", isCreativeSideRole(""), false);

console.log("\n— ใครแก้/ย้ายโพสต์ใน Content Plan ได้ —");
// ฝั่งวางแผนเป็นเจ้าของตาราง
is("CMO แก้ได้", canEditContentPlan("CMO"), true);
is("Marketing Manager / BGL แก้ได้", canEditContentPlan("Marketing Manager / BGL"), true);
is("Marketing Executive แก้ได้", canEditContentPlan("Marketing Executive"), true);
is("Co-ordinator แก้ได้", canEditContentPlan("Co-ordinator"), true);
// ฝั่งผลิตอ่านแผน ไม่ใช่คนเลื่อนแผน
is("Creative Leader แก้ไม่ได้", canEditContentPlan("Creative Leader"), false);
is("Senior Graphic Designer แก้ไม่ได้", canEditContentPlan("Senior Graphic Designer"), false);
is("VDO Editor แก้ไม่ได้", canEditContentPlan("VDO Editor"), false);
is("Content Creator แก้ไม่ได้", canEditContentPlan("Content Creator"), false);
is("KOL Specialist แก้ไม่ได้", canEditContentPlan("KOL Specialist"), false);
is("Agency (External) แก้ไม่ได้", canEditContentPlan("Agency (External)"), false);
// role ว่าง/ไม่รู้จัก ต้องไม่หลุด
is("role ว่างแก้ไม่ได้", canEditContentPlan(""), false);
is("role ที่ไม่รู้จักแก้ไม่ได้", canEditContentPlan("Intern"), false);
is("เว้นวรรคหน้า-หลังยังจับได้", canEditContentPlan("  CMO  "), true);

console.log("\n— ใครอนุมัติคำขอเบิกงบได้ (ต้องตรงกับ RLS: has_module('Finance','Approve')) —");
// นี่คือช่องโหว่ที่ audit เจอ: UI ปล่อยให้ Co-ordinator กด Approve และ DB ก็ยอม
is("CMO อนุมัติได้", canApproveExpense("CMO"), true);
is("Co-ordinator (Finance=Edit) อนุมัติไม่ได้", canApproveExpense("Co-ordinator"), false);
is("Marketing Manager / BGL (Finance=View) อนุมัติไม่ได้", canApproveExpense("Marketing Manager / BGL"), false);
is("Creative Leader อนุมัติไม่ได้", canApproveExpense("Creative Leader"), false);
is("Senior Graphic Designer อนุมัติไม่ได้", canApproveExpense("Senior Graphic Designer"), false);
is("VDO Editor อนุมัติไม่ได้", canApproveExpense("VDO Editor"), false);
is("KOL Specialist อนุมัติไม่ได้", canApproveExpense("KOL Specialist"), false);
is("Agency (External) อนุมัติไม่ได้", canApproveExpense("Agency (External)"), false);
// ตัวตนที่ยังไม่รู้ ต้องไม่ได้สิทธิ์อนุมัติเงิน (fail-closed)
is("role ว่างอนุมัติไม่ได้", canApproveExpense(""), false);
is("role ที่ไม่รู้จักอนุมัติไม่ได้", canApproveExpense("Intern"), false);

console.log("\n— ใครเห็น Spending Log ทั้งบริษัท (การ 'ส่งคำขอ' ไม่ต้องใช้สิทธิ์นี้) —");
// ค่าตั้งต้นที่ ship มากับโค้ด (seed matrix)
is("CMO เห็น", canSeeAllSpending("CMO"), true);
is("Marketing Manager / BGL เห็น", canSeeAllSpending("Marketing Manager / BGL"), true);
is("Co-ordinator ตาม seed ยังไม่เห็น", canSeeAllSpending("Co-ordinator"), false);
is("Senior Graphic Designer ไม่เห็น", canSeeAllSpending("Senior Graphic Designer"), false);
is("VDO Editor ไม่เห็น", canSeeAllSpending("VDO Editor"), false);
is("KOL Specialist ไม่เห็น", canSeeAllSpending("KOL Specialist"), false);
is("role ว่างไม่เห็น", canSeeAllSpending(""), false);

// matrix ที่ admin แก้ใน Settings ต้องชนะ seed เสมอ — production วันนี้ตั้ง
// Co-ordinator เป็น Finance=Edit ซึ่งต่างจาก seed ที่เป็น "—"
console.log("\n— matrix ที่บันทึกไว้ต้องชนะค่า seed —");
const live = { ...seedPermMatrix(), "Co-ordinator": { ...seedPermMatrix()["Co-ordinator"], Finance: "Edit" } };
is("Co-ordinator (live Finance=Edit) เห็น Spending Log", canSeeAllSpending("Co-ordinator", live), true);
is("Co-ordinator (live Finance=Edit) ยังอนุมัติไม่ได้", canApproveExpense("Co-ordinator", live), false);
const promoted = { ...seedPermMatrix(), "Co-ordinator": { ...seedPermMatrix()["Co-ordinator"], Finance: "Approve" } };
is("ถ้าตั้งเป็น Finance=Approve ถึงจะอนุมัติได้", canApproveExpense("Co-ordinator", promoted), true);

console.log("\n— ใครกด Mark Paid ได้ (ต้องตรงกับ trigger expenses_paid_guard) —");
// คนจ่ายเงินจริงคือคนที่บอกได้ว่าจ่ายแล้ว
is("Co-ordinator กดได้", canMarkPaid("Co-ordinator"), true);
is("CMO กดได้ (override เมื่อ Co-ordinator ไม่อยู่)", canMarkPaid("CMO"), true);
// Finance=Edit ไม่ได้แปลว่าเป็นคนจ่าย
is("Marketing Manager / BGL กดไม่ได้", canMarkPaid("Marketing Manager / BGL"), false);
is("Marketing Executive กดไม่ได้", canMarkPaid("Marketing Executive"), false);
is("Creative Leader กดไม่ได้", canMarkPaid("Creative Leader"), false);
is("Senior Graphic Designer กดไม่ได้", canMarkPaid("Senior Graphic Designer"), false);
is("VDO Editor กดไม่ได้", canMarkPaid("VDO Editor"), false);
is("KOL Specialist กดไม่ได้", canMarkPaid("KOL Specialist"), false);
is("Agency (External) กดไม่ได้", canMarkPaid("Agency (External)"), false);
is("role ว่างกดไม่ได้", canMarkPaid(""), false);
is("role ที่ไม่รู้จักกดไม่ได้", canMarkPaid("Intern"), false);
is("เว้นวรรคหน้า-หลังยังจับได้", canMarkPaid("  Co-ordinator  "), true);

console.log("\n— CMO อนุมัติแคมเปญก่อน Creative จึงรับงานได้ —");
// ก่อนแก้: มีใบงาน 12 ใบ + โพสต์ 11 ใบ เดินอยู่ใต้แคมเปญที่ยังไม่อนุมัติ
is("Draft → รับงานไม่ได้", campaignReleasedForWork("Draft"), false);
is("Waiting for Approval → รับงานไม่ได้", campaignReleasedForWork("Waiting for Approval"), false);
is("Waiting Approval (ชื่อเก่า) → รับงานไม่ได้", campaignReleasedForWork("Waiting Approval"), false);
is("Need Revision → รับงานไม่ได้", campaignReleasedForWork("Need Revision"), false);
is("Ready for Review → รับงานไม่ได้", campaignReleasedForWork("Ready for Review"), false);
is("Planning → รับงานไม่ได้", campaignReleasedForWork("Planning"), false);
is("Cancelled → รับงานไม่ได้", campaignReleasedForWork("Cancelled"), false);
is("Approved → รับงานได้", campaignReleasedForWork("Approved"), true);
is("Active → รับงานได้", campaignReleasedForWork("Active"), true);
is("In Progress → รับงานได้", campaignReleasedForWork("In Progress"), true);
// สถานะหาย = ไม่ปล่อย ห้ามเดาว่าอนุมัติแล้ว
is("สถานะว่าง → ไม่ปล่อย", campaignReleasedForWork(""), false);
is("null → ไม่ปล่อย", campaignReleasedForWork(null), false);
is("undefined → ไม่ปล่อย", campaignReleasedForWork(undefined), false);
is("เว้นวรรคหน้าหลังยังจับได้", campaignReleasedForWork("  Draft  "), false);
// สถานะที่ยังไม่รู้จักต้องไม่ freeze คิว (ตั้งใจ fail-open เฉพาะกรณีนี้)
is("สถานะใหม่ที่ไม่รู้จัก → ปล่อย (กันคิวค้างทั้งทีม)", campaignReleasedForWork("Some New Status"), true);

console.log("\n— ใครมอบหมายคนเขียนแคปชั่นได้ (ต้องตรงกับ content_owner_guard) —");
// ตาม flow ทีม: Creative Leader คือคนคุมคิวทั้งฝั่งกราฟฟิกและแคปชั่น
is("Creative Leader มอบหมายได้", canAssignCaption("Creative Leader"), true);
is("CMO มอบหมายได้ (สำรองตอน Leader ไม่อยู่)", canAssignCaption("CMO"), true);
// คนขอห้ามเลือกคนเขียนเอง — ไม่งั้นข้ามคนคุมคิว
is("Marketing Manager / BGL มอบหมายไม่ได้", canAssignCaption("Marketing Manager / BGL"), false);
is("Marketing Executive มอบหมายไม่ได้", canAssignCaption("Marketing Executive"), false);
is("Content Creator มอบหมายให้ตัวเองไม่ได้", canAssignCaption("Content Creator"), false);
is("Co-ordinator มอบหมายไม่ได้", canAssignCaption("Co-ordinator"), false);
is("Senior Graphic Designer มอบหมายไม่ได้", canAssignCaption("Senior Graphic Designer"), false);
is("role ว่าง → ไม่ได้", canAssignCaption(""), false);
is("เว้นวรรคหน้าหลังยังจับได้", canAssignCaption("  Creative Leader  "), true);

console.log("\n— ใครอนุมัติแคมเปญได้ (ต้องตรงกับปุ่ม Approve ใน CampaignDetailView) —");
// คิว My approvals เคยโชว์แคมเปญที่รออนุมัติให้ทุกคนที่เห็นแบรนด์นั้น ทั้งที่กดอนุมัติไม่ได้
is("CMO อนุมัติได้", canApproveCampaign("CMO"), true);
is("Marketing Manager / BGL อนุมัติไม่ได้", canApproveCampaign("Marketing Manager / BGL"), false);
is("Creative Leader อนุมัติไม่ได้ (คุมคิวงาน ไม่ใช่อนุมัติแคมเปญ)", canApproveCampaign("Creative Leader"), false);
is("Marketing Executive อนุมัติไม่ได้", canApproveCampaign("Marketing Executive"), false);
is("Senior Graphic Designer อนุมัติไม่ได้", canApproveCampaign("Senior Graphic Designer"), false);
is("Agency (External) อนุมัติไม่ได้", canApproveCampaign("Agency (External)"), false);
// ต่างจาก canCreateCampaign ที่ role ว่างแล้วปล่อยผ่าน — คิวอนุมัติต้อง fail-closed
is("role ว่าง (member ยังโหลดไม่เสร็จ) → ไม่ได้", canApproveCampaign(""), false);

console.log("\n— แคมเปญไหนควรอยู่ในคิว My approvals ของเรา —");
const wfa = { status: "Waiting for Approval", owner: "Ken S." };
const rfr = { status: "Ready for Review", owner: "Ken S." };
// รออนุมัติ = เรื่องของ CMO เท่านั้น เจ้าของงานไม่ได้เป็นคนกด
is("รออนุมัติ + เราอนุมัติได้ → เข้าคิว", campaignAwaitsMe(wfa, { canApprove: true, me: "Aran P." }), true);
is("รออนุมัติ + เราอนุมัติไม่ได้ → ไม่เข้า แม้เป็นเจ้าของ", campaignAwaitsMe(wfa, { canApprove: false, me: "Ken S." }), false);
// Ready for Review ไม่มีใคร "อนุมัติ" — เจ้าของต้องกดส่งขออนุมัติเอง
is("Ready for Review + เราเป็นเจ้าของ → เข้าคิว", campaignAwaitsMe(rfr, { canApprove: false, me: "Ken S." }), true);
is("Ready for Review + ไม่ใช่เจ้าของ → ไม่เข้า แม้เป็น CMO", campaignAwaitsMe(rfr, { canApprove: true, me: "Aran P." }), false);
is("เว้นวรรคหน้าหลังชื่อเจ้าของยังจับได้", campaignAwaitsMe({ status: "Ready for Review", owner: "  Ken S. " }, { canApprove: false, me: "Ken S." }), true);
// fail-closed: ระหว่างที่ member ยังโหลดไม่เสร็จ viewAs เป็น "" ต้องไม่ไปแมตช์งานที่ไม่มีเจ้าของ
is("me ว่าง + owner ว่าง → ไม่เข้าคิวใคร", campaignAwaitsMe({ status: "Ready for Review", owner: "" }, { canApprove: false, me: "" }), false);
// สถานะอื่นไม่ใช่เรื่องของคิวอนุมัติ
is("Active → ไม่เข้าคิว", campaignAwaitsMe({ status: "Active", owner: "Ken S." }, { canApprove: true, me: "Ken S." }), false);
is("Draft → ไม่เข้าคิว", campaignAwaitsMe({ status: "Draft", owner: "Ken S." }, { canApprove: true, me: "Ken S." }), false);

console.log("\n— เติมบรีฟหลัง Creative รับงาน: ต้องขอ Creative Leader แล้วรอปล่อย —");
const free = { acceptedAt: undefined } as Pick<Graphic, "acceptedAt" | "briefUnlock" | "acceptedBy">;
const taken = { acceptedAt: "2026-07-20T03:00:00Z", acceptedBy: "Boss" } as Pick<Graphic, "acceptedAt" | "briefUnlock" | "acceptedBy">;
const asked = { ...taken, briefUnlock: { status: "Pending" as const, requestedBy: "Ken S.", requestedAt: "2026-07-21T03:00:00Z" } };
const freed = { ...taken, briefUnlock: { status: "Granted" as const, requestedBy: "Ken S.", requestedAt: "2026-07-21T03:00:00Z", decidedBy: "Boss" } };
const refused = { ...taken, briefUnlock: { status: "Rejected" as const, requestedBy: "Ken S.", requestedAt: "2026-07-21T03:00:00Z", decidedBy: "Boss" } };
const asRequester = { isRequester: true, isCmo: false };
// ยังไม่มีใครรับงาน = เติมได้เลย (ไม่งั้นบรีฟจะค้างที่ 38% เหมือนก่อนมีฟอร์ม)
is("ยังไม่มีใครรับงาน → requester เติมได้เลย", canEditBriefNow(free, asRequester), true);
is("รับงานแล้ว + ยังไม่ได้ขอ → เติมไม่ได้", canEditBriefNow(taken, asRequester), false);
is("ขอแล้วแต่ยังไม่ปล่อย → ยังเติมไม่ได้", canEditBriefNow(asked, asRequester), false);
is("ปล่อยแล้ว → เติมได้", canEditBriefNow(freed, asRequester), true);
is("ไม่ปล่อย → เติมไม่ได้", canEditBriefNow(refused, asRequester), false);
// CMO มีสิทธิ์ override ทั่วแอป แต่ไม่ข้ามการปล่อยงาน
is("CMO ก็ต้องรอปล่อยเหมือนกัน", canEditBriefNow(taken, { isRequester: false, isCmo: true }), false);
is("คนอื่นที่ไม่ใช่ requester/CMO → เติมไม่ได้แม้ปล่อยแล้ว", canEditBriefNow(freed, { isRequester: false, isCmo: false }), false);
// ใครปล่อยได้ — Creative Leader เท่านั้น (แคบกว่า canAcceptWork โดยตั้งใจ)
is("Creative Leader ปล่อยได้", canReleaseBriefEdit("Creative Leader"), true);
is("CMO ปล่อยไม่ได้", canReleaseBriefEdit("CMO"), false);
is("Senior Graphic Designer ปล่อยไม่ได้", canReleaseBriefEdit("Senior Graphic Designer"), false);
is("role ว่าง ปล่อยไม่ได้", canReleaseBriefEdit(""), false);
is("เว้นวรรค/ตัวพิมพ์ยังจับได้", canReleaseBriefEdit("  creative leader "), true);
// สิทธิ์ใช้ได้ครั้งเดียว — เติมเสร็จแล้วต้องขอใหม่
is("เติมเสร็จ → สิทธิ์ถูกใช้ไป เติมซ้ำไม่ได้", canEditBriefNow(consumeBriefUnlock(freed as Graphic), asRequester), false);
is("ยังไม่ได้ปล่อย → consume ไม่ทำอะไร", briefUnlockState(consumeBriefUnlock(asked as Graphic)), "pending");

console.log("\n— Creative ส่งบรีฟกลับมาแก้ = ปล่อยให้แก้ได้เลย ไม่ต้องขอซ้ำ —");
{
  // บั๊กจริง: ตีบรีฟกลับแล้วสร้าง task ให้ requester ว่า "แก้ brief ตาม comment"
  // แต่ canEditBriefNow ยังปิดอยู่ → คนได้ใบสั่งให้ทำสิ่งที่ตัวเองทำไม่ได้
  const sentBack = releaseBriefForRevision(taken as Graphic, "Boss", "บรีฟยังไม่มี key message");
  is("ตีบรีฟกลับ → requester แก้ได้ทันที", canEditBriefNow(sentBack, asRequester), true);
  is("ปล่อยในนามคนที่ตีกลับ", sentBack.briefUnlock?.decidedBy, "Boss");
  is("เก็บเหตุผลที่ตีกลับไว้เป็นที่มาของการปล่อย", sentBack.briefUnlock?.reason, "บรีฟยังไม่มี key message");
  // one-shot เหมือนการปล่อยปกติ — รอบถัดไปต้องขอใหม่
  is("แก้เสร็จ 1 รอบแล้วต้องขอใหม่", canEditBriefNow(consumeBriefUnlock(sentBack), asRequester), false);
  // คนอื่นไม่ได้สิทธิ์ติดมาด้วย
  is("คนอื่นยังแก้ไม่ได้", canEditBriefNow(sentBack, { isRequester: false, isCmo: false }), false);
}

console.log("\n— งานที่ถูกตีกลับต้องถึงคนที่ส่งงานจริง —");
{
  const req = { acceptedBy: "Aom", designer: "Boss" };
  is("คนส่งงานมาก่อนทุกชื่อ", revisionAssignee(req, { submittedBy: "Studio Nine" }), "Studio Nine");
  is("ไม่มีคนส่ง → คนที่รับงาน", revisionAssignee(req, { submittedBy: "" }), "Aom");
  is("ไม่มีทั้งคู่ → designer", revisionAssignee({ acceptedBy: "", designer: "Boss" }, undefined), "Boss");
  // "Unassigned" เป็นคำที่แอปใช้แทนช่องว่าง ไม่ใช่ชื่อคน — เคสนี้คือที่ทำให้ feedback หายไปทั้งรอบ
  is("Unassigned ไม่นับเป็นคน", revisionAssignee({ acceptedBy: "Aom", designer: "Unassigned" }, undefined), "Aom");
  is("ไม่มีใครเลย → null (ไม่แจ้งผิดคน)", revisionAssignee({ acceptedBy: "Unassigned", designer: "" }, { submittedBy: "  " }), null);
}

console.log("\n— กติกาเติมบรีฟต้องตรงกันทั้งฝั่ง client และ SQL —");
{
  // บั๊กจริงที่เคยหลุด: UI ปล่อยให้แก้บรีฟหลัง Creative รับงาน (เมื่อ Creative
  // Leader ปล่อยแล้ว) แต่ RPC ยังปฏิเสธทุกกรณีที่มี acceptedAt — ผู้ใช้กด Save
  // แล้วงานหายเงียบ ๆ · migration รันด้วยมือ เทสต์นี้จึงเช็คว่าไฟล์ SQL รู้จัก
  // briefUnlock จริง ไม่ได้เช็คว่า DB รันไปแล้ว (เช็คจากที่นี่ไม่ได้)
  const sql = readFileSync(new URL("../supabase/graphic_brief_patch.sql", import.meta.url), "utf8");
  check("SQL รู้จัก briefUnlock", sql.includes("briefUnlock"));
  check("SQL ยอมให้แก้เมื่อสถานะเป็น Granted", /Granted/.test(sql));
  check("SQL ใช้สิทธิ์แล้วลบทิ้ง (one-shot)", /merged - 'briefUnlock'/.test(sql));
  // โหมดผลักบรีฟจากแคมเปญลงใบงานเดิม — เติมเฉพาะช่องว่าง และไม่แตะใบที่ถูกรับงานแล้ว
  check("SQL มีโหมด p_only_if_empty", sql.includes("p_only_if_empty"));
  // ต้อง drop signature เก่าก่อน create or replace ไม่งั้นได้ฟังก์ชัน 2 ตัวซ้อนกัน
  // แล้วการเรียกแบบ 2 args จะ "not unique" — คือทุกการเซฟบรีฟจาก build ที่ยัง
  // ไม่ได้ deploy พารามิเตอร์ที่สาม
  check("SQL drop signature 2 args ก่อนสร้างใหม่",
    /drop function if exists public\.graphic_brief_patch\(text, jsonb\)/.test(sql)
    && sql.indexOf("drop function if exists") < sql.indexOf("create or replace function"));
  check("โหมดนี้ไม่แตะใบที่ถูกรับงานแล้ว", /p_only_if_empty then[\s\S]{0,200}acceptedAt[\s\S]{0,80}return cur\.data/.test(sql));
  check("โหมดนี้ไม่ใช้สิทธิ์เติมบรีฟของ requester", /unlocked and not p_only_if_empty/.test(sql));
  // ฝั่ง client ต้องคิดแบบเดียวกัน
  const accepted = { acceptedAt: "2026-07-20T00:00:00Z", acceptedBy: "Boss" };
  const granted = { ...accepted, briefUnlock: { status: "Granted" as const, requestedBy: "Ken S.", requestedAt: "x" } };
  is("client: รับงานแล้ว + ไม่ปล่อย → แก้ไม่ได้ (ตรงกับ SQL)", canEditBriefNow(accepted, { isRequester: true, isCmo: false }), false);
  is("client: ปล่อยแล้ว → แก้ได้ (ตรงกับ SQL)", canEditBriefNow(granted, { isRequester: true, isCmo: false }), true);
}

console.log("\n— Agency ต้องคุยในใบงานตัวเองได้ (RLS ต้องตรงกับ UI) —");
{
  // บั๊กจริง: กล่อง "คุยกันในงานนี้" ขึ้นให้ทุกคนที่เปิดใบงานได้ รวม Agency Portal
  // ที่เปิด GraphicDrawer ตัวเต็ม แต่ RLS ของ graphic_feedback เปิดแค่ admin/staff
  // → เห็นกล่อง กดส่ง แล้ว error · เทสต์นี้เช็คว่าไฟล์ SQL ปิดช่องนั้นแล้ว
  const sql = readFileSync(new URL("../supabase/security_p16_agency_conversation.sql", import.meta.url), "utf8");
  check("มี policy ให้ agency อ่านบทสนทนา", /agency_own_feedback_read[\s\S]*for select/i.test(sql));
  check("มี policy ให้ agency ตอบได้", /agency_own_feedback_write[\s\S]*for insert/i.test(sql));
  // ขอบเขต: เฉพาะใบงานตัวเอง ไม่ใช่ทั้งตาราง
  check("จำกัดเฉพาะใบงานของตัวเอง", (sql.match(/owns_designer_slot/g) ?? []).length >= 2);
  // ปลอมชื่อคนพูดไม่ได้ — บทสนทนาต้องเชื่อชื่อได้
  check("ต้องลงชื่อตัวเอง", /jwt_member_name\(\)|jwt_email\(\)/.test(sql));
  // ห้ามลบ/แก้ประวัติการตีงาน
  check("ไม่เปิด update/delete ให้ agency", !/agency[\s\S]*for (update|delete)/i.test(sql));
  // ของเดิมต้องไม่ถูกแตะ — policy เป็น OR กัน การเพิ่มต้อง additive
  check("ไม่ไปแตะ staff_rw ของเดิม", !/drop policy if exists staff_rw/.test(sql));
  const rollback = readFileSync(new URL("../supabase/security_p16_agency_conversation_rollback.sql", import.meta.url), "utf8");
  check("มี rollback ที่ลบเฉพาะ policy ที่เพิ่ม", /agency_own_feedback_read/.test(rollback) && /agency_own_feedback_write/.test(rollback));
  check("rollback ไม่ลบ staff_rw", !/drop policy if exists staff_rw/.test(rollback));
}

console.log("\n— assets: หนึ่งใบงานหนึ่งแถว (ต้อง upsert ได้จริง) —");
{
  const sql = readFileSync(new URL("../supabase/assets_from_graphic.sql", import.meta.url), "utf8");
  check("มีคอลัมน์ผูกกับใบงาน", /add column if not exists graphic_request_id/.test(sql));
  check("มี unique index สำหรับ upsert", /create unique index[\s\S]{0,120}assets \(graphic_request_id\)/.test(sql));
  // partial index ใช้เป็น ON CONFLICT target ไม่ได้ — เคยพลาดตรงนี้แล้ว insert เงียบ
  check("ต้องไม่เป็น partial index", !/assets_graphic_request_uniq[\s\S]{0,200}where graphic_request_id is not null/.test(sql));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
