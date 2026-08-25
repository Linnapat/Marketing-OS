// Minting the id a row is addressed by.
//
// Every one of these tables is addressed by `data->>'id'`, and every one has a
// unique index on it (blob_id_unique.sql). Five id-collision bugs have been
// fixed in this codebase; the constraint is what turned the fifth from silent
// corruption into a visible failure:
//
//     duplicate key value violates unique constraint "tasks_blob_id_uniq"
//
// which is what a designer got trying to add a task for herself, while the
// optimistic row on her screen said it had worked — and opening it showed
// somebody else's task, because that id already belonged to one.
//
// The cause was counting: `Math.max(...tasks.map(t => t.id)) + 1`. It reads the
// list the SCREEN has, and the screen never has all of them. Trashed rows are
// filtered out of every fetch but keep their ids reserved (deliberately, so a
// restore cannot collide), and a brand-scoped viewer never sees rows outside
// their scope at all. So the highest id on screen is routinely lower than the
// highest id in the table, and "one more than the highest" lands on something
// that already exists.
//
// Counting cannot be made safe from the client. Stop counting.

/** A new row id, from the clock rather than from a list.
 *
 *  Milliseconds since the epoch, times a thousand, plus a random remainder —
 *  about 1.79e15 today, comfortably inside Number.MAX_SAFE_INTEGER (9.0e15)
 *  and far above any id these tables were seeded with by hand. Two rows can
 *  only collide by being minted in the same millisecond AND drawing the same
 *  remainder out of a thousand.
 *
 *  Pure so it can be tested: pass `Date.now()` and `Math.random()`.
 *
 *  Sorts the same way it always did — later rows get bigger numbers — so
 *  anything ordering by id keeps working. */
export function mintId(nowMs: number, rand: number): number {
  const ms = Math.max(0, Math.floor(nowMs));
  // Guard the remainder rather than trusting the caller: Math.random() is
  // [0,1), but a 1 slipping through would carry into the next millisecond's
  // block and hand out an id that another mint can reach.
  const r = Math.min(999, Math.max(0, Math.floor(rand * 1000)));
  return ms * 1000 + r;
}

/** `count` consecutive ids from one mint — for the forms that create a row per
 *  KOL or per asset in a single submit.
 *
 *  Reserved from the low end of the block so the whole run stays inside the
 *  millisecond it was minted in; a run long enough to overflow (>1000) would
 *  reach into the next one, so it is refused rather than silently wrapped. */
export function mintIds(nowMs: number, rand: number, count: number): number[] {
  if (count <= 0) return [];
  if (count > 1000) throw new Error(`mintIds: ขอ ${count} ids พร้อมกันมากเกินไป (สูงสุด 1000)`);
  const base = Math.max(0, Math.floor(nowMs)) * 1000;
  const start = Math.min(1000 - count, Math.max(0, Math.floor(rand * (1000 - count + 1))));
  return Array.from({ length: count }, (_, i) => base + start + i);
}
