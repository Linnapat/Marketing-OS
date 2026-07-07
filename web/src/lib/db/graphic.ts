// Data access for Graphic Requests. Full Graphic objects live in the `data`
// jsonb column. Mock fallback when Supabase isn't configured.

import { supabase } from "@/lib/supabase";
import { GRAPHICS, Graphic, deliverableProgress } from "@/lib/data/graphic";
import { BrandId } from "@/lib/brands";
import { fetchContent, updateContent } from "./content";
import { attachApprovedAssets, ContentItem } from "@/lib/data/content";

export async function fetchGraphics(): Promise<Graphic[]> {
  const db = supabase();
  if (!db) return GRAPHICS.map((g) => ({ ...g }));
  const { data, error } = await db.from("graphic_requests").select("id, data").order("id");
  if (error || !data) return GRAPHICS.map((g) => ({ ...g }));
  return data.map((r) => r.data as Graphic).filter(Boolean);
}

export async function createGraphic(g: Graphic): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("graphic_requests").insert({
    title: g.title, brand: g.b, campaign: g.campaign, campaign_id: g.campaignId ?? null,
    designer: g.designer, requester: g.requester,
    approver: g.approver, type: g.type, priority: g.priority, stage: g.stage, due: g.due,
    platform: g.platform, size: g.size, brief_complete: g.briefComplete, blocker: g.blocker,
    next_action: g.nextAction, data: g,
  });
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
export async function updateGraphic(g: Graphic): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("graphic_requests")
    .update({ stage: g.stage, blocker: g.blocker, next_action: g.nextAction, data: g })
    .eq("data->>id", String(g.id));
}

/** When every deliverable of a graphic is approved, attach the approved asset
 *  links to the linked Content Calendar post and mark its asset ready. Matched
 *  by campaign + content-item title. No-op when nothing lines up or the graphic
 *  isn't fully approved yet. Safe to call on every deliverable save. */
export async function syncApprovedAssetsToContent(g: Graphic): Promise<ContentItem | null> {
  if (!deliverableProgress(g).ready) return null;
  const assets = (g.deliverables ?? [])
    .filter((d) => d.status === "Approved" && d.assetLink)
    .map((d) => ({ platform: d.platform, size: d.size, link: d.assetLink }));
  if (!assets.length) return null;

  const posts = await fetchContent();
  const key = (s: string) => (s || "").trim().toLowerCase();
  // Prefer the real relational link (graphicRequestId / sourceContentItemId);
  // fall back to campaign + title match only for legacy rows without ids.
  const post =
    posts.find((c) => c.graphicRequestId && String(c.graphicRequestId) === String(g.id)) ??
    (g.sourceContentItemId ? posts.find((c) => c.sourceContentItemId === g.sourceContentItemId) : undefined) ??
    posts.find(
      (c) => key(c.campaign) === key(g.campaign) &&
        (key(c.title) === key(g.contentItem) || (g.contentItem && key(g.title).includes(key(c.title)))),
    );
  if (!post) return null;

  const next = attachApprovedAssets(post, assets);
  await updateContent(next);
  return next;
}

/** Build a full Graphic from the request form, filling sensible defaults. */
export function buildGraphic(input: {
  id: number; b: BrandId; campaign: string; title: string; type: string;
  due: string; designer: string; requester: string; approver: string; channels: string[];
  campaignId?: string; sourceContentItemId?: string;
}): Graphic {
  return {
    id: input.id, stage: "Brief", title: input.title || "New request", b: input.b, campaign: input.campaign,
    campaignId: input.campaignId, sourceContentItemId: input.sourceContentItemId,
    due: input.due || "TBD", designer: input.designer || "Unassigned", requester: input.requester || "You",
    // Approver falls back to the requester (a real person in the flow) — never a
    // name that doesn't exist in Settings › Users & Roles.
    approver: input.approver || input.requester || "Unassigned", type: input.type, priority: "Med", fb: 0, openFb: 0,
    isOverdue: false, briefComplete: false, pendingApprover: input.approver || input.requester || "Unassigned",
    blocker: null, waitingSince: null, nextAction: "Complete the brief to start design.",
    platform: input.channels.join(", ") || "—", size: "—", contentItem: input.title || "—",
  };
}
