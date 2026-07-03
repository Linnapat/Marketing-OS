// Data access for the Request Center. Persists to the `requests` table.

import { supabase } from "@/lib/supabase";
import { REQUESTS, RequestRow } from "@/lib/data/requests";
import { BrandId } from "@/lib/brands";

type Row = {
  id: string; type: string; type_icon: string; title: string; brand: BrandId;
  campaign: string | null; requester: string; approver: string; due: string; stage: string; priority: string;
};

const toReq = (r: Row): RequestRow => ({
  id: r.id, type: r.type, typeIcon: r.type_icon, title: r.title, b: r.brand,
  campaign: r.campaign ?? "—", requester: r.requester, approver: r.approver,
  due: r.due, stage: r.stage, priority: r.priority as RequestRow["priority"],
});

export async function fetchRequests(): Promise<RequestRow[]> {
  const db = supabase();
  if (!db) return REQUESTS.map((r) => ({ ...r }));
  const { data, error } = await db.from("requests").select("*").order("created_at", { ascending: false });
  if (error || !data || data.length === 0) return REQUESTS.map((r) => ({ ...r }));
  return (data as Row[]).map(toReq);
}

export async function createRequest(r: RequestRow): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("requests").upsert({
    id: r.id, type: r.type, type_icon: r.typeIcon, title: r.title, brand: r.b,
    campaign: r.campaign === "—" ? null : r.campaign, requester: r.requester,
    approver: r.approver, due: r.due, stage: r.stage, priority: r.priority,
  });
}
