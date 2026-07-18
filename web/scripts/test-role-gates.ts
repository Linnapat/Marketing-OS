/* Runtime tests for lib/roleGates — pinned to the Settings → Permissions
 * matrix, the source of truth QA verifies against. The earlier gate hardcoded
 * role names and "Content Creator" slipped through; now every role's Campaign
 * level decides, and these tests read the SAME seed matrix the app ships.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { canCreateCampaign, canSeePlatformPerformance, isCreativeSideRole, seedPermMatrix, campaignPermLevel } from "../src/lib/roleGates";

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

console.log("\n— edges —");
is("role ว่างไม่ถือเป็น creative", isCreativeSideRole(""), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
