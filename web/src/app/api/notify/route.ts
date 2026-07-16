// Real notifications — closes the "แจ้งในกลุ่ม LINE เอง" gap in the user guide.
//
// POST { event, title, detail?, link? }
//   → LINE group push via the Messaging API  (LINE_CHANNEL_ACCESS_TOKEN + LINE_TO)
//   → email via Resend                       (RESEND_API_KEY + NOTIFY_EMAIL_FROM/TO)
//
// Channels/triggers can be switched off in Settings → Notifications (persisted
// to org_settings). Unconfigured channels are skipped silently so the app works
// exactly as before until the env vars are added. See web/NOTIFICATIONS.md.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiUser, isApiAuthError } from "@/lib/apiAuth";

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_TO = process.env.LINE_TO; // group id (C…) or user id (U…)
const RESEND_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.NOTIFY_EMAIL_FROM; // e.g. "Marketing OS <os@teppenthailand.co.th>"
const MAIL_TO = process.env.NOTIFY_EMAIL_TO;     // comma-separated recipients

interface NotifyBody { event?: string; title?: string; detail?: string; link?: string }

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
  const { event = "generic", title, detail = "", link = "" } = body;
  if (!title) return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });

  const prefs = await loadPrefs();
  // A trigger toggled OFF in Settings silences the event; unknown events pass.
  if (prefs.triggers[event] === false) {
    return NextResponse.json({ ok: true, skipped: "trigger disabled" });
  }
  const lineOn = prefs.channels.line !== false;
  const emailOn = prefs.channels.email !== false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const fullLink = link && appUrl ? new URL(link, appUrl).toString() : link;
  const text = [title, detail, fullLink].filter(Boolean).join("\n");
  // Escape caller-supplied strings before embedding in the email HTML so a
  // title/detail containing markup can't inject arbitrary HTML into the message.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<p><b>${esc(title)}</b></p>${detail ? `<p>${esc(detail)}</p>` : ""}${fullLink ? `<p><a href="${esc(fullLink)}">เปิดใน Marketing OS →</a></p>` : ""}`;

  const [line, email] = await Promise.all([
    lineOn ? sendLine(text).catch(() => false) : Promise.resolve(false),
    emailOn ? sendEmail(`[Marketing OS] ${title}`, html).catch(() => false) : Promise.resolve(false),
  ]);

  return NextResponse.json({ ok: true, line, email, configured: { line: Boolean(LINE_TOKEN && LINE_TO), email: Boolean(RESEND_KEY && MAIL_FROM && MAIL_TO) } });
}
