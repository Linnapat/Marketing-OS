/* Which Content Plan post does an approved graphic request deliver to?
 *
 * This is the rule that decides where artwork lands, and getting it wrong is
 * invisible: the asset attaches to *a* post, just not the right one, and nobody
 * checks a link that appears to have worked. The old inline version matched
 * sourceContentItemId without scoping it to a campaign — and that value is the
 * brief's row number ("ci-1", "ci-2", …) restarting per campaign, so live data
 * has "ci-1" in 13 campaigns at once and 488 cross-campaign id collisions.
 * Run: node --import tsx scripts/test-graphic-post-link.ts */

import { findLinkedPost, findLinkedGraphics, resolveOpenTarget, pickBriefPatch, REQUESTER_EDITABLE_BRIEF_FIELDS, shootingDecision, footageReady, LinkablePost, Graphic } from "../src/lib/data/graphic";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) console.error(`    expected ${String(expected)}, got ${String(actual)}`);
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}`); }
}

const g = (over: Partial<Graphic> = {}): Graphic => ({
  id: 900, stage: "Approved", title: "Wagyu KV", b: "teppen", campaign: "Wagyu Festival",
  due: "Aug 5", designer: "Boss", requester: "Ken S.", approver: "Aran P.", type: "Photo",
  priority: "High", fb: 0, openFb: 0, isOverdue: false, briefComplete: true, pendingApprover: "—",
  blocker: null, waitingSince: "", nextAction: "", platform: "IG", size: "1:1",
  contentItem: "Wagyu hero post", ...over,
});

const p = (over: Partial<LinkablePost> = {}): LinkablePost => ({
  id: "c-1", campaign: "Wagyu Festival", campaignId: "CPN-01", title: "Wagyu hero post", ...over,
});

console.log("\n— 1. contentPostId ชนะทุกอย่าง (ลิงก์ตรงจาก Phase 1) —");
{
  const target = p({ id: "c-42" });
  const decoy = p({ id: "c-9", graphicRequestId: "900", sourceContentItemId: "ci-1" });
  is("ผูก post id ไว้ → ได้โพสต์นั้น", findLinkedPost(g({ contentPostId: "c-42" }), [decoy, target])?.id, "c-42");
  // A stated link that resolves to nothing means the post is gone — guessing
  // from the weaker signals would silently attach to the decoy.
  is("ผูกไว้แต่หาโพสต์ไม่เจอ → null ไม่เดาต่อ", findLinkedPost(g({ contentPostId: "c-404" }), [decoy]), null);
}

console.log("\n— 2. โพสต์ชี้กลับมาที่ request —");
{
  const target = p({ id: "c-7", graphicRequestId: "900" });
  is("graphicRequestId ตรงกัน", findLinkedPost(g(), [p({ id: "c-1" }), target])?.id, "c-7");
  is("เทียบข้ามชนิด number/string ได้", findLinkedPost(g({ id: 900 }), [p({ id: "c-7", graphicRequestId: "900" })])?.id, "c-7");
  // Two posts claiming the same request is corrupt data, not a coin flip.
  is("โพสต์ 2 อันอ้าง request เดียวกัน → null",
    findLinkedPost(g(), [p({ id: "c-7", graphicRequestId: "900" }), p({ id: "c-8", graphicRequestId: "900" })]), null);
}

console.log("\n— 3. ci-N ต้องอยู่ใน campaign เดียวกัน (บั๊กเดิม) —");
{
  const otherCampaign = p({ id: "c-other", campaign: "Mother's Day", campaignId: "CPN-17", sourceContentItemId: "ci-1" });
  const sameCampaign = p({ id: "c-mine", sourceContentItemId: "ci-1" });
  const req = g({ sourceContentItemId: "ci-1", campaignId: "CPN-01" });

  is("เจอโพสต์ที่ ci ตรงและ campaign ตรง", findLinkedPost(req, [otherCampaign, sameCampaign])?.id, "c-mine");
  // ก่อนแก้: อันนี้คืน c-other → asset ไปแปะโพสต์ของอีกแคมเปญ
  is("มีแต่ ci ตรง แต่คนละ campaign → null", findLinkedPost(req, [otherCampaign]), null);
  is("ci ตรงกัน 2 โพสต์ใน campaign เดียวกัน → null (กำกวม)",
    findLinkedPost(req, [sameCampaign, p({ id: "c-dup", sourceContentItemId: "ci-1" })]), null);

  // แถวเก่าที่ยังไม่มี campaignId ให้เทียบด้วยชื่อแคมเปญแทน
  const legacy = g({ sourceContentItemId: "ci-2", campaignId: undefined });
  is("ไม่มี campaignId → fallback ชื่อ campaign",
    findLinkedPost(legacy, [p({ id: "c-legacy", campaignId: undefined, sourceContentItemId: "ci-2" })])?.id, "c-legacy");
  is("ชื่อ campaign คนละอัน → null",
    findLinkedPost(legacy, [p({ id: "c-x", campaign: "Other", campaignId: undefined, sourceContentItemId: "ci-2" })]), null);
}

console.log("\n— 4. แถวเก่าที่ไม่มี id เลย: campaign + ชื่อตรงเป๊ะ —");
{
  const req = g({ sourceContentItemId: undefined, contentItem: "Wagyu hero post" });
  is("ชื่อตรงเป๊ะ", findLinkedPost(req, [p({ id: "c-title" })])?.id, "c-title");
  is("ไม่สนตัวพิมพ์/ช่องว่าง", findLinkedPost(req, [p({ id: "c-title", title: "  WAGYU HERO POST " })])?.id, "c-title");
  // เดิมใช้ g.title.includes(p.title) — "Wagyu" จะแมตช์ทุกโพสต์ที่ชื่อเป็นส่วนหนึ่ง
  is("ชื่อเป็นแค่ส่วนหนึ่ง ไม่แมตช์แล้ว",
    findLinkedPost(g({ sourceContentItemId: undefined, contentItem: "", title: "Wagyu hero post extended" }), [p({ id: "c-sub", title: "Wagyu" })]), null);
  is("ชื่อซ้ำกัน 2 โพสต์ → null",
    findLinkedPost(req, [p({ id: "c-a" }), p({ id: "c-b" })]), null);
  is("ไม่มีอะไรให้เทียบเลย → null",
    findLinkedPost(g({ sourceContentItemId: undefined, contentItem: "", title: "" }), [p()]), null);
}

console.log("\n— 5. งานที่ไม่มีโพสต์ (POSM / ป้าย / เมนู) —");
{
  // Phase 1 ให้ request อยู่ได้โดยไม่มีโพสต์ — ห้ามไปหยิบโพสต์อื่นมาแปะ
  const posm = g({ contentPostId: undefined, sourceContentItemId: undefined, contentItem: "—", title: "POSM ขาตั้งหน้าร้าน", campaign: "Wagyu Festival" });
  is("ไม่มีตัวเชื่อมใดๆ → null", findLinkedPost(posm, [p(), p({ id: "c-2", title: "อีกโพสต์" })]), null);
  is("ไม่มีโพสต์ในระบบเลย → null", findLinkedPost(g(), []), null);
}

{
  // ── ลบโพสต์แล้วคำขอกราฟิกต้องไปด้วย (findLinkedGraphics) ──────────────
  // เจอจริงบน production: OMD-20260901-MASTER มีคำขอค้าง 6 รายการ เพราะลบโพสต์
  // แล้วคำขอไม่ถูกลบตาม
  console.log("\n— หาคำขอกราฟิกของโพสต์ที่กำลังจะลบ —");
  const gr = (id: number, over: Partial<Graphic> = {}) => ({ ...g(over), id });

  const a = gr(1, { contentPostId: "c-1" });
  const b = gr(2, { contentPostId: "c-2" });
  is("คำขอที่ระบุ contentPostId ตรง → เจอ",
    findLinkedGraphics({ id: "c-1" }, [a, b]).map((x) => x.id).join(","), "1");
  is("คำขอของโพสต์อื่น → ไม่โดน",
    findLinkedGraphics({ id: "c-9" }, [a, b]).length, 0);

  // ทิศกลับ: โพสต์ชี้มาที่คำขอ
  const plain = gr(3, { contentPostId: undefined });
  is("โพสต์ระบุ graphicRequestId → เจอ",
    findLinkedGraphics({ id: "c-5", graphicRequestId: "3" }, [plain]).map((x) => x.id).join(","), "3");

  // ผูกกันสองทาง ต้องไม่นับซ้ำเป็นสองแถว
  const both = gr(4, { contentPostId: "c-7" });
  is("ผูกสองทางกับแถวเดียว → คืนแถวเดียว",
    findLinkedGraphics({ id: "c-7", graphicRequestId: "4" }, [both]).length, 1);

  // หนึ่งโพสต์มีได้หลายคำขอ
  const m1 = gr(5, { contentPostId: "c-8" });
  const m2 = gr(6, { contentPostId: "c-8" });
  is("โพสต์เดียวมีหลายคำขอ → ไปทั้งหมด",
    findLinkedGraphics({ id: "c-8" }, [m1, m2]).map((x) => x.id).join(","), "5,6");

  // ที่สำคัญที่สุด: ห้ามเดาจากชื่อ/แคมเปญ เพราะพลาดแล้วคือลบงานคนอื่นทิ้ง
  const sameTitle = gr(7, { contentPostId: undefined, sourceContentItemId: "ci-1", title: "Hero Don + Comfort Set" });
  is("ชื่อ/แคมเปญตรงแต่ไม่มีลิงก์ชัดเจน → ไม่ลบ",
    findLinkedGraphics({ id: "c-hero" }, [sameTitle]).length, 0);
  is("โพสต์ไม่มี id และไม่มี graphicRequestId → ไม่ลบอะไรเลย",
    findLinkedGraphics({ id: "" }, [a, b, plain]).length, 0);
  is("ไม่มีคำขอในระบบ → 0", findLinkedGraphics({ id: "c-1" }, []).length, 0);
}

{
  // ── /graphic?open=<id> — จังหวะเวลาเป็นหัวใจ ────────────────────────────
  // บั๊กจริงที่หลุดขึ้น production: หน้า /graphic ตั้ง state เริ่มต้นเป็น mock seed
  // (ไม่ว่าง) เช็ค graphics.length เลยผ่านตั้งแต่เรนเดอร์แรก → หาในข้อมูลปลอม
  // ไม่เจอ → ปิดตัวเอง ทิ้ง param → พอข้อมูลจริงมาก็ไม่ดูอีกแล้ว = กดลิงก์แล้วเงียบ
  console.log("\n— เปิด drawer จาก ?open= (ลำดับเวลา) —");
  const MOCK = [{ id: 999001 }, { id: 999002 }];          // seed ที่ติดมากับหน้า
  const REAL = [{ id: 1784302143872 }, { id: 1784302143875 }];
  const OPEN = "1784302143875";

  // เรนเดอร์แรก: mock อยู่ในมือแล้วแต่ของจริงยังไม่มา — ห้ามตัดสินใจ
  is("ยังโหลดไม่เสร็จ (มี mock อยู่) → wait ไม่ใช่ missing",
    resolveOpenTarget(OPEN, MOCK, false, false).action, "wait");
  // เรนเดอร์ถัดมา: ของจริงมาแล้ว
  const done = resolveOpenTarget(OPEN, REAL, true, false);
  is("โหลดเสร็จแล้ว → open", done.action, "open");
  is("เปิดใบที่ถูกต้อง", String(done.graphic?.id), OPEN);

  // ถ้าเช็คแบบเดิม (length) จะได้ missing ตั้งแต่ยังไม่โหลด — นี่คือบั๊ก
  is("ป้องกันการถอยกลับ: ยังไม่โหลด ห้ามคืน missing เด็ดขาด",
    resolveOpenTarget(OPEN, MOCK, false, false).action === "missing", false);

  // id ที่ไม่มีจริง ต้องบอก ไม่ใช่เงียบ
  is("โหลดเสร็จแล้วแต่ไม่มี id นี้ → missing",
    resolveOpenTarget("404404", REAL, true, false).action, "missing");
  is("ไม่มี param → idle", resolveOpenTarget(null, REAL, true, false).action, "idle");
  is("เปิดไปแล้ว ห้ามเปิดซ้ำ", resolveOpenTarget(OPEN, REAL, true, true).action, "idle");
  // โหลดเสร็จแต่ไม่มีใบงานเลยสักใบ ก็ยังต้องบอกว่าไม่เจอ
  is("โหลดเสร็จ ลิสต์ว่าง → missing", resolveOpenTarget(OPEN, [], true, false).action, "missing");
  // id มาจาก URL เป็น string ส่วน g.id เป็น number
  is("เทียบ string กับ number ได้", resolveOpenTarget("1784302143875", REAL, true, false).action, "open");
}

{
  // ── requester เติมบรีฟเอง: patch ต้องแคบและตรง ──────────────────────────
  console.log("\n— pickBriefPatch: ส่งเฉพาะช่องที่แก้จริง —");
  const base = g({ keyMessage: "เดิม", briefLink: "", objective: "obj" });

  is("ไม่แก้อะไรเลย → patch ว่าง",
    Object.keys(pickBriefPatch({ keyMessage: "เดิม", objective: "obj" }, base)).length, 0);
  is("เว้นวรรคหน้าหลังไม่นับว่าแก้",
    Object.keys(pickBriefPatch({ keyMessage: "  เดิม  " }, base)).length, 0);
  is("แก้ช่องเดียว → ส่งช่องเดียว",
    JSON.stringify(pickBriefPatch({ keyMessage: "ใหม่", objective: "obj" }, base)), '{"keyMessage":"ใหม่"}');
  is("เติมช่องที่ว่างอยู่ → ส่ง",
    JSON.stringify(pickBriefPatch({ briefLink: "https://x" }, base)), '{"briefLink":"https://x"}');
  is("ลบค่าทิ้ง (เป็นค่าว่าง) → ส่งค่าว่าง ไม่ใช่ข้าม",
    JSON.stringify(pickBriefPatch({ objective: "" }, base)), '{"objective":""}');

  // สำคัญที่สุด: ห้ามให้ฟิลด์นอกรายการหลุดเข้า patch ได้
  const sneaky = pickBriefPatch(
    { keyMessage: "ใหม่", stage: "Approved", designer: "someone", acceptedAt: "2026-01-01" } as never, base);
  is("ฟิลด์นอก whitelist ถูกตัดทิ้ง", JSON.stringify(sneaky), '{"keyMessage":"ใหม่"}');
  // cast: TS รู้อยู่แล้วว่าไม่มีทางตรง — แต่เราอยากให้ "รู้ตอนรันจริง" ด้วย
  // เผื่อวันหลังมีคนเผลอเติม platform/size เข้า whitelist
  const whitelist = REQUESTER_EDITABLE_BRIEF_FIELDS as readonly string[];
  is("platform/size ไม่อยู่ใน whitelist",
    whitelist.includes("platform") || whitelist.includes("size"), false);
  // 6 ไม่ใช่ 8: ยุบช่องลิงก์ 3 ช่อง (briefLink / driveLink / referenceLink)
  // เหลือ briefLink ช่องเดียว เพราะสามช่องเรียงกันทำให้คนกรอกคนละช่องกับที่ระบบอ่าน
  is("whitelist เหลือ 6 ช่อง (ลิงก์ช่องเดียว)", REQUESTER_EDITABLE_BRIEF_FIELDS.length, 6);
  is("มีช่องลิงก์เดียว", whitelist.filter((f) => /link/i.test(f)).join(","), "briefLink");
}

{
  // ── ต้องถ่าย / ไม่ต้องถ่าย / ยังไม่ระบุ ────────────────────────────────
  // checkbox เดิมทำให้ "ยังไม่ตัดสินใจ" กับ "ตัดสินใจแล้วว่าไม่ต้องถ่าย"
  // หน้าตาเหมือนกัน — designer เลยไม่รู้ว่าต้องรอรูปหรือเริ่มได้เลย
  console.log("\n— สถานะการถ่าย 3 แบบ —");
  is("ไม่เคยตั้งค่า → undecided", shootingDecision({}), "undecided");
  is("true → required", shootingDecision({ requiresShooting: true }), "required");
  is("false → not_required (ต่างจากยังไม่ระบุ)", shootingDecision({ requiresShooting: false }), "not_required");
  is("undefined กับ false ต้องไม่เท่ากัน",
    shootingDecision({}) === shootingDecision({ requiresShooting: false }), false);

  // pipeline ต้องไม่เปลี่ยนพฤติกรรม: ทั้ง undefined และ false = ไม่มีขั้นถ่าย
  is("ยังไม่ระบุ → ไม่บล็อกการส่งงาน", footageReady({ footageLink: "" }), true);
  is("ไม่ต้องถ่าย → ไม่บล็อกการส่งงาน",
    footageReady({ requiresShooting: false, footageLink: "" }), true);
  is("ต้องถ่ายแต่ยังไม่มี footage → บล็อก",
    footageReady({ requiresShooting: true, footageLink: "" }), false);
  is("ต้องถ่ายและมี footage แล้ว → ผ่าน",
    footageReady({ requiresShooting: true, footageLink: "https://x" }), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
