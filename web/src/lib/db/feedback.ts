// Persistence for KOL comments and graphic feedback (audit P2-5). Previously
// "Resolve ✓" only changed browser state; these functions back it with the
// kol_comments / graphic_feedback tables so resolves and new comments survive a
// refresh. In demo mode (no Supabase) they fall back to the bundled mock so the
// drawers still show sample content.

import { supabase } from "@/lib/supabase";
import { KOL_COMMENTS, KolComment } from "@/lib/data/kol";
import { FEEDBACK, Feedback } from "@/lib/data/graphic";
import { logAudit } from "@/lib/db/audit";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/* ── KOL comments ──────────────────────────────────────────────────── */

export async function fetchKolComments(kolId: number): Promise<KolComment[]> {
  const db = supabase();
  if (!db) return KOL_COMMENTS.filter((c) => c.kolId === kolId);
  const { data, error } = await db.from("kol_comments").select("*").eq("kol_id", kolId).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as number, kolId: r.kol_id as number, type: (r.type as string) ?? "", text: (r.text as string) ?? "",
    owner: (r.owner as string) ?? "", ownerTeam: (r.owner_team as string) ?? "", ownerColor: (r.owner_color as string) ?? "#9A9387",
    assignedTo: (r.assigned_to as string) ?? "", status: (r.status as string) ?? "Open",
    relatedItem: (r.related_item as string) ?? "", createdAt: shortDate(r.created_at as string), due: (r.due as string) ?? null,
  }));
}

export async function resolveKolComment(id: number): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("kol_comments").update({ status: "Resolved" }).eq("id", id);
  if (error) throw error;
  logAudit("Resolve KOL comment", "KOL", { after: "Resolved", meta: { commentId: id } });
}

export async function addKolComment(kolId: number, c: {
  type: string; text: string; owner: string; ownerTeam?: string; ownerColor?: string; assignedTo?: string; relatedItem?: string; due?: string | null;
}): Promise<KolComment | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("kol_comments").insert({
    kol_id: kolId, type: c.type, text: c.text, owner: c.owner, owner_team: c.ownerTeam ?? null,
    owner_color: c.ownerColor ?? "#9A9387", assigned_to: c.assignedTo ?? null, related_item: c.relatedItem ?? null, due: c.due ?? null,
  }).select("*").single();
  if (error || !data) throw error ?? new Error("insert failed");
  return {
    id: data.id as number, kolId, type: c.type, text: c.text, owner: c.owner, ownerTeam: c.ownerTeam ?? "",
    ownerColor: c.ownerColor ?? "#9A9387", assignedTo: c.assignedTo ?? "", status: "Open",
    relatedItem: c.relatedItem ?? "", createdAt: shortDate(data.created_at as string), due: c.due ?? null,
  };
}

/* ── Graphic feedback ──────────────────────────────────────────────── */

export async function fetchGraphicFeedback(gid: number): Promise<Feedback[]> {
  const db = supabase();
  if (!db) return FEEDBACK.filter((f) => f.gid === gid);
  const { data, error } = await db.from("graphic_feedback").select("*").eq("gid", gid).order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as number, gid: r.gid as number, owner: (r.owner as string) ?? "", team: (r.team as string) ?? "",
    ownerColor: (r.owner_color as string) ?? "#9A9387", type: (r.type as string) ?? "", text: (r.text as string) ?? "",
    version: (r.version as string) ?? "", status: (r.status as string) ?? "Open", assignedTo: (r.assigned_to as string) ?? "",
    due: (r.due as string) ?? null, createdAt: shortDate(r.created_at as string),
  }));
}

export async function resolveGraphicFeedback(id: number): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { error } = await db.from("graphic_feedback").update({ status: "Resolved" }).eq("id", id);
  if (error) throw error;
  logAudit("Resolve graphic feedback", "Graphic", { after: "Resolved", meta: { feedbackId: id } });
}

export async function addGraphicFeedback(gid: number, f: {
  owner: string; team?: string; ownerColor?: string; type: string; text: string; version?: string; assignedTo?: string; due?: string | null;
}): Promise<Feedback | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.from("graphic_feedback").insert({
    gid, owner: f.owner, team: f.team ?? null, owner_color: f.ownerColor ?? "#9A9387", type: f.type,
    text: f.text, version: f.version ?? null, assigned_to: f.assignedTo ?? null, due: f.due ?? null,
  }).select("*").single();
  if (error || !data) throw error ?? new Error("insert failed");
  return {
    id: data.id as number, gid, owner: f.owner, team: f.team ?? "", ownerColor: f.ownerColor ?? "#9A9387",
    type: f.type, text: f.text, version: f.version ?? "", status: "Open", assignedTo: f.assignedTo ?? "",
    due: f.due ?? null, createdAt: shortDate(data.created_at as string),
  };
}
