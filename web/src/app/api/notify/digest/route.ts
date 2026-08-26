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
import { milestonesFor } from "@/lib/data/deadlinePolicy";
import { deadlineBoard, deadlinesLandingIn, dueReminders, reminderText, MILESTONE_ROUTE } from "@/lib/data/deadlineBoard";
import type { CalendarTaskEdit } from "@/lib/data/calendarTasks";

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

// ── Deadline reminders ─────────────────────────────────────────────────────
// The Team Calendar already holds the month's dates, and four modules police
// their forms with them — but a date nobody is shown is a date people find out
// about by missing it. So three days out, the day before, and the morning of,
// the deadline goes to the room that owes the work.
//
// Read from the same single row the calendar saves to, resolved with the same
// pure functions the board on screen uses: the reminder and the board cannot
// disagree, because there is one source and one resolver.

/** Today in Bangkok as YYYY-MM-DD — the team's "today", not UTC's. */
function bangkokIso(now: Date): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

async function remindDeadlines(db: NonNullable<ReturnType<typeof supabaseAdmin>>, now: Date) {
  const { data, error } = await db.from("workflow_state")
    .select("overrides, tasks").eq("id", 1).maybeSingle();
  // No calendar saved yet is not an error: the shipped template still resolves,
  // so fall through with empty overrides rather than skipping the reminder.
  if (error && error.code !== "PGRST116") return { error: error.message };
  const row = (data ?? {}) as { overrides?: Record<string, string>; tasks?: CalendarTaskEdit[] };

  const todayIso = bangkokIso(now);
  const forMonth = todayIso.slice(0, 7);
  // Deadlines that LAND this month, not deadlines FOR this month's work — the
  // reminder is about a date arriving, and those dates sit months before the
  // work they serve.
  const rows = deadlineBoard(
    deadlinesLandingIn(forMonth, (m) => milestonesFor(m, row.overrides ?? {}, row.tasks ?? [])),
    todayIso,
  );
  const due = dueReminders(rows);
  if (!due.length) return { due: 0 };

  const channelIds = await loadChannelIds();
  const sent: Record<string, number> = {};
  // Grouped per room so a team with two dates on the same day gets one message.
  for (const team of CHANNEL_TEAMS) {
    const mine = due.filter((r) => MILESTONE_ROUTE[r.key].rooms.includes(team));
    if (!mine.length) continue;
    const text = [`*📌 เดดไลน์ที่ใกล้ถึง · ${TEAM_CHANNEL[team] ?? team}*`, ...mine.map(reminderText)].join("\n");
    const ok = await postToTeam(team, text, channelIds).catch(() => false);
    if (ok) sent[team] = mine.length;
  }

  // The half with no room: DM'd by name, or nobody hears about the brief.
  const byRole = new Map<string, typeof due>();
  for (const r of due) {
    for (const role of MILESTONE_ROUTE[r.key].roles) {
      byRole.set(role, [...(byRole.get(role) ?? []), r]);
    }
  }
  let dmd = 0;
  for (const [role, list] of byRole) {
    const { data } = await db.from("members").select("name").eq("role", role);
    const names = (data ?? []).map((m) => (m as { name?: string }).name ?? "").filter(Boolean);
    if (!names.length) continue;
    const text = ["*📌 เดดไลน์ที่ใกล้ถึง*", ...list.map(reminderText)].join("\n");
    for (const person of await resolveSlackIds(names)) {
      if (!person.slackId) continue;
      const ok = await postDM(person.slackId, text).catch(() => ({ ok: false }));
      if (ok.ok) dmd++;
    }
  }
  return { due: due.length, sent, dmd };
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
  // Same reasoning: a quiet day still owes the team its deadline warning.
  const deadlines = await remindDeadlines(db, new Date()).catch((e) => ({ error: String(e) }));

  const { data, error } = await db
    .from("slack_digest_queue")
    .select("id, team, event, title, detail, link, recipients, delivered")
    .is("sent_at", null)
    .order("at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as QueueRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, posted: {}, note: "nothing queued", retro, deadlines });

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
  return NextResponse.json({ ok: true, posted, pending: rows.length - done.length, retro, deadlines });
}
