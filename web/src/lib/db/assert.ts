export type DbErrorLike = { message?: string } | null | undefined;

export function assertDbOk(error: DbErrorLike, message: string): void {
  if (error) throw new Error(error.message || message);
}

export function assertDbData<T>(data: T | null | undefined, error: DbErrorLike, message: string): T {
  assertDbOk(error, message);
  if (data == null) throw new Error(message);
  return data;
}
