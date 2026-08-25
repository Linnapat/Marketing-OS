"use client";

/* The six lists an approval queue is built from — fetched once, shared.
 *
 * The queue rules live in useApprovalRows and the rendering in ApprovalQueue,
 * but both need the same six reads (campaigns, requests, expenses, graphics,
 * posts, tasks), and there are now three places that want them: the Approval
 * lanes, the queue on My Tasks, and the bell's รออนุมัติ tab. Fetched per
 * screen, that is six requests each time somebody switches view — the egress
 * bill this app has already been audited for once.
 *
 * So: one module-level cache, one in-flight promise, and every consumer sees
 * the same rows update at the same time. It is deliberately LAZY — nothing is
 * read until a screen actually asks (`enabled`), because the bell sits on
 * pages that have no interest in approvals at all.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchRequests } from "@/lib/db/requests";
import { fetchExpenseRequests, ExpenseReq } from "@/lib/db/finance";
import { fetchGraphics } from "@/lib/db/graphic";
import { fetchContent } from "@/lib/db/content";
import { fetchTasks } from "@/lib/db/tasks";
import { CampaignRow } from "@/lib/data/campaigns";
import { RequestRow } from "@/lib/data/requests";
import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Task } from "@/lib/data/tasks";

export interface ApprovalData {
  campaigns: CampaignRow[];
  requests: RequestRow[];
  expenseReqs: ExpenseReq[];
  graphics: Graphic[];
  posts: ContentItem[];
  tasks: Task[];
  doneIds: Set<number>;
}

const EMPTY: ApprovalData = {
  campaigns: [], requests: [], expenseReqs: [], graphics: [], posts: [], tasks: [], doneIds: new Set(),
};

let cache: ApprovalData | null = null;
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
/** How long a cached queue may be shown before a re-read. Long enough that
 *  flipping between the two views costs nothing, short enough that a decision
 *  taken elsewhere (the request drawer, the Content Plan) is not offered here
 *  again — approving something twice is not a cosmetic mistake. */
const STALE_MS = 60_000;
const listeners = new Set<(d: ApprovalData) => void>();

function publish(next: ApprovalData) {
  cache = next;
  for (const l of listeners) l(next);
}

/** Fetch all six, keeping whatever we already had for any that fail — a queue
 *  that empties itself because one request timed out reads as "nothing to
 *  approve", which is the one answer it must never give by accident. */
async function loadAll(): Promise<void> {
  const base = cache ?? EMPTY;
  const [campaigns, requests, expenseReqs, graphics, posts, tasks] = await Promise.all([
    fetchCampaigns().catch(() => base.campaigns),
    fetchRequests().catch(() => base.requests),
    fetchExpenseRequests().catch(() => base.expenseReqs),
    fetchGraphics().catch(() => base.graphics),
    fetchContent().catch(() => base.posts),
    fetchTasks().catch(() => ({ tasks: base.tasks, doneIds: [...base.doneIds] })),
  ]);
  fetchedAt = Date.now();
  publish({
    campaigns, requests, expenseReqs, graphics, posts,
    tasks: tasks.tasks, doneIds: new Set(tasks.doneIds),
  });
}

export function useApprovalData(enabled: boolean) {
  const [data, setData] = useState<ApprovalData>(cache ?? EMPTY);
  const [loading, setLoading] = useState(enabled && !cache);

  useEffect(() => {
    listeners.add(setData);
    return () => { listeners.delete(setData); };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    inFlight = inFlight ?? loadAll().finally(() => { inFlight = null; });
    try { await inFlight; } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Fresh enough: show what we have and do not re-read on a tab switch.
    if (cache && Date.now() - fetchedAt < STALE_MS) { setData(cache); setLoading(false); return; }
    void reload();
  }, [enabled, reload]);

  // Acting on a row has to move the shared copy, or the other screen reading it
  // still shows the decision as open.
  const patchGraphic = useCallback((next: Graphic) => {
    if (!cache) return;
    publish({ ...cache, graphics: cache.graphics.map((g) => (g.id === next.id ? next : g)) });
  }, []);
  const patchPost = useCallback((next: ContentItem) => {
    if (!cache) return;
    publish({ ...cache, posts: cache.posts.map((p) => (p.id === next.id ? next : p)) });
  }, []);
  const patchExpense = useCallback((match: (r: ExpenseReq) => boolean, next: (r: ExpenseReq) => ExpenseReq) => {
    if (!cache) return;
    publish({ ...cache, expenseReqs: cache.expenseReqs.map((r) => (match(r) ? next(r) : r)) });
  }, []);
  const markTaskDone = useCallback((id: number) => {
    if (!cache) return;
    publish({ ...cache, doneIds: new Set(cache.doneIds).add(id) });
  }, []);

  return { data, loading, reload, patchGraphic, patchPost, patchExpense, markTaskDone };
}
