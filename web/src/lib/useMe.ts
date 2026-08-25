"use client";

/* Who the person reading this screen is, by the name the work is filed under.
 *
 * Own module so a compact list (the bell) can ask without importing the whole
 * queue it lives next to.
 */

import { useEffect, useState } from "react";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { fetchMembers } from "@/lib/db/settings";

/** The signed-in member's name, or their own login when Settings has no
 *  matching row — never a teammate's. In demo mode (no auth at all) it falls
 *  back to the first internal member so a queue is not filtered by a person who
 *  does not exist. */
export function useMe(): string {
  const { member, user } = useAuth();
  const viewAs = member?.name || (AUTH_REQUIRED && user ? user.email?.split("@")[0] ?? "You" : "");
  const [fallbackName, setFallbackName] = useState("");
  useEffect(() => {
    if (viewAs) return;
    fetchMembers()
      .then((ms) => {
        const internal = ms.filter((m) => m.brandAccess !== "External only" && !/agency/i.test(m.role));
        if (internal.length) setFallbackName(internal[0].name);
      })
      .catch(() => {});
  }, [viewAs]);
  return viewAs || fallbackName;
}
