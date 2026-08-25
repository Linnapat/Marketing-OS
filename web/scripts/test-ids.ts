/* Minting the id a row is addressed by.
 *
 * The live failure: a designer added a task for herself and got
 *   duplicate key value violates unique constraint "tasks_blob_id_uniq"
 * while the optimistic row on screen said it had worked — and opening it
 * showed somebody else's task, because that id already belonged to one.
 *
 * The old allocator was `Math.max(...tasks.map(t => t.id)) + 1`: one more than
 * the highest id THE SCREEN has. Trashed rows keep their ids reserved but are
 * filtered out of every fetch, so the screen's maximum is routinely lower than
 * the table's — and "one more" lands on a row that already exists.
 * Run with:  npm test   (chained after test-flows.ts)
 * Same self-contained assert harness as the other suites — no runner needed. */

import { mintId, mintIds } from "../src/lib/data/ids";

let pass = 0, fail = 0;
function is(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ FAIL: ${name}\n      got:      ${a}\n      expected: ${e}`); }
}

const NOW = 1787_000_000_000; // a plausible "today" in ms

console.log("— id ต้องอยู่ในช่วงที่ JavaScript ยังนับถูก —");
is("ไม่เกิน MAX_SAFE_INTEGER", mintId(NOW, 0.999) < Number.MAX_SAFE_INTEGER, true);
is("เป็นจำนวนเต็ม", Number.isInteger(mintId(NOW, 0.5)), true);
// Seeded rows are hand-numbered in the low thousands; a minted id must never
// wander down into them.
is("สูงกว่า id ที่ seed ไว้ด้วยมือมาก", mintId(NOW, 0) > 1_000_000, true);

console.log("\n— เรียงตามเวลา: แถวใหม่ต้องได้เลขใหญ่กว่าเสมอ —");
is("มิลลิวินาทีถัดไปได้เลขใหญ่กว่า", mintId(NOW + 1, 0) > mintId(NOW, 0.999), true);
is("ภายในมิลลิวินาทีเดียวกัน random ต่างกัน = คนละเลข", mintId(NOW, 0.1) === mintId(NOW, 0.9), false);

console.log("\n— ขอบของ random ต้องไม่ล้นเข้าบล็อกถัดไป —");
// A 1 slipping through would carry into the next millisecond's block and hand
// out an id another mint can legitimately reach.
is("random = 1 (ไม่ควรเกิด) ยังไม่ล้น", mintId(NOW, 1) < mintId(NOW + 1, 0), true);
is("random เกิน 1 ก็ยังไม่ล้น", mintId(NOW, 5) < mintId(NOW + 1, 0), true);
is("random ติดลบ ไม่ทำให้เลขต่ำกว่าบล็อกตัวเอง", mintId(NOW, -1) >= NOW * 1000, true);
is("random = 0 ได้ค่าต่ำสุดของบล็อก", mintId(NOW, 0), NOW * 1000);
is("เวลาติดลบ ไม่พัง", mintId(-5, 0.5) >= 0, true);

console.log("\n— ขอหลาย id พร้อมกัน (ฟอร์ม KOL สร้างหลายเพจในครั้งเดียว) —");
{
  const ids = mintIds(NOW, 0.5, 3);
  is("ได้ครบตามจำนวน", ids.length, 3);
  is("เรียงต่อกัน", ids[1] === ids[0] + 1 && ids[2] === ids[1] + 1, true);
  is("ทุกตัวอยู่ในบล็อกของมิลลิวินาทีเดียวกัน",
    ids.every((v) => Math.floor(v / 1000) === NOW), true);
  is("ขอ 0 ตัว = ไม่ได้อะไร", mintIds(NOW, 0.5, 0), []);
  is("ขอติดลบ = ไม่ได้อะไร", mintIds(NOW, 0.5, -3), []);
}
{
  // The whole run has to fit inside its own millisecond, at any random draw.
  const last = mintIds(NOW, 0.999, 10).at(-1)!;
  is("สุ่มค่าสูงสุดแล้วตัวท้ายยังไม่ล้นบล็อก", Math.floor(last / 1000), NOW);
  const first = mintIds(NOW, 0, 10)[0];
  is("สุ่มค่าต่ำสุดแล้วตัวแรกยังอยู่ในบล็อก", Math.floor(first / 1000), NOW);
}
{
  let threw = false;
  try { mintIds(NOW, 0.5, 1001); } catch { threw = true; }
  is("ขอเกินหนึ่งบล็อก = โยน error ไม่แอบวนทับ", threw, true);
}

console.log("\n— ชนกันยากแค่ไหน: มิลลิวินาทีเดียวกัน 50 ครั้ง —");
{
  // Not a proof, a smoke test: two people creating in the same millisecond is
  // the only way to collide at all, and even then it needs the same draw.
  const seen = new Set<number>();
  for (let i = 0; i < 50; i++) seen.add(mintId(NOW, i / 50));
  is("50 ครั้งไม่ซ้ำกันเลย", seen.size, 50);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
