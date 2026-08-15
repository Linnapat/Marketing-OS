// Pure rules for the retro-approval queue — no database, so scripts/ can pin
// them. The IO half (reading the queue, clearing entries) lives in
// db/retroApproval; the two are split because these rules decide whether an
// edit is chargeable to the CMO at all, and that decision is worth testing on
// its own.

import { CampaignBrief, RetroApprovalEntry } from "@/lib/data/brief";

/** Outstanding entries on a brief, oldest first — the order they were made, so
 *  the CMO reads an edit history rather than a random pile. */
export function pendingEntriesOf(brief: Pick<CampaignBrief, "pendingApprovals">): RetroApprovalEntry[] {
  return [...(brief.pendingApprovals ?? [])].sort((a, b) => (a.at || "").localeCompare(b.at || ""));
}

/** Build the entry an edit leaves behind. Returns null when the edit changed
 *  nothing the CMO has to see — the caller then just logs and moves on, which
 *  is the whole point: a caption fix must not cost anybody an approval. */
export function retroEntryFor(opts: {
  at: string; by: string; status: string; major: string[]; minor: string[];
}): RetroApprovalEntry | null {
  if (!opts.major.length) return null;
  return {
    // The save timestamp is unique per campaign in practice (saves are queued
    // per campaign in db/brief) and is the one value both the writer and the
    // CMO's page already have, so it doubles as the key without a counter.
    id: opts.at,
    at: opts.at,
    by: opts.by || "Unknown",
    changes: opts.major,
    ...(opts.minor.length ? { minor: opts.minor } : {}),
    status: opts.status,
  };
}
