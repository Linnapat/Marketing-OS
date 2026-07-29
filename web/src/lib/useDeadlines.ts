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
import { CalendarTaskEdit } from "@/lib/data/calendarTasks";

interface CalendarState { overrides: Record<string, string>; tasks: CalendarTaskEdit[] }

let _state: CalendarState | null = null;
let _inflight: Promise<CalendarState> | null = null;

async function loadState(): Promise<CalendarState> {
  if (_state) return _state;
  if (_inflight) return _inflight;
  _inflight = fetchWorkflowState()
    .then((s) => { _state = { overrides: s?.overrides ?? {}, tasks: s?.tasks ?? [] }; return _state; })
    // A calendar we cannot read must not break the pages that show deadlines —
    // they fall back to the shipped template, which is still the right answer
    // for a team that has not re-timed anything.
    .catch(() => { _state = { overrides: {}, tasks: [] }; return _state; });
  return _inflight;
}

/** Forget the cached calendar — call after editing it so deadlines re-resolve. */
export function resetDeadlineCache(): void { _state = null; _inflight = null; }

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
  const [state, setState] = useState<CalendarState | null>(_state);
  useEffect(() => {
    if (state) return;
    let alive = true;
    void loadState().then((o) => { if (alive) setState(o); });
    return () => { alive = false; };
  }, [state]);
  const marks = state?.overrides ?? {};
  const rows = state?.tasks ?? [];
  return {
    ready: !!state,
    milestone: (key, forMonth) => resolveMilestone(key, forMonth, marks, rows),
    forDate: (key, iso) => (iso ? resolveMilestone(key, monthKeyOfIso(iso), marks, rows) : null),
    all: (forMonth) => milestonesFor(forMonth, marks, rows),
  };
}
