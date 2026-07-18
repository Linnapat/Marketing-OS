/* Runtime tests for lib/roleGates — pinned against the ACTUAL role strings in
 * the members table, because the previous gate classified roles through a
 * regex written for another purpose and "Content Creator" slipped through a
 * block meant for every content-production role.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import { canCreateCampaign, canSeePlatformPerformance, isCreativeSideRole } from "../src/lib/roleGates";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("\n— campaign creation: planning roles only —");
for (const role of ["CMO", "Marketing Manager / BGL", "Marketing Executive", "Co-ordinator", "KOL Specialist"]) {
  is(`${role} สร้างแคมเปญได้`, canCreateCampaign(role), true);
}
for (const role of ["Content Creator", "Creative Leader", "VDO Editor", "Senior Graphic Designer", "Agency (External)"]) {
  is(`${role} สร้างแคมเปญไม่ได้`, canCreateCampaign(role), false);
}

console.log("\n— platform performance: money stays with planning/management —");
for (const role of ["CMO", "Marketing Manager / BGL", "Marketing Executive", "Co-ordinator"]) {
  is(`${role} เห็น Platform Performance`, canSeePlatformPerformance(role), true);
}
for (const role of ["KOL Specialist", "VDO Editor", "Content Creator", "Creative Leader", "Agency (External)"]) {
  is(`${role} ไม่เห็น Platform Performance`, canSeePlatformPerformance(role), false);
}

console.log("\n— edges —");
is("role ว่างไม่ถือเป็น creative", isCreativeSideRole(""), false);
is("role ว่างสร้างแคมเปญได้ (demo/CMO fallback)", canCreateCampaign(""), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
