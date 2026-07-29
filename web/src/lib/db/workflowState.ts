// Work Calendar persistence — one shared row (needs supabase/workflow_state.sql).
// Overrides = admin cell edits, done = checked-off tasks, tasks = the team's
// row edits (supabase/workflow_custom_tasks.sql); all keyed per month/task.
// No-ops in mock mode so the page still works purely in memory.

import { supabase } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";
import { CalendarTaskEdit } from "@/lib/data/calendarTasks";

export interface WorkflowState {
  overrides: Record<string, string>;
  done: Record<string, boolean>;
  tasks: CalendarTaskEdit[];
}

// `tasks` arrived in a later migration. Selecting it on a database that has not
// run that SQL fails the WHOLE query — which would blank the calendar rather
// than merely disable row editing — so the column is probed once and dropped
// from the select until it exists.
let _hasTasks: boolean | null = null;

export function resetWorkflowTasksProbe(): void { _hasTasks = null; }

/** Has supabase/workflow_custom_tasks.sql been run? */
export async function workflowTasksReady(): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  if (_hasTasks !== null) return _hasTasks;
  const { error } = await db.from("workflow_state").select("tasks").limit(1);
  _hasTasks = !error;
  return _hasTasks;
}

export async function fetchWorkflowState(): Promise<WorkflowState | null> {
  const db = supabase();
  if (!db) return null;
  const withTasks = await workflowTasksReady();
  const { data, error } = await db.from("workflow_state")
    .select(withTasks ? "overrides, done, tasks" : "overrides, done")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { overrides?: unknown; done?: unknown; tasks?: unknown };
  return {
    overrides: (row.overrides as Record<string, string>) ?? {},
    done: (row.done as Record<string, boolean>) ?? {},
    tasks: Array.isArray(row.tasks) ? (row.tasks as CalendarTaskEdit[]) : [],
  };
}

/** Fire-and-forget upsert of the full state (small blobs, team-size traffic). */
export async function saveWorkflowState(state: WorkflowState): Promise<void> {
  const db = supabase();
  if (!db) return;
  const withTasks = await workflowTasksReady();
  // Writing `tasks` before the migration exists would reject the whole upsert
  // and lose the marker edit that came with it.
  const row: Record<string, unknown> = {
    id: 1, overrides: state.overrides, done: state.done, updated_at: new Date().toISOString(),
  };
  if (withTasks) row.tasks = state.tasks ?? [];
  const { error } = await db.from("workflow_state").upsert(row);
  assertDbOk(error, "Could not save workflow state");
}
