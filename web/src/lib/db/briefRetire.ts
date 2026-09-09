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
import { BriefBundle, orphanedPosts, retireVerdict, retireLogLine } from "@/lib/data/briefRetire";
import { fetchCampaignContentPosts } from "./content";
import { fetchGraphicsForCampaign } from "./graphic";
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
  const orphans = orphanedPosts(posts, liveItemIds);
  if (!orphans.length) return EMPTY;

  const graphics = await fetchGraphicsForCampaign(campaignId);
  const orphanGraphics = new Map<string, Graphic[]>();
  for (const p of orphans) {
    const src = String(p.sourceContentItemId);
    orphanGraphics.set(src, graphics.filter((g) =>
      g.sourceContentItemId === src || String(g.contentPostId ?? "") === p.id));
  }
  const allTasks = await fetchBriefRelatedTasks(
    campaignId, [...orphanGraphics.values()].flat().map((g) => g.id),
  );

  const out: RetireOutcome = { retired: { content: 0, graphics: 0, tasks: 0 }, log: [], kept: [] };
  for (const post of orphans) {
    const src = String(post.sourceContentItemId);
    const gs = orphanGraphics.get(src) ?? [];
    const bundle: BriefBundle = { post, graphics: gs, tasks: tasksForBundle(campaignId, src, gs, allTasks) };
    const verdict = retireVerdict(bundle);
    out.log.push(retireLogLine(post, verdict));
    if (!verdict.retirable) {
      out.kept.push({ title: post.title || post.id, reasons: verdict.reasons });
      continue;
    }
    // Tasks and graphics first, the post last: if a write fails partway the
    // post is still there naming the leftovers, which is a state someone can
    // read. Losing the post first would leave the rest unexplained.
    for (const t of bundle.tasks) { await moveToTrash("task", String(t.id), by); out.retired.tasks++; }
    for (const g of gs) { await moveToTrash("graphic", String(g.id), by); out.retired.graphics++; }
    await moveToTrash("content", post.id, by);
    out.retired.content++;
  }
  return out;
}
