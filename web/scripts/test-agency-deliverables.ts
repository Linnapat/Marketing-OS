/* Runtime tests for per-deliverable submit — the path an outsourced designer's
 * pay is counted from. The old portal stamped one link on deliverable #0 and
 * left the rest "Not submitted": a three-size request read as one delivery, so
 * two pieces could never be approved and would never be paid. These tests pin
 * the shape that makes each size countable.
 * Run with:  npm test   (chained after test-brief-sheet.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { submitDeliverable, passAllWaiting, deliverableProgress, artworkUnits, Graphic, GraphicDeliverable } from "../src/lib/data/graphic";
import { portalRowKey } from "../src/lib/data/agency";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  check(name, actual === expected);
}

const del = (platform: string, size: string, over: Partial<GraphicDeliverable> = {}): GraphicDeliverable => ({
  platform, size, refLink: "", assetLink: "", sourceLink: "", status: "Not submitted",
  version: 0, submittedBy: "", submittedAt: "", feedback: [], ...over,
});

/** A real shape of the problem: one request, three sizes = three pieces. */
const threeSizes = (): Graphic => ({
  id: 1, stage: "New Request", title: "Wagyu KV", b: "teppen", campaign: "Wagyu Festival",
  due: "Aug 5", designer: "Agency Studio", requester: "Ken S.", approver: "Aran P.",
  type: "Photo", priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: true,
  pendingApprover: "—", blocker: null, waitingSince: "", nextAction: "", platform: "IG + FB",
  size: "1:1 · 4:5 · 9:16", contentItem: "KV",
  deliverables: [del("Instagram", "1:1 (1080×1080)"), del("Instagram", "4:5 (1080×1350)"), del("Instagram", "9:16 (1080×1920)")],
  history: [],
});

console.log("\n— submitting one deliverable —");
{
  const g = threeSizes();
  const next = submitDeliverable(g, 1, "Agency Studio", { assetLink: "https://drive/x-4x5.png" });
  check("returns an updated request", !!next);
  is("the submitted piece is waiting review", next!.deliverables![1].status, "Waiting review");
  is("…with the link kept", next!.deliverables![1].assetLink, "https://drive/x-4x5.png");
  is("…the submitter recorded", next!.deliverables![1].submittedBy, "Agency Studio");
  is("…and its version bumped", next!.deliverables![1].version, 1);
  // The whole point: submitting one piece must not touch the others.
  is("the other pieces stay Not submitted", next!.deliverables!.filter((d) => d.status === "Not submitted").length, 2);
  is("the request stage rolls up", next!.stage, "Waiting Feedback");
  is("history records the submit", next!.history!.length, 1);
  is("…against the right deliverable", next!.history![0].deliverableKey, "Instagram::4:5 (1080×1350)");
  is("…as a submitted event", next!.history![0].type, "submitted");
  is("the source request is untouched (pure)", g.deliverables![1].status, "Not submitted");
}
{
  const g = threeSizes();
  is("no link = nothing to review", submitDeliverable(g, 0, "Agency Studio"), null);
  is("a deliverable that doesn't exist", submitDeliverable(g, 9, "Agency Studio", { assetLink: "x" }), null);
}
{
  // Re-submitting after the team sent a piece back.
  const g = threeSizes();
  g.deliverables![0] = del("Instagram", "1:1 (1080×1080)", {
    status: "Revision", assetLink: "https://drive/v1.png", version: 1,
    feedback: [{ reason: "โลโก้เล็กไป", by: "Ken S.", at: "2026-08-01T00:00:00Z" }],
  });
  const next = submitDeliverable(g, 0, "Agency Studio", { assetLink: "https://drive/v2.png" });
  is("a revision goes back to review", next!.deliverables![0].status, "Waiting review");
  is("…as a new version", next!.deliverables![0].version, 2);
  is("…keeping the feedback trail", next!.deliverables![0].feedback.length, 1);
}

console.log("\n— the full path: three pieces submitted, approved, counted —");
{
  let g: Graphic = threeSizes();
  for (let i = 0; i < 3; i++) {
    g = submitDeliverable(g, i, "Agency Studio", { assetLink: `https://drive/piece-${i}.png` })!;
  }
  is("all three are waiting review", deliverableProgress(g).submitted, 3);
  is("nothing approved yet", deliverableProgress(g).approved, 0);

  // Two checks now, so one person clearing their lens is NOT an approval.
  const half = passAllWaiting(g, "Ken S.", "info", { role: "Marketing Executive", isRequester: true })!;
  is("the requester passes the information check on all three", deliverableProgress(half).approved, 0);
  is("…and the request is not ready on one lens", deliverableProgress(half).ready, false);
  is("…no approval is recorded yet — the studio cannot bill this", (half.history ?? []).filter((e) => e.type === "approved").length, 0);

  const approved = passAllWaiting(half, "Boss L.", "ci", { role: "Creative Leader", isRequester: false })!;
  is("Creative Leader's CI pass completes all three", deliverableProgress(approved).approved, 3);
  is("…so the request is ready", deliverableProgress(approved).ready, true);
  is("…and the stage says Approved", approved.stage, "Approved");
  const approvedEvents = approved.history!.filter((e) => e.type === "approved");
  is("three approvals are recorded", approvedEvents.length, 3);
  check("…each naming its own deliverable", new Set(approvedEvents.map((e) => e.deliverableKey)).size === 3);

  // What the money question actually rides on: resize = a new piece.
  is("three sizes = three artwork pieces", artworkUnits(approved), 3);
}
{
  // Same size on two platforms is ONE file sent to two places — not two pieces.
  const g: Graphic = { ...threeSizes(), deliverables: [del("Facebook", "1:1 (1080×1080)"), del("Instagram", "1:1 (1080×1080)")] };
  is("same size on two platforms = one piece", artworkUnits(g), 1);
}

console.log("\n— bulk approve ข้ามชิ้นที่คนกดส่งเอง —");
{
  // The per-row Approve button refuses self-approval; the board's one-click
  // Approve must refuse the same pieces or the rule is one click from bypass.
  let g: Graphic = threeSizes();
  g = submitDeliverable(g, 0, "Agency Studio", { assetLink: "https://drive/a.png" })!;
  g = submitDeliverable(g, 1, "Ken S.", { assetLink: "https://drive/b.png" })!;

  const ctxKen = { role: "Marketing Executive", isRequester: true };
  const byKen = passAllWaiting(g, "Ken S.", "info", ctxKen)!;
  is("Ken ผ่านด้านข้อมูลได้เฉพาะชิ้นที่ Agency ส่ง", byKen.deliverables![0].review?.info?.verdict, "pass");
  is("…ชิ้นที่ Ken ส่งเอง ไม่โดนเซ็นให้", byKen.deliverables![1].review?.info, undefined);
  is("…ทั้งสองชิ้นยังรอรีวิว เพราะ CI ยังไม่มีใครตรวจ", byKen.deliverables![0].status, "Waiting review");
  is("…และยังไม่มี event approved", (byKen.history ?? []).filter((e) => e.type === "approved").length, 0);
  // ชื่อเทียบแบบไม่สนตัวพิมพ์/ช่องว่างหน้าหลัง
  is("เทียบชื่อไม่สนตัวพิมพ์", passAllWaiting(g, " ken s. ", "info", ctxKen)!.deliverables![1].review?.info, undefined);

  // ไม่เหลืออะไรให้อนุมัติ → null (ปุ่มจะขึ้น toast แทนที่จะเงียบ)
  let mine: Graphic = threeSizes();
  mine = submitDeliverable(mine, 0, "Ken S.", { assetLink: "https://drive/only.png" })!;
  is("ทุกชิ้นที่รอเป็นของตัวเอง → null", passAllWaiting(mine, "Ken S.", "info", ctxKen), null);
  is("…แต่คนอื่นเซ็นด้านนั้นได้", passAllWaiting(mine, "Mei T.", "info", { role: "Marketing Manager / BGL", isRequester: false })!.deliverables![0].review?.info?.verdict, "pass");
}

console.log("\n— the regression this replaces —");
{
  // The old portal put its single link on deliverable #0 only. Reproduce that
  // shape and show it under-counts: two pieces of paid work go missing.
  const g = threeSizes();
  const oldWay: Graphic = {
    ...g,
    deliverables: g.deliverables!.map((d, i) => (i === 0 ? { ...d, assetLink: "https://drive/only.png", status: "Waiting review" as const } : d)),
  };
  is("one link = only one piece reviewable", deliverableProgress(oldWay).submitted, 1);
  const oldBoth = passAllWaiting(passAllWaiting(oldWay, "Ken S.", "info", { role: "Marketing Executive", isRequester: true })!, "Boss L.", "ci", { role: "Creative Leader", isRequester: false })!;
  is("…so approving gives 1 of 3", deliverableProgress(oldBoth).approved, 1);

  let newWay: Graphic = threeSizes();
  for (let i = 0; i < 3; i++) newWay = submitDeliverable(newWay, i, "Agency Studio", { assetLink: `https://drive/p${i}.png` })!;
  const newBoth = passAllWaiting(passAllWaiting(newWay, "Ken S.", "info", { role: "Marketing Executive", isRequester: true })!, "Boss L.", "ci", { role: "Creative Leader", isRequester: false })!;
  is("per-deliverable submit gives 3 of 3", deliverableProgress(newBoth).approved, 3);
}

console.log("\n— แถวใน Agency Portal ต้องเป็นคนละแถวจริง ๆ —");
{
  // กดที่ชื่องานแล้วเด้งเป็นงานอื่น: id ของแถวเคยเป็น Number(`9${g.id}`) และ
  // g.id เป็นสแตมป์ 16 หลักอยู่แล้ว เติม "9" เข้าไปเลย Number.MAX_SAFE_INTEGER
  // ปลายเลขถูกปัดทิ้ง งานที่สร้างห่างกันไม่กี่มิลลิวินาที (ซึ่งคือวิธีที่ fan-out
  // สร้าง) จึงยุบเหลือ key เดียว — ของจริง 28 แถวใน 7 กลุ่ม กลุ่มใหญ่สุด 8 แถว
  const ids = ["1787286695952001", "1787286695952002", "1787286695952003"];
  check("เติม '9' แล้วเลขชนกันจริง (ต้นเหตุ)",
    Number(`9${ids[0]}`) === Number(`9${ids[1]}`));
  check("เลขดิบยังอยู่ในช่วงที่ปลอดภัย", ids.every((id) => Number(id) <= Number.MAX_SAFE_INTEGER));

  const keys = ids.map((id) => portalRowKey({ id: Number(id), graphicId: id, source: "graphic" }));
  check("สามงานได้สาม key ไม่ซ้ำกัน", new Set(keys).size === 3);
  check("key อ่านจากเลขจริง ไม่แปลงเป็นตัวเลข", keys[0] === `graphic-${ids[0]}`);

  // งานที่สร้างเองในพอร์ทัลยังใช้ id ของตัวเอง และไม่ชนกับฝั่ง graphic
  check("งาน manual คนละ namespace", portalRowKey({ id: 12, source: "manual" }) === "manual-12");
  check("manual ไม่ชนกับ graphic ที่เลขเดียวกัน",
    portalRowKey({ id: 12, source: "manual" }) !== portalRowKey({ id: 12, graphicId: "12", source: "graphic" }));
  // ไม่มี graphicId (แถวเก่า) ต้องไม่ระเบิด — ถอยไปใช้ id
  check("แถว graphic ที่ไม่มี graphicId ยังได้ key",
    portalRowKey({ id: 7, source: "graphic" }) === "manual-7");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
