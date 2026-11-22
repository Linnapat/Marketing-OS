/* What a Permissions save is about to change — spelled out before it happens,
 * and written down after.
 *
 * The matrix is edited by clicking cells, which cycle through the levels. A
 * stray click is one step away from "Save changes", and the audit log used to
 * record only "N role(s) updated": it could say that somebody had changed
 * permissions, never what. Listing the changes serves both — the person saving
 * reads them first, and each one becomes its own audit line with the old and
 * the new level. */

const RANK = ["—", "View", "Edit", "Approve", "Admin"];

export interface PermChange {
  role: string;
  module: string;
  from: string;
  to: string;
  /** More access than before — the direction worth a second look. */
  widens: boolean;
}

/** Every cell that differs between two matrices of level labels, in table
 *  order. `before` and `after` are [role][module]. */
export function permissionChanges(
  roles: readonly string[], modules: readonly string[],
  before: readonly (readonly string[])[], after: readonly (readonly string[])[],
): PermChange[] {
  const out: PermChange[] = [];
  roles.forEach((role, ri) => modules.forEach((module, mi) => {
    const from = before[ri]?.[mi] ?? "—", to = after[ri]?.[mi] ?? "—";
    if (from !== to) out.push({ role, module, from, to, widens: RANK.indexOf(to) > RANK.indexOf(from) });
  }));
  return out;
}

/** One audit line per change. */
export function permChangeLabel(c: PermChange): string {
  return `${c.role} · ${c.module}`;
}
