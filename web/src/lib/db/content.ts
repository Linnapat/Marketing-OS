// Data access for Content Calendar. Rich objects are stored whole in the
// `data` jsonb column, so every UI field round-trips losslessly.

import { supabase } from "@/lib/supabase";
import { CONTENT, ContentItem } from "@/lib/data/content";
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
  if (error || !data) return post;
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
  await db.from("content_posts")
    .update({ status: post.status, caption: post.caption, data: post })
    .eq("data->>id", post.id);
}
