"use client";

// Who the Creative Leader IS, by name.
//
// A notification cannot be sent to a role: when half an artwork review is in
// and the Visual CI verdict is still owed, somebody specific has to be asked.
//
// The resolution is fussier than it looks, and it has bitten twice: two people
// hold the "Creative Leader" role, members arrive ordered by email, so a plain
// `find` returned the QA account and every message went there. Settings → Teams
// names the actual lead, and that answer wins.
//
// Lives here rather than inside GraphicDrawer because Approval Center records
// the same verdicts from a list row — and a verdict given there that quietly
// skipped the "one lens still outstanding" notice would put the piece straight
// back in the hole that notice was added to fix (PR #247).

import { useEffect, useState } from "react";
import { fetchMembers, fetchJsonSetting } from "@/lib/db/settings";
import { roleHolders, leadFirst, creativeTeamLeadEmail } from "@/lib/roleGates";

/** The lead's name, or "" until the lookup lands (callers tolerate blank — the
 *  designer and requester are still told, only the "you owe a verdict" DM is
 *  skipped). */
export function useCreativeLeader(): string {
  const [name, setName] = useState("");
  useEffect(() => {
    let alive = true;
    fetchMembers().then((ms) => {
      if (!alive) return;
      const holders = roleHolders(ms, ["Creative Leader"]);
      if (holders[0]) setName(holders[0]);
      fetchJsonSetting<{ name?: string; lead?: string }[]>("teams_config")
        .then((teams) => {
          if (!alive) return;
          const best = leadFirst(holders, ms, creativeTeamLeadEmail(teams))[0];
          if (best) setName(best);
        })
        .catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return name;
}
