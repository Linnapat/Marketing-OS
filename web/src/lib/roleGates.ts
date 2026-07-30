// Role → capability gates, in ONE place. The first version of the campaign
// gate classified roles through OwnerSelect's memberTeam(), whose regex sends
// "Content Creator" to the Planner bucket — so Content Creator slipped past a
// block meant for every content-production role. Naming the gates explicitly
// (and unit-testing the role strings the team actually uses) keeps the next
// added role from slipping through the same crack.
//
// UI-layer gating like the rest of the app — RLS enforcement is the separate
// post-go-live track.

/** Roles that PRODUCE work inside campaigns (graphic, video, content, external
 *  studios) — as opposed to planning/managing them. */
export function isCreativeSideRole(role: string): boolean {
  return /creative|design|graphic|art|video|vdo|content creator|agency|external/i.test(role || "");
}

// ── Content Plan: who may rewrite or move a planned post ──────────────────
// The planning side owns the schedule — "แก้ไขหรือย้ายแคมเปญได้โดย Marketing".
// Creative roles read the plan and produce against it; they do not reschedule
// it, and the request they work from is the thing that locks (contentEditLock).
// Named explicitly rather than derived as "not creative", so a role added later
// gets no schedule-editing power by accident.
const PLANNER_ROLES = ["CMO", "Marketing Manager / BGL", "Marketing Executive", "Co-ordinator"];

/** May this role edit a planned post, or move it to another campaign? */
export function canEditContentPlan(role: string): boolean {
  return PLANNER_ROLES.includes((role || "").trim());
}

// ── Graphic deliverables: who signs off a submitted artwork ────────────────
// The Approve button on a deliverable row had no gate at all: any role that
// could open the Assets tab and saw a row in "Waiting review" could approve it,
// including the designer who had just submitted it. The Permissions matrix says
// Graphic = Approve for Creative Leader and the chain is
// Requester → Creative Leader → Marketing Manager / BGL → CMO, but none of that
// reached the button.
//
// The review step belongs to the person who asked for the work (they accept
// it), the Creative Leader (final creative review), or the CMO. Marketing
// Manager / BGL sits at a later step — approving the whole request — not at the
// per-artwork review, so they are deliberately not here.

/** May this person act on a submitted deliverable at all (approve or send back)? */
export function canReviewDeliverable(role: string, isRequester: boolean): boolean {
  return isRequester || role === "CMO" || role === "Creative Leader";
}

/** May they approve THIS row? Same reviewers, minus self-approval: signing off
 *  your own submission is the check approving itself. Sending your own work
 *  back stays allowed — a designer who spots their own mistake needs a way to
 *  reopen the row, which is otherwise locked while it waits for review. */
export function canApproveDeliverable(
  { role, isRequester, isSubmitter }: { role: string; isRequester: boolean; isSubmitter: boolean },
): boolean {
  return canReviewDeliverable(role, isRequester) && !isSubmitter;
}

/** May this person clear a rush brief — the one that jumped the monthly
 *  deadline, the lead time or the daily cap?
 *
 *  Creative Leader owns the queue's capacity, so the call is theirs; the CMO
 *  can act when they are away. Deliberately NOT the requester: the whole point
 *  of the gate is that someone other than the person in a hurry decides whether
 *  the month can absorb the work. */
export function canApproveRushBrief(role: string): boolean {
  return role === "Creative Leader" || role === "CMO";
}

// ── Campaign creation: driven by the Settings → Permissions matrix ─────────
// The source of truth the QA verified against. A role may create campaigns
// when its Campaign module level is Edit or higher; "View" means exactly that.
// The saved matrix (permissions table) wins; the seed matrix in
// lib/data/settings is the fallback before an admin ever saves one; a role in
// neither falls back to the creative-side heuristic so a brand-new role fails
// closed on the production side.

import { PERM_MODULES, PERM_ROLES } from "@/lib/data/settings";

export type PermMatrix = Record<string, Record<string, string>>;

const CAMPAIGN_CREATE_LEVELS = ["Edit", "Approve", "Admin"];

/** The shipped defaults, in the same shape fetchPermissions() returns. */
export function seedPermMatrix(): PermMatrix {
  const out: PermMatrix = {};
  for (const r of PERM_ROLES) {
    out[r.role] = {};
    r.perms.forEach((p, i) => { out[r.role][PERM_MODULES[i]] = p.l; });
  }
  return out;
}

/** The role's Campaign-module level per the live matrix (seed as fallback). */
export function campaignPermLevel(role: string, matrix?: PermMatrix | null): string | null {
  return modulePermLevel(role, "Campaign", matrix);
}

/** Opening campaigns follows the Permissions table: Campaign ≥ Edit. An empty
 *  role (demo mode, member row still loading) keeps working; a role the matrix
 *  doesn't know follows the creative-side heuristic. */
export function canCreateCampaign(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return true;
  const level = campaignPermLevel(role, matrix);
  if (level !== null) return CAMPAIGN_CREATE_LEVELS.includes(level);
  return !isCreativeSideRole(role);
}

// ── Expense approval: the same line the database now draws ────────────────
// The Approval tab used to render for anyone who could open Finance at all,
// so a Marketing Manager / BGL (Finance=View) and a Co-ordinator (Finance=Edit)
// both saw live Approve buttons — and the database let the Co-ordinator's click
// through, because the RPC had no role check and the row policy asked only for
// Finance >= View. supabase/security_p12_expense_approval.sql moved the rule
// into Postgres (has_module('Finance','Approve') + a CMO check inside the RPC);
// this is the matching UI gate, expressed against the same matrix level so the
// two cannot drift apart again.

const APPROVE_LEVELS = ["Approve", "Admin"];

/** The role's level for any module per the live matrix (seed as fallback). */
export function modulePermLevel(role: string, module: string, matrix?: PermMatrix | null): string | null {
  return matrix?.[role]?.[module] ?? seedPermMatrix()[role]?.[module] ?? null;
}

/** May this role decide an expense request (approve or send back)? */
export function canApproveExpense(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return false; // unknown identity never approves money
  return APPROVE_LEVELS.includes(modulePermLevel(role, "Finance", matrix) ?? "—");
}

/** May this role see company-wide spending (the Spending Log / Finance module)?
 *  Submitting your own request does not require this — everyone may do that. */
export function canSeeAllSpending(role: string, matrix?: PermMatrix | null): boolean {
  if (!role) return false;
  return (modulePermLevel(role, "Finance", matrix) ?? "—") !== "—";
}

/** May this role move a Spending Log row Unpaid → Paid?
 *
 *  Paying the vendor is the Co-ordinator's job, so declaring it paid is theirs
 *  too — the button used to render for everyone who could open the Spending
 *  Log. This is a named-role rule rather than a matrix level because the matrix
 *  has no level that means "handles payments"; Finance=Edit is held by people
 *  who prepare spending, not people who settle it. Mirrored in the database by
 *  supabase/security_p13_mark_paid.sql.
 *
 *  The CMO keeps an override: with one Co-ordinator on the team, no fallback
 *  would strand every unpaid row while they are away. */
export function canMarkPaid(role: string): boolean {
  const r = (role || "").trim();
  return r === "Co-ordinator" || r === "CMO";
}

/** Platform Performance shows company-wide budgets and actual spend with a
 *  "Request revise budget" action — money data, so it follows the same line as
 *  the Finance module: production-side roles (creative + KOL) don't see it.
 *  (CMO decision 2026-07-18: KOL Specialist explicitly closed off.) */
export function canSeePlatformPerformance(role: string): boolean {
  if (/kol|influencer/i.test(role || "")) return false;
  return !isCreativeSideRole(role);
}
