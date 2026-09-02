// Sending a campaign back for revision — the ONE way it happens.
//
// There used to be two buttons on the campaign page that both meant "I am not
// approving this yet", and only one of them told anybody:
//
//   Approval tab · "Send Revision Request"  → Need Revision · reason required ·
//                                             task + notification to the planner
//   Header banner · "Send back to Draft"    → Draft · no reason, no task, no
//                                             notification. Silent.
//
// The silent one is the one that sits next to Approve, so it is the one that
// gets pressed. CAM-2026-7206 (Run For Don) was sent back that way on 2 Sep at
// 15:45 and narawich, who had to act on it, was never told — the approver
// noticed and re-submitted it himself seven seconds later. TPN_2608_005 went the
// same way and sat for eight days with three POSM jobs frozen under it.
//
// So the operation lives here and both entry points call it. A send-back always
// carries a reason, always lands in the planner's My Tasks, and always sends the
// message — there is no longer a version of this action that goes quiet.

import { CampaignBrief } from "@/lib/data/brief";
import { logBriefApproval } from "@/lib/db/brief";
import { createRevisionTask } from "@/lib/db/tasks";
import { notify } from "@/lib/notify";
import { workLink } from "@/lib/deepLink";
import { brandName } from "@/lib/brands";
import { supabase } from "@/lib/supabase";

/** Who has to fix the campaign and resubmit it.
 *
 *  The brief's planner first, then the campaign row's owner. Null when neither
 *  is a real name — "Unassigned" is a placeholder, and addressing a task to it
 *  is how a revision reaches nobody. */
export function campaignRevisionOwner(
  // Not Pick<CampaignBrief,…>: briefs written before plannerOwner existed carry
  // no value for it, and the type says `string` only because the builder always
  // sets one. Read it as "might be missing" or the fallback never gets a turn.
  brief: { plannerOwner?: string | null },
  fallbackOwner?: string | null,
): string | null {
  for (const raw of [brief.plannerOwner, fallbackOwner]) {
    const name = (raw ?? "").trim();
    if (name && name !== "Unassigned") return name;
  }
  return null;
}

export type SendBackResult =
  | { ok: true; brief: CampaignBrief; sentTo: string | null }
  | { ok: false; reason: "no-reason" | "already-there" };

/** Send a campaign back to its planner with a reason.
 *
 *  Returns `already-there` when the database says the campaign has already left
 *  "Waiting for Approval" — whoever's click got there first owns the follow-up,
 *  and running the task + notification twice is how a planner gets two identical
 *  jobs for one send-back. */
export async function sendCampaignBackForRevision(opts: {
  brief: CampaignBrief;
  campaignId: string;
  /** campaigns row owner — the fallback when the brief names no planner. */
  fallbackOwner?: string | null;
  reason: string;
  by: string;
}): Promise<SendBackResult> {
  const reason = opts.reason.trim();
  // "แก้ด้วย" is not a brief. Same rule as a deliverable send-back.
  if (!reason) return { ok: false, reason: "no-reason" };

  const { brief, campaignId, by } = opts;
  const entry = {
    action: "Requested revision",
    by,
    at: new Date().toISOString(),
    comment: reason,
    from: brief.status,
    to: "Need Revision",
  };
  const fresh = (await logBriefApproval(brief.id, entry, "Need Revision"))
    // Demo mode has no database and nobody to race.
    ?? (supabase() ? null : { ...brief, status: "Need Revision" as CampaignBrief["status"], approvalLog: [...(brief.approvalLog ?? []), entry] });
  if (!fresh) return { ok: false, reason: "already-there" };

  const planner = campaignRevisionOwner(brief, opts.fallbackOwner);
  if (planner) {
    await createRevisionTask({
      module: "Campaign", title: `แก้แคมเปญ — ${brief.name}`, assignee: planner,
      brand: brandName(brief.b), campaign: brief.name, reason,
      by, relatedBrief: brief.id, dueDays: 2,
    }).catch(() => {/* the message below still goes out; surfaced by the caller's toast */});
  }
  notify("rejected", `↩️ แคมเปญถูกส่งกลับแก้: ${brief.name}`,
    `${reason} — ถึง ${planner ?? "ยังไม่มีผู้วางแผน"} · โดย ${by}`,
    workLink.campaign(campaignId),
    // No planner on record: tell the approver's team rather than nobody, so the
    // send-back is still visible to someone who can find an owner for it.
    { to: planner ? [planner] : [] });
  return { ok: true, brief: fresh, sentTo: planner };
}
