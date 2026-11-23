/* Audit 22 Nov 2026, round 2 — queues and stale data.
 * Run: node --import tsx scripts/test-audit-round2.ts */
import { isPostOverdue, isReadyToPost, planWaitingCounts, type ContentItem } from "../src/lib/data/content";
import { hasNoDue, graphicFilterDate, dueNotBeforePost } from "../src/lib/data/graphic";
import { isTestAccount } from "../src/lib/data/testAccounts";

let pass = 0, fail = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const post = (o: Partial<ContentItem>) => ({
  id: "p", day: 1, dateIso: "2026-11-10", time: "10:00", title: "T", b: "teppen", plat: "Facebook", status: "Draft",
  campaign: "C", owner: "A", caption: "", hashtags: "", cta: "",
  captionStatus: "Draft", assetStatus: "Waiting Design", approvalStatus: "Draft", publishStatus: "Draft", ...o,
} as ContentItem);
const TODAY = "2026-11-22";

console.log("\n— 2.2 การ์ดสรุปนับเฉพาะโพสต์ที่ยังไม่ปิด —");
{
  const lunch = [1, 2, 3].map((i) => post({ id: `l${i}`, approvalStatus: "Waiting Approval", publishStatus: "Published", status: "Published" }));
  is("Published ทั้ง 3 = ไม่มีอะไร waiting approval", planWaitingCounts(lunch).waitingApproval, 0);
  is("…และไม่นับ waiting asset", planWaitingCounts(lunch).waitingAsset, 0);
  const mixed = [...lunch, post({ id: "o1", approvalStatus: "Waiting Approval" }), post({ id: "o2", assetStatus: "Missing" }), post({ id: "x", approvalStatus: "Waiting Approval", publishStatus: "Cancelled" })];
  is("โพสต์ที่ยังไม่ลงยังถูกนับ", [planWaitingCounts(mixed).waitingApproval, planWaitingCounts(mixed).waitingAsset], [1, 2]);
  is("Cancelled ไม่นับ", planWaitingCounts(mixed).open, 2);
}

console.log("\n— 2.3 เลยวันโพสต์ / พร้อมลง —");
{
  is("วันผ่านแล้ว ยังไม่ Published = เลยวันโพสต์", isPostOverdue(post({}), TODAY), true);
  is("วันนี้ยังไม่ถือว่าเลย", isPostOverdue(post({ dateIso: TODAY }), TODAY), false);
  is("Published แล้วไม่เลย", isPostOverdue(post({ publishStatus: "Published" }), TODAY), false);
  is("Cancelled ไม่เลย", isPostOverdue(post({ publishStatus: "Cancelled" }), TODAY), false);
  // Changed in UX/UI round 4: a held post is waiting on purpose, not late.
  is("Hold ไม่นับว่าเลยวัน", isPostOverdue(post({ publishStatus: "Hold" }), TODAY), false);
  is("Caption + Asset Approved, Publish Draft = พร้อมลง", isReadyToPost(post({ captionStatus: "Approved", assetStatus: "Approved" })), true);
  is("Asset Final ก็นับ", isReadyToPost(post({ captionStatus: "Approved", assetStatus: "Final" })), true);
  is("Caption ยังไม่ Approved = ยังไม่พร้อม", isReadyToPost(post({ captionStatus: "Ready", assetStatus: "Approved" })), false);
  is("เข้าคิวแล้วไม่ต้องขึ้นป้าย", isReadyToPost(post({ captionStatus: "Approved", assetStatus: "Approved", publishStatus: "Queued" })), false);
  is("Hold ไม่ขึ้นพร้อมลง", isReadyToPost(post({ captionStatus: "Approved", assetStatus: "Approved", publishStatus: "Hold" })), false);
}

console.log("\n— 2.4 Graphic Request —");
{
  is("Due TBD = ยังไม่กำหนด Due", hasNoDue({ due: "TBD", dueIso: undefined }), true);
  is("มี dueIso = กำหนดแล้ว", hasNoDue({ due: "TBD", dueIso: "2026-12-25" }), false);
  is("ป้าย 'Dec 25' ก็ถือว่ากำหนดแล้ว", hasNoDue({ due: "Dec 25" }), false);
  is("TBD ถูกวางตามวันโพสต์", graphicFilterDate({ due: "TBD" }, "2026-08-14"), "2026-08-14");
  is("มี Due ใช้ Due ไม่ใช่วันโพสต์", graphicFilterDate({ due: "Dec 25", dueIso: "2026-12-25" }, "2027-01-05"), "2026-12-25");
  is("ไม่มีทั้ง Due และวันโพสต์ = ไม่มีวันให้กรอง", graphicFilterDate({ due: "TBD" }, ""), "");
  is("Due = วันโพสต์ → เตือน", dueNotBeforePost({ dueIso: "2027-01-08" }, "2027-01-08"), true);
  is("Due หลังวันโพสต์ → เตือน", dueNotBeforePost({ dueIso: "2027-01-09" }, "2027-01-08"), true);
  is("Due ก่อนวันโพสต์ → ไม่เตือน", dueNotBeforePost({ dueIso: "2026-12-25" }, "2027-01-08"), false);
  is("ไม่มีวันโพสต์ → ไม่เตือน", dueNotBeforePost({ dueIso: "2026-12-25" }, ""), false);
  is("QA Test Marketing เป็นบัญชีทดสอบ", isTestAccount({ name: "QA Test Marketing" }), true);
  is("คนจริงไม่ใช่บัญชีทดสอบ", [isTestAccount({ name: "Jungjing" }), isTestAccount({ name: "Four" }), isTestAccount({ name: "Qatar Team" })], [false, false, false]);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
