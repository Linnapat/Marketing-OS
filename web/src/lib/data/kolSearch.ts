/* Searching the KOL Library by a pasted profile URL.
 *
 * Creator names in this library are written in Thai, in English, or in both —
 * "บีกัน", "melaqo_ โอเปอล", "เด็กชายกินไม่กินผัก" — so typing a name only finds
 * the profile when you happen to spell it the way whoever imported it did. The
 * thing that IS unambiguous is the link: everyone already has the profile open
 * in another tab when they go looking.
 *
 * Pure so the parsing is testable without a database — see
 * scripts/test-kol-search.ts. */

/** What a search box entry actually asks for. */
export interface KolSearchNeedle {
  /** Match against display_name. Empty when the query is a bare URL whose
   *  handle we could not read — searching names for "https" finds nothing and
   *  would otherwise hide the URL match behind an empty result. */
  text: string;
  /** The @handle, with no leading "@". Matched against names AND channel URLs. */
  handle: string;
  /** The URL itself, normalised for a substring match against handle_url. */
  url: string;
}

/** Strip the parts of a URL that differ between two links to the same profile:
 *  scheme, www., a trailing slash, the query string and the fragment.
 *
 *  instagram.com/orn.thetable/?hl=th and https://www.instagram.com/orn.thetable
 *  are the same page, and a stored link almost never matches the one a person
 *  copies out of their browser. */
export function normaliseProfileUrl(raw: string): string {
  return (raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)|\.(com|net|org|app|co|me|tv)(\/|$)/i;

/** Segments that are part of the platform's own routing, never the handle. */
const NOT_A_HANDLE = new Set([
  "reels", "reel", "video", "p", "posts", "post", "profile.php", "share",
  "shorts", "watch", "channel", "user", "stories", "tv", "explore", "pages",
]);

/** Read the handle out of a profile URL.
 *
 *  Walks the path from the end and takes the last segment that is not a
 *  platform routing word or a bare number — instagram.com/name/reels/ and
 *  tiktok.com/@name/video/12345 both carry the handle in the middle, so taking
 *  the last segment finds "reels" and "12345" instead of the creator. */
export function handleFromUrl(raw: string): string {
  const clean = normaliseProfileUrl(raw);
  if (!clean) return "";
  const segments = clean.split("/").slice(1).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].replace(/^@/, "");
    if (!seg || NOT_A_HANDLE.has(segments[i].toLowerCase()) || /^\d+$/.test(seg)) continue;
    return seg;
  }
  return "";
}

/** Turn whatever is in the search box into the things worth matching on. */
export function kolSearchNeedle(query: string): KolSearchNeedle {
  const q = (query || "").trim();
  if (!q) return { text: "", handle: "", url: "" };
  if (LOOKS_LIKE_URL.test(q)) {
    const url = normaliseProfileUrl(q);
    const handle = handleFromUrl(q);
    // The handle stands in for the name: a lot of these creators are stored
    // under the same word their URL uses.
    return { text: handle, handle, url };
  }
  // A bare "@handle" is not a URL but is not a name either — it should reach
  // the channel links as well, which is where handles are actually stored.
  if (q.startsWith("@")) {
    const handle = q.slice(1).trim();
    return { text: handle, handle, url: "" };
  }
  return { text: q, handle: "", url: "" };
}
