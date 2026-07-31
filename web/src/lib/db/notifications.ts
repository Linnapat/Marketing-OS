"use client";

// In-app inbox. notify() (lib/notify) pushes to the LINE group and email; this
// is the per-person half that was missing — the reason a comment or a
// sent-back piece never showed up on My Tasks at all.

import { supabase } from "@/lib/supabase";
import { personKeys, isSamePerson, PersonRef } from "@/lib/identity";

export type NotifKind = "comment" | "revision" | "brief" | "assigned";

export interface Notif {
  id: number;
  recipient: string;
  event: NotifKind;
  title: string;
  detail?: string | null;
  link?: string | null;
  actor?: string | null;
  createdAt: string;
  readAt?: string | null;
}

const KIND_META: Record<NotifKind, { icon: string; label: string }> = {
  comment: { icon: "💬", label: "คอมเมนต์ใหม่" },
  revision: { icon: "↩", label: "งานถูกตีกลับ" },
  brief: { icon: "📝", label: "เรื่องบรีฟ" },
  assigned: { icon: "📌", label: "งานใหม่ถึงคุณ" },
};
export const notifMeta = (e: string) => KIND_META[e as NotifKind] ?? { icon: "🔔", label: "แจ้งเตือน" };

/** Raise notifications. Recipients are de-duplicated and the actor is dropped —
 *  telling someone about their own comment is noise, and noise is how an inbox
 *  stops being read. Best-effort: never throws, because a notification must not
 *  break the action that triggered it. */
export async function pushNotifications(
  recipients: (string | null | undefined)[],
  n: { event: NotifKind; title: string; detail?: string; link?: string; actor?: string },
): Promise<void> {
  const db = supabase();
  if (!db) return;
  const actorKeys = personKeys({ name: n.actor });
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const r of recipients) {
    const name = (r ?? "").trim();
    if (!name || name === "Unassigned") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (isSamePerson(name, actorKeys)) continue;   // never notify yourself
    seen.add(key);
    rows.push({ recipient: name, event: n.event, title: n.title, detail: n.detail ?? null, link: n.link ?? null, actor: n.actor ?? null });
  }
  if (!rows.length) return;
  const { error } = await db.from("notifications").insert(rows);
  if (error) console.warn("pushNotifications skipped", error.message);
}

const DEMO_NOTIFS: Notif[] = [
  { id: -1, recipient: "You", event: "revision", actor: "Boss",
    title: "งานถูกตีกลับ: Wagyu menu board",
    detail: "Instagram 9:16 · [CI] โลโก้เล็กไป ขอใหญ่ขึ้น",
    link: "/graphic", createdAt: new Date(Date.now() - 36e5).toISOString(), readAt: null },
  { id: -2, recipient: "You", event: "comment", actor: "Ken S.",
    title: "คอมเมนต์ใหม่: Wagyu key visual — Revision 2",
    detail: "ขอเช็คราคาในสไลด์ 2 อีกรอบก่อนส่งนะ",
    link: "/my-tasks", createdAt: new Date(Date.now() - 72e5).toISOString(), readAt: null },
  { id: -3, recipient: "You", event: "brief", actor: "Nok W.",
    title: "ขอเติมบรีฟ: Lunch set carousel",
    detail: "เพิ่ม CTA จองโต๊ะในสไลด์สุดท้าย",
    link: "/graphic", createdAt: new Date(Date.now() - 864e5).toISOString(), readAt: null },
];

/** The signed-in person's inbox, newest first. Reads a recent window only —
 *  an inbox is for what still needs attention, not an archive. */
export async function fetchNotifications(
  me: PersonRef | null | undefined,
  user: PersonRef | null | undefined,
  limit = 40,
): Promise<Notif[]> {
  const db = supabase();
  // Demo mode gets a sample inbox, like every other list in the app — an empty
  // panel would read as "the feature does not work" to anyone being shown it.
  if (!db) return DEMO_NOTIFS;
  const { data, error } = await db
    .from("notifications")
    .select("id, recipient, event, title, detail, link, actor, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  // RLS already restricts to this person; the client filter is belt-and-braces
  // for the demo/service-role paths where it does not.
  const keys = personKeys(me, user);
  return data
    .filter((r) => keys.size === 0 || isSamePerson(r.recipient as string, keys))
    .map((r) => ({
      id: r.id as number,
      recipient: r.recipient as string,
      event: r.event as NotifKind,
      title: r.title as string,
      detail: r.detail as string | null,
      link: r.link as string | null,
      actor: r.actor as string | null,
      createdAt: r.created_at as string,
      readAt: r.read_at as string | null,
    }));
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  const db = supabase();
  if (!db || !ids.length) return;
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  if (error) console.warn("markNotificationsRead skipped", error.message);
}
