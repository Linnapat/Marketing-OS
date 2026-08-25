"use client";

// Recording a caption verdict — the whole write, in one place.
//
// Same lesson as lib/graphicVerdict. It lived inside ContentDrawer, which was
// fine while the drawer was the only screen with the buttons on it. Approval
// Center now signs captions off from a list row without opening the post, and a
// verdict is not a one-line write: it saves the post, pulls it back out of
// Waiting Approval when the caption goes back for revision, raises the revision
// task for the writer, and routes the notification to PEOPLE rather than a room.
//
// That last part is the one that would break quietly. See CAPTION_NOTIFY_TEAM.

import {
  ContentItem, applyCaptionDecision, captionOwner,
} from "@/lib/data/content";
import { updateContent } from "@/lib/db/content";
import { createRevisionTask } from "@/lib/db/tasks";
import { notify } from "@/lib/notify";
import type { NotifyTeam } from "@/lib/notifyRouting";
import { workLink } from "@/lib/deepLink";
import { brandName } from "@/lib/brands";
import { toastError, toastSuccess } from "@/lib/toast";

/** Where caption sign-off is allowed to go: to people, never to a room.
 *
 *  These notifications used to carry no `team`, so they were routed off their
 *  link — /content resolves to the Graphic team, which has a room. And the
 *  approval named nobody to DM (the writer is `inform`, a bell entry by
 *  design), so the route's "nobody to DM → tell the room instead" fallback sent
 *  every single one to #05_marketing_graphic. Approving ten captions in a
 *  sitting posted ten messages, which is what the team saw on 5 Aug 2026 at
 *  14:01 and asked to stop: "ในส่วนของ Caption อนุมัติ ยังไม่ต้องส่งเข้า Slack".
 *
 *  "general" is the app's DM-only audience (notifyRouting.CHANNEL_TEAMS), so
 *  this holds even when nobody resolves to DM — a room post cannot happen by
 *  accident again. The writer still gets the bell, the DM and the revision
 *  task; only the channel goes quiet.
 *
 *  Named rather than inlined because it is meant to be reversible: "ยังไม่ต้อง"
 *  is not "never", and putting captions back in a room is one edit here. */
export const CAPTION_NOTIFY_TEAM: NotifyTeam = "general";

/** Approve a caption, or send it back with a reason.
 *
 *  Returns the saved post, or null when nothing happened — the caption was not
 *  waiting (a second click on a row that already went through), a send-back
 *  carried no reason, or the write failed. Callers refresh from the returned
 *  post rather than assuming; the row leaves the queue on its own once the
 *  page's copy updates. */
export async function decideCaption({ item, decision, by, reason = "", onUpdate }: {
  item: ContentItem;
  decision: "approve" | "revise";
  by: string;
  reason?: string;
  onUpdate?: (c: ContentItem) => void;
}): Promise<ContentItem | null> {
  const next = applyCaptionDecision(item, decision, by, reason);
  // applyCaptionDecision returns the input unchanged when there is nothing to
  // do, which is also how a double-click is refused.
  if (next === item) {
    if (decision === "revise") toastError("เขียนเหตุผลที่ส่งกลับแก้ก่อน");
    return null;
  }
  try {
    await updateContent(next);
  } catch (error) {
    toastError(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    return null;
  }
  onUpdate?.(next);
  toastSuccess(decision === "approve" ? "อนุมัติ caption แล้ว" : "ส่ง caption กลับไปแก้แล้ว");

  // captionOwner, not item.owner: on a post still marked "Unassigned" the
  // planner IS the writer, and the raw field names nobody.
  const writer = captionOwner(item);
  if (decision === "approve") {
    notify("approved", `✅ อนุมัติ caption: ${item.title}`, `${brandName(item.b)} · ${item.campaign} · โดย ${by}`,
      workLink.post(item.id), { team: CAPTION_NOTIFY_TEAM, inform: writer ? [writer] : [] });
    return next;
  }
  // The writer is the one who has to act, so this is a DM, not a bell entry.
  // Still DM-only even when the post has no writer yet, which used to fall
  // through to the room — see CAPTION_NOTIFY_TEAM.
  notify("rejected", `✏️ caption ถูกส่งกลับแก้: ${item.title}`, `${reason.trim()} · โดย ${by}`,
    workLink.post(item.id), { team: CAPTION_NOTIFY_TEAM, to: writer ? [writer] : [] });
  if (writer) {
    createRevisionTask({
      module: "Content", title: `แก้ caption — ${item.title}`, assignee: writer,
      brand: brandName(item.b), campaign: item.campaign, reason: reason.trim(), by,
    }).catch(() => {});
  }
  return next;
}
