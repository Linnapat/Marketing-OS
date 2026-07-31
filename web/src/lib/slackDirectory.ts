// Turning a name written in a task ("Aran P.") into a Slack user id.
//
// Nothing in the app stores a Slack id, so the chain is
//   display name → members row → email → Slack user (users.lookupByEmail)
// with a manual override map for the people whose Slack email differs from
// their work email. Names are matched through lib/identity, which already
// knows that "Pupay", "Orapan" and "orapan.ch@…" are one person.
//
// A name that resolves to nobody is NOT an error: the DM is skipped and the
// name is recorded in org_settings so Settings can show who is quietly missing
// their notifications. Silently dropping them with no trace is how someone
// stops getting told their work came back and nobody notices for a month.

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { personKeys, isSamePerson } from "@/lib/identity";
import { lookupUserByEmail, hasBotToken } from "@/lib/slackBot";

const MAP_KEY = "slack_user_map_v1";      // { "<email>": "U123…" } — manual overrides + cache
const UNMAPPED_KEY = "slack_unmapped_v1"; // { "<name>": "<iso date last tried>" }

interface MemberRow { name: string; email: string }

/** Lambda-lifetime cache: a burst of notifications shouldn't be a burst of
 *  users.lookupByEmail calls (Slack rate-limits it at tier 3). */
let cache: { at: number; members: MemberRow[]; map: Record<string, string> } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function loadDirectory() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const db = supabaseAdmin();
  if (!db) return { at: Date.now(), members: [], map: {} };
  const [members, setting] = await Promise.all([
    db.from("members").select("name, email"),
    db.from("org_settings").select("value").eq("key", MAP_KEY).maybeSingle(),
  ]);
  let map: Record<string, string> = {};
  try {
    map = setting.data?.value ? (JSON.parse(setting.data.value as string) as Record<string, string>) : {};
  } catch { map = {}; }
  cache = { at: Date.now(), members: (members.data as MemberRow[] | null) ?? [], map };
  return cache;
}

/** Remember an id we just discovered, so the next call skips the API. */
async function rememberId(email: string, id: string): Promise<void> {
  const dir = await loadDirectory();
  if (dir.map[email] === id) return;
  const next = { ...dir.map, [email]: id };
  // Cache in memory first: it still saves repeat lookups within this lambda
  // even when there is no database to persist to, or the write fails.
  cache = { ...dir, map: next };
  const db = supabaseAdmin();
  if (!db) return;
  await db.from("org_settings").upsert({ key: MAP_KEY, label: "Slack user mapping", value: JSON.stringify(next) }, { onConflict: "key" });
}

/** Record the people we could not reach, replacing the whole set for the names
 *  we just tried so someone who gets mapped later drops off the warning. */
async function recordUnmapped(names: string[], resolved: Set<string>): Promise<void> {
  const db = supabaseAdmin();
  if (!db || names.length === 0) return;
  const { data } = await db.from("org_settings").select("value").eq("key", UNMAPPED_KEY).maybeSingle();
  let current: Record<string, string> = {};
  try {
    current = data?.value ? (JSON.parse(data.value as string) as Record<string, string>) : {};
  } catch { current = {}; }
  const stamp = new Date().toISOString();
  let changed = false;
  for (const name of names) {
    if (resolved.has(name)) {
      if (name in current) { delete current[name]; changed = true; }
    } else if (current[name] !== stamp) {
      current[name] = stamp; changed = true;
    }
  }
  if (!changed) return;
  await db.from("org_settings").upsert({ key: UNMAPPED_KEY, label: "Slack: people not found", value: JSON.stringify(current) }, { onConflict: "key" });
}

/** Names the app tried to DM and couldn't, for Settings → Integrations. */
export async function fetchUnmapped(): Promise<string[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db.from("org_settings").select("value").eq("key", UNMAPPED_KEY).maybeSingle();
  try {
    return Object.keys(data?.value ? (JSON.parse(data.value as string) as Record<string, string>) : {});
  } catch { return []; }
}

export interface Resolution { name: string; slackId: string | null }

/** Resolve display names to Slack user ids, in one pass. */
export async function resolveSlackIds(names: string[]): Promise<Resolution[]> {
  const wanted = [...new Set(names.map((n) => (n ?? "").trim()).filter((n) => n && n !== "Unassigned"))];
  if (wanted.length === 0) return [];
  if (!hasBotToken()) return wanted.map((name) => ({ name, slackId: null }));

  const dir = await loadDirectory();
  const out: Resolution[] = [];
  for (const name of wanted) {
    // The name in a task may be the member's name, their email, or its local
    // part — identity.personKeys covers all three.
    const member = dir.members.find((m) => isSamePerson(name, personKeys({ name: m.name, email: m.email })));
    const email = (member?.email ?? (name.includes("@") ? name : "")).toLowerCase();
    if (!email) { out.push({ name, slackId: null }); continue; }
    const known = dir.map[email];
    if (known) { out.push({ name, slackId: known }); continue; }
    const found = await lookupUserByEmail(email);
    if (found) await rememberId(email, found);
    out.push({ name, slackId: found });
  }
  await recordUnmapped(wanted, new Set(out.filter((r) => r.slackId).map((r) => r.name)));
  return out;
}
