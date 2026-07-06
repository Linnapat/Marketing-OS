// Data access for the Agency Portal. Reads/writes Supabase when configured,
// otherwise falls back to the bundled mock so the app still works offline.

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AGENCY_TASKS, AgencyTask } from "@/lib/data/agency";
import { BrandId } from "@/lib/brands";

type Row = {
  id: number; title: string; brand: BrandId; campaign: string; type: string;
  status: string; due: string; brief: string | null; link: string | null; note: string | null;
  agency_email?: string | null;
};

const toTask = (r: Row): AgencyTask => ({
  id: r.id, title: r.title, b: r.brand, campaign: r.campaign, type: r.type,
  status: r.status as AgencyTask["status"], due: r.due,
  brief: r.brief ?? "", link: r.link ?? "", note: r.note ?? "",
  agencyEmail: r.agency_email ?? undefined,
});

/** External tasks — from Supabase if configured, else the mock. Pass the
 *  signed-in agency user's email to scope the list to their own tasks
 *  (unassigned/legacy rows stay visible until someone assigns them). */
export async function fetchAgencyTasks(agencyEmail?: string): Promise<AgencyTask[]> {
  const db = supabase();
  if (!db) return AGENCY_TASKS.map((t) => ({ ...t }));
  let q = db.from("agency_tasks").select("*").order("id");
  if (agencyEmail) q = q.or(`agency_email.is.null,agency_email.ilike.${agencyEmail}`);
  let { data, error } = await q;
  if (error && agencyEmail) {
    // agency_email column not migrated yet — show the unscoped list rather
    // than silently swapping in mock data.
    ({ data, error } = await db.from("agency_tasks").select("*").order("id"));
  }
  if (error || !data) return AGENCY_TASKS.map((t) => ({ ...t }));
  return (data as Row[]).map(toTask);
}

/** Insert a new external task; returns the created task (with its real id). */
export async function createAgencyTask(draft: Omit<AgencyTask, "id">, existing: AgencyTask[]): Promise<AgencyTask> {
  const db = supabase();
  if (!db) {
    const id = Math.max(0, ...existing.map((t) => t.id)) + 1;
    return { ...draft, id };
  }
  const { data, error } = await db.from("agency_tasks").insert({
    title: draft.title, brand: draft.b, campaign: draft.campaign, type: draft.type,
    status: draft.status, due: draft.due, brief: draft.brief, link: draft.link, note: draft.note,
    ...(draft.agencyEmail ? { agency_email: draft.agencyEmail } : {}),
  }).select().single();
  if (error || !data) {
    const id = Math.max(0, ...existing.map((t) => t.id)) + 1;
    return { ...draft, id };
  }
  return toTask(data as Row);
}

/** Patch a task's editable fields (status / link / note). Fire-and-forget. */
export async function updateAgencyTask(id: number, patch: Partial<AgencyTask>): Promise<void> {
  if (!isSupabaseConfigured) return;
  const db = supabase();
  if (!db) return;
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.link !== undefined) row.link = patch.link;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.b !== undefined) row.brand = patch.b;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.agencyEmail !== undefined) row.agency_email = patch.agencyEmail || null;
  if (Object.keys(row).length) await db.from("agency_tasks").update(row).eq("id", id);
}
