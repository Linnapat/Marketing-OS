"use client";

// One inbox, read once. The bell in the sidebar and the unread panel on My
// Tasks are two views of the same rows — fetched separately they drift, and a
// bell that says 3 above a list showing 1 is worse than no bell.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchNotifications, markNotificationsRead, Notif } from "@/lib/db/notifications";

// Module-level so every mounted consumer shares one fetch and one update.
let cache: Notif[] | null = null;
const listeners = new Set<(n: Notif[]) => void>();
let inFlight: Promise<void> | null = null;

function publish(next: Notif[]) {
  cache = next;
  for (const l of listeners) l(next);
}

export function useNotifications() {
  const { member, user } = useAuth();
  const [items, setItems] = useState<Notif[]>(cache ?? []);

  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  const reload = useCallback(async () => {
    if (inFlight) return inFlight;
    inFlight = fetchNotifications(member, user)
      .then(publish)
      .catch(() => {})
      .finally(() => { inFlight = null; });
    return inFlight;
  }, [member, user]);

  useEffect(() => {
    void reload();
    // Poll while the tab is visible. Deliberately slow: this is a nudge, not a
    // chat, and a tight interval on every page would cost more than it earns.
    const tick = () => { if (document.visibilityState === "visible") void reload(); };
    const id = window.setInterval(tick, 120_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [reload]);

  const markRead = useCallback((ids: number[]) => {
    if (!ids.length) return;
    const at = new Date().toISOString();
    publish((cache ?? []).map((n) => (ids.includes(n.id) ? { ...n, readAt: at } : n)));
    void markNotificationsRead(ids);
  }, []);

  return { items, unread: items.filter((n) => !n.readAt), markRead, reload };
}
