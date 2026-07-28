// What the system already knows about a person's month, so the reviewer isn't
// counting rows by hand.
//
// The KPI review keeps asking two things about Creative work — "how much did it
// bounce back?" and "was it on time?" — and Graphic Requests already answer
// both: every revision is an event in the request's history, and 42 of the 46
// live requests carry a due date.
//
// Two different clocks, deliberately kept apart:
//   • REWORK is counted on APPROVED pieces, by approval month — the same rule
//     the Artwork report bills on, so the team never gets two answers to "how
//     many pieces did I do".
//   • LATENESS is counted on the DUE month. A piece due on 5 July that is still
//     unapproved on 20 July is the lateness the review is about; waiting for it
//     to be approved before counting it would hide exactly the bad month.
//
// Advisory, never automatic: the numbers are shown and the CMO decides whether
// to use them. A month where half the work was cancelled shouldn't score itself.

import { Graphic } from "@/lib/data/graphic";
import { ArtworkPiece, artworkReport } from "@/lib/data/artworkReport";
import { daysBetween } from "@/lib/data/ageing";

export interface KpiSignals {
  designer: string;
  month: string;

  /* ── Rework: approved pieces, by approval month ─────────────────── */
  /** Pieces approved in this month. */
  pieces: number;
  /** Revision requests across those pieces — a piece bounced twice counts twice. */
  revisions: number;
  /** Pieces that needed at least one revision. */
  piecesRevised: number;
  /** Share approved without a single bounce, 0..100. null when nothing landed. */
  cleanRate: number | null;

  /* ── Lateness: requests due in this month ───────────────────────── */
  /** Requests whose due date falls in this month. */
  due: number;
  /** Approved on or before the due date. */
  onTime: number;
  /** Approved after the due date, plus anything still open past its due date. */
  late: number;
  /** Of `late`, the ones still not approved — late AND unfinished. */
  stillOpen: number;
  /** Due later this month and not yet resolved — not late, not counted either way. */
  pending: number;
  /** On-time share over settled work (onTime + late), 0..100. null when nothing
   *  is settled yet, which is NOT 0% and must never be shown as a score. */
  onTimeRate: number | null;
  /** Average days late over the late items (0 when none). */
  avgDaysLate: number;
  /** Worst single delay, for the outlier the average hides. */
  maxDaysLate: number;
}

const empty = (designer: string, month: string): KpiSignals => ({
  designer, month,
  pieces: 0, revisions: 0, piecesRevised: 0, cleanRate: null,
  due: 0, onTime: 0, late: 0, stillOpen: 0, pending: 0,
  onTimeRate: null, avgDaysLate: 0, maxDaysLate: 0,
});

/** Comparison key for a person's name: the review screen and the request board
 *  are typed by different people, so "Boss " and "boss" are one designer. */
export const nameKey = (name: string) => (name ?? "").trim().toLowerCase();

/** Names that mean "nobody" — unassigned work belongs to no one's review. */
const UNOWNED = /^(unassigned|-|—|tbd|n\/a)$/i;
const isPerson = (name: string) => !!nameKey(name) && !UNOWNED.test(nameKey(name));

const monthOf = (iso: string) => (iso ?? "").slice(0, 7);

/** Days something landed after its due date; 0 when on time, null when either
 *  date is missing. Whole days, UTC — the helper the ageing board uses. */
export function daysLate(dueIso: string | undefined, doneIso: string): number | null {
  const due = (dueIso ?? "").slice(0, 10);
  const done = (doneIso ?? "").slice(0, 10);
  if (!due || !done) return null;
  return done > due ? (daysBetween(due, done) ?? 0) : 0;
}

/** When a request was finished: its first approval event, else empty. */
export function approvedAt(g: Graphic): string {
  const events = (g.history ?? []).filter((e) => e.type === "approved" || e.type === "delivered");
  const dates = events.map((e) => e.at).filter(Boolean).sort();
  return dates[0] ?? "";
}

/** Per-designer signals for one month (`YYYY-MM`). `today` (ISO date) decides
 *  whether an unfinished request is already late or still merely pending. */
export function kpiSignals(graphics: Graphic[], month: string, today: string): KpiSignals[] {
  const rows = new Map<string, KpiSignals>();
  const row = (designer: string) => {
    const key = nameKey(designer);
    const existing = rows.get(key);
    if (existing) return existing;
    const created = empty(designer, month);
    rows.set(key, created);
    return created;
  };

  // Rework — approved pieces, filed by approval month.
  const pieces: ArtworkPiece[] = artworkReport(graphics).pieces.filter((p) => p.month === month);
  const byDesigner = new Map<string, ArtworkPiece[]>();
  for (const piece of pieces) {
    if (!isPerson(piece.designer)) continue;
    const key = nameKey(piece.designer);
    const bucket = byDesigner.get(key);
    if (bucket) bucket.push(piece);
    else byDesigner.set(key, [piece]);
  }
  for (const list of byDesigner.values()) {
    const r = row(list[0].designer);
    r.pieces = list.length;
    r.revisions = list.reduce((sum, p) => sum + p.revisions, 0);
    r.piecesRevised = list.filter((p) => p.revisions > 0).length;
    r.cleanRate = ((list.length - r.piecesRevised) / list.length) * 100;
  }

  // Lateness — requests due this month, settled or not.
  const lateDays = new Map<string, number[]>();
  for (const g of graphics) {
    if (!isPerson(g.designer)) continue;
    if (monthOf(g.dueIso ?? "") !== month) continue;
    const r = row(g.designer);
    r.due += 1;

    const done = approvedAt(g);
    const late = done ? daysLate(g.dueIso, done) : daysLate(g.dueIso, today);
    if (late === null) continue;

    if (late > 0) {
      r.late += 1;
      if (!done) r.stillOpen += 1;
      const bucket = lateDays.get(nameKey(g.designer)) ?? [];
      bucket.push(late);
      lateDays.set(nameKey(g.designer), bucket);
    } else if (done) {
      r.onTime += 1;
    } else {
      r.pending += 1;   // due later this month, still in flight
    }
  }

  for (const [key, r] of rows) {
    const settled = r.onTime + r.late;
    r.onTimeRate = settled ? (r.onTime / settled) * 100 : null;
    const days = lateDays.get(key) ?? [];
    r.avgDaysLate = days.length ? days.reduce((s, d) => s + d, 0) / days.length : 0;
    r.maxDaysLate = days.reduce((max, d) => Math.max(max, d), 0);
  }

  return [...rows.values()].sort((a, b) => (b.pieces + b.due) - (a.pieces + a.due));
}

/** The row for one person, matched on name. null when the name has no work that
 *  month — shown as "no data", never as a zero score. */
export function signalsFor(name: string, rows: KpiSignals[]): KpiSignals | null {
  const key = nameKey(name);
  if (!key) return null;
  return rows.find((r) => nameKey(r.designer) === key) ?? null;
}

/** Totals across the people being reviewed. Rates are recomputed from the raw
 *  counts, not averaged — averaging percentages would let a person with one
 *  piece weigh as much as one with twenty. */
export function totalSignals(rows: KpiSignals[]): KpiSignals {
  const total = empty("ทีม", rows[0]?.month ?? "");
  let lateDaysSum = 0;
  for (const r of rows) {
    total.pieces += r.pieces;
    total.revisions += r.revisions;
    total.piecesRevised += r.piecesRevised;
    total.due += r.due;
    total.onTime += r.onTime;
    total.late += r.late;
    total.stillOpen += r.stillOpen;
    total.pending += r.pending;
    total.maxDaysLate = Math.max(total.maxDaysLate, r.maxDaysLate);
    lateDaysSum += r.avgDaysLate * r.late;
  }
  total.cleanRate = total.pieces ? ((total.pieces - total.piecesRevised) / total.pieces) * 100 : null;
  const settled = total.onTime + total.late;
  total.onTimeRate = settled ? (total.onTime / settled) * 100 : null;
  total.avgDaysLate = total.late ? lateDaysSum / total.late : 0;
  return total;
}
