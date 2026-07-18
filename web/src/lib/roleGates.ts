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

/** Opening/editing campaigns is planning work — creative-side roles work via
 *  Content Plan and Creative Kitchen instead. */
export function canCreateCampaign(role: string): boolean {
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
