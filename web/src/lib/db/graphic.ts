// Data access for Graphic Requests. Full Graphic objects live in the `data`
// jsonb column. Mock fallback when Supabase isn't configured.

import { supabase } from "@/lib/supabase";
import { GRAPHICS, Graphic, withLiveGraphicOverdue, deliverableProgress, findLinkedPost, RequesterBriefField, consumeBriefUnlock } from "@/lib/data/graphic";
import { BrandId, brandName } from "@/lib/brands";
import { fetchContent, updateContent } from "./content";
import { attachApprovedAssets, ContentItem } from "@/lib/data/content";
import { upsertGraphicTask } from "./tasks";
import { Task } from "@/lib/data/tasks";
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

/** Source content-item ids that already have a graphic for a campaign — the
 *  idempotency set that stops duplicate graphic requests on re-Submit. */
export async function fetchGraphicSourceIds(campaignId: string): Promise<Set<string>> {
  const db = supabase();
  if (!db) return new Set();
  const { data, error } = await db.from("graphic_requests").select("data").eq("campaign_id", campaignId);
  if (error || !data) return new Set();
  const ids = new Set<string>();
  for (const r of data) { const s = (r.data as Graphic)?.sourceContentItemId; if (s) ids.add(s); }
  return ids;
}

/** Create a graphic request only if its (campaignId, sourceContentItemId) isn't present. */
export async function createGraphicIfNew(g: Graphic, existing?: Set<string>): Promise<{ created: boolean }> {
  const key = g.sourceContentItemId;
  if (key) {
    const set = existing ?? (g.campaignId ? await fetchGraphicSourceIds(g.campaignId) : new Set());
    if (set.has(key)) return { created: false };
    set.add(key);
  }
  await createGraphic(g);
  return { created: true };
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
  const { data, error } = await db.rpc("graphic_brief_patch", { p_id: String(g.id), p_patch: patch });
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

function graphicTaskFromRequest(g: Graphic): Task {
  return {
    id: Number(`${g.id}01`),
    title: g.title,
    module: "Graphic",
    moduleIcon: "🎨",
    moduleColor: "#C2691E",
    type: "Graphic",
    assignee: g.designer || "Unassigned",
    brand: brandName(g.b),
    campaign: g.campaign,
    priority: g.priority,
    status: g.designer && g.designer !== "Unassigned" ? "Todo" : "Todo",
    group: g.designer && g.designer !== "Unassigned" ? "doFirst" : "quickWins",
    due: g.due || "TBD",
    dueIso: g.dueIso,
    blocker: null,
    pendingApprover: g.requester || null,
    isQuickWin: false,
    nextAction: g.designer && g.designer !== "Unassigned" ? `${g.designer} to start design` : "Creative leader to assign designer",
    checklist: ["Review brief", "Create first draft", "Upload artwork for review"],
    relatedGraphicId: String(g.id),
  };
}

async function syncGraphicAssignmentTask(g: Graphic): Promise<void> {
  await upsertGraphicTask(graphicTaskFromRequest(g));
}
