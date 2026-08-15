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
import { NotifyTeam, CHANNEL_TEAMS, TEAM_CHANNEL } from "@/lib/notifyRouting";
import { loadChannelIds, postToTeam } from "@/lib/slackRooms";
import { resolveSlackIds } from "@/lib/slackDirectory";
import { postDM } from "@/lib/slackBot";
import { DEFAULT_APPROVER } from "@/lib/approval";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_LINES = 40; // a Slack message is capped; past this we say "and N more"

interface QueueRow {
  id: number; team: string; event: string | null; title: string;
  detail: string | null; link: string | null; recipients: string[] | null; delivered: boolean;
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

// ── Weekly retro-approval reminder ─────────────────────────────────────────
// Edits to already-approved campaigns no longer stop the work; they queue on
// /approvals for the CMO. A queue nobody is blocked by is a queue that gets
// forgotten, so once a week it comes and finds them.
//
// Monday, in the same 18:00 Bangkok run as the daily digest. DM, not a channel:
// campaign approvals are one person's job (see notifyRouting — "general" work
// never reaches a room).
const RETRO_REMINDER_DAY = 1; // Mon, in Bangkok terms — see bangkokDay()

/** The weekday in Bangkok (UTC+7), which is what the team means by "Monday". */
function bangkokDay(now: Date): number {
  return new Date(now.getTime() + 7 * 3600_000).getUTCDay();
}

interface PendingRow { id: string; name: string; data: { pendingApprovals?: { at: string }[] } | null }

/** Same env var the notify route uses to absolutise links. Unset (preview /
 *  local) leaves a bare path rather than a broken link. */
function approvalsLink(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  return base ? `<${new URL("/campaigns/approvals", base).toString()}|เปิดหน้า Approvals>` : "เปิดหน้า Approvals ในแอป";
}

/** Who to remind: everyone holding the approver role, by name as the members
 *  table spells it (that is what resolveSlackIds matches on). Falls back to the
 *  role name itself, which the directory also resolves for single-holder roles. */
async function approverNames(db: NonNullable<ReturnType<typeof supabaseAdmin>>): Promise<string[]> {
  const { data } = await db.from("members").select("name, role").eq("role", DEFAULT_APPROVER);
  const names = (data ?? []).map((m) => (m as { name?: string }).name ?? "").filter(Boolean);
  return names.length ? names : [DEFAULT_APPROVER];
}

async function remindRetroApprovals(db: NonNullable<ReturnType<typeof supabaseAdmin>>, now: Date) {
  if (bangkokDay(now) !== RETRO_REMINDER_DAY) return { skipped: "not monday" };
  const { data, error } = await db.from("campaigns")
    .select("id, name, data")
    .is("deleted_at", null)
    .not("data->pendingApprovals", "is", null);
  if (error) return { error: error.message };

  const open = (data as PendingRow[] ?? [])
    .map((r) => ({ name: r.name, entries: r.data?.pendingApprovals ?? [] }))
    .filter((r) => r.entries.length > 0);
  if (!open.length) return { pending: 0 };

  const total = open.reduce((n, r) => n + r.entries.length, 0);
  const oldest = open.flatMap((r) => r.entries.map((e) => e.at)).sort()[0];
  const days = oldest ? Math.floor((now.getTime() - new Date(oldest).getTime()) / 86_400_000) : 0;
  const lines = [
    `*🗂 รออนุมัติย้อนหลัง ${total} รายการ · ${open.length} แคมเปญ*`,
    "การแก้ไขทั้งหมดนี้ live อยู่แล้ว งานไม่ได้ถูกบล็อก — เหลือแค่รอ CMO เคลียร์",
    ...open.slice(0, MAX_LINES).map((r) => `• ${r.name} — ${r.entries.length} รายการ`),
    ...(open.length > MAX_LINES ? [`_…และอีก ${open.length - MAX_LINES} แคมเปญ_`] : []),
    ...(days >= 7 ? [`⚠️ รายการเก่าสุดค้างมา ${days} วันแล้ว`] : []),
    approvalsLink(),
  ];

  const names = await approverNames(db);
  const resolved = await resolveSlackIds(names);
  let sent = 0;
  for (const r of resolved) {
    if (!r.slackId) continue;
    const ok = await postDM(r.slackId, lines.join("\n")).catch(() => ({ ok: false }));
    if (ok.ok) sent++;
  }
  return { pending: total, campaigns: open.length, reminded: sent };
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

  // Independent of the daily queue: a week with nothing DM'd still owes the CMO
  // their reminder, so this runs before the "nothing queued" exit.
  const retro = await remindRetroApprovals(db, new Date()).catch((e) => ({ error: String(e) }));

  const { data, error } = await db
    .from("slack_digest_queue")
    .select("id, team, event, title, detail, link, recipients, delivered")
    .is("sent_at", null)
    .order("at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as QueueRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, posted: {}, note: "nothing queued", retro });

  const channelIds = await loadChannelIds();
  const posted: Record<string, number> = {};
  const done: number[] = [];
  for (const team of CHANNEL_TEAMS) {
    const mine = rows.filter((r) => r.team === team);
    if (mine.length === 0) continue;
    // A team with nowhere to post leaves its rows queued rather than dropping
    // the day on the floor — they go out once its room is wired.
    const ok = await postToTeam(team, render(team, mine), channelIds).catch(() => false);
    if (!ok) continue;
    posted[team] = mine.length;
    done.push(...mine.map((r) => r.id));
  }

  if (done.length) {
    await db.from("slack_digest_queue").update({ sent_at: new Date().toISOString() }).in("id", done);
  }
  return NextResponse.json({ ok: true, posted, pending: rows.length - done.length, retro });
}
