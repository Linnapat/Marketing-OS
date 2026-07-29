"use client";

// Optimistic updates that actually undo themselves.
//
// The pattern this replaces was everywhere: paint the new state, fire the
// write, and hang a `.catch(toastError)` off the end —
//
//     setApproved((a) => ({ ...a, [i]: true }));
//     approveExpenseRequest(r, r.requested).catch((e) => toastError(...));
//
// When the write failed the row kept saying "Approved". The toast slid away
// after a few seconds and the screen was left asserting something the database
// had refused, until someone happened to reload. On the expense-approval path
// that is a person believing money was signed off when it was not — and after
// security_p12 tightened who may approve, refusals are now an ordinary event
// rather than a theoretical one, so the UI has to tell the truth about them.
//
// `optimistic()` keeps the instant feedback and adds the missing half: revert
// on failure, then say why.

import { toastError } from "@/lib/toast";

/** Apply a local change immediately, persist it, and undo the local change if
 *  the write fails.
 *
 *  @param apply   paint the optimistic state
 *  @param revert  put it back exactly as it was (called only on failure)
 *  @param write   the persistence call
 *  @param message prefix for the error toast, e.g. "อนุมัติคำขอเบิกไม่สำเร็จ"
 *  @returns true when the write succeeded */
export async function optimistic(
  apply: () => void,
  revert: () => void,
  write: () => Promise<unknown>,
  message: string,
): Promise<boolean> {
  apply();
  try {
    await write();
    return true;
  } catch (error) {
    revert();
    toastError(`${message}: ${error instanceof Error ? error.message : "Unknown error"}`);
    return false;
  }
}
