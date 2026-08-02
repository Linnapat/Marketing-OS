// Where a notification points.
//
// Every Slack DM, channel post and email carries one "เปิดใน Marketing OS"
// link, and until now almost all of them pointed at a module's front page: a
// designer told their artwork came back opened a board of forty requests and
// had to find it by name. The message already knows which piece of work it is
// about — the link should too.
//
// One module, because a link and the page that has to honour it are two halves
// of the same decision. Kept apart, a renamed query param silently turns every
// notification back into a front-page link, and nothing fails loudly enough to
// notice.
//
// Only relative paths: /api/notify drops anything else (an absolute URL in a
// message under the bot's name is a ready-made phishing channel).

/** Query param each page reads to open one item. Owned here, not by each
 *  module, so nothing can import a link builder without the param that makes it
 *  work — and so this file stays free of module imports (data/graphic re-exports
 *  its own, which is where the callers already look for it). */
export const OPEN_PARAM = {
  graphic: "open",
  task: "task",
  post: "post",
  /** Which tab to land on, where a page has more than one. */
  tab: "tab",
} as const;

const q = (v: string | number) => encodeURIComponent(String(v));

/** The link for one piece of work. Anything not listed has no way to be opened
 *  on its own yet, and those call sites keep pointing at the module page —
 *  honestly, rather than inventing a param no page reads. */
export const workLink = {
  /** A graphic request, opened in its drawer. */
  graphic: (id: string | number) => `/graphic?${OPEN_PARAM.graphic}=${q(id)}`,
  /** A My Tasks card, opened in its drawer. */
  task: (id: string | number) => `/my-tasks?${OPEN_PARAM.task}=${q(id)}`,
  /** A content post, opened in its drawer on the Content Plan. */
  post: (id: string | number) => `/content?${OPEN_PARAM.post}=${q(id)}`,
  /** A campaign — a real page, so no param needed. `tab` lands on a section. */
  campaign: (id: string | number, tab?: string) => `/campaigns/${q(id)}${tab ? `?tab=${q(tab)}` : ""}`,
  /** A KOL profile — also a real page. */
  kol: (id: string | number) => `/kol/${q(id)}`,
  /** The approval queue itself. Used where the thing to act on has no page of
   *  its own to open (an expense request is a row in a table, not a record with
   *  a drawer) — landing on the queue that holds the Approve button still beats
   *  landing on someone's personal task board and asking them to find the tab. */
  approvals: () => `/my-tasks?${OPEN_PARAM.tab}=approval`,
};

/** What a page should do about an `?open=`-style param this render.
 *
 *  The timing is the whole problem: the list starts as the bundled demo seed,
 *  so "the list is not empty" says nothing about whether the real rows have
 *  arrived. Deciding before they have means telling someone their work does
 *  not exist a beat before it loads. Hence `loaded`, and hence a pure function
 *  — it can be replayed in order in a test, which an inline effect cannot.
 *
 *  `alreadyOpened` stops the drawer reopening every render (and reopening
 *  after the person closes it). */
export function resolveOpenTarget<T extends { id: string | number }>(
  openId: string | null,
  items: T[],
  loaded: boolean,
  alreadyOpened: boolean,
): { action: "idle" | "wait" | "open" | "missing"; item?: T } {
  if (!openId || alreadyOpened) return { action: "idle" };
  if (!loaded) return { action: "wait" };
  const found = items.find((i) => String(i.id) === String(openId));
  return found ? { action: "open", item: found } : { action: "missing" };
}
