import { NextRequest, NextResponse } from "next/server";
import { ContentItem, itemPlatforms } from "@/lib/data/content";
import { MetaBrandAccount } from "@/lib/db/metaPublishing";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function caption(post: ContentItem): string {
  return [post.caption, post.hashtags, post.cta].filter(Boolean).join("\n\n");
}

function firstAssetUrl(post: ContentItem): string | null {
  return post.assets?.find((asset) => asset.link)?.link ?? null;
}

async function postForm(path: string, form: Record<string, string>): Promise<{ id?: string; error?: string }> {
  const body = new URLSearchParams(form);
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json?.error?.message || `Meta API error ${res.status}` };
  return { id: json.id ?? json.post_id };
}

export async function POST(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: "Meta token missing in Vercel env: META_PAGE_ACCESS_TOKEN" }, { status: 412 });

  const { post, channels, account } = await req.json() as { post: ContentItem; channels?: string[]; account?: MetaBrandAccount };
  const pageId = account?.facebookPageId || process.env.META_FACEBOOK_PAGE_ID;
  const igId = account?.instagramBusinessId || process.env.META_INSTAGRAM_BUSINESS_ID;
  const requested = channels?.length ? channels : itemPlatforms(post);
  const wantsFacebook = requested.some((ch) => /facebook/i.test(ch));
  const wantsInstagram = requested.some((ch) => /instagram|reel/i.test(ch));
  const ids: Record<string, string> = {};
  const errors: string[] = [];

  if (wantsFacebook) {
    if (!pageId) errors.push("Facebook Page ID missing in Vercel env: META_FACEBOOK_PAGE_ID");
    else {
      const asset = firstAssetUrl(post);
      const path = asset ? `${pageId}/photos` : `${pageId}/feed`;
      const payload: Record<string, string> = asset
        ? { url: asset, caption: caption(post), published: "true", access_token: token }
        : { message: caption(post), access_token: token };
      const fb = await postForm(path, payload);
      if (fb.error) errors.push(`Facebook: ${fb.error}`);
      else if (fb.id) ids.facebook = fb.id;
    }
  }

  if (wantsInstagram) {
    const asset = firstAssetUrl(post);
    if (!igId) errors.push("Instagram Business ID missing in Vercel env: META_INSTAGRAM_BUSINESS_ID");
    else if (!asset) errors.push("Instagram requires a public image/video asset URL");
    else {
      const created = await postForm(`${igId}/media`, { image_url: asset, caption: caption(post), access_token: token });
      if (created.error || !created.id) errors.push(`Instagram container: ${created.error || "missing creation id"}`);
      else {
        const published = await postForm(`${igId}/media_publish`, { creation_id: created.id, access_token: token });
        if (published.error) errors.push(`Instagram publish: ${published.error}`);
        else if (published.id) ids.instagram = published.id;
      }
    }
  }

  if (errors.length) return NextResponse.json({ ok: false, error: errors.join(" · "), ids }, { status: 502 });
  return NextResponse.json({ ok: true, ids });
}
