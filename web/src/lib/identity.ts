/** Who counts as "me".
 *
 *  Every person filter in the app compared one string to another — usually the
 *  member's name against a row's `assignee` / `requester`. It works right up
 *  until the same person is written down two ways, and then it fails silently:
 *  one manager's work was filed as "Pupay", "Orapan" and
 *  "orapan.ch@teppenthailand.co.th", so her My Tasks showed 9 of 27 items and
 *  the other 18 belonged, as far as the app was concerned, to nobody.
 *
 *  Nothing announced this. The list was not empty, so it looked like her list.
 *
 *  So identity is a SET of strings, not one: name, email, and the email's
 *  local part — which is what most of these stray values turn out to be.
 *  Matching stays exact within that set (no fuzzy matching: "Ken S." and
 *  "Ken T." are two people, and guessing there is worse than missing a row). */

export interface PersonRef { name?: string | null; email?: string | null }

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();
const localPart = (v: string) => (v.includes("@") ? v.split("@")[0] : "");

/** Every string that means this person. */
export function personKeys(...refs: (PersonRef | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const ref of refs) {
    for (const raw of [ref?.name, ref?.email]) {
      const k = norm(raw);
      if (!k) continue;
      out.add(k);
      const lp = localPart(k);
      if (lp) out.add(lp);
    }
  }
  return out;
}

/** Does `value` name the person these keys describe? */
export function isSamePerson(value: string | null | undefined, keys: Set<string>): boolean {
  const v = norm(value);
  if (!v || keys.size === 0) return false;
  if (keys.has(v)) return true;
  const lp = localPart(v);
  return !!lp && keys.has(lp);
}

/** Two raw values, no member row in hand — used where the app compares one
 *  stored name to another (a submitter against a reviewer, say). */
export function sameName(a?: string | null, b?: string | null): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return localPart(x) === y || x === localPart(y);
}
