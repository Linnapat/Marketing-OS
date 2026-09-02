/* Runtime tests for campaignRevisionOwner — who a campaign sent back lands on.
 *
 * The bug: the campaign page had two "not approving this" buttons and only one
 * of them told anybody. CAM-2026-7206 (Run For Don) was sent back on 2 ก.ย.
 * 15:45 with the silent one; narawich, the planner, was never told, and the
 * approver re-submitted it himself seven seconds later. Both buttons now run
 * sendCampaignBackForRevision, and this pins the "who" half of it — the half
 * that decides whether the message reaches a person or nobody.
 * Run with:  npm test */

import { campaignRevisionOwner } from "../src/lib/campaignRevision";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log("\n— ส่งกลับแล้วไปถึงใคร —");
// Run For Don: planner narawich, approver Gik — ต้องไป narawich ไม่ใช่คนกดส่งกลับ
is("ผู้วางแผนของบรีฟมาก่อน", campaignRevisionOwner({ plannerOwner: "narawich" }, "someone else"), "narawich");
is("ไม่มีผู้วางแผน → ตกที่เจ้าของแคมเปญ", campaignRevisionOwner({ plannerOwner: undefined }, "Pupay"), "Pupay");
is("ผู้วางแผนว่าง ๆ ก็ตกที่เจ้าของ", campaignRevisionOwner({ plannerOwner: "   " }, "Pupay"), "Pupay");

console.log("\n— ห้ามส่งให้ค่าที่ไม่ใช่ชื่อคน —");
// "Unassigned" เป็น placeholder — ตั้ง assignee เป็นค่านี้คืองานที่ไม่มีใครได้รับ
is("Unassigned ไม่ใช่ชื่อคน → ตกที่เจ้าของ", campaignRevisionOwner({ plannerOwner: "Unassigned" }, "Pupay"), "Pupay");
is("ทั้งคู่เป็น Unassigned → null", campaignRevisionOwner({ plannerOwner: "Unassigned" }, "Unassigned"), null);
is("ไม่มีใครเลย → null ไม่เดาชื่อ", campaignRevisionOwner({ plannerOwner: undefined }, undefined), null);
is("เจ้าของเป็นค่าว่าง → null", campaignRevisionOwner({ plannerOwner: "" }, ""), null);

console.log(`\n${fail ? "✗" : "✓"} campaign send-back: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
