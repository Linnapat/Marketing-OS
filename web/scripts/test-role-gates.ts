/* Runtime tests for lib/roleGates — pinned to the Settings → Permissions
 * matrix, the source of truth QA verifies against. The earlier gate hardcoded
 * role names and "Content Creator" slipped through; now every role's Campaign
 * level decides, and these tests read the SAME seed matrix the app ships.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { campaignReleasedForWork } from "../src/lib/data/campaigns";
import { canCreateCampaign, canSeePlatformPerformance, isCreativeSideRole, seedPermMatrix, campaignPermLevel, canApproveDeliverable, canReviewDeliverable, canEditContentPlan, canApproveExpense, canSeeAllSpending, canMarkPaid } from "../src/lib/roleGates";

let pass = 0, fail = 0;
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

console.log("\n— artwork sign-off: ผู้ขอ / Creative Leader / CMO เท่านั้น —");
{
  const approve = (role: string, isRequester = false, isSubmitter = false) =>
    canApproveDeliverable({ role, isRequester, isSubmitter });

  is("Creative Leader อนุมัติได้ (final review ตาม matrix)", approve("Creative Leader"), true);
  is("CMO อนุมัติได้", approve("CMO"), true);
  is("ผู้ขอของงานนั้นอนุมัติได้ แม้ role จะเป็นสายผลิต", approve("Senior Graphic Designer", true), true);

  // ก่อนแก้: ทุก role ที่เปิดแท็บ Assets ได้ กดอนุมัติได้หมด
  for (const role of ["Senior Graphic Designer", "VDO Editor", "Content Creator", "Co-ordinator", "KOL Specialist", "Agency (External)", "Marketing Executive"]) {
    is(`${role} อนุมัติ artwork ไม่ได้`, approve(role), false);
  }
  // Marketing Manager / BGL อยู่ขั้นถัดไปของ chain (อนุมัติทั้ง request) ไม่ใช่ขั้นรีวิวรายชิ้น
  is("Marketing Manager / BGL ไม่ใช่ผู้รีวิวรายชิ้น", approve("Marketing Manager / BGL"), false);

  console.log("\n— ห้ามอนุมัติงานที่ตัวเองส่ง —");
  is("Creative Leader ที่ส่งงานชิ้นนั้นเอง อนุมัติไม่ได้", approve("Creative Leader", false, true), false);
  is("CMO ที่ส่งงานชิ้นนั้นเอง อนุมัติไม่ได้", approve("CMO", false, true), false);
  is("ผู้ขอที่ส่งงานเอง อนุมัติไม่ได้", approve("Creative Leader", true, true), false);
  // แต่ยังส่งกลับแก้ได้ — แถวถูกล็อกตอน Waiting review ถ้าปิดหมดจะไม่มีทางแก้เอง
  is("…แต่ยัง Request Revision ได้", canReviewDeliverable("Creative Leader", true), true);

  console.log("\n— edges —");
  is("role ว่าง + ไม่ใช่ผู้ขอ → อนุมัติไม่ได้ (fail closed)", approve(""), false);
  is("role ที่ matrix ไม่รู้จัก อนุมัติไม่ได้", approve("Junior Motion Graphic"), false);
}

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
