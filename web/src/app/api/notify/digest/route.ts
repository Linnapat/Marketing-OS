// Daily channel summary of everything that went out as a DM.
//
// Assign / revise notifications go straight to the person now, which keeps the
// team channel readable but leaves it blind to the day's movement. This posts
// one message per team, once a day, listing what happened and who it went to —
// the visibility a channel is for, without the interruption it was causing.
//
// Driven by Vercel cron (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set the route
// refuses to run rather than leaving a public endpoint that spams Slack.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NotifyTeam, CHANNEL_TEAMS, TEAM_CHANNEL, webhookEnvKeys } from "@/lib/notifyRouting";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_LINES = 40; // a Slack message is capped; past this we say "and N more"

interface QueueRow {
  id: number; team: string; event: string | null; title: string;
  detail: string | null; link: string | null; recipients: string[] | null; delivered: boolean;
}

function webhookFor(team: NotifyTeam): string | undefined {
  for (const key of webhookEnvKeys(team)) {
    const url = process.env[key];
    if (url) return url;
  }
  return undefined;
}

async function postWebhook(url: string, text: string): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 3900) }),
  });
  return res.ok;
}

/** One digest message for a team. */
function render(team: NotifyTeam, rows: QueueRow[]): string {
  const lines = [`*📋 สรุปงานวันนี้ · ${TEAM_CHANNEL[team] ?? team}* — ${rows.length} รายการ`];
  for (const r of rows.slice(0, MAX_LINES)) {
    const who = (r.recipients ?? []).filter(Boolean).join(", ");
    const title = r.link ? `<${r.link}|${r.title}>` : r.title;
    // A row nobody could be DM'd is the one worth flagging: the channel is the
    // only place that work got mentioned at all.
    const flag = r.delivered ? "" : " ⚠️ _ไม่ได้ส่ง DM — ไม่พบใน Slack_";
    lines.push(`• ${title}${who ? ` → ${who}` : ""}${flag}`);
  }
  if (rows.length > MAX_LINES) lines.push(`_…และอีก ${rows.length - MAX_LINES} รายการ_`);
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "database not configured" }, { status: 503 });

  const { data, error } = await db
    .from("slack_digest_queue")
    .select("id, team, event, title, detail, link, recipients, delivered")
    .is("sent_at", null)
    .order("at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as QueueRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, posted: {}, note: "nothing queued" });

  const posted: Record<string, number> = {};
  const done: number[] = [];
  for (const team of CHANNEL_TEAMS) {
    const mine = rows.filter((r) => r.team === team);
    if (mine.length === 0) continue;
    const url = webhookFor(team);
    // No webhook for this team: leave the rows queued rather than dropping the
    // day on the floor — they go out once one is configured.
    if (!url) continue;
    const ok = await postWebhook(url, render(team, mine)).catch(() => false);
    if (!ok) continue;
    posted[team] = mine.length;
    done.push(...mine.map((r) => r.id));
  }

  if (done.length) {
    await db.from("slack_digest_queue").update({ sent_at: new Date().toISOString() }).in("id", done);
  }
  return NextResponse.json({ ok: true, posted, pending: rows.length - done.length });
}
