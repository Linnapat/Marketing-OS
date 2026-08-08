// Posting to a team's Slack room — the one place that decides HOW, so the
// live notification and the daily digest cannot disagree about where a team's
// messages land.
//
// A room can be wired two ways:
//
//   1. An incoming webhook in env (SLACK_WEBHOOK_URL_*). How the first three
//      rooms were set up.
//   2. A channel id in org_settings, posted to with the bot token the DMs
//      already use. Nothing secret is involved — a channel id is not a
//      credential — so a new room can be added from the app instead of from
//      Vercel, without a redeploy and without anyone handling a webhook URL.
//
// Webhook wins when both exist: it is the more specific instruction, and a room
// that was deliberately given its own webhook should keep using it.

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NotifyTeam, TEAM_ENV, TEAM_FALLBACK } from "@/lib/notifyRouting";
import { hasBotToken, postChannel } from "@/lib/slackBot";

/** org_settings key holding `{ team: "C…" }`. */
export const CHANNEL_IDS_KEY = "slack_channel_ids";

export type ChannelIds = Partial<Record<NotifyTeam, string>>;

/** Channel ids set in org_settings. Best-effort: a database hiccup must leave
 *  the webhook rooms working rather than silence every room at once. */
export async function loadChannelIds(): Promise<ChannelIds> {
  try {
    const db = supabaseAdmin();
    if (!db) return {};
    const { data } = await db.from("org_settings").select("value").eq("key", CHANNEL_IDS_KEY).limit(1);
    const raw = data?.[0]?.value;
    if (!raw) return {};
    const parsed = JSON.parse(raw as string) as Record<string, unknown>;
    const ids: ChannelIds = {};
    for (const [team, id] of Object.entries(parsed)) {
      if (typeof id === "string" && id.trim()) ids[team as NotifyTeam] = id.trim();
    }
    return ids;
  } catch {
    return {};
  }
}

/** The room's own incoming webhook, if env has one. Read per call so a newly
 *  added env var takes effect without a redeploy. */
export function webhookUrl(team: NotifyTeam): string | undefined {
  const key = TEAM_ENV[team];
  return key ? process.env[key] || undefined : undefined;
}

/** Whether this room can be reached at all — either way of wiring counts.
 *  Settings reports this, and it deliberately ignores TEAM_FALLBACK: a room
 *  that is only reachable by borrowing someone else's is not yet set up. */
export function roomWired(team: NotifyTeam, ids: ChannelIds): boolean {
  return Boolean(webhookUrl(team)) || Boolean(ids[team] && hasBotToken());
}

async function postWebhook(url: string, text: string): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 3900) }),
  });
  return res.ok;
}

/** Send one message to a team's room. Tries, in order: the room's own webhook,
 *  its channel id via the bot, then the room it is allowed to borrow. Returns
 *  false when the team has no room and when nothing is wired — the caller
 *  treats both as "not delivered to a channel", which is what they are. */
export async function postToTeam(team: NotifyTeam, text: string, ids: ChannelIds): Promise<boolean> {
  const own = webhookUrl(team);
  if (own) return postWebhook(own, text);

  const channelId = ids[team];
  if (channelId && hasBotToken()) return postChannel(channelId, text);

  const borrowed = TEAM_FALLBACK[team];
  const borrowedUrl = borrowed ? webhookUrl(borrowed) : undefined;
  if (borrowedUrl) return postWebhook(borrowedUrl, text);
  const borrowedId = borrowed ? ids[borrowed] : undefined;
  if (borrowedId && hasBotToken()) return postChannel(borrowedId, text);

  return false;
}
