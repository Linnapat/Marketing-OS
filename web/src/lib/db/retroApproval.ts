// The retro-approval queue: tier-A edits to already-approved campaigns, held
// for the CMO to clear in one weekly pass instead of one approval per edit.
//
// The rule this replaces (campaigns/new: `mustReapprove`) sent the campaign
// back to "Waiting for Approval" on ANY edit by a non-CMO, which stopped the
// fan-out and froze the team on a campaign that was already running. Here the
// campaign KEEPS its status — work carries on — and the change is recorded as
// something the CMO still owes an answer on.
//
// Nothing here needs a migration: the queue lives in the brief blob
// (campaigns.data.pendingApprovals), the same place the approval log already
// lives, so it inherits the brand-scoped RLS on campaigns for free.

import { supabase } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";
import { logAudit } from "@/lib/db/audit";
import { fetchCampaignBrief } from "@/lib/db/brief";
import { adoptBriefVersion, briefVersionOf } from "@/lib/db/briefVersion";
import { liveOnly, trashReady } from "@/lib/db/trash";
import { CampaignBrief, RetroApprovalEntry } from "@/lib/data/brief";
import { pendingEntriesOf } from "@/lib/data/retroApproval";
import { BrandId } from "@/lib/brands";

// Re-exported from here because callers reach for the queue, not for the two
// halves it is built from.
export { pendingEntriesOf, retroEntryFor } from "@/lib/data/retroApproval";

/** A campaign with at least one edit still waiting to be cleared. */
export interface RetroApprovalRow {
  campaignId: string;
  campaignName: string;
  code?: string;
  b: BrandId;
  status: string;
  entries: RetroApprovalEntry[];
}

/** Every campaign carrying outstanding entries.
 *
 *  Filtered in the database on the key existing at all, so the blobs of
 *  campaigns with a clean record are never pulled over the wire; the empty-array
 *  case is dropped here because PostgREST cannot measure a JSON array's length.
 *  Brand scoping is whatever RLS already gives this person. */
export async function fetchRetroApprovalQueue(): Promise<RetroApprovalRow[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await liveOnly(
    db.from("campaigns").select("id, name, brand, status, data").not("data->pendingApprovals", "is", null),
    await trashReady(),
  );
  if (error || !data) return [];
  const rows: RetroApprovalRow[] = [];
  for (const r of data as { id: string; name: string; brand: string; status: string; data: CampaignBrief }[]) {
    const entries = pendingEntriesOf(r.data ?? { pendingApprovals: [] });
    if (!entries.length) continue;
    rows.push({
      campaignId: r.id,
      campaignName: r.name,
      code: r.data?.code,
      b: (r.data?.b ?? r.brand) as BrandId,
      status: r.status,
      entries,
    });
  }
  // Oldest outstanding edit first: the queue is a debt, and the oldest debt is
  // the one that has been running unreviewed the longest.
  return rows.sort((a, b) => (a.entries[0]?.at ?? "").localeCompare(b.entries[0]?.at ?? ""));
}

export type RetroDecision = "acknowledged" | "rejected";

/** Clear entries off a campaign.
 *
 *  "acknowledged" is the weekly pass: the edits stand, the campaign is
 *  untouched, and the decision is written into the approval log.
 *
 *  "rejected" is the escape hatch for an edit that should not have happened.
 *  It cannot un-run the fan-out — posts and requests are already out there — so
 *  it does the only honest thing: sends the campaign to "Need Revision" so the
 *  planner has to come back and put it right, and says so in the log.
 *
 *  Status and blob move in ONE update. Writing the blob and the status column
 *  separately is what produced the campaign/brief drift that
 *  campaign_row_brief_drift_repair.sql had to clean up. */
export async function resolveRetroApprovals(
  campaignId: string,
  entryIds: string[],
  decision: RetroDecision,
  by: string,
  comment?: string,
): Promise<number> {
  const db = supabase();
  if (!db) return 0;
  // Reads the row AND remembers its version, so a concurrent edit is refused
  // rather than overwritten (db/briefVersion).
  const brief = await fetchCampaignBrief(campaignId);
  if (!brief) throw new Error("ไม่พบแคมเปญนี้ — อาจถูกลบไปแล้ว ลอง refresh หน้านี้");

  const wanted = new Set(entryIds);
  const pending = brief.pendingApprovals ?? [];
  const hit = pending.filter((e) => wanted.has(e.id));
  // Someone else cleared them first. Not an error: the queue is shared and the
  // outcome the caller wanted is already true.
  if (!hit.length) return 0;

  const at = new Date().toISOString();
  const summary = hit.flatMap((e) => e.changes).join(" · ");
  const action = decision === "acknowledged"
    ? `อนุมัติย้อนหลัง ${hit.length} รายการ`
    : `ตีกลับการแก้ไข ${hit.length} รายการ — ส่งกลับให้แก้`;
  const status = decision === "rejected" ? "Need Revision" : brief.status;

  const next: CampaignBrief = {
    ...brief,
    status: status as CampaignBrief["status"],
    pendingApprovals: pending.filter((e) => !wanted.has(e.id)),
    approvalLog: [
      ...(brief.approvalLog ?? []),
      { action, by: by || "CMO", at, comment: [summary, comment].filter(Boolean).join(" — "), from: brief.status, to: status },
    ],
  };

  const patch: Record<string, unknown> = { data: next };
  if (decision === "rejected") { patch.status = status; patch.next_approval = "None"; }

  let q = db.from("campaigns").update(patch).eq("id", campaignId);
  // Same optimistic guard persistBriefBlob uses; skipped when this session never
  // saw a version (a database without campaign_concurrency.sql).
  const seenAt = briefVersionOf(campaignId);
  if (seenAt) q = q.eq("updated_at", seenAt);
  const { data, error } = await q.select("id, updated_at");
  assertDbOk(error, "บันทึกผลอนุมัติย้อนหลังไม่สำเร็จ");
  if (!data?.length) throw new Error("มีคนแก้แคมเปญนี้อยู่พอดี — refresh แล้วกดใหม่อีกครั้ง");
  adoptBriefVersion(campaignId, data as { updated_at?: string }[]);

  logAudit(`Brief ${brief.name || campaignId}: ${action}`, "Campaign", {
    actorName: by, before: brief.status, after: status,
    meta: { campaignId, entries: hit.map((e) => e.id), decision, changes: summary },
  });
  return hit.length;
}
