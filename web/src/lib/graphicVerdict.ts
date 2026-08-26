"use client";

// Recording one lens verdict on one piece of artwork — the whole write, in one
// place.
//
// It lived inside DeliverablesEditor, which was fine while the drawer was the
// only screen with the buttons on it. Approval Center now signs pieces off from
// a list row without opening anything, and a verdict is not a one-line write:
// it recomputes the request's stage, pushes approved links onto the linked
// content post and into the Asset Library, raises the revision task for
// whoever submitted the piece, and tells the right people once — when the round
// ENDS, not on each half of it.
//
// Two copies of that would drift on the first change, and the drift would be
// silent: artwork approved from one screen filed into the Asset Library and
// artwork approved from the other one not. So both call this.

import {
  Graphic, GraphicDeliverable, ReviewLens, LENS_META,
  applyLensVerdict, deliverableProgress, stageFromDeliverables, assignedBy,
  reviewProgress, feedbackOwners, revisionTaskTitle,
  storyboardAuthor,
} from "@/lib/data/graphic";
import { updateGraphic, syncApprovedAssetsToContent } from "@/lib/db/graphic";
import { fileApprovedAsset } from "@/lib/db/assets";
import { createRevisionTask } from "@/lib/db/tasks";
import { graphicTeam } from "@/lib/notifyRouting";
import { notify } from "@/lib/notify";
import { workLink } from "@/lib/deepLink";
import { brandName } from "@/lib/brands";
import { toastError } from "@/lib/toast";

/** Save a request whose deliverables just changed, and carry out everything
 *  that becoming "ready" implies.
 *
 *  `announce: false` still syncs the links outward — a relocated file has to
 *  reach the Content post and the Asset Library, or those two keep pointing at
 *  the folder the artwork just left — but skips the "approved everything"
 *  message. Nothing was approved; a file was filed, and re-announcing a
 *  sign-off that happened last week is how a channel stops being read. */
export function persistGraphicDeliverables(
  base: Graphic,
  { previous, announce = true, onUpdate }: { previous: Graphic; announce?: boolean; onUpdate?: (g: Graphic) => void },
): Graphic {
  const ng: Graphic = { ...base };
  const ready = deliverableProgress(ng).ready;
  ng.stage = stageFromDeliverables(ng);
  ng.blocker = ready ? null : previous.blocker;
  ng.nextAction = ready ? "Ready to deploy — attached to Content Calendar" : previous.nextAction;
  updateGraphic(ng)
    .then(() => onUpdate?.(ng))
    .catch((error) => toastError(`บันทึกงาน Graphic ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  // Fully approved → push approved asset links onto the linked content post.
  if (ready) {
    syncApprovedAssetsToContent(ng).catch((error) => toastError(`อนุมัติครบแล้ว แต่ sync asset เข้า Content Calendar ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    // …and into the Asset Library. Separate from the Content sync on purpose:
    // POSM, posters and menu artwork serve no post, so that sync returns early
    // for them and they used to finish nowhere.
    void fileApprovedAsset(ng);
    if (announce) {
      notify("approved", `✅ งานกราฟฟิกอนุมัติครบทุกชิ้น: ${previous.title}`, "แนบ asset เข้า Content Calendar ให้แล้ว — พร้อม publish",
        ng.contentPostId ? workLink.post(ng.contentPostId) : workLink.graphic(ng.id), { team: graphicTeam(previous) });
    }
  }
  return ng;
}

/** One lens's verdict. The rule — both checks in, by two different people,
 *  before anything is Approved — lives in applyLensVerdict, so no caller can
 *  answer it differently. Returns the updated request, or null when the verdict
 *  was refused (already given, or not this person's to give).
 *
 *  Callers pass the deliverables they are holding: the drawer edits a local
 *  copy before saving, and handing `g.deliverables` in from a list would throw
 *  that away. */
export function giveLensVerdict({ g, deliverables, index, lens, verdict, me, note, creativeLeader, productionOwners, onUpdate }: {
  g: Graphic;
  deliverables: GraphicDeliverable[];
  index: number;
  lens: ReviewLens;
  verdict: "pass" | "revise";
  me: string;
  note?: string;
  /** Resolved by NAME, because a notification cannot be sent to a role — the
   *  person who owes the Visual CI verdict has to be someone. Blank is
   *  tolerated (the notice still reaches the designer and requester), but a
   *  caller that can resolve it should. */
  creativeLeader?: string;
  /** People who could take the piece when the request names nobody — see
   *  feedbackOwners. Without it an unassigned job's revision reaches only the
   *  requester, and nobody at all when the requester is the one who wrote it. */
  productionOwners?: string[];
  onUpdate?: (g: Graphic) => void;
}): Graphic | null {
  const before = deliverables[index];
  const ng = applyLensVerdict({ ...g, deliverables }, index, lens, verdict, me, note);
  if (!ng) return null;
  const after = ng.deliverables![index];
  const saved = persistGraphicDeliverables(ng, { previous: g, onUpdate });

  // Told only when the round actually ends, not on each verdict: half a review
  // is not news the designer can act on, and pinging them twice per piece is
  // how people start ignoring the channel.
  if (after.status === "Revision" && before.status !== "Revision") {
    // review is cleared once the round settles, so the notes are read back out
    // of feedback — every entry stamped in this round, both lenses.
    const lastAt = after.feedback.at(-1)?.at;
    const said = after.feedback.filter((f) => f.at === lastAt).map((f) => `[${LENS_META[f.lens ?? "info"].short}] ${f.reason}`).join(" · ");
    // The person who submitted this piece, or — when the request names nobody
    // — whoever could pick it up. See feedbackOwners.
    const owners = feedbackOwners(g, before, { pool: productionOwners, creativeLeader });
    const owner = owners[0] ?? null;
    if (owner) {
      createRevisionTask({
        module: "Graphic", title: revisionTaskTitle(g, before.platform), assignee: owner,
        brand: brandName(g.b), campaign: g.campaign, reason: said, by: me, relatedGraphicId: String(g.id),
      }).catch((error) => toastError(`สร้าง task แก้ Graphic ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    notify("rejected", `✏️ งานกราฟฟิกถูกส่งกลับแก้: ${g.title}`, `${before.platform} — ${said} · ถึง ${owner ?? "Creative"} · โดย ${me}`,
      // The requester and whoever assigned the job hear about it too, in the
      // bell rather than as a DM: the requester used to learn their artwork had
      // gone back by opening the drawer and noticing, and the Creative Leader
      // juggling the queue never learned at all. Neither has to act on it, so
      // neither gets interrupted.
      workLink.graphic(g.id), { team: graphicTeam(g), to: owners, inform: [g.requester, assignedBy(g)] });
  } else {
    // Half a review told NOBODY anything, and that is where pieces went to sit.
    // A designer heard "มีแก้กลับไปนะคะ" in Slack, opened the request, found
    // feedback and no box to submit into, and no way to tell that the other
    // lens simply had not answered yet. Meanwhile the reviewer who owed that
    // verdict was never asked for it.
    //
    // The batching stays — a designer still gets one combined list rather than
    // two rounds of exporting (see statusFromReview). What changes is that the
    // wait is now addressed to someone: the outstanding reviewer is asked, and
    // the people watching the piece can see why it has not moved.
    const waiting = reviewProgress(after).pending[0];
    if (waiting) {
      const owes = waiting === "ci" ? [creativeLeader] : [g.requester];
      const verdictWord = verdict === "revise" ? "ขอให้แก้" : "ผ่าน";
      notify("feedback", `👀 รอตรวจอีกหนึ่งด้าน: ${g.title}`,
        `${before.platform} — [${LENS_META[lens].short}] ${verdictWord} โดย ${me} · รอ [${LENS_META[waiting].short}] ${LENS_META[waiting].owner} ตรวจ แล้วชิ้นนี้ถึงจะขยับ`,
        workLink.graphic(g.id),
        // The reviewer who owes it is the one who has to act, so they are the
        // one interrupted. The designer and the requester get it in the bell:
        // there is nothing for them to do until the round closes, but "a
        // revision is coming" beats hearing it from a colleague on Slack.
        { team: graphicTeam(g), to: owes.filter(Boolean) as string[],
          inform: [...feedbackOwners(g, before, { pool: productionOwners, creativeLeader }), g.requester] });
    }
  }
  return saved;
}

/** Accept a storyboard, or send it back with a reason.
 *
 *  Lives beside the lens verdict for the same reason: Approval Center decides
 *  storyboards from a list row, the drawer decides them from the production
 *  panel, and the decision is not just a status — it rewrites nextAction (a
 *  storyboard that passed means "start shooting", one sent back means "Creative
 *  Content fixes it"), and it tells the person who DREW it, who is the one this
 *  decision is actually about.
 *
 *  Returns the saved request, or null when refused — a send-back with a reason
 *  shorter than five characters is not a reason, and "no" was the whole message
 *  the author used to get. */
export function decideStoryboard({ g, approved, by, note = "", onUpdate }: {
  g: Graphic;
  approved: boolean;
  by: string;
  note?: string;
  onUpdate?: (g: Graphic) => void;
}): Graphic | null {
  if (!approved && note.trim().length < 5) {
    toastError("เขียนเหตุผลที่ส่งกลับแก้อย่างน้อย 5 ตัวอักษร");
    return null;
  }
  const at = new Date().toISOString();
  const next: Graphic = {
    ...g,
    storyboardStatus: approved ? "Approved" : "Revision",
    storyboardDecidedBy: by, storyboardDecidedAt: at,
    storyboardNote: approved ? "" : note.trim(),
    nextAction: approved ? "storyboard ผ่านแล้ว — เริ่มถ่าย/ผลิตงานได้" : "Creative Content แก้ storyboard แล้วส่งใหม่",
  };
  updateGraphic(next)
    .then(() => onUpdate?.(next))
    .catch((error) => toastError(`บันทึกผล storyboard ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  // The person who drew it is the one this decision is about — approved means
  // they can stop waiting, sent back means they have work to do. It went to the
  // room only, so the author learned either way by opening the drawer.
  notify(approved ? "approved" : "rejected", `${approved ? "✅ อนุมัติ" : "✏️ ส่งกลับแก้"} storyboard: ${g.title}`,
    approved ? `โดย ${by} — เริ่มถ่าย/ผลิตงานได้` : `${note.trim()} · โดย ${by}`,
    workLink.graphic(g.id), { team: graphicTeam(g), to: [storyboardAuthor(g)] });
  return next;
}
