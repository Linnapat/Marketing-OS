/* Runtime tests for lib/roleGates — pinned to the Settings → Permissions
 * matrix, the source of truth QA verifies against. The earlier gate hardcoded
 * role names and "Content Creator" slipped through; now every role's Campaign
 * level decides, and these tests read the SAME seed matrix the app ships.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { campaignReleasedForWork, campaignAwaitsMe, campaignHoldReason } from "../src/lib/data/campaigns";
import { canEditBriefNow, canReleaseBriefEdit, consumeBriefUnlock, briefUnlockState, releaseBriefForRevision, revisionAssignee, isOwnQueueJob, hasShootOnRecord, shootContradiction, type Graphic } from "../src/lib/data/graphic";
import { canCreateCampaign, canSeePlatformPerformance, isCreativeSideRole, seedPermMatrix, campaignPermLevel, canEditContentPlan, canApproveExpense, canSeeAllSpending, canMarkPaid, canAssignCaption, canApproveCampaign, canDecideCaption, canMakeApprovedPlan, type PermMatrix, roleHolders, RUSH_DECIDER_ROLES, leadFirst, creativeTeamLeadEmail, canEditCampaignBrief, worksOwnQueueOnly} from "../src/lib/roleGates";

import { captionReviewer } from "../src/lib/data/content";
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

console.log("\n— บอกให้ตรงว่ารอใคร ไม่ใช่ 'รอ CMO' ทุกกรณี —");
// TPN_2608_005 ค้าง 8 วันโดยการ์ดบอกว่า "CMO ยังไม่อนุมัติ" ทั้งที่ CMO ตีกลับ
// ไปแล้ว คนที่ต้องขยับคือผู้วางแผน — ดีไซเนอร์จึงไปรอคนที่ไม่ได้ค้างอะไร
const people = { planner: "Pupay", approver: "Gik" };
is("ส่งกลับแก้ → รอผู้วางแผน ไม่ใช่ CMO", campaignHoldReason("Need Revision", people)?.who, "Pupay");
is("…และบอกว่าต้องกดอะไรต่อ", campaignHoldReason("Need Revision", people)?.next, "แก้ตามคอมเมนต์แล้วกด Submit for Approval อีกครั้ง");
is("ส่งไปแล้ว รออนุมัติ → รอผู้อนุมัติ", campaignHoldReason("Waiting for Approval", people)?.who, "Gik");
is("ชื่อสถานะเก่าก็ตอบเหมือนกัน", campaignHoldReason("Waiting Approval", people)?.who, "Gik");
is("ยังไม่ส่ง (Draft) → รอผู้วางแผนกดส่ง", campaignHoldReason("Draft", people)?.next, "กด Submit for Approval");
is("Planning ก็คือยังไม่ส่ง", campaignHoldReason("Planning", people)?.headline, "แคมเปญยังไม่ได้ส่งอนุมัติ");
is("Ready for Review ก็คือยังไม่ส่ง", campaignHoldReason("Ready for Review", people)?.headline, "แคมเปญยังไม่ได้ส่งอนุมัติ");
is("ยกเลิกแล้ว → ไม่มีใครให้รอ", campaignHoldReason("Cancelled", people)?.who, null);
is("แคมเปญปล่อยแล้ว → ไม่มีอะไรกั้น", campaignHoldReason("Approved", people), null);
// ห้ามเดาชื่อ — ตรงกับกติกาเดียวกับ lensAskWho
is("ไม่มีชื่อผู้วางแผน → บอกว่าไม่มี ไม่เดา", campaignHoldReason("Need Revision", {})?.who, null);
is("Unassigned ไม่ใช่ชื่อคน", campaignHoldReason("Need Revision", { planner: "Unassigned" })?.who, null);
is("หาแคมเปญไม่เจอ → ไม่ใช่เรื่องรออนุมัติ", campaignHoldReason("", people)?.headline, "หาแคมเปญของใบงานนี้ไม่เจอ");
// ทุกสถานะที่ถูกกั้นต้องมีคำอธิบาย ไม่มีตัวไหนเงียบ
check("ทุกสถานะที่รับงานไม่ได้ ต้องบอกเหตุผลได้",
  ["Draft", "Planning", "Ready for Review", "Waiting for Approval", "Waiting Approval", "Need Revision", "Cancelled"]
    .every((st) => !!campaignHoldReason(st, people)));
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

console.log("\n— ใครอนุมัติ caption ได้ —");
{
  const other = { me: "Ken S.", writer: "May T." };
  // ฝั่งวางแผนเป็นคนตรวจ ("marketing revise or approve caption")
  for (const r of ["CMO", "Marketing Manager / BGL", "Marketing Executive", "Co-ordinator"]) {
    is(`${r} อนุมัติ caption ได้`, canDecideCaption(r, other), true);
  }
  // ฝั่งผลิตเป็นคนเขียน ไม่ใช่คนตรวจ
  for (const r of ["Creative Leader", "Content Creator", "Senior Graphic Designer", "VDO Editor", "Agency (External)"]) {
    is(`${r} อนุมัติ caption ไม่ได้`, canDecideCaption(r, other), false);
  }
  // เขียนเองอนุมัติเองไม่ได้ แม้จะอยู่ฝั่งวางแผน — เช็คที่ผ่านได้ด้วยการเขียนเองไม่ใช่เช็ค
  is("คนเขียนอนุมัติงานตัวเองไม่ได้", canDecideCaption("CMO", { me: "May T.", writer: "May T." }), false);
  is("ตัวพิมพ์/เว้นวรรคยังจับได้", canDecideCaption("CMO", { me: " may t. ", writer: "May T." }), false);
  // ยังไม่มอบหมายคนเขียน = ไม่มีใครให้กันท่า
  is("ยังไม่มีคนเขียน → อนุมัติได้", canDecideCaption("CMO", { me: "Ken S.", writer: "Unassigned" }), true);
  is("คนเขียนว่าง → อนุมัติได้", canDecideCaption("CMO", { me: "Ken S.", writer: "" }), true);
  is("role ว่างอนุมัติไม่ได้", canDecideCaption("", other), false);

  // 5 ส.ค. 69: caption proposal เด้งเข้า CMO ซึ่งไม่ต้องการ — ต้องเข้า requester
  // / คนสร้างแคมเปญ พอส่งไปหาคนนั้นแล้ว ปุ่มก็ต้องเปิดให้เขาด้วย ไม่งั้นย้ายทางตัน
  {
    const owed = (me: string, reviewer: string | null) => ({ me, writer: "May T.", reviewer });
    is("คนที่ถูกระบุให้ตรวจ กดได้แม้ไม่ใช่ฝั่งวางแผน",
      canDecideCaption("Creative Leader", owed("Pichayaporn", "Pichayaporn")), true);
    is("ฝั่งผลิตที่ไม่ได้ถูกระบุ ยังกดไม่ได้",
      canDecideCaption("Creative Leader", owed("Pichayaporn", "Pupay")), false);
    is("CMO ยังมีสิทธิ์ override เหมือนทุกที่ในแอป",
      canDecideCaption("CMO", owed("Gik", "Pupay")), true);
    is("ไม่มีคนถูกระบุ → กลับไปใช้กติกาฝั่งวางแผนเหมือนเดิม",
      canDecideCaption("Marketing Executive", owed("Ken S.", null)), true);
    // แคปชั่นเขียนโดย Creative และรับโดย Marketer ที่ขอเปิดโพสต์ — คนละคนโดยตั้งใจ
    // กติกาห้ามเซ็นงานตัวเองจึงยังอยู่ แม้จะถูกระบุชื่อให้ตรวจก็ตาม
    is("ถูกระบุให้ตรวจ แต่เป็นคนเขียนเอง กดไม่ได้",
      canDecideCaption("Creative Leader", { me: "May T.", writer: "May T.", reviewer: "May T." }), false);
    is("คนเขียนกดงานตัวเองไม่ได้ แม้อยู่ฝั่งวางแผน",
      canDecideCaption("Marketing Executive", { me: "May T.", writer: "May T.", reviewer: null }), false);
  }
}

console.log("\n— caption รออนุมัติของใคร —");
{
  // requester มาก่อน approver: คนอนุมัติแคปชั่นคือ Marketer ที่ขอเปิดโพสต์
  // ช่อง approver เป็นของการเซ็นอาร์ตเวิร์ก — มี 3 โพสต์จริงที่ช่องนั้นเป็นคนใน
  // Creative ทั้งที่คนขอเปิดงานคือฝ่ายการตลาด · "Unassigned" คือช่องว่าง ไม่ใช่ชื่อคน
  // ไม่รู้ว่าแบรนด์นี้ใครดูแล → ใช้คนที่ขอเปิดงาน ดีกว่าไม่มีชื่อเลย
  is("มี requester → เป็นของ requester", captionReviewer({ approver: "Orapan", requester: "Pupay" }), "Pupay");
  is("ไม่มี requester → ตกไปที่ approver", captionReviewer({ approver: "Orapan", requester: "" }), "Orapan");
  is("requester = Unassigned → ตกไปที่ approver", captionReviewer({ approver: "Orapan", requester: "Unassigned" }), "Orapan");
  is("ไม่มีทั้งคู่ → null (คิวกลับไปเป็นของฝั่งวางแผน)", captionReviewer({}), null);
  is("Unassigned ทั้งคู่ → null", captionReviewer({ approver: "Unassigned", requester: "Unassigned" }), null);

  // รู้ว่าใครดูแลแบรนด์ → แคปชั่นเข้า Marketer ของแบรนด์นั้น
  // teppen/mainichi = Pupay · omakase = narawich (จาก resolveBrandLead)
  is("คนขอเปิดงานเป็น Marketer ของแบรนด์ → เป็นของเขา",
    captionReviewer({ requester: "Pupay", approver: "Pupay" }, "Pupay"), "Pupay");
  is("Creative เป็นคนขอเปิดงาน → ตกไปที่ Marketer ของแบรนด์",
    captionReviewer({ requester: "Pichayaporn", approver: "Pichayaporn" }, "Pupay"), "Pupay");
  // CMO เปิดโพสต์เอง = ของ CMO · ส่งต่อให้ Marketer ของแบรนด์คือการโยนคำขอของ
  // เขาออกไปจากมือเขาเอง
  is("CMO เปิดงานเอง → อยู่ที่ CMO",
    captionReviewer({ requester: "Gik", approver: "Gik" }, "narawich", "Gik"), "Gik");
  is("…แม้ช่อง approver จะเป็นคนอื่น",
    captionReviewer({ requester: "Gik", approver: "Orapan" }, "narawich", "Gik"), "Gik");
  is("แต่ถ้า CMO ไม่ได้เปิดเอง ยังเข้า Marketer ของแบรนด์",
    captionReviewer({ requester: "Pichayaporn", approver: "Pichayaporn" }, "narawich", "Gik"), "narawich");
  is("ไม่มีใครขอเปิดงาน → Marketer ของแบรนด์รับไป",
    captionReviewer({}, "narawich"), "narawich");
  is("แบรนด์ไม่มีคนดูแล → กลับไปใช้คนขอเปิดงาน",
    captionReviewer({ requester: "Pichayaporn" }, null), "Pichayaporn");
  is("แบรนด์ไม่มีคนดูแล และไม่มีคนขอ → null",
    captionReviewer({}, "Unassigned"), null);
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

console.log("\n— กู้คืน fan-out ที่ล้ม: ใครกดปุ่ม “สร้างงานจากแผนนี้” ได้ —");
{
  // เปิดกว้างขึ้นตั้งใจ (Gik 5 ส.ค. 69): ปุ่มนี้ไม่ได้ตัดสินใจอะไรใหม่ CMO อนุมัติ
  // รายการพวกนี้ไปแล้ว มันแค่สร้างสิ่งที่แผนบอกไว้ ถ้ากั้นไว้ที่ฝั่งวางแผน งานจะค้าง
  // จนกว่า planner จะบังเอิญเปิดแท็บ — Creative Leader เจ้าของแผนเห็น warning แต่ไม่เห็นปุ่ม
  //
  // แต่กว้างได้แค่เท่าที่ RLS ยอม: write แรกของ fan-out คือ upsert แถว campaigns ซึ่ง
  // policy staff_insert ขอ has_module('Campaign','Edit') ปุ่มที่ DB จะปฏิเสธคือทางตัน
  // แบบเดียวกับที่ audit 1 ส.ค. เจอ เกตนี้เลยอ่าน matrix ตัวเดียวกับที่ has_module อ่าน
  const live: PermMatrix = {
    "CMO": { Campaign: "Approve" },
    "Marketing Manager / BGL": { Campaign: "Edit" },
    "Creative Leader": { Campaign: "Edit" },       // ตาราง permissions จริงบน prod
    "Senior Graphic Designer": { Campaign: "View" },
    "VDO Editor": { Campaign: "View" },
    "Content Creator": { Campaign: "View" },
    "Agency (External)": { Campaign: "—" },
  };
  for (const role of ["CMO", "Marketing Manager / BGL", "Creative Leader"]) {
    is(`${role} (Campaign ≥ Edit) กดได้`, canMakeApprovedPlan(role, live), true);
  }
  for (const role of ["Senior Graphic Designer", "VDO Editor", "Content Creator"]) {
    is(`${role} (Campaign = View) ไม่เห็นปุ่ม — DB ก็จะปฏิเสธอยู่ดี`, canMakeApprovedPlan(role, live), false);
  }
  is("Agency (External) กดไม่ได้", canMakeApprovedPlan("Agency (External)", live), false);
  is("role ว่าง (demo / member ยังโหลดไม่เสร็จ) ไม่ถูกบล็อก", canMakeApprovedPlan("", live), true);
  // กว้างกว่า canEditContentPlan จริง ๆ ไม่ใช่ alias ของกันและกัน — นี่คือหัวใจของการแก้
  check("Creative Leader กดกู้คืนได้ ทั้งที่แก้ Content Plan ไม่ได้",
    canMakeApprovedPlan("Creative Leader", live) && !canEditContentPlan("Creative Leader"));
  // ตรงกับเกตสร้างแคมเปญเป๊ะ ๆ เพราะ RLS ใช้เงื่อนไขเดียวกัน
  for (const role of Object.keys(live)) {
    is(`${role}: ตรงกับ canCreateCampaign (RLS เงื่อนไขเดียวกัน)`,
      canMakeApprovedPlan(role, live), canCreateCampaign(role, live));
  }
}

console.log("\n— แก้แคมเปญ: เจ้าของแก้ของตัวเองได้ —");
const edit = (role: string, isOwner: boolean) => canEditCampaignBrief(role, { isOwner });
is("CMO แก้ได้ทุกใบ", [edit("CMO", false), edit("CMO", true)].join(","), "true,true");
is("Marketing Manager แก้ได้ทุกใบ", edit("Marketing Manager / BGL", false), true);
// 3 ใน 30 แคมเปญเป็นของ Creative Leader / Co-ordinator ซึ่งเปิด builder ไม่ได้เลย
is("Creative Leader แก้ของตัวเองได้", edit("Creative Leader", true), true);
is("Co-ordinator แก้ของตัวเองได้", edit("Co-ordinator", true), true);
// แต่ไม่ใช่ของคนอื่น — เปิดสิทธิ์ให้เจ้าของ ไม่ได้เปิดให้ทุกคน
is("Creative Leader แก้ของคนอื่นไม่ได้", edit("Creative Leader", false), false);
is("VDO Editor แก้ของคนอื่นไม่ได้", edit("VDO Editor", false), false);
is("Agency แก้ของคนอื่นไม่ได้", edit("Agency (External)", false), false);
// "แก้ได้" ไม่เท่ากับ "อนุมัติได้": การเปลี่ยนสถานะยังกั้นที่หน้า Campaigns
// ด้วย role === "CMO" ตรง ๆ และการแก้ใบที่อนุมัติแล้วจะถอนอนุมัติกลับไปหา CMO
is("เจ้าของที่ไม่มีสิทธิ์สร้าง ก็ยังแก้ของตัวเองได้", edit("KOL Specialist", true), true);

console.log("\n— roleHolders: กฎ → ตัวคน —");
{
  const team = [
    { name: "Pichayaporn", role: "Creative Leader", status: "Active" },
    { name: "Gik", role: "CMO", status: "Active" },
    { name: "Four", role: "VDO Editor", status: "Active" },
    { name: "GID", role: "Creative Leader", status: "Invited" },
  ];
  // เรียงตามลำดับที่ส่งเข้าไป — ชื่อแรกคือคนที่จะถูกใส่ในงาน
  is("Creative Leader มาก่อน CMO", roleHolders(team, [...RUSH_DECIDER_ROLES]).join(","), "Pichayaporn,Gik");
  is("สลับลำดับ = สลับคนแรก", roleHolders(team, ["CMO", "Creative Leader"]).join(","), "Gik,Pichayaporn");
  // คนที่ยังไม่เคยเข้าระบบไม่มีใครอ่านกล่องให้ ส่งไปก็เท่ากับไม่ได้ส่ง
  is("Invited ไม่นับ", roleHolders(team, ["Creative Leader"]).join(","), "Pichayaporn");
  is("ไม่มีใครถือ role นั้น", roleHolders(team, ["Marketing Manager / BGL"]).length, 0);
  is("ทีมว่าง", roleHolders([], [...RUSH_DECIDER_ROLES]).length, 0);
  is("ชื่อไม่ซ้ำแม้ถือหลาย role", roleHolders([{ name: "Gik", role: "CMO", status: "Active" }], ["CMO", "CMO"]).join(","), "Gik");

  // ทีมจริงมีคนถือ "Creative Leader" สองคน และ fetchMembers เรียงตาม email
  // → Marketing-crm@ มาก่อน Pichayaporn.l@ ทุกครั้ง งานเลยวิ่งไปหาบัญชี QA
  const real = [
    { name: "QA Test Marketing", email: "Marketing-crm@teppenthailand.co.th", role: "Creative Leader", status: "Active" },
    { name: "Pichayaporn", email: "Pichayaporn.l@teppenthailand.co.th", role: "Creative Leader", status: "Active" },
    { name: "Gik", email: "Linnapat.d@teppenthailand.co.th", role: "CMO", status: "Active" },
  ];
  const byEmail = roleHolders(real, [...RUSH_DECIDER_ROLES]);
  is("ลำดับดิบหยิบบัญชี QA มาก่อน (นี่คือบั๊ก)", byEmail[0], "QA Test Marketing");
  const teams = [{ name: "Creative Team", lead: "Pichayaporn.l@teppenthailand.co.th" }];
  is("หัวหน้าทีมที่ตั้งไว้ต้องมาก่อน", leadFirst(byEmail, real, creativeTeamLeadEmail(teams))[0], "Pichayaporn");
  is("คนอื่นยังอยู่ครบ ไม่ได้ถูกตัดทิ้ง", leadFirst(byEmail, real, creativeTeamLeadEmail(teams)).length, 3);
  is("อ่าน lead ของทีม Creative ได้", creativeTeamLeadEmail(teams), "Pichayaporn.l@teppenthailand.co.th");
  is("ไม่มี teams config = ลำดับเดิม", leadFirst(byEmail, real, "").join(","), byEmail.join(","));
  is("ไม่มีทีม Creative ในคอนฟิก", creativeTeamLeadEmail([{ name: "CRM Team", lead: "x@y.z" }]), "");
  // หัวหน้าที่ไม่ได้ถือ role นั้น ต้องไม่ถูกดันเข้ามาทางลัด
  is("lead ที่ไม่มีสิทธิ์ ไม่ถูกยัดเข้ามา",
    leadFirst(byEmail, [...real, { name: "Four", email: "kittinan.k@teppenthailand.co.th", role: "VDO Editor", status: "Active" }], "kittinan.k@teppenthailand.co.th").join(","),
    byEmail.join(","));
}

console.log("\n— คิวงานของตัวเอง: คนถ่ายต้องเห็นใบงานที่ตัวเองถูกสั่งให้ถ่าย —");
{
  // เคสจริง: Jeeno (VDO Editor) ถูกตั้งเป็นคนถ่ายในใบที่ Pichayaporn รับไปแล้ว
  // ใบนั้นจึงไม่ใช่ "งานของเขา" และไม่ใช่ "งานว่าง" → หายไปจากบอร์ดทั้งใบ
  // ทำให้ส่ง footage ที่ทั้งคิวตัดต่อรออยู่ไม่ได้เลย
  const job = (over: Partial<Graphic>) =>
    ({ designer: "Pichayaporn", storyboardOwner: "", shooter: "", acceptedBy: "", ...over }) as Graphic;

  is("VDO Editor ยังทำงานเฉพาะคิวตัวเอง", worksOwnQueueOnly("VDO Editor"), true);
  is("คนถ่ายเห็นใบที่ตัวเองต้องถ่าย", isOwnQueueJob(job({ shooter: "Jeeno" }), "Jeeno"), true);
  is("designer เห็นใบตัวเอง", isOwnQueueJob(job({}), "Pichayaporn"), true);
  is("คนทำ storyboard เห็นใบตัวเอง", isOwnQueueJob(job({ storyboardOwner: "Jeeno" }), "Jeeno"), true);
  is("คนที่กดรับงานเห็นใบตัวเอง แม้ designer เป็นคนอื่น", isOwnQueueJob(job({ acceptedBy: "Jeeno" }), "Jeeno"), true);
  is("คนนอกใบงานยังไม่เห็น", isOwnQueueJob(job({ shooter: "Pupay" }), "Jeeno"), false);

  // งานที่ยังไม่มีใครถือต้องเห็นได้ ไม่งั้นกดรับงานไม่ได้เลย
  is("งานว่างยังเห็นได้", isOwnQueueJob(job({ designer: "Unassigned" }), "Jeeno"), true);
  is("งานว่าง (ค่าว่าง) ยังเห็นได้", isOwnQueueJob(job({ designer: "" }), "Jeeno"), true);

  // fail closed: ไม่รู้ว่าเป็นใคร = ไม่เห็นอะไรเลย ไม่ใช่เห็นทั้งบอร์ด
  is("ไม่รู้ชื่อผู้ใช้ = ไม่เห็นใบที่มีคนถือ", isOwnQueueJob(job({ shooter: "Jeeno" }), ""), false);
  is("ไม่รู้ชื่อผู้ใช้ = ไม่เห็นแม้แต่งานว่าง", isOwnQueueJob(job({ designer: "Unassigned" }), "  "), false);

  // ชื่อเขียนไม่ตรงเป๊ะ (อีเมล vs ชื่อ) ต้องเป็นคนเดียวกัน — ใช้ sameName เหมือนที่อื่น
  is("อีเมลกับชื่อคือคนเดียวกัน", isOwnQueueJob(job({ shooter: "jeeno@teppenthailand.co.th" }), "jeeno"), true);
  is("ตัวพิมพ์เล็กใหญ่ไม่เกี่ยว", isOwnQueueJob(job({ shooter: "JEENO" }), "jeeno"), true);
}

console.log("\n— งานถ่ายที่บันทึกไว้แล้ว ต้องไม่หายไปเพราะสวิตช์ —");
{
  // 6 ใบบน production ตั้ง "ไม่ต้องถ่าย" ทั้งที่มีคนถ่าย/วันถ่ายค้างอยู่ —
  // เดิม drawer ซ่อนทั้งบล็อก รวมช่องส่ง footage ด้วย = ไม่มีใครส่งได้เลย
  const sh = (over: Partial<Graphic>) => over as Graphic;

  is("ต้องถ่าย = แสดง", hasShootOnRecord(sh({ requiresShooting: true })), true);
  is("ไม่ต้องถ่าย แต่มีคนถ่าย = ยังแสดง", hasShootOnRecord(sh({ requiresShooting: false, shooter: "Jeeno" })), true);
  is("ไม่ต้องถ่าย แต่มีวันถ่าย = ยังแสดง", hasShootOnRecord(sh({ requiresShooting: false, shootDate: "2026-08-10" })), true);
  is("ไม่ต้องถ่าย แต่ส่ง footage แล้ว = ยังแสดง", hasShootOnRecord(sh({ requiresShooting: false, footageLink: "http://x" })), true);
  is("ไม่ต้องถ่ายและไม่มีอะไรเลย = ไม่แสดง", hasShootOnRecord(sh({ requiresShooting: false })), false);
  is("ยังไม่ตัดสินใจและไม่มีอะไรเลย = ไม่แสดง", hasShootOnRecord(sh({})), false);

  // เตือนเมื่อสวิตช์กับข้อมูลขัดกัน — ไม่ใช่แค่แอบแสดงเฉย ๆ
  check("ขัดกัน = ขึ้นเตือน พร้อมชื่อคนถ่าย",
    (shootContradiction(sh({ requiresShooting: false, shooter: "Jeeno", shootDate: "2026-08-10" })) ?? "").includes("Jeeno"));
  is("ต้องถ่ายอยู่แล้ว = ไม่เตือน", shootContradiction(sh({ requiresShooting: true, shooter: "Jeeno" })), null);
  is("ยังไม่ตัดสินใจ = ไม่เตือน", shootContradiction(sh({ shooter: "Jeeno" })), null);
  is("ไม่ต้องถ่ายและไม่มีอะไรค้าง = ไม่เตือน", shootContradiction(sh({ requiresShooting: false })), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);