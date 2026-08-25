/* Approving a campaign must not re-make work that already exists.
 *
 * The live case: four pieces on one campaign were briefed by hand first
 * ("+ Send Brief", which mints its own post), then written into the campaign
 * brief and approved. The fan-out recognised its own stamp and nothing else, so
 * it made a second post and a second request for each — eight rows on the
 * Request page for four jobs, half of them already in progress.
 *
 * These rules are what stop that, and they are also the rules that could
 * silently merge two real pieces if they were loose. Both directions are
 * tested: what must match, and what must NOT.
 * Run with:  npm test   (chained after test-flows.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { adoptablePostFor, graphicsBySourceItem, type AdoptablePost, type LinkedGraphic } from "../src/lib/data/fanoutAdopt";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const post = (id: string, title: string, src?: string): AdoptablePost => ({ id, title, sourceContentItemId: src });

console.log("— รับโพสต์เดิมมาแทนที่จะสร้างใหม่ —");
{
  // The real one, name and all.
  const hand = post("c-hand", "TO10_YOUR DREAM, TO ISE JINGU");
  is("ชื่อตรงกัน + โพสต์ยังไม่มีเจ้าของ = รับมาใช้",
    adoptablePostFor({ title: "TO10_YOUR DREAM, TO ISE JINGU" }, [hand])?.id, "c-hand");
  is("ช่องว่างหน้าหลังไม่ทำให้พลาด",
    adoptablePostFor({ title: "  TO10_YOUR DREAM, TO ISE JINGU  " }, [hand])?.id, "c-hand");
  is("ตัวพิมพ์เล็กใหญ่ไม่ทำให้พลาด",
    adoptablePostFor({ title: "to10_your dream, to ise jingu" }, [hand])?.id, "c-hand");
  is("ช่องว่างซ้อนกลางชื่อไม่ทำให้พลาด",
    adoptablePostFor({ title: "TO10_YOUR   DREAM, TO ISE JINGU" }, [hand])?.id, "c-hand");
}

console.log("\n— สิ่งที่ต้องไม่จับคู่ ถึงจะดูคล้าย —");
{
  // Already belongs to another brief item: adopting it would move work off one
  // piece of content and onto another.
  is("โพสต์ที่เป็นของ brief item อื่นอยู่แล้ว = ไม่รับ",
    adoptablePostFor({ title: "TO10_WHY ISE JINGU?" }, [post("c1", "TO10_WHY ISE JINGU?", "ci-9")]), null);
  // Two posts with one title is an ambiguity this cannot resolve, so it
  // resolves nothing and lets the duplicate be visible.
  is("ชื่อซ้ำสองโพสต์ = ไม่เดา ปล่อยให้ซ้ำแล้วให้คนตัดสิน",
    adoptablePostFor({ title: "Reel" }, [post("a", "Reel"), post("b", "Reel")]), null);
  is("ชื่อไม่ตรง = ไม่รับ",
    adoptablePostFor({ title: "TO10_WHY ISE JINGU?" }, [post("c1", "TO10_YOUR DREAM")]), null);
  is("item ไม่มีชื่อ = ไม่จับคู่กับอะไรเลย",
    adoptablePostFor({ title: "" }, [post("c1", "")]), null);
  is("ไม่มีโพสต์ให้รับ", adoptablePostFor({ title: "อะไรก็ได้" }, []), null);
  // Suffix is how the fan-out names a GRAPHIC, never a post — a post that
  // carries one is a different thing and must not be adopted by the bare title.
  is("ชื่อที่มีท้าย — Reel ไม่ใช่ชื่อเดียวกับชื่อเปล่า",
    adoptablePostFor({ title: "TO10_WHY ISE JINGU?" }, [post("c1", "TO10_WHY ISE JINGU? — Reel")]), null);
}

console.log("\n— ใบงานที่มีอยู่แล้ว รับใช้ content item ไหน —");
{
  const g = (id: string | number, src?: string, postId?: string): LinkedGraphic =>
    ({ id, sourceContentItemId: src, contentPostId: postId });

  is("ใบที่ปั๊ม sourceContentItemId ไว้ = ตอบตรง ๆ",
    [...graphicsBySourceItem([g(1, "ci-2")], [])], [["ci-2", 1]]);

  // The half that was missing: a hand-raised request knows only its post.
  is("ใบที่รู้จักแค่โพสต์ = อ่านทะลุโพสต์ไปหา item",
    [...graphicsBySourceItem([g(9, undefined, "c-hand")], [post("c-hand", "x", "ci-2")])], [["ci-2", 9]]);

  is("โพสต์ที่ยังไม่ถูกรับ = ยังโยงไม่ได้ (ต้องรับโพสต์ก่อน)",
    [...graphicsBySourceItem([g(9, undefined, "c-hand")], [post("c-hand", "x")])], []);

  is("ใบที่ไม่มีทั้งสองอย่าง = ไม่นับ",
    [...graphicsBySourceItem([g(9)], [post("c-hand", "x", "ci-2")])], []);

  // A request that names the item outright beats one inferred through a post.
  is("ชนกัน: ใบที่ระบุ item เองชนะใบที่เดาผ่านโพสต์",
    [...graphicsBySourceItem([g(9, undefined, "c-hand"), g(1, "ci-2")], [post("c-hand", "x", "ci-2")])], [["ci-2", 1]]);

  is("สองใบคนละ item อยู่ครบทั้งคู่",
    [...graphicsBySourceItem([g(1, "ci-1"), g(2, undefined, "p2")], [post("p2", "y", "ci-2")])],
    [["ci-1", 1], ["ci-2", 2]]);

  is("ไม่มีอะไรเลย ไม่พัง", [...graphicsBySourceItem([], [])], []);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
