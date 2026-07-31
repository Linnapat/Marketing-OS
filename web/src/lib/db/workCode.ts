// Issuing a job number to a post or an artwork request as it is created.
//
// Lives at the data layer, not in the forms: posts and requests are created from
// several places (Submit materialising a brief, the Content Plan modal, the
// Graphic Request modal, the post→graphic link), and a number handed out by only
// some of them is worse than none — half the work would be quotable and half
// would not. createContent/createGraphic call this, so every path is covered.
//
// Reads the codes already issued for the campaign rather than counting rows, so
// a deleted post does not hand its number to the next one. The read is a real
// round trip; it is one small query per create, on an action that already writes.
//
// Race: two people creating a post in the same campaign at the same moment can
// still be handed the same number — the same limit the campaign codes have. It
// is visible rather than silent (two posts, one number), and the fix is a
// database-side sequence, which is worth doing for all three at once.

import { supabase } from "@/lib/supabase";
import { nextWorkCode, artworkParent } from "@/lib/data/workCode";

async function campaignCodeOf(campaignId?: string): Promise<string | undefined> {
  const db = supabase();
  if (!db || !campaignId) return undefined;
  const { data } = await db.from("campaigns").select("data").eq("id", campaignId).maybeSingle();
  return (data?.data as { code?: string } | null)?.code;
}

/** The next content code for a campaign, or undefined when the campaign has no
 *  code (nothing to hang a number off — better unnumbered than misfiled). */
export async function issueContentCode(campaignId?: string): Promise<string | undefined> {
  const db = supabase();
  if (!db || !campaignId) return undefined;
  const campaignCode = await campaignCodeOf(campaignId);
  if (!campaignCode) return undefined;
  const { data } = await db.from("content_posts").select("data").eq("campaign_id", campaignId);
  const used = (data ?? []).map((r) => (r.data as { code?: string } | null)?.code);
  return nextWorkCode(campaignCode, "C", used);
}

/** The post this artwork serves, by the post's blob id or — when the request was
 *  built from a brief and has no post id yet — by the (campaign, brief row) pair
 *  that identifies the post the Submit just created. Returns the post only when
 *  it is in the SAME campaign: a request pointing at a post that has since moved
 *  campaigns must not be numbered under the campaign it moved to. */
async function servedPost(campaignId: string, contentPostId?: string, sourceContentItemId?: string) {
  const db = supabase();
  if (!db) return null;
  if (contentPostId) {
    const { data } = await db.from("content_posts").select("data, campaign_id").eq("data->>id", contentPostId).maybeSingle();
    return data ?? null;
  }
  if (sourceContentItemId) {
    const { data } = await db.from("content_posts").select("data, campaign_id")
      .eq("campaign_id", campaignId).eq("data->>sourceContentItemId", sourceContentItemId).maybeSingle();
    return data ?? null;
  }
  return null;
}

/** The next artwork code — under its post when it has one, else under the
 *  campaign. `contentPostId` is the post's blob id; `sourceContentItemId` is the
 *  fallback the brief-Submit path has, since it creates the request without ever
 *  learning the post id. */
export async function issueArtworkCode(
  campaignId?: string, contentPostId?: string, sourceContentItemId?: string,
): Promise<string | undefined> {
  const db = supabase();
  if (!db || !campaignId) return undefined;

  const post = await servedPost(campaignId, contentPostId, sourceContentItemId);
  // Only nest under a post of this campaign. A cross-campaign link is real in
  // live data (a post moved and its request stayed behind), and nesting there
  // would give the artwork a code naming a campaign it is not in.
  const sameCampaign = post && post.campaign_id === campaignId;
  const postCode = sameCampaign ? (post.data as { code?: string } | null)?.code : undefined;

  const parent = artworkParent(postCode, await campaignCodeOf(campaignId));
  if (!parent) return undefined;

  const { data } = await db.from("graphic_requests").select("data").eq("campaign_id", campaignId);
  const used = (data ?? []).map((r) => (r.data as { code?: string } | null)?.code);
  return nextWorkCode(parent, "A", used);
}
