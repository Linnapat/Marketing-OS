export type DbErrorLike = { message?: string; code?: string } | null | undefined;

export function assertDbOk(error: DbErrorLike, message: string): void {
  if (error) throw new Error(error.message || message);
}

export function assertDbData<T>(data: T | null | undefined, error: DbErrorLike, message: string): T {
  assertDbOk(error, message);
  if (data == null) throw new Error(message);
  return data;
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
