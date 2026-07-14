// Work Calendar persistence — one shared row (needs supabase/workflow_state.sql).
// Overrides = admin cell edits, done = checked-off tasks; both keyed per month.
// No-ops in mock mode so the page still works purely in memory.

import { supabase } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";

export interface WorkflowState {
  overrides: Record<string, string>;
  done: Record<string, boolean>;
}

export async function fetchWorkflowState(): Promise<WorkflowState | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("workflow_state").select("overrides, done").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return {
    overrides: (data.overrides as Record<string, string>) ?? {},
    done: (data.done as Record<string, boolean>) ?? {},
  };
}

/** Fire-and-forget upsert of the full state (small blobs, team-size traffic). */
export async function saveWorkflowState(state: WorkflowState): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("workflow_state").upsert({
    id: 1, overrides: state.overrides, done: state.done, updated_at: new Date().toISOString(),
  });
  assertDbOk(error, "Could not save workflow state");
}
