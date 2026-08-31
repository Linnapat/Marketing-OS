export type DbErrorLike = { message?: string; code?: string } | null | undefined;

/** Postgres codes for "the row-level security policy said no".
 *  42501 = insufficient_privilege; PostgREST also surfaces its own 42501-ish
 *  message for a violated WITH CHECK. */
const RLS_CODES = new Set(["42501"]);

const looksLikeRls = (error: DbErrorLike) =>
  !!error && (RLS_CODES.has(error.code ?? "") || /row-level security|violates row-level/i.test(error.message ?? ""));

/** Permission refusals now come from the database, not just from a hidden
 *  button, so they need words a person can act on. "new row violates row-level
 *  security policy for table expense_requests" tells a marketer nothing except
 *  that something is broken — and it is not broken, they simply may not do it. */
/** Postgres 22P05: a string in the payload carried a character `text` cannot
 *  hold — in practice a NUL that came in with a paste from Excel or a PDF.
 *  Raw, it reads "unsupported Unicode escape sequence", which names neither the
 *  cause nor anything the person could do about it. */
const looksLikeBadUnicode = (error: DbErrorLike) =>
  !!error && ((error.code ?? "") === "22P05" || /unsupported Unicode escape/i.test(error.message ?? ""));

/** Postgres 23505: the row is already there. Raw, it reads "duplicate key value
 *  violates unique constraint …_blob_id_uniq", which sounds like the save was
 *  lost — and it is the opposite: the save went through, and this is a SECOND
 *  copy of it being turned away. Someone clicking a slow button twice must not
 *  be told their work failed. */
const looksLikeDuplicate = (error: DbErrorLike) =>
  !!error && ((error.code ?? "") === "23505" || /duplicate key value|violates unique constraint/i.test(error.message ?? ""));

export function assertDbOk(error: DbErrorLike, message: string): void {
  if (!error) return;
  if (looksLikeDuplicate(error)) {
    throw new Error(`${message} — รายการนี้ถูกบันทึกไปแล้ว (ระบบได้รับคำขอซ้ำ) · ลอง refresh หน้านี้ดูก่อน ถ้าเห็นรายการแล้วแปลว่าไม่ต้องทำอะไรเพิ่ม`);
  }
  if (looksLikeRls(error)) {
    throw new Error(`${message} — บัญชีของคุณไม่มีสิทธิ์ทำรายการนี้ (ตรวจสิทธิ์ได้ที่ Settings › Permissions หรือแจ้ง CMO)`);
  }
  if (looksLikeBadUnicode(error)) {
    throw new Error(`${message} — ข้อความมีอักขระที่มองไม่เห็นซึ่งฐานข้อมูลเก็บไม่ได้ (มักติดมาจากการคัดลอกจาก Excel / PDF) · ลองพิมพ์ข้อความนั้นใหม่ หรือวางแบบไม่เอารูปแบบ (Ctrl/Cmd + Shift + V)`);
  }
  throw new Error(error.message || message);
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
