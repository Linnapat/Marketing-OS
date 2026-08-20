// การไปร้านของ KOL — นัดวันไหน มาหรือยัง
//
// The visit is its own appointment: for an F&B deal the creator comes to the
// branch days or weeks before the post goes out, the branch has to staff it,
// and it was never recorded anywhere but LINE. "Who is coming this week" could
// not be answered from the system at all, and a creator who quietly never
// turned up looked identical to one whose post was simply not due yet.
//
// Pure — see scripts/test-kol-visit.ts.

import { Kol, VisitStatus } from "@/lib/data/kol";

export interface VisitTone { bg: string; border: string; fg: string }

/** Everything a visit can be, including the one nobody sets: no date yet. */
export type VisitState = VisitStatus | "unscheduled";

export const VISIT_META: Record<VisitState, { label: string; tone: VisitTone }> = {
  unscheduled: { label: "ยังไม่นัดวันไป", tone: { bg: "#F5F3EF", border: "#E3DED4", fg: "#8b8378" } },
  scheduled:   { label: "นัดแล้ว",        tone: { bg: "#EEF1F8", border: "#D5DEEF", fg: "#3E5C9A" } },
  visited:     { label: "ไปแล้ว",         tone: { bg: "#EEF4EE", border: "#CFE4C2", fg: "#3F6A34" } },
  no_show:     { label: "ไม่มาตามนัด",    tone: { bg: "#FFF5F4", border: "#F5C8C4", fg: "#B33A2E" } },
  cancelled:   { label: "ยกเลิกนัด",      tone: { bg: "#FBF6EC", border: "#EADBC1", fg: "#8A6D1E" } },
};

/** The visit state to SHOW, derived rather than stored.
 *
 *  A date with no status is "นัดแล้ว" — nobody should have to set both, and
 *  making them would leave every existing row blank forever. A status with no
 *  date still counts: a no-show is a fact even if the date was never typed. */
export function visitStateOf(k: Pick<Kol, "visitDate" | "visitStatus">): VisitState {
  if (k.visitStatus) return k.visitStatus;
  return (k.visitDate ?? "").trim() ? "scheduled" : "unscheduled";
}

/** A booked visit whose day has passed with nobody saying what happened.
 *
 *  This is the whole reason the field earns its place: the branch prepared for
 *  someone, and three weeks later nothing says whether they came. Only
 *  "scheduled" can go stale — visited / no_show / cancelled are all answers.
 *  `todayIso` is passed in so the rule stays pure and testable. */
export function visitOverdue(k: Pick<Kol, "visitDate" | "visitStatus">, todayIso: string): boolean {
  if (visitStateOf(k) !== "scheduled") return false;
  const day = (k.visitDate ?? "").slice(0, 10);
  return !!day && day < todayIso;
}

/** Short line for a list row: the date, and what happened, in one string. */
export function visitSummary(k: Pick<Kol, "visitDate" | "visitStatus">, todayIso: string): string {
  const state = visitStateOf(k);
  const day = (k.visitDate ?? "").slice(0, 10);
  if (state === "unscheduled") return VISIT_META.unscheduled.label;
  if (!day) return VISIT_META[state].label;
  return visitOverdue(k, todayIso)
    ? `${day} · เลยวันนัดแล้ว ยังไม่ระบุว่ามาไหม`
    : `${day} · ${VISIT_META[state].label}`;
}
