// The row version a campaign brief was loaded at, so a save can tell whether
// anybody else has written to the row since. Kept out of CampaignBrief itself:
// it belongs to the ROW, not to the plan, and putting it in the blob would mean
// the version travels inside the thing it is versioning.
//
// Its own module rather than a private map inside db/brief, because the version
// is only correct if EVERY writer of a campaigns row keeps it current — and the
// writers live in db/campaigns too, which db/brief already imports. Sharing it
// through here is what lets both sides adopt the version their own write
// produced, instead of leaving a marker that points at the row as it was before
// they touched it.
//
// That gap is not hypothetical. logBriefApproval wrote status + approval log
// straight onto the row, the updated_at trigger moved the row on, and the marker
// stayed where it was — so the saveCampaignBrief that runs immediately after it
// (the fan-out that turns an approved plan into posts, graphic requests and
// tasks) saw a version that no longer matched and refused as a conflict. Every
// campaign approved after campaign_concurrency.sql went live on 2026-07-29
// materialised nothing; TPN_2609_006 sat approved with 7 planned items and 0
// posts, reported as "คอนเทนท์กลับมาแล้วแต่กดเข้าไปสร้างไม่ได้".

const briefVersions = new Map<string, string>();

/** Remember the version a brief was read at. */
export function noteBriefVersion(id: string, updatedAt?: string | null): void {
  if (id && updatedAt) briefVersions.set(id, updatedAt);
}

/** Forget it — after a successful save, or when abandoning an edit. */
export function forgetBriefVersion(id: string): void { briefVersions.delete(id); }

/** The version this session last saw, if any. */
export function briefVersionOf(id: string): string | undefined { return briefVersions.get(id); }

/** Adopt the version OUR OWN write just produced.
 *
 *  A write we made is not a conflict, so the marker has to follow it. Callers
 *  pass the rows returned by `.select("id, updated_at")` on their update; when a
 *  writer cannot select the row back the marker is dropped instead of left
 *  stale, so the next save is unconditional rather than certain to fail. */
export function adoptBriefVersion(id: string, rows?: { updated_at?: string | null }[] | null): void {
  const next = rows?.[0]?.updated_at;
  if (next) briefVersions.set(id, next);
  else forgetBriefVersion(id);
}
