// What happens to the work when a content item is taken OUT of a campaign plan.
//
// The fan-out (db/brief.ts) only ever inserted. Editing an approved campaign's
// Content Plan from six items down to four rewrote the plan and left all six
// posts, all six graphic requests and their tasks exactly where they were —
// so the Campaign tab still read "Content 6", the Content Calendar still
// scheduled the two dropped pieces, and the graphic team still had them on the
// board. Found live on CAM-2026-7206 "Run For Don": the brief carried ci-1,
// ci-2, ci-4, ci-6 while ci-3 and ci-5 were still open work with nobody able
// to say why.
//
// The other direction already existed — moving a post to another campaign
// detaches its item from the old plan (detachBriefContentItem). This is the
// missing half.
//
// Deleting is NOT automatic-and-unconditional. By the time an item leaves the
// plan a designer may have delivered artwork against it, a writer may have
// written the caption, it may already be published. Throwing that away because
// a line was removed from a spreadsheet is the worse failure of the two: the
// leftover row is visible and fixable, the deleted work is neither.
//
// So the rule is: retire the bundle only when NOBODY HAS TOUCHED IT — the post
// is still a Draft with no caption, the request is still a New Request with no
// file submitted, and the tasks are still Todo. Anything else stays, and the
// caller reports it so the plan's owner can decide. Pure, so
// scripts/test-brief-retire.ts can pin the rule.

import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";

/** One content item's materialised work, gathered from the three tables. */
export interface BriefBundle {
  post: ContentItem;
  graphics: Graphic[];
  tasks: Task[];
}

export interface RetireVerdict {
  /** Safe to move the whole bundle to Trash. */
  retirable: boolean;
  /** Why not — in the team's words, for the approval log and the UI notice.
   *  Empty when retirable. */
  reasons: string[];
}

const clean = (s: unknown) => String(s ?? "").trim();

/** A post nobody has worked on yet: still a draft, no caption written, not
 *  approved / scheduled / published, and no artwork attached to it. */
function postUntouched(post: ContentItem): string | null {
  if (clean(post.caption)) return "มี caption เขียนไว้แล้ว";
  if (clean(post.captionApprovedBy)) return "caption ผ่านการอนุมัติแล้ว";
  if (/approved/i.test(clean(post.approvalStatus))) return "โพสต์ถูกอนุมัติแล้ว";
  if (!/^draft$/i.test(clean(post.publishStatus) || "Draft")) return `สถานะการโพสต์เป็น ${clean(post.publishStatus)}`;
  if (/published|scheduled/i.test(clean(post.status))) return `สถานะเป็น ${clean(post.status)}`;
  return null;
}

/** A request nobody has started: still New Request, no designer accepted it,
 *  and no deliverable carries a submitted file. */
function graphicUntouched(g: Graphic): string | null {
  if (!/^new request$/i.test(clean(g.stage))) return `ใบงานกราฟิกอยู่ขั้น ${clean(g.stage)}`;
  const submitted = (g.deliverables ?? []).some((d) => clean(d.assetLink) || clean(d.submittedBy));
  if (submitted || clean(g.deliverableLink)) return "ใบงานกราฟิกมีไฟล์ส่งแล้ว";
  const designer = clean(g.designer);
  if (designer && !/^unassigned$/i.test(designer)) return `มอบหมายให้ ${designer} แล้ว`;
  return null;
}

/** A task nobody has moved off the starting line. */
function taskUntouched(t: Task): string | null {
  if (!/^todo$/i.test(clean(t.status))) return `งาน “${clean(t.title)}” อยู่สถานะ ${clean(t.status)}`;
  return null;
}

/** Can this bundle be retired wholesale?
 *
 *  All-or-nothing on purpose: a post whose artwork is already delivered must
 *  keep BOTH, or the delivered file ends up orphaned on a board with nothing
 *  explaining what it was for. One piece of real work anywhere in the bundle
 *  keeps the whole bundle. */
export function retireVerdict(bundle: BriefBundle): RetireVerdict {
  const reasons = [
    postUntouched(bundle.post),
    ...bundle.graphics.map(graphicUntouched),
    ...bundle.tasks.map(taskUntouched),
  ].filter((r): r is string => !!r);
  // The same reason can arrive from two deliverables of one request.
  const unique = Array.from(new Set(reasons));
  return { retirable: unique.length === 0, reasons: unique };
}

/** Which of a campaign's materialised posts no longer answer to any item in
 *  the plan.
 *
 *  Only rows that CAME from the plan are candidates: a post raised by hand
 *  carries no sourceContentItemId and was never the brief's to remove. */
export function orphanedPosts(posts: ContentItem[], liveItemIds: Set<string>): ContentItem[] {
  return posts.filter((p) => {
    const src = clean(p.sourceContentItemId);
    return !!src && !liveItemIds.has(src);
  });
}

/** One line per bundle for the approval log — what was retired, or what was
 *  kept and why. */
export function retireLogLine(post: ContentItem, verdict: RetireVerdict): string {
  const title = clean(post.title) || clean(post.id);
  return verdict.retirable
    ? `เอา “${title}” ออกจากแผน — ย้ายโพสต์/ใบงานที่ยังไม่มีใครแตะลงถังขยะ (กู้คืนได้ 7 วัน)`
    : `เอา “${title}” ออกจากแผน — แต่งานที่สร้างไว้ยังอยู่: ${verdict.reasons.join(", ")}`;
}
