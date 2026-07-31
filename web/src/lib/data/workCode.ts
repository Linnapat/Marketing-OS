/* Job numbers for the work under a campaign — one post, one artwork.
 *
 * The campaign got a readable number (TPN_2609_003); the work under it did not.
 * Content had `ci-1`, which restarts inside every campaign and so names nothing
 * on its own — six `ci-N` values are in use across more than one campaign — and
 * artwork had only its database row number. So the team did what it did with
 * campaigns before this: typed a number into the title ("0901_", "MS0901"),
 * 18 posts and 17 requests deep.
 *
 * The codes read down the tree, so a number quoted on its own says where it
 * belongs without anything else attached:
 *
 *   TPN_2609_003          the campaign
 *   TPN_2609_003-C01      a post in it
 *   TPN_2609_003-C01-A01  the artwork for that post
 *   TPN_2609_003-A01      artwork with no post behind it
 *
 * Artwork hangs off its post rather than off the campaign, because "which post
 * is this for" is the question actually asked of an artwork request. The six
 * requests raised without a post fall back to the campaign.
 *
 * Numbers are per parent and never reused: they come from the highest existing
 * number, not from a count, so deleting a post does not hand its number to the
 * next one and break a reference someone already wrote down.
 *
 * Pure: no fetch, no React. The callers supply the codes already in use. */

/** Sequence marker: C for a content post, A for an artwork request. */
export type WorkKind = "C" | "A";

const seqOf = (code: string, parent: string, kind: WorkKind): number => {
  if (!code.startsWith(`${parent}-${kind}`)) return 0;
  const rest = code.slice(parent.length + 2);
  // Must be the LAST segment: "…-C01-A01" is not a C-child of "…", it is an
  // A-child of "…-C01", and counting it as both would double-issue numbers.
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : 0;
};

/** `parent-C07` / `parent-A02` — the next free number under one parent. */
export function nextWorkCode(parent: string, kind: WorkKind, existing: readonly (string | undefined)[]): string {
  const max = existing.reduce<number>((m, c) => Math.max(m, c ? seqOf(c, parent, kind) : 0), 0);
  return `${parent}-${kind}${String(max + 1).padStart(2, "0")}`;
}

/** The code an artwork should hang off: its post's code when it has one, else
 *  the campaign's. Returns undefined when neither is known — an artwork on a
 *  campaign with no code cannot be numbered, and inventing a parent would put
 *  it under a campaign it may not belong to. */
export function artworkParent(postCode?: string, campaignCode?: string): string | undefined {
  return postCode || campaignCode || undefined;
}

/** Split a work code back into its parts, for display and for search.
 *  Returns null for anything that is not one of ours. */
export function parseWorkCode(code: string): { campaign: string; content?: string; artwork?: string } | null {
  const m = /^([A-Z]{3}_\d{4}_\d{3})(?:-C(\d+))?(?:-A(\d+))?$/.exec(code ?? "");
  if (!m || (!m[2] && !m[3] && code.length !== m[1].length)) return null;
  return { campaign: m[1], content: m[2], artwork: m[3] };
}
