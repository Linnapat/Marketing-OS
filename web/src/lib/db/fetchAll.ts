// Read a whole table, not the first 1,000 rows of it.
//
// PostgREST caps every response at the project's max-rows (1,000 here) and
// says nothing about it — no error, just a short list. fetchTasks read the
// table in one query ordered by id, so once tasks passed 1,000 (4,692 of them
// orphaned by the Fuji Don KOL fan-out) every NEW task fell off the end: the
// notification linked to it, My Tasks said "ไม่พบงาน", and Jungjing had 17
// jobs she could only find on the Graphic board.
//
// So: page through with .range() until a page comes back short. Ordered by id
// so the pages are stable while we read them.

const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** `build(from, to)` must return the query for rows from..to (inclusive),
 *  ordered by a unique column. Returns every row, or the first error. */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => Page<T>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return { data: out, error: null };
  }
}
