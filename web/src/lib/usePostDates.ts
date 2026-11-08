"use client";

// The post date a Graphic Request is working towards, for the request list's
// "Post date" column. Designers asked for it beside Due so they can order the
// queue by what goes live first — Due is when the artwork is wanted, the post
// date is when it is actually published.
//
// One read of the content posts, cached at module level like useCampaignCodes:
// the list renders once per campaign group in "By Campaign", and every row
// needs the same lookup. Matching a request to its post is findLinkedPost's
// job (pure, tested) — this hook only owns the fetch and the cache.

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/db/content";
import { findLinkedPost, type Graphic } from "@/lib/data/graphic";
import type { ContentItem } from "@/lib/data/content";

let _posts: ContentItem[] | null = null;
let _inflight: Promise<ContentItem[]> | null = null;

async function loadPosts(): Promise<ContentItem[]> {
  if (_posts) return _posts;
  if (_inflight) return _inflight;
  _inflight = fetchContent()
    .then((rows) => { _posts = rows; return rows; })
    // A column that only decorates the row must not break the list.
    .catch(() => { _posts = []; return _posts; });
  return _inflight;
}

/** "Oct 26" — the same shape the Due column prints. */
export function shortPostDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** `postDateOf(g)` → the linked post's date as ISO, or "" when the request has
 *  no post (or the posts have not loaded yet). */
export function usePostDates(): (g: Graphic) => string {
  const [posts, setPosts] = useState<ContentItem[] | null>(_posts);
  useEffect(() => {
    if (posts) return;
    let alive = true;
    void loadPosts().then((p) => { if (alive) setPosts(p); });
    return () => { alive = false; };
  }, [posts]);
  return (g) => {
    if (!posts) return "";
    const post = findLinkedPost(g, posts) as ContentItem | null;
    return post?.dateIso ?? "";
  };
}
