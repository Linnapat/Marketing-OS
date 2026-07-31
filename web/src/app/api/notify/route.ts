// Real notifications — closes the "แจ้งในกลุ่ม LINE เอง" gap in the user guide.
//
// POST { event, title, detail?, link?, team? }
//   → Slack via a per-team incoming webhook   (SLACK_WEBHOOK_URL[_FINANCE|_CREATIVE])
//   → LINE group push via the Messaging API  (LINE_CHANNEL_ACCESS_TOKEN + LINE_TO)
//   → email via Resend                       (RESEND_API_KEY + NOTIFY_EMAIL_FROM/TO)
//
// GET → which channels are configured (no secrets), for Settings → Integrations.
//
// Each channel is independent and skipped when its env vars are absent, so
// moving from LINE to Slack is done by setting SLACK_WEBHOOK_URL and dropping
// the LINE ones — no code change, and no window where notifications stop.
//
// Slack is routed per team (see lib/notifyRouting): finance work goes to the
// finance webhook, creative work to the creative one, everything else to the
// general one. A team without its own webhook falls back to the general one, so
// setting SLACK_WEBHOOK_URL alone behaves exactly as it did before.
//
// Channels/triggers can be switched off in Settings → Notifications (persisted
// to org_settings). Unconfigured channels are skipped silently so the app works
// exactly as before until the env vars are added. See web/NOTIFICATIONS.md.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";
import { NotifyTeam, TEAM_ENV, NOTIFY_TEAMS, resolveTeam } from "@/lib/notifyRouting";

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_TO = process.env.LINE_TO; // group id (C…) or user id (U…)
const RESEND_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.NOTIFY_EMAIL_FROM; // e.g. "Marketing OS <os@teppenthailand.co.th>"
const MAIL_TO = process.env.NOTIFY_EMAIL_TO;     // comma-separated recipients

/** The webhook a team posts to, falling back to the general one when that team
 *  has no channel of its own. Read per call rather than cached at module load
 *  so a redeploy isn't needed to pick up a newly added env var. */
function slackWebhookFor(team: NotifyTeam): string | undefined {
  return process.env[TEAM_ENV[team]] || process.env[TEAM_ENV.general] || undefined;
}

const anySlackConfigured = () => NOTIFY_TEAMS.some((t) => Boolean(process.env[TEAM_ENV[t]]));

interface NotifyBody { event?: string; title?: string; detail?: string; link?: string; team?: string }

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
  const { event = "generic", title, detail = "", link = "", team: teamHint } = body;
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

  const [slack, line, email] = await Promise.all([
    slackOn ? sendSlack(team, title, detail, fullLink).catch(() => false) : Promise.resolve(false),
    lineOn ? sendLine(text).catch(() => false) : Promise.resolve(false),
    emailOn ? sendEmail(`[Marketing OS] ${title}`, html).catch(() => false) : Promise.resolve(false),
  ]);

  return NextResponse.json({
    ok: true, slack, line, email, team,
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
    NOTIFY_TEAMS.map((t) => [t, {
      own: Boolean(process.env[TEAM_ENV[t]]),
      routed: Boolean(slackWebhookFor(t)),
      env: TEAM_ENV[t],
    }]),
  );
  return NextResponse.json({
    ok: true,
    slack: { configured: anySlackConfigured(), teams },
    line: Boolean(LINE_TOKEN && LINE_TO),
    email: Boolean(RESEND_KEY && MAIL_FROM && MAIL_TO),
  });
}
