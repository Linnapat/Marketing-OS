// Data access for My Tasks. Full Task objects live in the `data` jsonb column;
// the flat columns exist for relational links / filtering. Mock fallback.

import { supabase } from "@/lib/supabase";
import { TASKS, Task } from "@/lib/data/tasks";
import { BRANDS, BRAND_ORDER, BrandId } from "@/lib/brands";

const DEFAULT_DONE = [1, 4, 7, 8, 12, 14, 18, 20];

// Task.brand is a display name ("Teppen"); the flat column needs a brand id.
const brandId = (v: string): BrandId | null => {
  const low = (v || "").toLowerCase();
  if (BRANDS[low as BrandId]) return low as BrandId;
  return BRAND_ORDER.find((id) => BRANDS[id].name.toLowerCase() === low) ?? null;
};

/** All tasks + the set of ids currently marked done. */
export async function fetchTasks(): Promise<{ tasks: Task[]; doneIds: number[] }> {
  const db = supabase();
  if (!db) return { tasks: TASKS.map((t) => ({ ...t })), doneIds: [...DEFAULT_DONE] };
  const { data, error } = await db.from("tasks").select("id, done, data").order("id");
  if (error || !data || data.length === 0) return { tasks: TASKS.map((t) => ({ ...t })), doneIds: [...DEFAULT_DONE] };
  const tasks = data.map((r) => r.data as Task).filter(Boolean);
  const doneIds = data.filter((r) => r.done || (r.data as Task)?.status === "Done").map((r) => (r.data as Task).id);
  return { tasks, doneIds };
}

/** Insert a newly created task. Fire-and-forget. */
export async function createTaskDb(t: Task): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("tasks").insert({
    title: t.title, brand: brandId(t.brand), campaign: t.campaign, assignee: t.assignee,
    type: t.type, priority: t.priority, status: t.status, due: t.due,
    next_action: t.nextAction, blocker: t.blocker, checklist: t.checklist ?? [],
    done: t.status === "Done", data: t,
  });
}

/** Patch an existing task's data blob (matched by its app id). */
export async function updateTaskDb(id: number, patch: Partial<Task>): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { data } = await db.from("tasks").select("id, data").eq("data->>id", String(id)).maybeSingle();
  if (!data) return;
  const merged = { ...(data.data as Task), ...patch };
  const row: Record<string, unknown> = { data: merged };
  if (patch.status === "Done") row.done = true;
  if (patch.assignee !== undefined) row.assignee = patch.assignee;
  await db.from("tasks").update(row).eq("id", (data as { id: number }).id);
}

export const markDoneDb = (id: number) => updateTaskDb(id, { status: "Done" });
export const reassignDb = (id: number, to: string) => updateTaskDb(id, { assignee: to });
