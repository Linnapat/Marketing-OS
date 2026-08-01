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

/** Slack is not uniform about this: chat.postMessage takes JSON, but the older
 *  read methods — users.lookupByEmail among them — accept ONLY
 *  application/x-www-form-urlencoded. Post JSON to one of those and Slack does
 *  not complain about the encoding; it simply sees no arguments and answers as
 *  though you asked about nobody, which reads exactly like "that person is not
 *  in this workspace". Every lookup failed this way for a day and looked like a
 *  Slack account problem instead of ours. */
type Encoding = "json" | "form";

async function call(method: string, body: Record<string, unknown>, encoding: Encoding = "json"): Promise<SlackResponse> {
  if (!TOKEN) return { ok: false, error: "no_token" };
  const isForm = encoding === "form";
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": isForm
          ? "application/x-www-form-urlencoded; charset=utf-8"
          : "application/json; charset=utf-8",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: isForm
        ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString()
        : JSON.stringify(body),
    });
    return (await res.json()) as SlackResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

/** Slack user id for an email, plus WHY when there isn't one.
 *
 *  This used to return a bare null, which made `users_not_found` (this person
 *  uses a different email for Slack — ordinary, fix it in Users & Roles) look
 *  exactly like `missing_scope` (the token can't ask — reinstall the app).
 *  They need opposite fixes, and telling them apart from the outside cost an
 *  afternoon, so the reason travels with the answer now. */
export async function lookupUserByEmail(email: string): Promise<{ id: string | null; reason?: string }> {
  const res = await call("users.lookupByEmail", { email }, "form");
  if (!res.ok) return { id: null, reason: res.error || "unknown_error" };
  const user = res.user as { id?: string } | undefined;
  return user?.id ? { id: user.id } : { id: null, reason: "no_user_in_response" };
}

/** DM a user. Passing a user id as `channel` opens the IM if needed. */
export async function postDM(userId: string, text: string): Promise<{ ok: boolean; reason?: string }> {
  const res = await call("chat.postMessage", {
    channel: userId,
    text: text.slice(0, 3900),
    unfurl_links: false,
  });
  return res.ok ? { ok: true } : { ok: false, reason: res.error || "unknown_error" };
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
