/* Runtime tests for lib/roleGates — pinned to the Settings → Permissions
 * matrix, the source of truth QA verifies against. The earlier gate hardcoded
 * role names and "Content Creator" slipped through; now every role's Campaign
 * level decides, and these tests read the SAME seed matrix the app ships.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { canCreateCampaign, canSeePlatformPerformance, isCreativeSideRole, seedPermMatrix, campaignPermLevel, canApproveDeliverable, canReviewDeliverable, canEditContentPlan } from "../src/lib/roleGates";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
