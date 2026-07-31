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

/** The next artwork code — under its post when it has one, else under the
 *  campaign. `contentPostId` is the post's blob id, the same value the request
 *  stores. */
export async function issueArtworkCode(campaignId?: string, contentPostId?: string): Promise<string | undefined> {
  const db = supabase();
  if (!db || !campaignId) return undefined;

  let postCode: string | undefined;
  if (contentPostId) {
    const { data } = await db.from("content_posts").select("data").eq("data->>id", contentPostId).maybeSingle();
    postCode = (data?.data as { code?: string } | null)?.code;
  }
  // A post that exists but has no code of its own would otherwise silently push
  // this artwork up to the campaign, where it would collide with the standalone
  // numbering. Falling back is right only when there is genuinely no post.
  const parent = artworkParent(postCode, contentPostId && !postCode ? undefined : await campaignCodeOf(campaignId));
  if (!parent) return undefined;

  const { data } = await db.from("graphic_requests").select("data").eq("campaign_id", campaignId);
  const used = (data ?? []).map((r) => (r.data as { code?: string } | null)?.code);
  return nextWorkCode(parent, "A", used);
}
