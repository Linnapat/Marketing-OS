/* Accounts that exist to test the system, not to do the work.
 *
 * "QA Test Marketing" is an active member with a Creative role, so every
 * assign picker offered it alongside the real designers — and five graphic
 * requests ended up assigned to it (three still in progress on 22 Nov 2026),
 * which is work sitting with nobody. Test accounts stay signed-in-able and keep
 * whatever they already hold; they are just not offered as someone to hand new
 * work to.
 *
 * Matched on the name the team gave it. One rule in one place, so the pickers
 * and the filters cannot disagree about who counts. */
export function isTestAccount(m: { name?: string | null; email?: string | null }): boolean {
  const name = (m.name ?? "").trim();
  return /^qa[\s._-]*test\b/i.test(name) || /^test[\s._-]*account\b/i.test(name);
}
