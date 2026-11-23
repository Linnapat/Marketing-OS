/* Hold and delete, from the approval queue.
 *
 * A card in the queue offered two verdicts: pass, or ask for changes. Some work
 * deserves neither — the piece is beyond fixing, or the campaign it was for is
 * not happening — and with no third answer it simply sat there ("Kaisen Don Set
 * Series — Payday — Photo album": 33 days). Two more answers, for the people
 * who run the queue:
 *
 *   Hold    set aside with a reason; out of everyone's count; comes back to the
 *           same place with one click.
 *   Delete  the request goes to Trash (never destroyed), with a reason; its
 *           post is kept or cancelled, as chosen.
 *
 * Pure: what a hold IS lives here, so the queue, the pages that show the held
 * work and the tests cannot each have their own idea of it. */

import type { ContentItem } from "@/lib/data/content";
import { PUBLISH_HOLD, PUBLISH_CANCELLED, withChange } from "@/lib/data/content";
import type { Graphic } from "@/lib/data/graphic";
import { withNotice } from "@/lib/data/graphic";

export interface ApprovalHold {
  reason: string;
  by: string;
  at: string;
  /** Post only: the Publish status to put back when the hold is lifted. */
  prevPublishStatus?: string;
}

export const HOLD_REASON_MIN = 10;

/** A hold needs a reason somebody else can act on — not "x". */
export function holdReasonValid(reason: string): boolean {
  return (reason ?? "").trim().length >= HOLD_REASON_MIN;
}

/** Who may hold or delete from the queue: the two roles that run it. */
export function canHoldOrDelete(role: string): boolean {
  const r = (role || "").trim();
  return r === "CMO" || r === "Creative Leader";
}

export function isHeld(x: { approvalHold?: ApprovalHold } | null | undefined): boolean {
  return !!x?.approvalHold;
}

/** Put a post on hold. Its Publish status becomes Hold — the status Content
 *  Plan, the tracker and the Status Board already understand — and what it was
 *  before is kept so lifting the hold returns it exactly there. */
export function holdPost(post: ContentItem, reason: string, by: string, at: string): ContentItem {
  if (isHeld(post)) return post;
  const why = reason.trim();
  const held: ContentItem = {
    ...post,
    approvalHold: { reason: why, by, at, prevPublishStatus: post.publishStatus },
    publishStatus: PUBLISH_HOLD,
    publishStatusReason: why,
  };
  return withChange(held, by, "Hold (จากคิวอนุมัติ)", why);
}

/** Lift it: back to the status it had, the reason cleared. A post that was
 *  moved off Hold by hand in the meantime keeps whatever it was moved to. */
export function resumePost(post: ContentItem, by: string): ContentItem {
  const hold = post.approvalHold;
  if (!hold) return post;
  const stillHeld = (post.publishStatus ?? "").trim() === PUBLISH_HOLD;
  const next: ContentItem = {
    ...post,
    approvalHold: undefined,
    publishStatus: stillHeld ? (hold.prevPublishStatus || "Draft") : post.publishStatus,
    publishStatusReason: stillHeld ? undefined : post.publishStatusReason,
  };
  return withChange(next, by, "นำกลับมาจาก Hold", hold.reason);
}

/** Hold a graphic request. The stage is left alone — a hold is not a stage,
 *  and lifting it must not have to guess where the work was. A notice goes on
 *  the request so whoever opens it sees why it stopped. */
export function holdGraphic(g: Graphic, reason: string, by: string, at: string): Graphic {
  if (isHeld(g)) return g;
  const why = reason.trim();
  return withNotice({ ...g, approvalHold: { reason: why, by, at } }, by, `⏸ งานนี้ถูก Hold — ${why}`);
}

export function resumeGraphic(g: Graphic, by: string): Graphic {
  if (!g.approvalHold) return g;
  return withNotice({ ...g, approvalHold: undefined }, by, "▶️ นำงานกลับมาจาก Hold แล้ว — ทำต่อได้");
}

export const DELETE_REASONS = ["งานไม่ผ่าน ไม่ทำต่อ", "ยกเลิกแคมเปญ", "อื่น ๆ"] as const;
export type DeleteReason = (typeof DELETE_REASONS)[number];

/** The reason as it is recorded: the chosen option, or the typed text for
 *  "อื่น ๆ". "" when "อื่น ๆ" was chosen and nothing was typed. */
export function deleteReasonText(choice: DeleteReason | "", other: string): string {
  if (!choice) return "";
  return choice === "อื่น ๆ" ? (other ?? "").trim() : choice;
}

/** What the confirm dialog must spell out before a request is deleted. */
export function deleteSummary(g: Pick<Graphic, "title" | "code" | "deliverables">, hasPost: boolean): string[] {
  const pieces = (g.deliverables ?? []).length;
  return [
    `ใบงาน "${g.title}"${g.code ? ` (${g.code})` : ""} จะถูกย้ายลงถังขยะ`,
    pieces > 0 ? `รวมไฟล์ที่ส่งไว้ ${pieces} ชิ้นในใบงานนี้` : "ใบงานนี้ยังไม่มีไฟล์ที่ส่ง",
    "แคมเปญไม่ถูกลบ",
    hasPost ? "โพสต์ที่ผูกอยู่: เลือกด้านล่างว่าจะเก็บไว้หรือยกเลิก" : "ใบงานนี้ไม่ได้ผูกกับโพสต์",
    "กู้คืนได้จากหน้า Trash",
  ];
}

/** The linked post after its request is deleted, when the choice was to cancel
 *  it too. Cancelled, not removed — the post stays on the plan as the record. */
export function cancelPostWithRequest(post: ContentItem, reason: string, by: string): ContentItem {
  const next: ContentItem = { ...post, publishStatus: PUBLISH_CANCELLED, publishStatusReason: reason, approvalHold: undefined };
  return withChange(next, by, "ยกเลิกโพสต์ (ลบใบงานจากคิวอนุมัติ)", reason);
}
