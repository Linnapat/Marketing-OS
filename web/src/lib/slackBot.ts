// Slack Web API client — the half incoming webhooks cannot do.
//
// A webhook is bound to one channel, so "tell the person who was just assigned
// this" is impossible with one. DMs need a bot token (SLACK_BOT_TOKEN, scopes
// chat:write + im:write + users:read + users:read.email).
//
// Everything here is best-effort and returns rather than throws: a Slack
// outage must not fail the action that triggered the notification.

import "server-only";

const TOKEN = process.env.SLACK_BOT_TOKEN;
// Overridable so the DM path can be exercised against a stub before it starts
// landing in real people's DMs. Leave unset everywhere except local testing.
const API_BASE = process.env.SLACK_API_BASE || "https://slack.com/api";

export const hasBotToken = () => Boolean(TOKEN);

interface SlackResponse { ok: boolean; error?: string; [k: string]: unknown }

async function call(method: string, body: Record<string, unknown>): Promise<SlackResponse> {
  if (!TOKEN) return { ok: false, error: "no_token" };
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
    return (await res.json()) as SlackResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

/** Slack user id for an email, or null when this workspace has no such member.
 *  `users_not_found` is the ordinary case (someone using a different email for
 *  Slack), not an error worth logging loudly. */
export async function lookupUserByEmail(email: string): Promise<string | null> {
  const res = await call("users.lookupByEmail", { email });
  if (!res.ok) return null;
  const user = res.user as { id?: string } | undefined;
  return user?.id ?? null;
}

/** DM a user. Passing a user id as `channel` opens the IM if needed. */
export async function postDM(userId: string, text: string): Promise<boolean> {
  const res = await call("chat.postMessage", {
    channel: userId,
    text: text.slice(0, 3900),
    unfurl_links: false,
  });
  return res.ok;
}

/** Post to a channel by id/name with the bot token — used by the daily digest
 *  when a team is wired by token rather than webhook. */
export async function postChannel(channel: string, text: string): Promise<boolean> {
  const res = await call("chat.postMessage", {
    channel,
    text: text.slice(0, 3900),
    unfurl_links: false,
  });
  return res.ok;
}
