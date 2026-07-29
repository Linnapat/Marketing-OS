"use client";

// One read of the Team Calendar's saved state, shared by every module that
// shows a deadline from it.
//
// Module-level cache on purpose: the Content Plan, the Campaign Builder and the
// Graphic drawer can all be on screen in one session, and each mounting its own
// fetch would hit the same single-row table repeatedly to get the same answer.

import { useEffect, useState } from "react";
import { fetchWorkflowState } from "@/lib/db/workflowState";
import {
  MilestoneKey, MilestoneDeadline, resolveMilestone, milestonesFor, monthKeyOfIso,
} from "@/lib/data/deadlinePolicy";

let _overrides: Record<string, string> | null = null;
let _inflight: Promise<Record<string, string>> | null = null;

async function loadOverrides(): Promise<Record<string, string>> {
  if (_overrides) return _overrides;
  if (_inflight) return _inflight;
  _inflight = fetchWorkflowState()
    .then((s) => { _overrides = s?.overrides ?? {}; return _overrides; })
    // A calendar we cannot read must not break the pages that show deadlines —
    // they fall back to the shipped template, which is still the right answer
    // for a team that has not re-timed anything.
    .catch(() => { _overrides = {}; return _overrides; });
  return _inflight;
}

/** Forget the cached calendar — call after editing it so deadlines re-resolve. */
export function resetDeadlineCache(): void { _overrides = null; _inflight = null; }

export interface DeadlineApi {
  /** Ready = the saved calendar has been read (or has failed and fallen back). */
  ready: boolean;
  /** The deadline for a milestone, for the month the work is FOR. */
  milestone: (key: MilestoneKey, forMonth: string) => MilestoneDeadline | null;
  /** Same, keyed by an ISO date instead of a month. */
  forDate: (key: MilestoneKey, iso?: string) => MilestoneDeadline | null;
  /** Every milestone that speaks about a month, earliest first. */
  all: (forMonth: string) => MilestoneDeadline[];
}

export function useDeadlines(): DeadlineApi {
  const [overrides, setOverrides] = useState<Record<string, string> | null>(_overrides);
  useEffect(() => {
    if (overrides) return;
    let alive = true;
    void loadOverrides().then((o) => { if (alive) setOverrides(o); });
    return () => { alive = false; };
  }, [overrides]);
  const map = overrides ?? {};
  return {
    ready: !!overrides,
    milestone: (key, forMonth) => resolveMilestone(key, forMonth, map),
    forDate: (key, iso) => (iso ? resolveMilestone(key, monthKeyOfIso(iso), map) : null),
    all: (forMonth) => milestonesFor(forMonth, map),
  };
}
