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
/** Pages read at once after the first. Two: enough to stop a big table being a
 *  chain of round trips, small enough that a table that ends on the first page
 *  costs nothing extra. */
const PARALLEL = 2;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => Page<T>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  // The first page alone: most tables end here, and it must not cost them a
  // second request.
  const first = await build(0, PAGE - 1);
  if (first.error) return { data: null, error: first.error };
  const out: T[] = [...(first.data ?? [])];
  if ((first.data ?? []).length < PAGE) return { data: out, error: null };
  // Past 1,000 rows the pages used to be read one after another — tasks is
  // three of them, on every page that lists work. They are independent reads
  // (ordered by a unique column), so they go out together and are appended in
  // order; a short page anywhere in a batch is the end of the table.
  for (let from = PAGE; ; from += PAGE * PARALLEL) {
    const batch = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => build(from + i * PAGE, from + (i + 1) * PAGE - 1)),
    );
    for (const page of batch) {
      if (page.error) return { data: null, error: page.error };
      const rows = page.data ?? [];
      out.push(...rows);
      if (rows.length < PAGE) return { data: out, error: null };
    }
  }
}
