"use client";

// Remember a page's filter/view choices across navigation.
//
// Leaving Content Plan (or KOL) to open a post and coming back used to reset
// the brand, month and view mode to defaults — so the planner re-picked the
// same filters a dozen times a day. State lives in sessionStorage (per tab,
// cleared when the browser closes) keyed per page and per user, so two people
// on the same machine never inherit each other's view.

import { useEffect, useState } from "react";

export function useStickyView<T>(pageKey: string, userKey: string, initial: T): [T, (v: T) => void] {
  const storageKey = `mos-view:${pageKey}:${userKey || "guest"}`;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // Read once on mount (client only — the server render must stay deterministic).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setValue({ ...initial, ...JSON.parse(raw) } as T);
    } catch { /* unreadable entry just means "use the defaults" */ }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return; // don't overwrite the stored view with the initial one
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* private mode */ }
  }, [storageKey, value, loaded]);

  return [value, setValue];
}
