// Retiring the work behind a content item that was taken out of a campaign plan.
//
// The rule this enforces lives in data/briefRetire.ts — untouched work goes to
// Trash, work anyone has started stays and is reported. This module is only the
// reads, the writes and the reporting.
//
// Soft delete throughout: everything lands in /trash with the usual 7 days to
// undo. An automatic delete that could not be undone would not be worth having.

import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";
import { ContentItem } from "@/lib/data/content";
import { BriefBundle, orphanedPosts, orphanedGraphics, retireVerdict, retireLogLine } from "@/lib/data/briefRetire";
import { fetchCampaignContentPosts, fetchContentById } from "./content";
import { fetchGraphicsForCampaign } from "./graphic";
import { removeBriefContentItem } from "./brief";
import { fetchBriefRelatedTasks } from "./tasks";
import { moveToTrash, trashReady } from "./trash";

export interface RetireOutcome {
  /** Bundles moved to Trash: how many rows of each kind went. */
  retired: { content: number; graphics: number; tasks: number };
  /** One line per bundle — retired or kept — for the approval log. */
  log: string[];
  /** Titles of the items whose work was KEPT because someone had started it.
   *  The UI turns these into "เอาออกจากแผนแล้ว แต่งานยังอยู่ — ตรวจสอบ". */
  kept: { title: string; reasons: string[] }[];
}

const EMPTY: RetireOutcome = { retired: { content: 0, graphics: 0, tasks: 0 }, log: [], kept: [] };

/** Which tasks belong to one content item: the two the fan-out writes for it,
 *  plus anything raised against its graphic requests. */
function tasksForBundle(
  campaignId: string, itemId: string, graphics: Graphic[], all: Task[],
): Task[] {
  const keys = new Set([`${campaignId}:content:${itemId}`, `${campaignId}:graphic:${itemId}`]);
  const gids = new Set(graphics.map((g) => String(g.id)));
  return all.filter((t) =>
    (t.briefTaskKey && keys.has(t.briefTaskKey))
    || (t.relatedGraphicId && gids.has(String(t.relatedGraphicId))));
}

/** Take the plan's leavers out of the live tables.
 *
 *  `liveItemIds` is the plan as it stands AFTER the edit. Posts raised by hand
 *  are never candidates — they carry no sourceContentItemId and were never the
 *  brief's to remove.
 *
 *  Returns what happened rather than throwing on a kept bundle: an item being
 *  dropped from the plan while its artwork is already delivered is a real
 *  situation someone has to look at, not an error that should undo the save. */
export async function retireRemovedBriefItems(
  campaignId: string, liveItemIds: Set<string>, by: string,
): Promise<RetireOutcome> {
  // Without the migration there is no Trash, and a hard delete is not a
  // substitute for one. Leave everything alone rather than destroy it.
  if (!(await trashReady())) return EMPTY;

  const posts = await fetchCampaignContentPosts(campaignId);
  const graphics = await fetchGraphicsForCampaign(campaignId);
  // Orphans are found through posts AND requests: an In-store / Delivery-only
  // item has a request but no post, and would be missed looking at posts alone.
  const orphanPosts = orphanedPosts(posts, liveItemIds);
  const srcIds = new Set([
    ...orphanPosts.map((p) => String(p.sourceContentItemId)),
    ...orphanedGraphics(graphics, liveItemIds).map((g) => String(g.sourceContentItemId)),
  ]);
  if (!srcIds.size) return EMPTY;

  const bundles = [...srcIds].map((src) => {
    const post = orphanPosts.find((p) => String(p.sourceContentItemId) === src);
    const gs = graphics.filter((g) =>
      g.sourceContentItemId === src || (!!post && String(g.contentPostId ?? "") === post.id));
    return { src, post, graphics: gs };
  });
  const allTasks = await fetchBriefRelatedTasks(
    campaignId, bundles.flatMap((b) => b.graphics.map((g) => g.id)),
  );

  const out: RetireOutcome = { retired: { content: 0, graphics: 0, tasks: 0 }, log: [], kept: [] };
  for (const { src, post, graphics: gs } of bundles) {
    const bundle: BriefBundle = { post, graphics: gs, tasks: tasksForBundle(campaignId, src, gs, allTasks) };
    const work = post ?? gs[0] ?? { id: src };
    const verdict = retireVerdict(bundle);
    out.log.push(retireLogLine(work, verdict));
    if (!verdict.retirable) {
      out.kept.push({ title: String(work.title || work.id), reasons: verdict.reasons });
      continue;
    }
    const moved = await trashBundle(bundle, by);
    out.retired.tasks += moved.tasks;
    out.retired.graphics += moved.graphics;
    out.retired.content += moved.content;
  }
  return out;
}

/** Tasks and graphics first, the post last: if a write fails partway the post
 *  is still there naming the leftovers, which is a state someone can read.
 *  Losing the post first would leave the rest unexplained. */
async function trashBundle(bundle: BriefBundle, by: string): Promise<RetireOutcome["retired"]> {
  const n = { content: 0, graphics: 0, tasks: 0 };
  for (const t of bundle.tasks) { await moveToTrash("task", String(t.id), by); n.tasks++; }
  for (const g of bundle.graphics) { await moveToTrash("graphic", String(g.id), by); n.graphics++; }
  if (bundle.post) { await moveToTrash("content", bundle.post.id, by); n.content++; }
  return n;
}

export type CancelOutcome =
  | { ok: true; retired: RetireOutcome["retired"]; detached: boolean }
  | { ok: false; reasons: string[] };

/** Cancel a graphic request that was briefed by mistake — wrong brand, wrong
 *  campaign — from the request itself.
 *
 *  Same rule as taking an item out of the plan, because it IS that: the whole
 *  bundle (request, its post, their tasks) goes to Trash only if nobody has
 *  touched any of it, and the item leaves its campaign's plan so a re-submit
 *  of that brief does not make it all again. Started work is refused with the
 *  reasons, never half-cancelled.
 *
 *  To re-brief it under the right campaign, raise it there — a Teppen request
 *  cannot simply be re-labelled OMD: its job number, brand scope and plan all
 *  name the campaign it was made in. */
export async function cancelGraphicRequest(g: Graphic, by: string, reason: string): Promise<CancelOutcome> {
  if (!(await trashReady())) {
    return { ok: false, reasons: ["ระบบถังขยะยังไม่พร้อม — ยกเลิกไม่ได้เพราะจะกู้คืนไม่ได้"] };
  }
  const src = String(g.sourceContentItemId ?? "").trim();
  const campaignId = String(g.campaignId ?? "").trim();

  // The request, plus any sibling request raised for the same plan item.
  let graphics: Graphic[] = [g];
  let post: ContentItem | undefined;
  if (campaignId && src) {
    const [cgs, posts] = await Promise.all([fetchGraphicsForCampaign(campaignId), fetchCampaignContentPosts(campaignId)]);
    graphics = cgs.filter((x) => String(x.sourceContentItemId ?? "") === src);
    if (!graphics.some((x) => String(x.id) === String(g.id))) graphics.push(g);
    post = posts.find((p) => String(p.sourceContentItemId ?? "") === src);
  }
  if (!post && g.contentPostId) post = (await fetchContentById(String(g.contentPostId))) ?? undefined;

  const all = await fetchBriefRelatedTasks(campaignId, graphics.map((x) => x.id));
  const tasks = campaignId && src
    ? tasksForBundle(campaignId, src, graphics, all)
    : all.filter((t) => t.relatedGraphicId && graphics.some((x) => String(x.id) === String(t.relatedGraphicId)));

  const bundle: BriefBundle = { post, graphics, tasks };
  const verdict = retireVerdict(bundle);
  if (!verdict.retirable) return { ok: false, reasons: verdict.reasons };

  // Plan first: if this fails nothing has moved, and the error says why.
  const detached = campaignId && src
    ? await removeBriefContentItem(campaignId, src, by, "Content item cancelled",
        `ยกเลิกบรีฟ “${g.title}” — ${reason}`)
    : false;
  const retired = await trashBundle(bundle, by);
  return { ok: true, retired, detached };
}
