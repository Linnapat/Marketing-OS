// Data access for the Request Center. Persists to the `requests` table.

import { supabase } from "@/lib/supabase";
import { REQUESTS, RequestRow } from "@/lib/data/requests";
import { BrandId } from "@/lib/brands";
import { assertDbOk } from "@/lib/db/assert";

type Row = {
  id: string; type: string; type_icon: string; title: string; brand: BrandId;
  campaign: string | null; requester: string; approver: string; due: string; stage: string; priority: string;
  feedback?: RequestRow["feedback"];
};

const toReq = (r: Row): RequestRow => ({
  id: r.id, type: r.type, typeIcon: r.type_icon, title: r.title, b: r.brand,
  campaign: r.campaign ?? "—", requester: r.requester, approver: r.approver,
  due: r.due, stage: r.stage, priority: r.priority as RequestRow["priority"],
  feedback: r.feedback ?? [],
});

export async function fetchRequests(): Promise<RequestRow[]> {
  const db = supabase();
  if (!db) return REQUESTS.map((r) => ({ ...r }));
  const { data, error } = await db.from("requests").select("*").order("created_at", { ascending: false });
  if (error || !data) return REQUESTS.map((r) => ({ ...r }));
  return (data as Row[]).map(toReq);
}

export async function updateRequestStage(id: string, stage: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("requests").update({ stage }).eq("id", id);
  assertDbOk(error, "Could not update request stage");
}

/** Move a request back a stage AND record the mandatory reject reason on the
 *  request's feedback history. Stage change and feedback write are separate so
 *  the stage still persists even on a DB missing the `feedback` column. */
export async function rejectRequest(
  id: string, stage: string, feedback: NonNullable<RequestRow["feedback"]>,
): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("requests").update({ stage }).eq("id", id);
  assertDbOk(error, "Could not reject request");
  await db.from("requests").update({ feedback }).eq("id", id);
}

export async function createRequest(r: RequestRow): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("requests").upsert({
    id: r.id, type: r.type, type_icon: r.typeIcon, title: r.title, brand: r.b,
    campaign: r.campaign === "—" ? null : r.campaign, requester: r.requester,
    approver: r.approver, due: r.due, stage: r.stage, priority: r.priority,
  });
  assertDbOk(error, "Could not save request");
}
