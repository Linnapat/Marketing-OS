// Recognising work that already exists, when the two sides were never
// introduced.
//
// A campaign's approval fans out one post and one graphic request per content
// item, and it knows what it made before by `sourceContentItemId` — the brief
// item's own id, stamped on everything it creates. That is exact and it is
// enough, right up until the work was NOT made by the fan-out.
//
// Which is the normal case here. Somebody raises a Graphic Brief by hand
// ("+ Send Brief") for a shoot that is already happening; the form mints a post
// for it, and that post has no brief item behind it to be stamped with. Weeks
// later the planner writes the same piece into the campaign brief and it gets
// approved — and the fan-out, finding no stamp it recognises, makes a second
// post and a second request for a job already halfway done. Four of them, on
// one campaign, is what sent this file into existence.
//
// So: match on what the two sides actually share. The planner types the same
// title both times, because it is the same piece of content — and inside a
// single campaign an exact title match is a strong claim, not a guess.

/** Case- and spacing-insensitive, because "TO10_YOUR DREAM " typed twice is one
 *  title, and nobody should lose a match to a trailing space. */
const normTitle = (s?: string | null) =>
  (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export interface AdoptablePost {
  id: string;
  title?: string;
  /** Set = the fan-out made this post. Absent = raised by hand. */
  sourceContentItemId?: string;
}

/** The existing post a brief content item should take over rather than
 *  duplicate, or null when there is nothing to take over.
 *
 *  Deliberately narrow, because the cost of a wrong match (two real pieces
 *  silently merged into one) is worse than the cost of a miss (a duplicate
 *  somebody deletes):
 *
 *   - only posts with NO sourceContentItemId are adoptable. One that has one
 *     already belongs to another brief item, and taking it would move work
 *     from one piece of content to another.
 *   - the title has to match exactly once. Two posts sharing a title is an
 *     ambiguity this function has no way to resolve, so it resolves nothing
 *     and lets the duplicate happen — visible, and fixable by a human.
 *   - an item with no title matches nothing. Empty string is not a name.
 *
 *  `posts` is expected to be one campaign's posts. Titles repeat across
 *  campaigns constantly ("Ads Branding — Reel"); matching without that scope
 *  would pull work in from a campaign that has nothing to do with this one. */
export function adoptablePostFor(
  item: { title?: string },
  posts: AdoptablePost[],
): AdoptablePost | null {
  const want = normTitle(item.title);
  if (!want) return null;
  const hits = posts.filter((p) => !p.sourceContentItemId && normTitle(p.title) === want);
  return hits.length === 1 ? hits[0] : null;
}

export interface LinkedGraphic {
  id: string | number;
  sourceContentItemId?: string;
  /** The post this request serves, when it was linked from the post side. */
  contentPostId?: string;
}

/** Which brief content item each existing request already serves.
 *
 *  The direct answer is `sourceContentItemId`. The second half is the one that
 *  was missing: a request raised by hand carries only `contentPostId`, so it
 *  was invisible to a fan-out that read the stamp and nothing else — and
 *  invisible is exactly how you end up making it twice. Reading through the
 *  post it points at closes that, once the post itself has been adopted.
 *
 *  First writer wins on a collision: a request that names the item outright is
 *  a better answer than one inferred through a post. */
export function graphicsBySourceItem(
  graphics: LinkedGraphic[],
  posts: AdoptablePost[],
): Map<string, string | number> {
  const out = new Map<string, string | number>();
  const itemOfPost = new Map<string, string>();
  for (const p of posts) if (p.sourceContentItemId) itemOfPost.set(String(p.id), p.sourceContentItemId);

  for (const g of graphics) if (g.sourceContentItemId && !out.has(g.sourceContentItemId)) out.set(g.sourceContentItemId, g.id);
  for (const g of graphics) {
    if (g.sourceContentItemId || !g.contentPostId) continue;
    const item = itemOfPost.get(String(g.contentPostId));
    if (item && !out.has(item)) out.set(item, g.id);
  }
  return out;
}
