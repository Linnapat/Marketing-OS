// Data access for Graphic Requests. Full Graphic objects live in the `data`
// jsonb column. Mock fallback when Supabase isn't configured.

import { supabase } from "@/lib/supabase";
import { GRAPHICS, Graphic, withLiveGraphicOverdue, deliverableProgress, findLinkedPost, findLinkedGraphics, RequesterBriefField, consumeBriefUnlock, graphicAssignmentTasks } from "@/lib/data/graphic";
import { BrandId } from "@/lib/brands";
import { fetchContent, updateContent } from "./content";
import { attachApprovedAssets, ContentItem } from "@/lib/data/content";
import { upsertGraphicTask } from "./tasks";
import { assertDbOk, assertRowsTouched } from "@/lib/db/assert";
import { liveOnly, trashReady } from "@/lib/db/trash";
import { assertMockUniqueId, seedMockIds } from "@/lib/db/mockGuard";
import { issueArtworkCode } from "@/lib/db/workCode";

export async function fetchGraphics(): Promise<Graphic[]> {
  const db = supabase();
  if (!db) return GRAPHICS.map((g) => withLiveGraphicOverdue({ ...g }));
  const { data, error } = await liveOnly(db.from("graphic_requests").select("id, data, created_at"), await trashReady()).order("id");
  if (error || !data) return []; // query error = no live data, never demo rows
  return data
    .map((r) => (r.data ? { ...(r.data as Graphic), createdAt: (r as { created_at?: string }).created_at } : null))
    .filter(Boolean)
    .map((g) => withLiveGraphicOverdue(g as Graphic));
}

/** One request by its id — for surfaces that already know which request they
 *  want (the Content drawer showing what kind of artwork a post is waiting on)
 *  and should not pull the whole board to find it. */
export async function fetchGraphicById(id: string | number): Promise<Graphic | null> {
  const db = supabase();
  if (!db) return GRAPHICS.find((g) => String(g.id) === String(id)) ?? null;
  const { data, error } = await liveOnly(
    db.from("graphic_requests").select("id, data, created_at").eq("data->>id", String(id)),
    await trashReady(),
  ).maybeSingle();
  if (error || !data?.data) return null;
  return withLiveGraphicOverdue({ ...(data.data as Graphic), createdAt: (data as { created_at?: string }).created_at });
}

/** The request(s) a post is waiting on, read from EITHER end of the link.
 *
 *  The link is written on whichever side happened to be created second, and one
 *  path never wrote it back: a brief that mints its own post stamps
 *  `graphic.contentPostId` and leaves `post.graphicRequestId` empty. Eight live
 *  posts are in that state, and the Content drawer — which only ever looked at
 *  `post.graphicRequestId` — offered "ขอกราฟฟิกสำหรับโพสต์นี้" over work that
 *  had already been briefed, assigned and accepted. Whoever was writing the
 *  caption had to open Graphic Request and match it up by eye.
 *
 *  Ordered by id, so a post that somehow carries two requests reads oldest
 *  first and the caller can say how many there are instead of silently
 *  dropping the rest. */
export async function fetchGraphicsForPost(
  post: { id: string; graphicRequestId?: string | number | null },
): Promise<Graphic[]> {
  const named = String(post.graphicRequestId ?? "").trim();
  if (named) {
    const one = await fetchGraphicById(named);
    if (one) return [one];
  }
  const postId = String(post.id ?? "").trim();
  if (!postId) return [];
  const db = supabase();
  // Demo mode runs the SAME rule the pure layer states, rather than a second
  // hand-rolled copy of "what counts as linked".
  if (!db) return findLinkedGraphics({ id: postId, graphicRequestId: named || undefined }, GRAPHICS);
  const { data, error } = await liveOnly(
    db.from("graphic_requests").select("id, data, created_at").eq("data->>contentPostId", postId),
    await trashReady(),
  ).order("id");
  if (error || !data) return [];
  return data
    .filter((r) => r.data)
    .map((r) => withLiveGraphicOverdue({ ...(r.data as Graphic), createdAt: (r as { created_at?: string }).created_at }));
}

export async function createGraphic(input: Graphic): Promise<void> {
  const db = supabase();
  if (!db) {
    seedMockIds("graphic_requests", GRAPHICS.map((x) => x.id));
    assertMockUniqueId("graphic_requests", input.id);
  }
  // Numbered under the post this serves, so the artwork's number says which post
  // it is for without opening it. Every creation path goes through here.
  const g: Graphic = input.code || !db
    ? input
    : { ...input, code: await issueArtworkCode(input.campaignId, input.contentPostId, input.sourceContentItemId) };
  if (db) {
    const { error } = await db.from("graphic_requests").insert({
      title: g.title, brand: g.b, campaign: g.campaign, campaign_id: g.campaignId ?? null,
      designer: g.designer, requester: g.requester,
      approver: g.approver, type: g.type, priority: g.priority, stage: g.stage, due: g.due,
      platform: g.platform, size: g.size, brief_complete: g.briefComplete, blocker: g.blocker,
      next_action: g.nextAction, data: g,
    });
    assertDbOk(error, "Could not save graphic request");
  }
  await syncGraphicAssignmentTask(g);
}

/** Source content-item ids that already have a graphic for a campaign, mapped
 *  to that request's blob id — the idempotency read that stops duplicate
 *  requests on re-Submit, and the lookup that lets a skipped item top up the
 *  request that ACTUALLY exists (the fan-out used to aim topUpGraphicBrief at
 *  the fresh gid it had just minted, which matches no row on any re-run). */
export async function fetchGraphicSourceIds(campaignId: string): Promise<Map<string, string | number>> {
  const db = supabase();
  if (!db) return new Map();
  const { data, error } = await db.from("graphic_requests").select("data").eq("campaign_id", campaignId);
  // A failed read must abort the fan-out, not report "nothing exists yet".
  if (error) throw new Error(`เช็คใบงานเดิมของแคมเปญไม่สำเร็จ (${error.message}) — ยังไม่ได้สร้างอะไรเพิ่ม ลองใหม่อีกครั้ง`);
  if (!data) return new Map();
  const ids = new Map<string, string | number>();
  for (const r of data) {
    const g = r.data as Graphic | null;
    if (g?.sourceContentItemId) ids.set(g.sourceContentItemId, g.id);
  }
  return ids;
}

/** Create a graphic request only if its (campaignId, sourceContentItemId) isn't
 *  present; when it is, `existingId` names the row that already serves the item. */
export async function createGraphicIfNew(
  g: Graphic, existing?: Map<string, string | number>,
): Promise<{ created: boolean; existingId?: string | number }> {
  const key = g.sourceContentItemId;
  if (key) {
    const seen = existing ?? (g.campaignId ? await fetchGraphicSourceIds(g.campaignId) : new Map());
    if (seen.has(key)) return { created: false, existingId: seen.get(key) };
    seen.set(key, g.id);
  }
  try {
    await createGraphic(g);
    return { created: true };
  } catch (error) {
    // A sibling Approve racing this one may have inserted the same
    // (campaignId, sourceContentItemId) after our read — the request exists,
    // which is the outcome this function promises. Re-check before failing.
    if (key && g.campaignId) {
      const now = await fetchGraphicSourceIds(g.campaignId).catch(() => new Map<string, string | number>());
      const hit = now.get(key);
      if (hit !== undefined) return { created: false, existingId: hit };
    }
    throw error;
  }
}

/** Persist edits to a graphic (submitted work, stage moves, approvals). The full
 *  object round-trips through `data`; stage is mirrored. Matched on the blob id. */
/** Save just the brief fields the requester changed.
 *
 *  Deliberately not updateGraphic(): that sends the whole `data` blob, so two
 *  people editing the same request before Creative accepts means whoever saves
 *  second wipes the other's changes without any error. The RPC merges the patch
 *  into the row server-side in one statement, so only the fields actually
 *  touched move — and it re-checks both the field whitelist and the "Creative
 *  has accepted" lock, neither of which a client can be trusted to enforce.
 *
 *  Returns the merged request so the drawer shows what the database now holds
 *  rather than what the form hoped it would. */
export async function patchGraphicBrief(
  g: Graphic,
  patch: Partial<Record<RequesterBriefField, string>>,
): Promise<Graphic> {
  if (!Object.keys(patch).length) return g;
  const db = supabase();
  // demo mode — local only. consumeBriefUnlock mirrors what the RPC does with
  // a granted release so the one-shot behaves the same without a database.
  if (!db) return consumeBriefUnlock({ ...g, ...patch });
  const { data, error } = await db.rpc("graphic_brief_patch", { p_id: String(g.id), p_patch: patch, p_only_if_empty: false });
  if (error) {
    // The migration is applied by hand, so say which failure this is instead of
    // showing a raw "function does not exist" to whoever is trying to type a link.
    if (/function .*graphic_brief_patch.* does not exist/i.test(error.message)) {
      throw new Error("ยังไม่ได้รัน supabase/graphic_brief_patch.sql — แก้บรีฟยังไม่ได้จนกว่าจะรัน");
    }
    throw new Error(error.message);
  }
  return (data as Graphic | null) ?? { ...g, ...patch };
}

/** Push campaign brief detail down into a Graphic Request that already exists.
 *
 *  The fan-out only ever CREATED: a request made in July never saw the Drive
 *  link added to its campaign in August, so the planner filled the brief, the
 *  designer opened the request, and it was blank. Re-approving did not help —
 *  the fan-out skips anything already materialised.
 *
 *  Blanks only, and never on an accepted request; both enforced in SQL
 *  (p_only_if_empty) rather than here, because this runs on every campaign
 *  save and must not overwrite what the request's own people typed.
 *
 *  Best-effort: a campaign save must not fail because one request would not
 *  take a top-up. */
export async function topUpGraphicBrief(
  id: string | number,
  patch: Partial<Record<RequesterBriefField, string>>,
): Promise<void> {
  const db = supabase();
  if (!db) return;
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => (v ?? "").trim() !== ""),
  );
  if (!Object.keys(clean).length) return;
  const { error } = await db.rpc("graphic_brief_patch", { p_id: String(id), p_patch: clean, p_only_if_empty: true });
  if (error) console.warn("topUpGraphicBrief skipped", id, error.message);
}

export async function updateGraphic(g: Graphic): Promise<void> {
  const db = supabase();
  if (db) {
    // .select() so a filter matching nothing is caught: accepting a job,
    // submitting a storyboard or handing over footage all write through here,
    // and each one tells the user it worked.
    await assertRowsTouched(
      db.from("graphic_requests")
        .update({
          stage: g.stage, designer: g.designer, requester: g.requester, approver: g.approver,
          blocker: g.blocker, next_action: g.nextAction, data: g,
        })
        .eq("data->>id", String(g.id))
        .select("id"),
      "บันทึกใบงาน Graphic ไม่สำเร็จ",
    );
  }
  await syncGraphicAssignmentTask(g);
}

/** When every deliverable of a graphic is approved, attach the approved asset
 *  links to the Content Plan post it serves and mark that post's asset ready.
 *  No-op when the request serves no post (POSM / print work), when nothing
 *  identifies exactly one post, or when the graphic isn't fully approved yet.
 *  Safe to call on every deliverable save. */
export async function syncApprovedAssetsToContent(g: Graphic): Promise<ContentItem | null> {
  if (!deliverableProgress(g).ready) return null;
  const assets = (g.deliverables ?? [])
    .filter((d) => d.status === "Approved" && d.assetLink)
    .map((d) => ({ platform: d.platform, size: d.size, link: d.assetLink }));
  if (!assets.length) return null;

  const posts = await fetchContent();
  // The matching rule lives in lib/data/graphic (pure, unit-tested) — it used
  // to sit inline here and matched sourceContentItemId without scoping it to a
  // campaign, which could land one campaign's artwork on another's post.
  const match = findLinkedPost(g, posts);
  if (!match) return null;
  const post = posts.find((p) => p.id === match.id);
  if (!post) return null;

  const next = attachApprovedAssets(post, assets);
  await updateContent(next);
  return next;
}

/** Build a full Graphic from the request form, filling sensible defaults. */
export function buildGraphic(input: {
  id: number; b: BrandId; campaign: string; title: string; type: string;
  due: string; dueIso?: string; designer: string; requester: string; approver: string; channels: string[];
  campaignId?: string; sourceContentItemId?: string;
}): Graphic {
  return {
    id: input.id, stage: "Brief", title: input.title || "New request", b: input.b, campaign: input.campaign,
    campaignId: input.campaignId, sourceContentItemId: input.sourceContentItemId,
    due: input.due || "TBD", dueIso: input.dueIso, designer: input.designer || "Unassigned", requester: input.requester || "You",
    // Approver falls back to the requester (a real person in the flow) — never a
    // name that doesn't exist in Settings › Users & Roles.
    approver: input.approver || input.requester || "Unassigned", type: input.type, priority: "Med", fb: 0, openFb: 0,
    isOverdue: false, briefComplete: false, pendingApprover: input.approver || input.requester || "Unassigned",
    blocker: null, waitingSince: null, nextAction: "Complete the brief to start design.",
    platform: input.channels.join(", ") || "—", size: "—", contentItem: input.title || "—",
    history: [{ type: "requested", at: new Date().toISOString(), by: input.requester || "You", note: input.campaign || "" }],
  };
}

/** One My Tasks row per job the request has a person on — storyboard, shoot and
 *  artwork. The rule itself lives in lib/data/graphic (pure, tested) so the
 *  drawer and this sync can never disagree about who owes what.
 *
 *  Sequential, not Promise.all: the three upserts each read-then-write the
 *  tasks table, and firing them together made three round trips race for the
 *  same connection for no gain — there are at most three. */
async function syncGraphicAssignmentTask(g: Graphic): Promise<void> {
  for (const task of graphicAssignmentTasks(g)) {
    await upsertGraphicTask(task);
  }
}
