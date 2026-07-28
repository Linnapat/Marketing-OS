// Storage for the monthly Team KPI review.
//
// Reviews live in their own table (`team_kpi_reviews`, see
// supabase/team_kpi.sql) rather than in org_settings: every authenticated staff
// member may read org_settings, and one person's rating is not team-wide
// reading. The table's RLS is admin-only, so a review is visible to the CMO
// seat and nobody else.
//
// localStorage mirrors the month so the screen still works before the migration
// is run and in demo mode (no Supabase env) — the same fallback appSettings.ts
// uses. A mirror-only save is reported to the caller, because "saved on this
// laptop" and "saved for the team" are not the same promise.

import { supabase } from "@/lib/supabase";
import { assertDbOk } from "@/lib/db/assert";
import { TeamKpiMonth, emptyMonth, parseMonth } from "@/lib/data/teamKpi";

const TABLE = "team_kpi_reviews";
const mirrorKey = (month: string) => `mos-team-kpi-${month}`;

/** Postgres/PostgREST codes for "that table isn't there" — the pre-migration
 *  state, which must degrade to the local mirror instead of throwing. */
const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST202"]);
const isMissingTable = (error: { code?: string; message?: string } | null) =>
  !!error && (MISSING_TABLE.has(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? ""));

function readMirror(month: string): TeamKpiMonth {
  if (typeof window === "undefined") return emptyMonth(month);
  try {
    const raw = window.localStorage.getItem(mirrorKey(month));
    return raw ? parseMonth(month, JSON.parse(raw)) : emptyMonth(month);
  } catch {
    return emptyMonth(month);
  }
}

function writeMirror(review: TeamKpiMonth): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(mirrorKey(review.month), JSON.stringify(review));
  } catch {
    // Private browsing / quota — the database write below is what matters.
  }
}

export interface TeamKpiLoad {
  review: TeamKpiMonth;
  /** False when the row came from the local mirror (no DB, or no table yet). */
  shared: boolean;
}

export async function fetchTeamKpiMonth(month: string): Promise<TeamKpiLoad> {
  const db = supabase();
  if (!db) return { review: readMirror(month), shared: false };

  const { data, error } = await db.from(TABLE).select("payload, updated_at").eq("month", month).maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { review: readMirror(month), shared: false };
    throw new Error(error.message || "อ่านข้อมูล KPI ไม่ได้");
  }
  if (!data) return { review: emptyMonth(month), shared: true };

  const review = parseMonth(month, { ...(data.payload as object), updatedAt: data.updated_at as string });
  writeMirror(review);
  return { review, shared: true };
}

export interface TeamKpiSave {
  /** False when only the local mirror was written. */
  shared: boolean;
  savedAt: string;
}

export async function saveTeamKpiMonth(review: TeamKpiMonth): Promise<TeamKpiSave> {
  const savedAt = new Date().toISOString();
  const stored: TeamKpiMonth = { ...review, updatedAt: savedAt };
  writeMirror(stored);

  const db = supabase();
  if (!db) return { shared: false, savedAt };

  const { error } = await db.from(TABLE).upsert({
    month: review.month,
    payload: { people: review.people, inputs: review.inputs },
    updated_at: savedAt,
  });
  if (error) {
    if (isMissingTable(error)) return { shared: false, savedAt };
    assertDbOk(error, "บันทึกผล KPI ไม่ได้");
  }
  return { shared: true, savedAt };
}
