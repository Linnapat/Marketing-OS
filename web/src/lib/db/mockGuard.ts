// Make mock mode fail the way the database fails.
//
// With no Supabase configured every write returns success and nothing is
// stored, so local development cannot see the failures that matter. The two
// worst bugs found in this codebase — two content posts sharing one id, and
// updates that matched no row while reporting success — were both invisible on
// a developer's machine and had to be found by querying production.
//
// The database now refuses a duplicate id (supabase/blob_id_unique.sql). This
// asserts the same invariant in mock mode, so the collision surfaces where it
// is cheap to fix instead of where it corrupts real work.

const issued = new Map<string, Set<string>>();

function bucket(table: string): Set<string> {
  const found = issued.get(table);
  if (found) return found;
  const fresh = new Set<string>();
  issued.set(table, fresh);
  return fresh;
}

/** Seed the ids a mock dataset already contains, so a new row colliding with
 *  demo data is caught too. Safe to call repeatedly. */
export function seedMockIds(table: string, ids: (string | number | undefined)[]): void {
  const set = bucket(table);
  for (const id of ids) if (id !== undefined && id !== null) set.add(String(id));
}

/** Mirrors the unique index on `data->>'id'`. Throws the same shape of
 *  complaint the database would, so the code path that handles a failed insert
 *  is exercised locally rather than only in production. */
export function assertMockUniqueId(table: string, id: string | number | undefined): void {
  if (id === undefined || id === null || id === "") return;
  const key = String(id);
  const set = bucket(table);
  if (set.has(key)) {
    throw new Error(
      `[mock] duplicate key value violates unique constraint "${table}_blob_id_uniq" — `
      + `id "${key}" already exists in ${table}. `
      + `This is the same refusal the real database gives; the id generator has produced a collision.`,
    );
  }
  set.add(key);
}

/** Free an id after a row is removed, so mock deletes behave like real ones. */
export function releaseMockId(table: string, id: string | number | undefined): void {
  if (id === undefined || id === null) return;
  bucket(table).delete(String(id));
}

/** Tests start from a clean slate. */
export function resetMockGuard(): void { issued.clear(); }
