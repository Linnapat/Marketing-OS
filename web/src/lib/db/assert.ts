export type DbErrorLike = { message?: string; code?: string } | null | undefined;

export function assertDbOk(error: DbErrorLike, message: string): void {
  if (error) throw new Error(error.message || message);
}

export function assertDbData<T>(data: T | null | undefined, error: DbErrorLike, message: string): T {
  assertDbOk(error, message);
  if (data == null) throw new Error(message);
  return data;
}

/** Await an UPDATE that MUST hit a row, and fail loudly when it hits none.
 *
 *  Postgres reports no error for an UPDATE that matches zero rows — whether the
 *  id is stale, the row was deleted, or RLS hid it. Without this the caller
 *  shows "บันทึกเรียบร้อย" over a write that never happened, which is the worst
 *  kind of failure: the user believes the work is saved and closes the tab.
 *
 *  Pair it with `.select("id")` so the driver returns the affected rows:
 *      await assertRowsTouched(
 *        db.from("t").update(patch).eq("data->>id", id).select("id"),
 *        "…",
 *      );
 *
 *  Only for writes where zero rows is genuinely wrong. A bulk stamp that may
 *  legitimately match nothing (a campaign with no posts) must NOT use this. */
export async function assertRowsTouched(
  op: PromiseLike<{ data: unknown[] | null; error: DbErrorLike }>,
  message: string,
): Promise<void> {
  const { data, error } = await op;
  assertDbOk(error, message);
  if (!data?.length) throw new Error(`${message} — ไม่พบแถวที่ตรงกัน (อาจถูกลบไปแล้ว หรือคุณไม่มีสิทธิ์แก้) ลอง refresh แล้วบันทึกใหม่`);
}

/** Await a follow-up write that targets columns added by a later migration
 *  (the "insert base row, then patch extended columns" pattern). A missing
 *  column (Postgres 42703) is tolerated so a DB that hasn't run the migration
 *  still keeps the base row; every other error is surfaced instead of being
 *  silently swallowed — which previously let extended fields fail unnoticed. */
export async function softColumnUpdate(
  op: PromiseLike<{ error: DbErrorLike }>,
  message: string,
): Promise<void> {
  const { error } = await op;
  if (error && error.code !== "42703") throw new Error(error.message || message);
}
