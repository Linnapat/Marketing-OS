// Data access for Graphic Requests. Full Graphic objects live in the `data`
// jsonb column. Mock fallback when Supabase isn't configured.

import { supabase } from "@/lib/supabase";
import { GRAPHICS, Graphic } from "@/lib/data/graphic";
import { BrandId } from "@/lib/brands";

export async function fetchGraphics(): Promise<Graphic[]> {
  const db = supabase();
  if (!db) return GRAPHICS.map((g) => ({ ...g }));
  const { data, error } = await db.from("graphic_requests").select("id, data").order("id");
  if (error || !data || data.length === 0) return GRAPHICS.map((g) => ({ ...g }));
  return data.map((r) => r.data as Graphic).filter(Boolean);
}

export async function createGraphic(g: Graphic): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from("graphic_requests").insert({
    title: g.title, brand: g.b, campaign: g.campaign, designer: g.designer, requester: g.requester,
    approver: g.approver, type: g.type, priority: g.priority, stage: g.stage, due: g.due,
    platform: g.platform, size: g.size, brief_complete: g.briefComplete, blocker: g.blocker,
    next_action: g.nextAction, data: g,
  });
}

/** Build a full Graphic from the request form, filling sensible defaults. */
export function buildGraphic(input: {
  id: number; b: BrandId; campaign: string; title: string; type: string;
  due: string; designer: string; requester: string; approver: string; channels: string[];
}): Graphic {
  return {
    id: input.id, stage: "Brief", title: input.title || "New request", b: input.b, campaign: input.campaign,
    due: input.due || "TBD", designer: input.designer || "Unassigned", requester: input.requester || "You",
    approver: input.approver || "Aran P.", type: input.type, priority: "Med", fb: 0, openFb: 0,
    isOverdue: false, briefComplete: false, pendingApprover: input.approver || "Aran P.",
    blocker: null, waitingSince: null, nextAction: "Complete the brief to start design.",
    platform: input.channels.join(", ") || "—", size: "—", contentItem: input.title || "—",
  };
}
