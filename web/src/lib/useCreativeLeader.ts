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
import { fetchMembers, fetchJsonSetting, Member } from "@/lib/db/settings";
import { roleHolders, leadFirst, creativeTeamLeadEmail } from "@/lib/roleGates";
import { PRODUCTION_ROLES, CI_BACKUP_ROLES, WorkKind } from "@/lib/data/graphic";

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

/** The people who could take an UNASSIGNED piece of work of this kind.
 *
 *  Same reason the lead is resolved by name above: a notification cannot be
 *  addressed to "VDO Editor". Returns [] until the member list lands, which
 *  callers tolerate — feedbackOwners falls through to the Creative Leader. */
export function useProductionOwners(): (kind: WorkKind) => string[] {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    let alive = true;
    fetchMembers().then((ms) => { if (alive) setMembers(ms); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (kind: WorkKind) => roleHolders(members, PRODUCTION_ROLES[kind] ?? []);
}

/** The CMO, by name — the person who covers a lens its owner may not give.
 *
 *  Needed on screen as well as in the notification: a card that says "รอ
 *  Creative Leader ตรวจ" when the Creative Leader is the one who raised the
 *  brief names somebody the rules forbid from moving it. */
export function useCmoName(): string {
  const [name, setName] = useState("");
  useEffect(() => {
    let alive = true;
    fetchMembers()
      .then((ms) => { if (alive) setName(roleHolders(ms, ["CMO"])[0] ?? ""); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return name;
}

/** Who can give the Visual CI verdict besides the Creative Leader — resolved by
 *  name, for the card and the "still waiting" notice. */
export function useCiBackup(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    fetchMembers()
      .then((ms) => { if (alive) setNames(roleHolders(ms, CI_BACKUP_ROLES)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return names;
}
