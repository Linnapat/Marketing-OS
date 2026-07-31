/* Runtime tests for the two-check artwork review in lib/data/graphic.
 *
 * The rule that matters most here is not "who may click" but "a piece is
 * Approved only when BOTH checks are in, by two different people" — the
 * Artwork Count report bills an outsourced studio from the approved event, so
 * a piece counted after half a review is a piece invoiced for work nobody
 * verified.
 * Run with:  npm test
 * Same self-contained assert harness as the other suites — no runner needed. */

import {
  canGiveLensVerdict, canPassLens, reviewProgress, statusFromReview, artworkGroup,
  applyLensVerdict, rejectionsByLens, emptyDeliverable,
  type Graphic, type GraphicDeliverable,
} from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const submitted = (over: Partial<GraphicDeliverable> = {}): GraphicDeliverable => ({
  ...emptyDeliverable("Instagram", "1:1 (1080×1080)"),
  assetLink: "https://drive.example/a.png",
  status: "Waiting review",
  version: 1,
  submittedBy: "Boss",
  submittedAt: "2026-07-30T02:00:00Z",
  ...over,
});

const req = (dels: GraphicDeliverable[]): Graphic => ({
  id: 1, stage: "Waiting Feedback", title: "Wagyu KV", b: "teppen", campaign: "Wagyu Festival",
  due: "Jul 30", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "Social Media",
  priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—",
  blocker: null, waitingSince: null, nextAction: "—", platform: "IG", size: "1:1 (1080×1080)",
  contentItem: "—", deliverables: dels,
});

console.log("\n— ใครให้ผลตรวจด้านไหนได้ —");
const fresh = { role: "", isRequester: false, me: "", deliverable: submitted() };
// ข้อมูล = คนเขียนบรีฟรู้ดีที่สุด + สายที่ดูแลแคมเปญ
is("ผู้ขอเปิดงานตรวจด้านข้อมูลได้", canGiveLensVerdict("info", { ...fresh, isRequester: true, me: "Ken S." }), true);
is("Marketing Manager / BGL ตรวจด้านข้อมูลได้", canGiveLensVerdict("info", { ...fresh, role: "Marketing Manager / BGL", me: "Mei T." }), true);
is("Creative Leader ตรวจด้านข้อมูลไม่ได้", canGiveLensVerdict("info", { ...fresh, role: "Creative Leader", me: "Boss L." }), false);
// CI = Creative Leader เจ้าของเรื่อง, CMO เป็นตัวสำรอง
is("Creative Leader ตรวจ CI ได้", canGiveLensVerdict("ci", { ...fresh, role: "Creative Leader", me: "Boss L." }), true);
is("CMO ตรวจ CI ได้ (สำรอง)", canGiveLensVerdict("ci", { ...fresh, role: "CMO", me: "Aran P." }), true);
is("ผู้ขอเปิดงานตรวจ CI ไม่ได้", canGiveLensVerdict("ci", { ...fresh, isRequester: true, me: "Ken S." }), false);
is("ดีไซเนอร์ตรวจอะไรไม่ได้", canGiveLensVerdict("ci", { ...fresh, role: "Senior Graphic Designer", me: "Boss" }), false);

console.log("\n— สองลายเซ็นต้องเป็นคนละคน —");
// CMO คลุมได้ทั้งสองเลน ถ้าไม่กันตรงนี้ CMO คนเดียวเซ็นครบทั้งใบได้ การแยกตรวจก็เหลือแค่ในกระดาษ
const ciDoneByCmo = submitted({ review: { ci: { verdict: "pass", by: "Aran P.", at: "2026-07-30T03:00:00Z" } } });
is("CMO เซ็น CI แล้ว จะมาเซ็นด้านข้อมูลเองไม่ได้", canGiveLensVerdict("info", { role: "CMO", isRequester: false, me: "Aran P.", deliverable: ciDoneByCmo }), false);
is("แต่คนอื่นเซ็นด้านข้อมูลต่อได้", canGiveLensVerdict("info", { role: "Marketing Manager / BGL", isRequester: false, me: "Mei T.", deliverable: ciDoneByCmo }), true);
is("เทียบชื่อไม่สนตัวพิมพ์/เว้นวรรค", canGiveLensVerdict("info", { role: "CMO", isRequester: false, me: "  aran p. ", deliverable: ciDoneByCmo }), false);

console.log("\n— ห้ามเซ็นผ่านงานที่ตัวเองส่ง (แต่ตีกลับงานตัวเองได้) —");
const mine = { role: "Creative Leader", isRequester: false, me: "Boss", deliverable: submitted({ submittedBy: "Boss" }) };
is("Creative Leader ที่เป็นคนส่งเอง กดผ่านไม่ได้", canPassLens("ci", mine), false);
is("แต่ตีกลับงานตัวเองได้ (ไม่งั้นแถวล็อกค้าง)", canGiveLensVerdict("ci", mine), true);

console.log("\n— ชิ้นงานผ่านเมื่อครบสองด้านเท่านั้น —");
is("ยังไม่มีใครตรวจ → รอรีวิว", statusFromReview(submitted()), "Waiting review");
is("ผ่านด้านเดียว → ยังรอรีวิว ไม่ใช่ Approved", statusFromReview(submitted({ review: { info: { verdict: "pass", by: "Ken S.", at: "x" } } })), "Waiting review");
is("ผ่านทั้งสอง → Approved", statusFromReview(submitted({ review: { info: { verdict: "pass", by: "Ken S.", at: "x" }, ci: { verdict: "pass", by: "Boss L.", at: "y" } } })), "Approved");
is("ครบสองแต่มีตีกลับ → Revision", statusFromReview(submitted({ review: { info: { verdict: "pass", by: "Ken S.", at: "x" }, ci: { verdict: "revise", by: "Boss L.", at: "y", note: "โลโก้เล็ก" } } })), "Revision");
is("ยังไม่ส่งงาน → สถานะไม่ขยับ", statusFromReview(emptyDeliverable("IG", "1:1")), "Not submitted");
is("นับความคืบหน้า 1 จาก 2", reviewProgress(submitted({ review: { info: { verdict: "pass", by: "Ken S.", at: "x" } } })).given, 1);
is("บอกได้ว่าค้างด้านไหน", reviewProgress(submitted({ review: { info: { verdict: "pass", by: "Ken S.", at: "x" } } })).pending.join(","), "ci");

console.log("\n— ตรวจทีละ artwork ไม่ใช่ทีละ platform —");
// ไฟล์เดียว 1080×1080 ส่งลง IG กับ FB = ของชิ้นเดียว ต้องตรวจครั้งเดียว
const threeRows = [
  submitted({ platform: "Instagram", size: "1:1 (1080×1080)" }),
  submitted({ platform: "Facebook", size: "1:1 (1080×1080)" }),
  submitted({ platform: "Instagram", size: "9:16 (1080×1920)" }),
];
is("จับกลุ่มตาม pixel ไม่ใช่ชื่อ platform", artworkGroup(threeRows, 0).join(","), "0,1");
is("คนละไซซ์คนละกลุ่ม", artworkGroup(threeRows, 2).join(","), "2");

const afterInfo = applyLensVerdict(req(threeRows), 0, "info", "pass", "Ken S.")!;
is("เซ็นครั้งเดียวลงทั้งกลุ่ม", afterInfo.deliverables![1].review?.info?.verdict, "pass");
is("ไม่ไปโดนไซซ์อื่น", afterInfo.deliverables![2].review?.info, undefined);
is("ผ่านด้านเดียวยังไม่ Approved", afterInfo.deliverables![0].status, "Waiting review");
is("ยังไม่ยิง event approved (บิลต้องไม่นับงานที่ตรวจครึ่งเดียว)", (afterInfo.history ?? []).filter((e) => e.type === "approved").length, 0);

const afterBoth = applyLensVerdict(afterInfo, 0, "ci", "pass", "Boss L.")!;
is("ครบสองด้าน → Approved", afterBoth.deliverables![0].status, "Approved");
is("ยิง event approved ครั้งเดียวต่อแถวในกลุ่ม", (afterBoth.history ?? []).filter((e) => e.type === "approved").length, 2);
is("เก็บเวลาแยกรายด้านไว้แยก 'ดีไซเนอร์ช้า' กับ 'คนตรวจช้า'", typeof afterBoth.deliverables![0].review?.info?.at, "string");

console.log("\n— ตีกลับ —");
const sentBack = applyLensVerdict(applyLensVerdict(req(threeRows), 0, "info", "pass", "Ken S.")!, 0, "ci", "revise", "Boss L.", "โลโก้เล็กไป")!;
is("ครบสองโดยมีตีกลับ → Revision", sentBack.deliverables![0].status, "Revision");
is("โน้ตเข้า feedback พร้อมป้ายด้าน", sentBack.deliverables![0].feedback.at(-1)?.lens, "ci");
is("เคลียร์ผลตรวจรอบเก่า รอบใหม่เริ่มนับใหม่", sentBack.deliverables![0].review, undefined);
is("ตีกลับต้องมีเหตุผล — ไม่มีโน้ต = ไม่ทำอะไร", applyLensVerdict(req(threeRows), 0, "ci", "revise", "Boss L."), null);
is("ยังไม่ส่งงาน = ตรวจไม่ได้", applyLensVerdict(req([emptyDeliverable("IG", "1:1")]), 0, "ci", "pass", "Boss L."), null);

console.log("\n— แยกสาเหตุการตีกลับ (design problem หรือ brief problem?) —");
const counts = rejectionsByLens([sentBack, req([submitted({ feedback: [{ reason: "ราคาผิด", by: "Ken S.", at: "x", lens: "info" }, { reason: "เก่า", by: "Ken S.", at: "x" }] })])]);
// 2 ไม่ใช่ 1: การตีกลับหนึ่งครั้งลงทุกแถวในกลุ่ม artwork (IG + FB ที่เป็นไฟล์เดียวกัน)
// ตัวเลขนี้จึงเป็น "จำนวนแถวที่ถูกตีกลับ" ไม่ใช่ "จำนวนครั้งที่คนกด"
is("นับด้าน CI ตามแถวที่โดนตีกลับ", counts.ci, 2);
is("นับด้านข้อมูล", counts.info, 1);
is("แถวเก่าที่ไม่มีป้าย ไม่ยัดเข้าด้านใดด้านหนึ่ง", counts.unlabelled, 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
