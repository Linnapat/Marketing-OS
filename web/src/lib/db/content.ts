// Data access for Content Calendar. Rich objects are stored whole in the
// `data` jsonb column, so every UI field round-trips losslessly.

import { supabase } from "@/lib/supabase";
import { CONTENT, ContentItem, contentApproveBlockers, canPublish } from "@/lib/data/content";
import { CAMPAIGNS } from "@/lib/data/campaigns";

const campById = Object.fromEntries(CAMPAIGNS.map((c) => [c.name, c.id]));

/** All posts — from Supabase (data blob) if configured, else the mock. */
export async function fetchContent(): Promise<ContentItem[]> {
  const db = supabase();
  if (!db) return CONTENT.map((c) => ({ ...c }));
  const { data, error } = await db.from("content_posts").select("id, data").order("id");
  if (error || !data) return CONTENT.map((c) => ({ ...c }));
  return data
    .map((r) => (r.data ? { ...(r.data as ContentItem), id: (r.data as ContentItem).id ?? `c${r.id}` } : null))
    .filter(Boolean) as ContentItem[];
}

/** Insert a new post; returns it (with a stable id). */
export async function createContent(post: ContentItem): Promise<ContentItem> {
  const db = supabase();
  if (!db) return post;
  const { data, error } = await db.from("content_posts").insert({
    title: post.title, brand: post.b, campaign: post.campaign, campaign_id: post.campaignId ?? campById[post.campaign] ?? null,
    platforms: post.platforms ?? [post.plat], status: post.status, day: post.day, time: post.time,
    owner: post.owner, caption: post.caption, data: post,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message || "Could not save content post to Supabase");
  return { ...post, id: `c${data.id}` };
}

/** Source content-item ids already materialised for a campaign — the
 *  idempotency set that makes re-running a Submit a no-op. */
export async function fetchContentSourceIds(campaignId: string): Promise<Set<string>> {
  const db = supabase();
  if (!db) return new Set();
  const { data, error } = await db.from("content_posts").select("data").eq("campaign_id", campaignId);
  if (error || !data) return new Set();
  const ids = new Set<string>();
  for (const r of data) { const s = (r.data as ContentItem)?.sourceContentItemId; if (s) ids.add(s); }
  return ids;
}

/** Create a post only if its (campaignId, sourceContentItemId) isn't present. */
export async function createContentIfNew(post: ContentItem, existing?: Set<string>): Promise<{ created: boolean; post: ContentItem }> {
  const key = post.sourceContentItemId;
  if (key) {
    const set = existing ?? (post.campaignId ? await fetchContentSourceIds(post.campaignId) : new Set());
    if (set.has(key)) return { created: false, post };
    set.add(key);
  }
  const created = await createContent(post);
  return { created: true, post: created };
}

/** Persist an edited post (approval action, caption edit, etc). The whole
 *  object round-trips through the `data` jsonb; the status column is mirrored
 *  so list queries stay accurate. Matched on the stable id inside the blob
 *  (the same value fetchContent surfaces to the UI). */
export async function updateContent(post: ContentItem): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("content_posts")
    .update({ status: post.status, caption: post.caption, data: post })
    .eq("data->>id", post.id);
  if (error) throw new Error(error.message);
}

/** Backend-enforced Approve: re-checks the prerequisites (never trusts the
 *  disabled button) before persisting the approval. Returns the reasons when
 *  blocked so the UI can show exactly what's missing. */
export async function approveContent(post: ContentItem, by: string): Promise<{ ok: boolean; reasons: string[]; post: ContentItem }> {
  const reasons = contentApproveBlockers(post);
  if (reasons.length) return { ok: false, reasons, post };
  const next: ContentItem = {
    ...post, approvalStatus: "Approved", status: post.status === "Draft" || post.status === "Waiting Approval" ? "Approved" : post.status,
    approvedBy: by, approvedAt: new Date().toISOString(),
  };
  await updateContent(next);
  return { ok: true, reasons: [], post: next };
}

/** Backend-enforced Publish: re-checks the publish gate before persisting. */
export async function publishContent(post: ContentItem, by: string): Promise<{ ok: boolean; reasons: string[]; post: ContentItem }> {
  const gate = canPublish(post);
  if (!gate.ok) return { ok: false, reasons: gate.reasons, post };
  const next: ContentItem = { ...post, publishStatus: "Published", status: "Published", publishedBy: by, publishedAt: new Date().toISOString() };
  await updateContent(next);
  return { ok: true, reasons: [], post: next };
}

export async function scheduleContentToMeta(post: ContentItem, by: string, scheduledFor: string, channels: string[]): Promise<{ ok: boolean; reasons: string[]; post: ContentItem }> {
  const gate = canPublish(post);
  if (!gate.ok) return { ok: false, reasons: gate.reasons, post };
  const next: ContentItem = {
    ...post,
    status: "Scheduled",
    publishStatus: "Scheduled to Meta",
    publishChannels: channels,
    scheduledBy: by,
    scheduledAt: new Date().toISOString(),
    scheduledFor,
    metaError: undefined,
  };
  await updateContent(next);
  return { ok: true, reasons: [], post: next };
}

export async function publishContentToMeta(post: ContentItem, by: string, channels: string[], account?: unknown): Promise<{ ok: boolean; reasons: string[]; post: ContentItem }> {
  const gate = canPublish(post);
  if (!gate.ok) return { ok: false, reasons: gate.reasons, post };
  const res = await fetch("/api/meta/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post, channels, account }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const error = json?.error || "Meta publish failed";
    const failed: ContentItem = { ...post, publishStatus: "Failed", status: "Failed", publishChannels: channels, metaError: error };
    await updateContent(failed);
    return { ok: false, reasons: [error], post: failed };
  }
  const next: ContentItem = {
    ...post,
    publishStatus: "Published",
    status: "Published",
    publishChannels: channels,
    metaPostIds: json.ids ?? {},
    metaError: undefined,
    publishedBy: by,
    publishedAt: new Date().toISOString(),
  };
  await updateContent(next);
  return { ok: true, reasons: [], post: next };
}
