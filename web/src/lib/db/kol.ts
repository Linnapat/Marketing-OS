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
    owner: kol.owner, data: kol,
  }).select("id").single();
  if (error || !data) return kol;
  return kol;
}

/** Build a full Kol from the sparse request form, filling sensible defaults. */
export function buildKol(input: {
  id: number; campaign: string; b: BrandId; kolType: string; count: number;
  budget: number; deliverables: string; notes: string;
}): Kol {
  return {
    id: input.id,
    name: `New Request — ${input.kolType}`,
    h: "@tbd", plat: "Instagram", b: input.b, branch: "—", campaign: input.campaign,
    kolType: input.kolType, followers: 0, expectedReach: 0, actualReach: 0, visits: 0,
    fee: input.budget, foodCost: 0, totalCost: input.budget * Math.max(1, input.count),
    owner: "Ken S.", ownerTeam: "KOL Team", pendingApprover: "Aran P.", currentBlocker: null,
    status: "Prospect", waitingSince: null, postDueDate: "TBD", postedDate: null,
    openComments: 0, latestComment: "", isOverdue: false, couponCode: null,
    contractStatus: "Pending", quotationStatus: "Pending", invoiceStatus: "Pending",
    paymentStatus: "Unpaid", financeReqId: "—", paymentDue: "TBD", roi: 0,
    audienceFit: "TBD", contentStyle: input.deliverables || "TBD", contactInfo: "—",
    pastCollab: "None", objective: "Awareness", target: "TBD", keyMsg: "TBD", offer: "TBD",
    postingPeriod: "TBD", engagement: "—", saves: "—", shares: "—", postLink: null,
    notes: input.notes,
    stages: [
      { l: "Prospect", d: "Today", done: false, cur: true },
      { l: "Shortlisted", d: "", done: false, cur: false },
      { l: "Negotiating", d: "", done: false, cur: false },
    ],
  } as Kol;
}
