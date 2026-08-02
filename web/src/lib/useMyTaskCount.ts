"use client";

// How much work is still on me — the number beside My Tasks in the sidebar.
//
// The rail said "My Tasks" and nothing else, so the only way to find out
// whether anything was waiting was to open the page. A count next to the label
// is the cheapest version of that answer, and it is on screen from every other
// module.
//
// Counts what the page itself would show as outstanding: tasks assigned to me
// that are not done. Deliberately NOT "everything on the board" — a number that
// includes other people's work is a number nobody can act on, and it never
// reaches zero, which is how a badge stops meaning anything.
//
// One fetch shared by every mounted consumer, same shape as useNotifications:
// the sidebar renders on every page, and a per-mount query would put a task
// read on top of every navigation.

import { useCallback, useEffect, useState } from "react";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchMembers } from "@/lib/db/settings";
import { personKeys, isSamePerson } from "@/lib/identity";

let cache: number | null = null;
const listeners = new Set<(n: number) => void>();
let inFlight: Promise<void> | null = null;

function publish(next: number) {
  cache = next;
  for (const l of listeners) l(next);
}

export function useMyTaskCount(): number {
  const { member, user } = useAuth();
  const [count, setCount] = useState<number>(cache ?? 0);

  useEffect(() => {
    listeners.add(setCount);
    return () => { listeners.delete(setCount); };
  }, []);

  const reload = useCallback(async () => {
    if (inFlight) return inFlight;
    inFlight = fetchTasks()
      .then(async ({ tasks, doneIds }) => {
        // Same identity rule as My Tasks: one person is filed under a display
        // name, a nickname and an email across these tables, so an exact string
        // match undercounts (see lib/identity).
        let keys = personKeys(member, user);
        // Demo mode has no session to read an identity from, and the page
        // itself falls back to the first member for exactly that reason. Guard
        // it on AUTH_REQUIRED: doing this where sign-in IS enforced would badge
        // one person's rail with somebody else's workload.
        if (!keys.size && !AUTH_REQUIRED) {
          const first = (await fetchMembers().catch(() => []))
            .find((m) => m.brandAccess !== "External only" && !/agency/i.test(m.role));
          keys = personKeys({ name: first?.name });
        }
        // Still nobody = no badge, rather than a count of everyone's work.
        if (!keys.size) { publish(0); return; }
        const done = new Set(doneIds);
        publish(tasks.filter((t) => isSamePerson(t.assignee, keys) && !done.has(t.id) && t.status !== "Done").length);
      })
      .catch(() => {})
      .finally(() => { inFlight = null; });
    return inFlight;
  }, [member, user]);

  useEffect(() => {
    void reload();
    // Slow poll, and only while the tab is in front. The badge is a nudge, not
    // a live counter — the page itself is authoritative once you open it.
    const tick = () => { if (document.visibilityState === "visible") void reload(); };
    const id = window.setInterval(tick, 120_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [reload]);

  return count;
}
