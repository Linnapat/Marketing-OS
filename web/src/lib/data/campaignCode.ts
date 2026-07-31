/* Resolving a campaign's running code (#TPN-2026-006) from whatever a module row
 * happens to carry.
 *
 * Every module denormalises the campaign NAME beside campaign_id, and names are
 * not unique — two campaigns can share one, which is the whole reason the code
 * exists. So the id is tried first and the name only as a fallback, for the rows
 * that predate the campaign_id backfill and never got linked.
 *
 * Pure: no fetch, no React, so the fallback rules are testable on their own.
 * useCampaignCodes wraps this with the shared read of the campaign list. */

import { CampaignRow } from "@/lib/data/campaigns";

export interface CampaignCodeIndex {
  byId: Record<string, string>;
  /** A name that two campaigns share maps to "" — see buildCampaignCodeIndex. */
  byName: Record<string, string>;
}

export const EMPTY_CODE_INDEX: CampaignCodeIndex = { byId: {}, byName: {} };

export function buildCampaignCodeIndex(rows: CampaignRow[]): CampaignCodeIndex {
  const byId: Record<string, string> = {};
  const byName: Record<string, string> = {};
  for (const c of rows) {
    if (!c.code) continue;
    byId[c.id] = c.code;
    // An ambiguous name resolves to no code rather than to one of the two
    // campaigns at random — a missing pill is a smaller lie than a confident
    // wrong one, and the row that owns an id is unaffected either way.
    byName[c.name] = c.name in byName && byName[c.name] !== c.code ? "" : c.code;
  }
  return { byId, byName };
}

/** The code for a row, or undefined when there is no unambiguous answer. */
export function lookupCampaignCode(
  index: CampaignCodeIndex, id?: string, name?: string,
): string | undefined {
  return (id ? index.byId[id] : undefined) || (name ? index.byName[name] : undefined) || undefined;
}
