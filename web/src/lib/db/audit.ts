// Real audit trail backed by the `audit_log` table (audit P2-3). logAudit() is
// fire-and-forget — an audit failure must never break the action it records.
// Falls back silently in demo mode (no Supabase configured).

import { supabase } from "@/lib/supabase";
import { AUDIT_LOG } from "@/lib/data/settings";

export interface AuditEntry {
  time: string;
  action: string;
  user: string;
  module: string;
  before: string;
  after: string;
}

interface LogOpts {
  before?: string;
  after?: string;
  actorName?: string;
  actorEmail?: string;
  meta?: Record<string, unknown>;
}

/** Record an audit event. Non-blocking, never throws. */
export function logAudit(action: string, module: string, opts: LogOpts = {}): void {
  void (async () => {
    try {
      const db = supabase();
      if (!db) return; // demo mode — nothing to persist
      let email = opts.actorEmail;
      if (!email) {
        const { data } = await db.auth.getUser();
        email = data.user?.email ?? undefined;
      }
      await db.from("audit_log").insert({
        action,
        module,
        before_text: opts.before ?? null,
        after_text: opts.after ?? null,
        actor_email: email ?? null,
        actor_name: opts.actorName ?? null,
        meta: opts.meta ?? null,
      });
    } catch {
      /* best-effort */
    }
  })();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** Read the audit log. In demo mode returns the bundled sample rows; live it
 *  returns real events (empty array when none recorded yet). */
export async function fetchAuditLog(limit = 100): Promise<AuditEntry[]> {
  const db = supabase();
  if (!db) return AUDIT_LOG as AuditEntry[];
  const { data, error } = await db.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    time: fmtTime(r.at as string),
    action: (r.action as string) ?? "",
    user: (r.actor_name as string) || ((r.actor_email as string)?.split("@")[0] ?? "system"),
    module: (r.module as string) || "—",
    before: (r.before_text as string) || "",
    after: (r.after_text as string) || "",
  }));
}
