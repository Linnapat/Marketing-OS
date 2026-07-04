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
    title: post.title, brand: post.b, campaign: post.campaign, campaign_id: campById[post.campaign] ?? null,
    platforms: post.platforms ?? [post.plat], status: post.status, day: post.day, time: post.time,
    owner: post.owner, caption: post.caption, data: post,
  }).select("id").single();
  if (error || !data) return post;
  return { ...post, id: `c${data.id}` };
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
