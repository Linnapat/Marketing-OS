// Real notifications — closes the "แจ้งในกลุ่ม LINE เอง" gap in the user guide.
//
// POST { event, title, detail?, link?, team?, to? }
//   → Slack — a channel webhook, a DM, or both (see below)
//   → LINE group push via the Messaging API  (LINE_CHANNEL_ACCESS_TOKEN + LINE_TO)
//   → email via Resend                       (RESEND_API_KEY + NOTIFY_EMAIL_FROM/TO)
//
// GET → which channels are configured (no secrets), for Settings → Integrations.
//
// Slack routing follows the team's rooms, not our idea of them (lib/notifyRouting):
//
//   KOL / VDO / Graphic work  → that room's webhook
//   campaigns, tasks, help    → DM only, no room
//   anything about money      → DM to one person (SLACK_FINANCE_DM), no room
//
// `to` names the people an event is FOR (assigned, asked to revise). They get a
// DM and the room is spared the interruption — the event is queued instead and
// goes out in one daily summary (/api/notify/digest). Without `to`, a room
// event posts immediately.
//
// Every channel is independent and skipped when its env vars are absent, so the
// app behaves exactly as before until they are set. Channels/triggers can also
// be switched off in Settings → Notifications. See web/NOTIFICATIONS.md.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";
import { NotifyTeam, TEAM_ENV, CHANNEL_TEAMS, hasChannel, resolveTeam, inboxKind, webhookEnvKeys } from "@/lib/notifyRouting";
import { hasBotToken, postDM } from "@/lib/slackBot";
import { resolveSlackIds, fetchUnmapped } from "@/lib/slackDirectory";

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_TO = process.env.LINE_TO; // group id (C…) or user id (U…)
const RESEND_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.NOTIFY_EMAIL_FROM; // e.g. "Marketing OS <os@teppenthailand.co.th>"
const MAIL_TO = process.env.NOTIFY_EMAIL_TO;     // comma-separated recipients

/** The one person told about money. Everything financial is DM'd here and
 *  reaches no channel — an email, or any name the members table knows. */
const FINANCE_DM = () => process.env.SLACK_FINANCE_DM || "";

/** A team's webhook. Read per call rather than cached at module load so a newly
 *  added env var takes effect without a redeploy. Teams with no room (general,
 *  finance) have no env var and deliberately return nothing. Content borrows
 *  the graphic room until its own webhook is set — see TEAM_FALLBACK. */
function slackWebhookFor(team: NotifyTeam): string | undefined {
  for (const key of webhookEnvKeys(team)) {
    const url = process.env[key];
    if (url) return url;
  }
  return undefined;
}

/** Whether the team's OWN webhook is set — no borrowing. Settings reports this
 *  one, so a room still waiting for its webhook shows up as missing instead of
 *  looking wired because a fallback covers it. */
function ownWebhook(team: NotifyTeam): boolean {
  const key = TEAM_ENV[team];
  return Boolean(key && process.env[key]);
}

const anySlackConfigured = () => CHANNEL_TEAMS.some(ownWebhook);

interface NotifyBody { event?: string; title?: string; detail?: string; link?: string; team?: string; to?: string[]; inform?: string[] }

/** DM everyone the event is for. Returns who was reached and who could not be
 *  found — an unfound person is skipped quietly here and surfaced in Settings
 *  instead, so one unmapped account never blocks the rest. */
async function sendDMs(names: string[], title: string, detail: string, link: string): Promise<{ sent: string[]; unresolved: string[] }> {
  if (!hasBotToken() || names.length === 0) return { sent: [], unresolved: [] };
  const lines = [`*${title}*`];
  if (detail) lines.push(detail);
  if (link) lines.push(`<${link}|เปิดใน Marketing OS>`);
  const text = lines.join("\n");

  const resolved = await resolveSlackIds(names);
  const results = await Promise.all(resolved.map(async (r) => {
    if (!r.slackId) return { ...r, ok: false };
    const posted = await postDM(r.slackId, text).catch(() => ({ ok: false, reason: "request_failed" }));
    return { ...r, ok: posted.ok, reason: posted.ok ? undefined : posted.reason };
  }));
  return {
    sent: results.filter((r) => r.ok).map((r) => r.name),
    // The reason travels back so a failed test says what Slack objected to
    // rather than just "it didn't work".
    unresolved: results.filter((r) => !r.ok).map((r) => `${r.name} (${r.reason ?? "unknown"})`),
  };
}

/** Park a DM'd event for the daily channel summary. Best-effort: losing a
 *  digest line must not fail the notification that was already delivered. */
async function queueForDigest(team: NotifyTeam, event: string, title: string, detail: string, link: string, recipients: string[], delivered: boolean): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (!db) return;
    await db.from("slack_digest_queue").insert({
      team, event, title, detail: detail || null, link: link || null, recipients, delivered,
    });
  } catch { /* the DM already went out; the summary line is the lesser loss */ }
}

/** Everything that means "me", for the person who triggered this. Telling
 *  someone their own action came back is noise, and noise is how an inbox stops
 *  being read — the client-side writer this replaces already dropped the actor,
 *  so losing that would be a regression. The caller's email comes from their
 *  JWT; the member name is looked up because most rows name people that way. */
async function actorKeys(email: string | null): Promise<Set<string>> {
  const keys = new Set<string>();
  const add = (v?: string | null) => {
    const k = (v ?? "").trim().toLowerCase();
    if (!k) return;
    keys.add(k);
    if (k.includes("@")) keys.add(k.split("@")[0]);
  };
  add(email);
  try {
    const db = supabaseAdmin();
    if (db && email) {
      const { data } = await db.from("members").select("name").ilike("email", email).limit(1);
      add(data?.[0]?.name as string | undefined);
    }
  } catch { /* a missing name only risks one self-notification */ }
  return keys;
}

/** Write the in-app inbox rows. `to` are the people the event is for; `inform`
 *  are people who should find it in the bell without being interrupted by a DM.
 *  Best-effort, like every other channel here: the Slack message already went
 *  out and must not be undone by a failed insert. */
async function fillInbox(
  people: string[], actor: Set<string>,
  n: { event: string; title: string; detail: string; link: string },
): Promise<number> {
  try {
    const db = supabaseAdmin();
    if (!db) return 0;
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const raw of people) {
      const name = (raw ?? "").trim();
      const key = name.toLowerCase();
      if (!name || name === "Unassigned" || seen.has(key)) continue;
      if (actor.has(key) || (key.includes("@") && actor.has(key.split("@")[0]))) continue;
      seen.add(key);
      rows.push({
        recipient: name, event: inboxKind(n.event), title: n.title,
        detail: n.detail || null, link: n.link || null, actor: null,
      });
    }
    if (!rows.length) return 0;
    const { error } = await db.from("notifications").insert(rows);
    if (error) { console.warn("inbox insert skipped", error.message); return 0; }
    return rows.length;
  } catch { return 0; }
}

/** Settings → Notifications toggles (org_settings kv). Missing = everything on. */
async function loadPrefs(): Promise<{ channels: Record<string, boolean>; triggers: Record<string, boolean> }> {
  const fallback = { channels: {}, triggers: {} };
  try {
    const db = supabaseAdmin();
    if (!db) return fallback;
    const { data } = await db.from("org_settings").select("key, value").in("key", ["notif_channels", "notif_triggers"]);
    const get = (k: string) => {
      const row = data?.find((r) => r.key === k);
      return row ? (JSON.parse(row.value as string) as Record<string, boolean>) : {};
    };
    return { channels: get("notif_channels"), triggers: get("notif_triggers") };
  } catch {
    return fallback;
  }
}

/** Slack incoming webhook for one team. mrkdwn, so the link becomes a real one
 *  rather than a bare URL taking up a line of its own. */
async function sendSlack(team: NotifyTeam, title: string, detail: string, link: string): Promise<boolean> {
  const webhook = slackWebhookFor(team);
  if (!webhook) return false;
  const lines = [`*${title}*`];
  if (detail) lines.push(detail);
  if (link) lines.push(`<${link}|เปิดใน Marketing OS>`);
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n").slice(0, 3900) }),
  });
  return res.ok;
}

async function sendLine(text: string): Promise<boolean> {
  if (!LINE_TOKEN || !LINE_TO) return false;
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: LINE_TO, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
  });
  return res.ok;
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY || !MAIL_FROM || !MAIL_TO) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: MAIL_FROM, to: MAIL_TO.split(",").map((s) => s.trim()).filter(Boolean), subject, html }),
  });
  return res.ok;
}

export async function POST(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  let body: NotifyBody;
  try {
    body = (await req.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const { event = "generic", title, detail = "", link = "", team: teamHint, to = [], inform = [] } = body;
  const recipients = Array.isArray(to) ? to.filter((n): n is string => typeof n === "string") : [];
  // People who should find this in the bell but not be interrupted by a DM.
  const informed = Array.isArray(inform) ? inform.filter((n): n is string => typeof n === "string") : [];
  if (!title) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });

  const prefs = await loadPrefs();
  // A trigger toggled OFF in Settings silences the event; unknown events pass.
  if (prefs.triggers[event] === false) {
    return NextResponse.json({ ok: true, skipped: "trigger disabled" });
  }
  const slackOn = prefs.channels.slack !== false;
  const lineOn = prefs.channels.line !== false;
  const emailOn = prefs.channels.email !== false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  // `link` is an in-app path and nothing else. new URL(link, appUrl) lets an
  // ABSOLUTE url win over the base, so a caller could push any external link
  // into the company LINE group / Slack / mailbox under the bot's name — a
  // ready-made phishing channel, since every notification looks like ours.
  // Anything that isn't a same-origin relative path is dropped.
  const safeLink = /^\/(?!\/)/.test(link) ? link : "";
  const fullLink = safeLink && appUrl ? new URL(safeLink, appUrl).toString() : safeLink;
  const text = [title, detail, fullLink].filter(Boolean).join("\n");
  // Escape caller-supplied strings before embedding in the email HTML so a
  // title/detail containing markup can't inject arbitrary HTML into the message.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<p><b>${esc(title)}</b></p>${detail ? `<p>${esc(detail)}</p>` : ""}${fullLink ? `<p><a href="${esc(fullLink)}">เปิดใน Marketing OS →</a></p>` : ""}`;

  // Routed on the link the notification carries unless the caller named a team.
  const team = resolveTeam(teamHint, link);
  // Money goes to one person and never to a room, whoever the event is about.
  const dmTargets = team === "finance"
    ? [FINANCE_DM()].filter(Boolean)
    : recipients;
  // A room only hears about it when the event isn't addressed to anyone —
  // otherwise the people concerned get a DM and the room gets the daily digest.
  // Teams with no room (general, finance) are DM-only either way.
  const canDM = slackOn && dmTargets.length > 0 && hasBotToken();
  const toChannel = slackOn && hasChannel(team) && !canDM;

  const [dm, slack, line, email] = await Promise.all([
    canDM ? sendDMs(dmTargets, title, detail, fullLink).catch(() => ({ sent: [], unresolved: dmTargets })) : Promise.resolve({ sent: [] as string[], unresolved: [] as string[] }),
    toChannel ? sendSlack(team, title, detail, fullLink).catch(() => false) : Promise.resolve(false),
    lineOn ? sendLine(text).catch(() => false) : Promise.resolve(false),
    emailOn ? sendEmail(`[Marketing OS] ${title}`, html).catch(() => false) : Promise.resolve(false),
  ]);
  // Only rooms get a digest — there is nowhere to summarise general/finance to.
  if (canDM && hasChannel(team)) {
    await queueForDigest(team, event, title, detail, fullLink, dmTargets, dm.sent.length > 0);
  }

  // The in-app inbox. Deliberately NOT gated on the Slack toggle or on whether
  // a DM was delivered: the bell is the one channel that works when Slack is
  // off, the token has expired, or the person's email does not match their
  // Slack account — which is exactly when a notification is most likely to be
  // lost. Money is the one exception: it is DM'd to one person by design and
  // must not appear in anyone else's bell.
  // The stored link stays relative — the bell renders an in-app <Link>, and an
  // absolute URL there would send someone out to the browser and back.
  const inboxPeople = team === "finance" ? [] : [...recipients, ...informed];
  const inbox = inboxPeople.length
    ? await fillInbox(inboxPeople, await actorKeys(guard.user.email), { event, title, detail, link: safeLink })
    : 0;

  return NextResponse.json({
    ok: true, slack, line, email, team, dm, inbox,
    configured: {
      slack: anySlackConfigured(),
      line: Boolean(LINE_TOKEN && LINE_TO),
      email: Boolean(RESEND_KEY && MAIL_FROM && MAIL_TO),
    },
  });
}

/** Read-only wiring status for Settings → Integrations. Never returns a webhook
 *  URL — only whether each one is set, and which team falls back to general. */
export async function GET(req: NextRequest) {
  const guard = await requireApiUser(req);
  if (isApiAuthError(guard)) return guard.error;

  const teams = Object.fromEntries(
    CHANNEL_TEAMS.map((t) => [t, { own: ownWebhook(t), env: TEAM_ENV[t] }]),
  );
  // Who the app tried to DM and couldn't — shown as a warning rather than left
  // to be discovered by someone wondering why they never hear about their work.
  const unmapped = hasBotToken() ? await fetchUnmapped().catch(() => []) : [];

  return NextResponse.json({
    ok: true,
    slack: { configured: anySlackConfigured(), teams, dm: hasBotToken(), financeDm: Boolean(FINANCE_DM()), unmapped },
    line: Boolean(LINE_TOKEN && LINE_TO),
    email: Boolean(RESEND_KEY && MAIL_FROM && MAIL_TO),
  });
}
