/* Text the database can actually store.
 *
 * Reported by Pupay, 26 Aug 2026: saving a Mainichi promotion failed with
 * "unsupported Unicode escape sequence" and no way past it — the promotion
 * simply could not be added.
 *
 * That message is Postgres's (SQLSTATE 22P05). PostgREST parses the request
 * body as JSON and casts each string to `text`, and Postgres `text` cannot hold
 * a NUL: one anywhere in the payload fails the whole write. Nothing in the app
 * puts one there — they arrive by paste. Copying a promotion out of Excel, a
 * PDF menu or a chat window brings NULs, other C0 control codes and (from emoji
 * mangled somewhere upstream) half-surrogates along with the words. None of
 * them are visible in the box, which is why it reads as "the button is broken".
 *
 * So the paste is cleaned rather than refused: the characters being dropped
 * carry no meaning a reader could see, and a form that rejects text somebody
 * can read on their own screen is not a form anyone can use.
 */

/** Characters `text` columns cannot hold. C0 controls except tab and newline
 *  (\r is normalised to \n before this runs), plus DEL. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** A high surrogate with no low one after it — half an emoji. */
const LONE_HIGH = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g;
/** A low surrogate with no high one before it — the other half. */
const LONE_LOW = /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Strip what `text` columns cannot hold, keeping every character a person can
 *  actually see.
 *
 *  Kept on purpose: newline and tab (real formatting in a promotion detail),
 *  and every emoji whose surrogate pair is intact. */
export function pgSafeText(value: string): string {
  return (value ?? "")
    // Windows line endings are normalised rather than dropped: they are line
    // breaks somebody typed, not junk.
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(LONE_HIGH, "")
    .replace(LONE_LOW, "");
}

/** Did cleaning remove anything a person could not see? For telling somebody
 *  their paste was tidied instead of doing it behind their back. */
export function hasUnstorableText(value: string): boolean {
  const normalised = (value ?? "").replace(/\r\n?/g, "\n");
  return pgSafeText(value) !== normalised;
}

/** The same clean, through a whole record.
 *
 *  Rows that keep a jsonb copy of their object (content posts, graphic
 *  requests) fail on a NUL in ANY field, not only the one being edited — so
 *  cleaning the blob has to be as deep as the blob is. Arrays and nested
 *  objects are walked; anything that is not a string is returned untouched. */
export function pgSafeDeep<T>(value: T): T {
  if (typeof value === "string") return pgSafeText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => pgSafeDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = pgSafeDeep(v);
    return out as unknown as T;
  }
  return value;
}
