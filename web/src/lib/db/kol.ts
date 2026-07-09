// Data access for KOL / Creator. Full Kol objects live in the `data` jsonb
// column so nothing is lost. Mock fallback when Supabase isn't configured.

import { supabase } from "@/lib/supabase";
import { KOLS, Kol } from "@/lib/data/kol";
import { BrandId } from "@/lib/brands";

/** Read all creators — from Supabase (data blob) if configured, else the mock. */
export async function fetchKols(): Promise<Kol[]> {
  const db = supabase();
  if (!db) return KOLS.map((k) => ({ ...k }));
  const { data, error } = await db.from("kols").select("id, data").order("id");
  if (error || !data) return KOLS.map((k) => ({ ...k }));
  return data.map((r) => r.data as Kol).filter(Boolean);
}

/** Insert a new creator request; returns it (with a unique id). */
export async function createKol(kol: Kol): Promise<Kol> {
  const db = supabase();
  if (!db) return kol;
  const { data, error } = await db.from("kols").insert({
    name: kol.name, handle: kol.h, brand: kol.b, campaign: kol.campaign, tier: kol.kolType,
    platform: kol.plat, followers: kol.followers, rate: kol.fee, status: kol.status,
    owner: kol.owner, kol_id: kol.masterKolId ?? null, data: kol,
  }).select("id").single();
  if (error || !data) return kol;
  // campaign_id is added by kol_content_integrity.sql; set it in a second step so
  // the row still saves on a DB that hasn't run the migration yet.
  if (kol.campaignId) await db.from("kols").update({ campaign_id: kol.campaignId }).eq("id", data.id);
  return kol;
}

/** Source ids (campaignId + sourceKolRequirementId) already materialised for a
 *  campaign — the idempotency set that makes re-running a Submit a no-op. */
export async function fetchKolSourceIds(campaignId: string): Promise<Set<string>> {
  const db = supabase();
  if (!db) return new Set();
  const { data, error } = await db.from("kols").select("data").filter("data->>campaignId", "eq", campaignId);
  if (error || !data) return new Set();
  const ids = new Set<string>();
  for (const r of data) { const s = (r.data as Kol)?.sourceKolRequirementId; if (s) ids.add(s); }
  return ids;
}

/** Create a KOL only if its (campaignId, sourceKolRequirementId) isn't present.
 *  Pass a pre-fetched `existing` set to batch a whole brief without re-querying. */
export async function createKolIfNew(kol: Kol, existing?: Set<string>): Promise<{ created: boolean; kol: Kol }> {
  const key = kol.sourceKolRequirementId;
  if (key) {
    const set = existing ?? (kol.campaignId ? await fetchKolSourceIds(kol.campaignId) : new Set());
    if (set.has(key)) return { created: false, kol };
    set.add(key);
  }
  const created = await createKol(kol);
  return { created: true, kol: created };
}

/** All KOL rows linked to a campaign (by the relational campaignId in the blob). */
export async function fetchKolsForCampaign(campaignId: string): Promise<Kol[]> {
  const db = supabase();
  if (!db) return [];
  const { data, error } = await db.from("kols").select("data").filter("data->>campaignId", "eq", campaignId);
  if (error || !data) return [];
  return data.map((r) => r.data as Kol).filter(Boolean);
}

// Fields that come FROM the requirement (KOL Plan) and should be overwritten on
// an edit; everything else (workflow progress, the specialist's real page,
// contract/finance, posts, actual results) is preserved.
const REQUIREMENT_FIELDS: (keyof Kol)[] = [
  "kolType", "plat", "fee", "totalCost", "expectedReach", "expectedEngagement",
  "branch", "contentStyle", "objective", "target", "keyMsg", "offer",
  "postDueDate", "postingDate", "postingPeriod", "owner", "pendingApprover", "campaign", "b", "requester",
];

/** Live two-way sync (Campaign Builder → KOL rows): create the row if new, else
 *  overwrite ONLY its requirement fields on the existing row so re-submitting an
 *  edited KOL Plan updates the pages without wiping their progress. */
export async function upsertKolRequirement(reqKol: Kol, existingRows: Kol[]): Promise<{ created: boolean }> {
  const key = reqKol.sourceKolRequirementId;
  const existing = key ? existingRows.find((k) => k.sourceKolRequirementId === key) : undefined;
  if (!existing) {
    await createKol(reqKol);
    existingRows.push(reqKol);
    return { created: true };
  }
  const merged = { ...existing };
  for (const f of REQUIREMENT_FIELDS) (merged as Record<string, unknown>)[f] = reqKol[f];
  // Keep owner only if the row hadn't been given a real one yet.
  if (existing.owner && existing.owner !== "Unassigned") merged.owner = existing.owner;
  await updateKol(merged);
  return { created: false };
}

/** Persist edits to a creator (results, contract status, etc). The whole Kol
 *  round-trips through `data`; status is mirrored. Matched on the id in the blob. */
export async function updateKol(kol: Kol): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("kols")
    .update({ status: kol.status, data: kol })
    .eq("data->>id", String(kol.id));
}

/** Approve a submitted KOL proposal from My Approval. */
export async function approveKolProposal(kolId: number): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { data } = await db.from("kols").select("data").eq("data->>id", String(kolId)).maybeSingle();
  const kol = data?.data as Kol | undefined;
  if (!kol) return;
  const next: Kol = { ...kol, quotationStatus: "Approved", currentBlocker: null };
  await db.from("kols").update({ status: next.status, data: next }).eq("data->>id", String(kolId));
}

/** Build a full Kol from the request form. Owner/Approver default to
 *  "Unassigned" (never a demo user); campaign context is copied verbatim so no
 *  field shows "TBD" when the Campaign Builder already has the value. */
export function buildKol(input: {
  id: number; campaign: string; b: BrandId; kolType: string; count: number;
  budget: number; deliverables: string; notes: string;
  name?: string; handle?: string; expectedReach?: number; expectedEngagement?: number;
  postingDate?: string; postingEnd?: string; contactStatus?: string;
  masterKolId?: string; platform?: string; followers?: number;
  owner?: string; approver?: string; requester?: string; branch?: string;
  // Real relational links + copied campaign context (all optional).
  campaignId?: string; sourceKolRequirementId?: string;
  objective?: string; target?: string; keyMsg?: string; offer?: string; dueDate?: string;
}): Kol {
  const owner = input.owner?.trim() || "Unassigned";
  const period = input.postingDate && input.postingEnd ? `${input.postingDate} – ${input.postingEnd}` : (input.postingDate || input.postingEnd || "TBD");
  const or = (v?: string) => { const t = (v ?? "").trim(); return t || "TBD"; };
  return {
    id: input.id,
    name: input.name?.trim() || `New Request — ${input.kolType}`,
    masterKolId: input.masterKolId,
    campaignId: input.campaignId,
    sourceKolRequirementId: input.sourceKolRequirementId,
    requester: input.requester?.trim() || undefined,
    h: input.handle?.trim() || "@tbd", plat: input.platform || "Instagram", b: input.b, branch: input.branch?.trim() || "—", campaign: input.campaign,
    kolType: input.kolType, followers: input.followers ?? 0, expectedReach: input.expectedReach ?? 0, actualReach: 0, visits: 0,
    fee: input.budget, foodCost: 0, totalCost: input.budget * Math.max(1, input.count),
    owner, ownerTeam: "KOL Team", pendingApprover: input.approver?.trim() || "Unassigned",
    // No owner yet → surface it as a blocker so the Needs-Attention list catches it.
    currentBlocker: owner === "Unassigned" ? "No owner assigned" : null,
    status: input.contactStatus || "Request", waitingSince: null, postDueDate: input.dueDate || input.postingDate || "TBD", postedDate: null,
    expectedEngagement: input.expectedEngagement ?? 0, actualEngagement: 0,
    contactStatus: input.contactStatus || "Request", postingDate: input.postingDate || "TBD",
    openComments: 0, latestComment: "", isOverdue: false, couponCode: null,
    contractStatus: "Pending", quotationStatus: "Pending", invoiceStatus: "Pending",
    paymentStatus: "Unpaid", financeReqId: "—", paymentDue: "TBD", roi: 0,
    audienceFit: "TBD", contentStyle: input.deliverables || "TBD", contactInfo: "—",
    pastCollab: "None",
    objective: or(input.objective), target: or(input.target), keyMsg: or(input.keyMsg), offer: or(input.offer),
    postingPeriod: period, engagement: "—", saves: "—", shares: "—", postLink: null,
    notes: input.notes,
    history: [{ type: "requested", at: new Date().toISOString(), by: input.requester?.trim() || "System", note: input.campaign }],
    stages: [
      { l: "Request", d: "Today", done: false, cur: true },
      { l: "Owner Assigned", d: "", done: false, cur: false },
      { l: "Negotiating", d: "", done: false, cur: false },
    ],
  } as Kol;
}
