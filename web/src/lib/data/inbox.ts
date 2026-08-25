/* Grouping the inbox by the job it is about.
 *
 * The bell is a flat list of events, newest first, which answers "what
 * happened" and not "what am I in the middle of". Four notifications about one
 * Reel read as four separate interruptions, and the reply you owe someone is
 * three rows below the notice that you owe it — so the conversation itself was
 * only ever visible one message at a time.
 *
 * These threads are derived from the rows the bell already has: no second
 * fetch, and nothing to keep in sync. A job earns a thread when somebody has
 * actually said something on it (a `comment` row); the other events on the same
 * job ride along as context rather than starting threads of their own, because
 * "your piece came back" is a notice, not a conversation.
 */

/** The shape the bell's rows already have. Structural on purpose — the pure
 *  grouping must not import the client/supabase module the type lives in. */
export interface InboxItem {
  id: number;
  event: string;
  title: string;
  detail?: string | null;
  link?: string | null;
  actor?: string | null;
  createdAt: string;
  readAt?: string | null;
}

export interface InboxThread {
  /** Stable key — the deep link when there is one, else the cleaned title. */
  key: string;
  title: string;
  link: string | null;
  /** Messages said on this job, in the window the bell holds. */
  messages: number;
  /** Other events on the same job (sent back, waiting review, assigned…). */
  notices: number;
  unread: number;
  /** Ids in the thread, so "read" can be applied to the whole thing at once. */
  ids: number[];
  lastAt: string;
  /** Who spoke last. Parsed from "Name: what they said" when the detail carries
   *  it — the message notification writes the speaker there, and the `actor`
   *  column is left null by the API route that inserts these rows. */
  lastBy: string | null;
  lastText: string;
}

/** The job's own name, without the notification's framing.
 *
 *  Titles arrive as "💬 Kani Last Chance — Reel" from the thread and as
 *  "รอตรวจอีกหนึ่งด้าน: Kani Last Chance — Reel" from the review notices. Both
 *  name the same job, and a grouping that cannot see that shows it twice. */
export function jobTitleOf(raw: string): string {
  const noIcon = (raw ?? "").replace(/^[^\p{L}\p{N}#[]+/u, "").trim();
  const cut = noIcon.indexOf(": ");
  const after = cut >= 0 ? noIcon.slice(cut + 2).trim() : "";
  return after.length >= 3 ? after : noIcon;
}

/** Speaker and words, from a "Name: what they said" detail line. */
export function splitSaid(detail?: string | null): { by: string | null; text: string } {
  const said = (detail ?? "").trim();
  const cut = said.indexOf(": ");
  if (cut <= 0 || cut > 40) return { by: null, text: said };
  return { by: said.slice(0, cut).trim(), text: said.slice(cut + 2).trim() };
}

/** Jobs with a conversation on them, most recently spoken on first. */
export function conversationThreads(items: InboxItem[]): InboxThread[] {
  const byKey = new Map<string, InboxThread>();
  // Oldest first, so the last write wins and "last message" needs no compare.
  const ordered = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const n of ordered) {
    const title = jobTitleOf(n.title);
    const link = (n.link ?? "").trim() || null;
    const key = link ?? title.toLowerCase();
    if (!key) continue;
    const isMessage = n.event === "comment";
    const thread = byKey.get(key) ?? {
      key, title, link, messages: 0, notices: 0, unread: 0, ids: [],
      lastAt: n.createdAt, lastBy: null, lastText: "",
    };
    thread.ids.push(n.id);
    if (!n.readAt) thread.unread++;
    if (isMessage) {
      const { by, text } = splitSaid(n.detail);
      thread.messages++;
      // A message names the job plainly; a notice frames it. Prefer the plain
      // one so the row is headed the way the job is actually called.
      thread.title = title;
      thread.lastAt = n.createdAt;
      thread.lastBy = by ?? n.actor ?? null;
      thread.lastText = text;
    } else {
      thread.notices++;
      if (!thread.messages) {
        thread.lastAt = n.createdAt;
        thread.lastText = (n.detail ?? "").trim();
        thread.lastBy = n.actor ?? null;
      }
    }
    byKey.set(key, thread);
  }
  return [...byKey.values()]
    .filter((t) => t.messages > 0)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Where a thread row goes. Rows written before the conversation link existed
 *  point at the job's summary; sending them to the tab the message is actually
 *  on costs one query param and saves the hunt. */
export function threadHref(link: string | null): string | null {
  if (!link) return null;
  if (!link.startsWith("/graphic?") || /[?&]tab=/.test(link)) return link;
  return `${link}&tab=feedback`;
}
