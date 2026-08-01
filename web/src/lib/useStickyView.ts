"use client";

// Remember a page's filter/view choices across navigation.
//
// Leaving Content Plan (or KOL) to open a post and coming back used to reset
// the brand, month and view mode to defaults — so the planner re-picked the
// same filters a dozen times a day. State lives in sessionStorage (per tab,
// cleared when the browser closes) keyed per page and per user, so two people
// on the same machine never inherit each other's view.

import { useEffect, useRef, useState } from "react";

/**
 * @param override Fields the caller knows before the stored view loads — a tab
 *   named in the URL, say. Applied on top of whatever was remembered, because a
 *   link is an instruction and the stored view is only a memory of last time.
 *   Callers used to do this from their own mount effect, which quietly depended
 *   on effect ordering: /kol?tab=list read as "already on list" against the
 *   defaults, wrote nothing, and then the stored tab landed on top of it. A
 *   deep link to the default tab was the one that never worked.
 */
export function useStickyView<T>(pageKey: string, userKey: string, initial: T, override?: Partial<T>): [T, (v: T) => void] {
  const storageKey = `mos-view:${pageKey}:${userKey || "guest"}`;
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  // Read through a ref so a caller passing a fresh object each render does not
  // re-run the load — the override only matters at the moment of loading.
  const overrideRef = useRef(override);
  overrideRef.current = override;

  // Read once on mount (client only — the server render must stay deterministic).
  useEffect(() => {
    let next = initial;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) next = { ...initial, ...JSON.parse(raw) } as T;
    } catch { /* unreadable entry just means "use the defaults" */ }
    setValue(overrideRef.current ? { ...next, ...overrideRef.current } : next);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return; // don't overwrite the stored view with the initial one
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* private mode */ }
  }, [storageKey, value, loaded]);

  return [value, setValue];
}
