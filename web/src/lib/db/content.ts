// Data access for Content Calendar. Rich objects are stored whole in the
// `data` jsonb column, so every UI field round-trips losslessly.

import { supabase } from "@/lib/supabase";
import { CONTENT, ContentItem, contentApproveBlockers, canPublish } from "@/lib/data/content";
import { CAMPAIGNS } from "@/lib/data/campaigns";
import { liveOnly, moveToTrash, trashReady } from "@/lib/db/trash";
import { assertMockUniqueId, releaseMockId, seedMockIds } from "@/lib/db/mockGuard";
import { issueContentCode } from "@/lib/db/workCode";

const campById = Object.fromEntries(CAMPAIGNS.map((c) => [c.name, c.id]));

/** All posts — from Supabase (data blob) if configured, else the mock. */
export async function fetchContent(): Promise<ContentItem[]> {
  const db = supabase();
  if (!db) return CONTENT.map((c) => ({ ...c }));
  const { data, error } = await liveOnly(db.from("content_posts").select("id, data, created_at"), await trashReady()).order("id");
  if (error || !data) return []; // query error = no live data, never demo rows
  return data
    .map((r) => (r.data
      ? { ...(r.data as ContentItem), id: (r.data as ContentItem).id ?? `c${r.id}`,
          createdAt: (r.data as ContentItem).createdAt ?? (r.created_at as string | undefined) }
      : null))
    .filter(Boolean) as ContentItem[];
}

/** Insert a new post; returns it with the id every later write matches on.
 *
 *  That id is the one inside the `data` blob, not the table's serial primary
 *  key: updateContent/deleteContent filter on `data->>id`, and fetchContent
 *  hands the blob id to the UI. Returning `c<serial>` here instead handed the
 *  caller an id that exists nowhere in the blob, so editing a just-created post
 *  matched zero rows — Save Caption reported success and saved nothing until
 *  the page was reloaded. Only fall back to the serial when the caller supplied
 *  no id at all, and write it back so the blob agrees. */
export async function createContent(input: ContentItem): Promise<ContentItem> {
  const db = supabase();
  if (!db) {
    // Mock mode has no unique index to hit, so assert it here — this is exactly
    // the collision that shipped to production unnoticed.
    seedMockIds("content_posts", CONTENT.map((c) => c.id));
    assertMockUniqueId("content_posts", input.id);
    return input;
  }
  // Numbered here rather than in each form, so a post gets the same job number
  // whether it came from Submit, the plan modal or a graphic link.
  const post: ContentItem = input.code ? input : { ...input, code: await issueContentCode(input.campaignId) };
  const { data, error } = await db.from("content_posts").insert({
    title: post.title, brand: post.b, campaign: post.campaign, campaign_id: post.campaignId ?? campById[post.campaign] ?? null,
    platforms: post.platforms ?? [post.plat], status: post.status, day: post.day, time: post.time,
    owner: post.owner, caption: post.caption, data: post,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message || "Could not save content post to Supabase");
  if (post.id) return post;
  const seeded: ContentItem = { ...post, id: `c${data.id}` };
  const { error: idError } = await db.from("content_posts").update({ data: seeded }).eq("id", data.id);
  if (idError) throw new Error(idError.message);
  return seeded;
}

/** Source content-item ids already materialised for a campaign — the
 *  idempotency set that makes re-running a Submit a no-op. */
/** One post by id — the graphic drawer needs the caption of the post its
 *  artwork serves, and pulling the whole calendar to find one row is not that.
 *
 *  Filtered in SQL on data->>'id', which is where the app's own ids live (the
 *  table's own `id` is the database's). Null when there is no such post. */
export async function fetchContentById(id: string): Promise<ContentItem | null> {
  const key = String(id ?? "").trim();
  if (!key) return null;
  const db = supabase();
  if (!db) return CONTENT.find((c) => String(c.id) === key) ?? null;
  const { data, error } = await liveOnly(
    db.from("content_posts").select("id, data, created_at").eq("data->>id", key).limit(1),
    await trashReady(),
  );
  if (error || !data?.length) return null;
  const r = data[0];
  if (!r.data) return null;
  return {
    ...(r.data as ContentItem),
    id: (r.data as ContentItem).id ?? `c${r.id}`,
    createdAt: (r.data as ContentItem).createdAt ?? (r.created_at as string | undefined),
  };
}

export async function fetchContentSourceIds(campaignId: string): Promise<Set<string>> {
  const db = supabase();
  if (!db) return new Set();
  const { data, error } = await db.from("content_posts").select("data").eq("campaign_id", campaignId);
  // A failed read must abort the fan-out, not come back as "nothing exists yet":
  // an empty set here sends every item to insert, straight into the unique index.
  if (error) throw new Error(`เช็คงานเดิมของแคมเปญไม่สำเร็จ (${error.message}) — ยังไม่ได้สร้างอะไรเพิ่ม ลองใหม่อีกครั้ง`);
  if (!data) return new Set();
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
  try {
    const created = await createContent(post);
    return { created: true, post: created };
  } catch (error) {
    // Two Approves can race (two buttons, two tabs, two people): both pass the
    // read above, both insert, and the slower one dies on content_posts_source_uniq
    // even though the post it wanted now exists — which is this function's
    // promise kept, not an error. Re-check the database instead of parsing the
    // message; anything still missing is a real failure and is rethrown.
    if (key && post.campaignId) {
      const now = await fetchContentSourceIds(post.campaignId).catch(() => new Set<string>());
      if (now.has(key)) return { created: false, post };
    }
    throw error;
  }
}

/** Persist an edited post (approval action, caption edit, etc). The whole
 *  object round-trips through the `data` jsonb; the status column is mirrored
 *  so list queries stay accurate. Matched on the stable id inside the blob
 *  (the same value fetchContent surfaces to the UI). */
export async function updateContent(post: ContentItem): Promise<void> {
  const db = supabase();
  if (!db) return;
  // `.select()` so a filter that matches nothing is caught. Postgres reports no
  // error for an UPDATE that touches zero rows — whether the id is stale or RLS
  // hid the row — and without this the caller shows "saved" over a lost edit.
  // Mirror EVERY column createContent writes, not just status and caption.
  // The columns are a denormalised copy of the blob, and half of them were
  // never refreshed on update — so moving a post to another campaign left
  // `campaign_id` pointing at the old one. That is not cosmetic: deleteCampaign
  // cascades on `campaign_id`, so deleting the campaign a post had been moved
  // OUT of would have taken the post with it.
  const { data, error } = await db.from("content_posts")
    .update({
      title: post.title, brand: post.b,
      campaign: post.campaign, campaign_id: post.campaignId ?? campById[post.campaign] ?? null,
      platforms: post.platforms ?? [post.plat], status: post.status,
      day: post.day, time: post.time, owner: post.owner, caption: post.caption,
      data: post,
    })
    .eq("data->>id", post.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`ไม่พบโพสต์นี้ในฐานข้อมูล (id ${post.id}) — ลอง refresh หน้าแล้วบันทึกใหม่`);
}

/** Move a post to Trash — recoverable for 7 days, then purged.
 *
 *  Falls back to a hard delete only when the trash migration has not been run
 *  yet, so "ลบ" never silently does nothing on a database that predates it.
 *
 *  Returns how many linked Graphic Requests went with it, so the caller can say
 *  so — deleting three things when the user asked to delete one must not be
 *  silent. */
export async function deleteContent(post: ContentItem, by = ""): Promise<{ graphics: number }> {
  const db = supabase();
  if (!db) { releaseMockId("content_posts", post.id); return { graphics: 0 }; }
  if (await moveToTrash("content", post.id, by)) {
    return { graphics: await trashGraphicsForPost(post, by) };
  }
  const { data, error } = await db.from("content_posts").delete().eq("data->>id", post.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`ไม่พบโพสต์นี้ในฐานข้อมูล (id ${post.id}) — ลอง refresh หน้าแล้วลบใหม่`);
  return { graphics: 0 };
}

/** Send a deleted post's Graphic Requests to Trash with it.
 *
 *  Without this the request outlives the post that justified it and shows up on
 *  /graphic under a campaign whose plan no longer contains it — six such rows
 *  had built up on OMD-20260901-MASTER by the time anyone noticed, because
 *  nothing in the app ever pointed at the leftovers.
 *
 *  Matching is the explicit-links-only rule in findLinkedGraphics: the request
 *  names the post, or the post names the request. Both go to Trash, not a hard
 *  delete, so an unwanted cascade is undone from /trash within 7 days.
 *
 *  A failure here throws even though the post is already gone. The alternative
 *  — swallow it and carry on — recreates the exact orphan this function exists
 *  to prevent, and does it quietly. Better a visible error naming the post. */
async function trashGraphicsForPost(post: ContentItem, by: string): Promise<number> {
  const db = supabase();
  if (!db || !(await trashReady())) return 0;

  const named = String(post.graphicRequestId ?? "").trim();
  // Two writes rather than one .or() filter: PostgREST's `or` needs the JSON
  // arrow operators inlined into the filter string, where an id containing a
  // comma or a dot would silently change the predicate.
  const targets = [
    db.from("graphic_requests").update({ deleted_at: new Date().toISOString(), deleted_by: by })
      .eq("data->>contentPostId", post.id).is("deleted_at", null).select("id"),
    ...(named
      ? [db.from("graphic_requests").update({ deleted_at: new Date().toISOString(), deleted_by: by })
          .eq("data->>id", named).is("deleted_at", null).select("id")]
      : []),
  ];

  const results = await Promise.all(targets);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new Error(
      `ลบโพสต์ “${post.title}” แล้ว แต่ลบคำขอกราฟิกที่ผูกไว้ไม่สำเร็จ: ${failed.error.message} — ` +
      `คำขอนั้นจะค้างอยู่ในหน้า Graphic Request ต้องลบเอง`,
    );
  }
  // A post can name a request that also names the post; count rows once.
  const ids = new Set(results.flatMap((r) => (r.data ?? []).map((row) => (row as { id: number }).id)));
  return ids.size;
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
  const { authHeaders } = await import("@/lib/supabase");
  const res = await fetch("/api/meta/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
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
