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
  return matrix?.[role]?.["Campaign"] ?? seedPermMatrix()[role]?.["Campaign"] ?? null;
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

/** Platform Performance shows company-wide budgets and actual spend with a
 *  "Request revise budget" action — money data, so it follows the same line as
 *  the Finance module: production-side roles (creative + KOL) don't see it.
 *  (CMO decision 2026-07-18: KOL Specialist explicitly closed off.) */
export function canSeePlatformPerformance(role: string): boolean {
  if (/kol|influencer/i.test(role || "")) return false;
  return !isCreativeSideRole(role);
}
