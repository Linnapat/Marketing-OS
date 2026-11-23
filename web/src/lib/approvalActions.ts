// Hold / bring back / delete from the approval queue — the writes.
//
// The rules (what a hold is, what a delete leaves behind) are pure and live in
// data/approvalHold. This file is only the order things are saved in, who is
// told, and what goes in the audit log — kept out of the component so the
// three actions cannot each tell a different set of people.

import type { ApprovalRow } from "@/lib/data/approvals";
import type { ContentItem } from "@/lib/data/content";
import { captionOwner, isPostClosed, withChange } from "@/lib/data/content";
import { findLinkedPost, jobHolder, type Graphic } from "@/lib/data/graphic";
import {
  holdGraphic, holdPost, resumeGraphic, resumePost, cancelPostWithRequest, isHeld,
} from "@/lib/data/approvalHold";
import { fetchContent, updateContent } from "@/lib/db/content";
import { fetchGraphicsForPost, updateGraphic } from "@/lib/db/graphic";
import { moveToTrash } from "@/lib/db/trash";
import { logAudit } from "@/lib/db/audit";
import { notify } from "@/lib/notify";
import { workLink } from "@/lib/deepLink";

export interface QueueActionResult { graphics: Graphic[]; posts: ContentItem[]; removedGraphicIds: (string | number)[] }

type GraphicRow = Extract<ApprovalRow, { g: Graphic }>;
type CaptionRow = Extract<ApprovalRow, { kind: "caption" }>;
export const isGraphicRow = (row: ApprovalRow): row is GraphicRow => "g" in row && !!(row as GraphicRow).g;
export const isCaptionRow = (row: ApprovalRow): row is CaptionRow => row.kind === "caption";
/** The kinds this queue can hold or delete: work with a request or a post
 *  behind it. Campaigns, expenses and KOL rows have their own flows. */
export const canHoldRow = (row: ApprovalRow) => isGraphicRow(row) || isCaptionRow(row);

export const rowTitle = (row: ApprovalRow): string =>
  isGraphicRow(row) ? row.g.title : isCaptionRow(row) ? row.post.title : "";

async function postOf(g: Graphic): Promise<ContentItem | null> {
  const posts = await fetchContent().catch(() => [] as ContentItem[]);
  return (findLinkedPost(g, posts) as ContentItem | null) ?? null;
}

/** Submitter and whoever holds the work — the people a hold or delete lands on. */
function audience(row: ApprovalRow): { to: (string | null | undefined)[]; inform: (string | null | undefined)[]; link: string } {
  if (isGraphicRow(row)) {
    const d = "deliverable" in row ? row.deliverable : undefined;
    return { to: [d?.submittedBy, jobHolder(row.g), row.g.designer], inform: [row.g.requester], link: workLink.graphic(row.g.id) };
  }
  if (isCaptionRow(row)) return { to: [captionOwner(row.post)], inform: [row.post.requester], link: workLink.post(row.post.id) };
  return { to: [], inform: [], link: "/approval-center" };
}

function tell(row: ApprovalRow, event: "rejected" | "approved", title: string, detail: string) {
  const a = audience(row);
  notify(event, title, detail, a.link, { team: isGraphicRow(row) ? "graphic" : "content", to: a.to, inform: a.inform });
}

export async function holdFromQueue(row: ApprovalRow, reason: string, by: string): Promise<QueueActionResult> {
  const at = new Date().toISOString();
  const out: QueueActionResult = { graphics: [], posts: [], removedGraphicIds: [] };
  if (isGraphicRow(row)) {
    const g = holdGraphic(row.g, reason, by, at);
    await updateGraphic(g);
    out.graphics.push(g);
    // The post it is for stops with it, so every page says the same thing.
    const post = await postOf(row.g);
    if (post && !isPostClosed(post) && !isHeld(post)) { const p = holdPost(post, reason, by, at); await updateContent(p).then(() => out.posts.push(p)).catch(() => {}); }
  } else if (isCaptionRow(row)) {
    const p = holdPost(row.post, reason, by, at);
    await updateContent(p);
    out.posts.push(p);
    const linked = await fetchGraphicsForPost({ id: row.post.id, graphicRequestId: row.post.graphicRequestId }).catch(() => [] as Graphic[]);
    for (const g0 of linked) { if (isHeld(g0)) continue; const g = holdGraphic(g0, reason, by, at); await updateGraphic(g).then(() => out.graphics.push(g)).catch(() => {}); }
  }
  tell(row, "rejected", `⏸ Hold: ${rowTitle(row)}`, `เหตุผล: ${reason.trim()} · โดย ${by}`);
  logAudit(`Hold งานจากคิวอนุมัติ: ${rowTitle(row)}`, "Approval", { after: reason.trim(), actorName: by, meta: { kind: row.kind, key: row.key } });
  return out;
}

export async function resumeFromQueue(row: ApprovalRow, by: string): Promise<QueueActionResult> {
  const out: QueueActionResult = { graphics: [], posts: [], removedGraphicIds: [] };
  if (isGraphicRow(row)) {
    const g = resumeGraphic(row.g, by);
    await updateGraphic(g);
    out.graphics.push(g);
    const post = await postOf(row.g);
    if (post && isHeld(post)) { const p = resumePost(post, by); await updateContent(p).then(() => out.posts.push(p)).catch(() => {}); }
  } else if (isCaptionRow(row)) {
    const p = resumePost(row.post, by);
    await updateContent(p);
    out.posts.push(p);
    const linked = await fetchGraphicsForPost({ id: row.post.id, graphicRequestId: row.post.graphicRequestId }).catch(() => [] as Graphic[]);
    for (const g0 of linked) { if (!isHeld(g0)) continue; const g = resumeGraphic(g0, by); await updateGraphic(g).then(() => out.graphics.push(g)).catch(() => {}); }
  }
  tell(row, "approved", `▶️ นำกลับมาจาก Hold: ${rowTitle(row)}`, `กลับเข้าคิวรออนุมัติ · โดย ${by}`);
  logAudit(`นำงานกลับจาก Hold: ${rowTitle(row)}`, "Approval", { before: row.held?.reason, actorName: by, meta: { kind: row.kind, key: row.key } });
  return out;
}

/** Delete from the queue. A graphic request goes to Trash — never destroyed:
 *  if Trash is not available the action fails rather than hard-deleting. A
 *  caption has no record of its own to bin, so "delete" there withdraws the
 *  caption from approval (back to a draft, text kept). Either way the post is
 *  kept, or cancelled, as chosen. */
export async function deleteFromQueue(row: ApprovalRow, reason: string, by: string, cancelPost: boolean): Promise<QueueActionResult> {
  const out: QueueActionResult = { graphics: [], posts: [], removedGraphicIds: [] };
  if (isGraphicRow(row)) {
    const post = await postOf(row.g);
    const binned = await moveToTrash("graphic", String(row.g.id), by);
    if (!binned) throw new Error("ย้ายลงถังขยะไม่สำเร็จ — ยังไม่ได้ลบอะไร (ระบบ Trash ไม่พร้อม หรือใบงานถูกลบไปแล้ว)");
    out.removedGraphicIds.push(row.g.id);
    if (post && !isPostClosed(post)) {
      const p = cancelPost ? cancelPostWithRequest(post, reason, by) : (isHeld(post) ? resumePost(post, by) : null);
      if (p) await updateContent(p).then(() => out.posts.push(p)).catch(() => {});
    }
  } else if (isCaptionRow(row)) {
    const p = cancelPost
      ? cancelPostWithRequest(row.post, reason, by)
      : withChange({ ...row.post, captionStatus: "Draft", approvalHold: undefined }, by, "ถอน Caption ออกจากคิวอนุมัติ", reason);
    await updateContent(p);
    out.posts.push(p);
  }
  tell(row, "rejected", `🗑 ลบงานจากคิวอนุมัติ: ${rowTitle(row)}`, `เหตุผล: ${reason} · ${cancelPost ? "ยกเลิกโพสต์ด้วย" : "เก็บโพสต์ไว้"} · โดย ${by}`);
  logAudit(`ลบงานจากคิวอนุมัติ: ${rowTitle(row)}`, "Approval", {
    after: reason, actorName: by, meta: { kind: row.kind, key: row.key, cancelPost, trashed: isGraphicRow(row) },
  });
  return out;
}
