// Artwork counting for outsourced work — the numbers an invoice is checked
// against, so every rule here is deliberate and none of them guess.
//
// The agreed policy (2026-07): a RESIZE IS A NEW PIECE. One master exported to
// 1:1, 4:5 and 9:16 is three pieces, because each needs its own composition.
// The same size used on two platforms is ONE piece — one file, sent twice.
// That is `normSize` in lib/data/graphic, and this module reuses it rather than
// re-deriving it: two answers to "how many pieces" is one too many.
//
// A piece counts when it is APPROVED (the requester accepted it), not when it
// was requested or submitted — work that was sent back and never accepted isn't
// billable. Revisions are shown but never add to the count: fixing a piece is
// still that piece.
//
// The month comes from the approval timestamp, never from a due date. An
// invoice covers what was accepted that month, and a request can be raised in
// July and accepted in August.

import { BrandId } from "@/lib/brands";
import { Graphic, GraphicDeliverable, WorkKind, deriveDeliverables, normSize, workKind, stageFromDeliverables } from "@/lib/data/graphic";

export interface ArtworkPiece {
  requestId: number;
  title: string;
  campaign: string;
  b: BrandId;
  /** Who is credited — the request's designer (an agency name for outsourced work). */
  designer: string;
  kind: WorkKind;
  /** The piece's identity: its size. Platforms below share this one file. */
  size: string;
  platforms: string[];
  /** ISO timestamp of the FIRST approval among the deliverables of this piece. */
  approvedAt: string;
  /** YYYY-MM of approvedAt — empty when the approval has no timestamp. */
  month: string;
  /** Times this piece was sent back. Information only; it is not paid twice. */
  revisions: number;
}

export interface ArtworkReport {
  /** Approved, dated pieces — what an invoice is built from. */
  pieces: ArtworkPiece[];
  /** Approved but undateable: the deliverable says "Approved" while no approval
   *  event carries a timestamp (rows approved before the history existed, or
   *  written by a path that didn't record one). Real work, so it is surfaced
   *  rather than dropped — but it is NOT filed into a month, because guessing
   *  one would move someone's pay onto the wrong invoice. */
  undated: ArtworkPiece[];
}

const monthOf = (iso: string) => (/^\d{4}-\d{2}/.exec(iso)?.[0] ?? "");

/** Group a request's deliverables into pieces of artwork, keyed by size. */
function piecesOf(g: Graphic): Map<string, GraphicDeliverable[]> {
  const dels = g.deliverables?.length ? g.deliverables : deriveDeliverables(g);
  const groups = new Map<string, GraphicDeliverable[]>();
  for (const d of dels) {
    const key = normSize(d.size);
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }
  return groups;
}

/** Every approval/revision event for a deliverable, by its `platform::size` key. */
function eventsByKey(g: Graphic) {
  const approvals = new Map<string, string[]>();
  const revisions = new Map<string, number>();
  for (const e of g.history ?? []) {
    if (!e.deliverableKey) continue;
    if (e.type === "approved") {
      const list = approvals.get(e.deliverableKey) ?? [];
      list.push(e.at);
      approvals.set(e.deliverableKey, list);
    } else if (e.type === "revision_requested") {
      revisions.set(e.deliverableKey, (revisions.get(e.deliverableKey) ?? 0) + 1);
    }
  }
  return { approvals, revisions };
}

export function artworkReport(graphics: Graphic[]): ArtworkReport {
  const pieces: ArtworkPiece[] = [];
  const undated: ArtworkPiece[] = [];

  for (const g of graphics) {
    const { approvals, revisions } = eventsByKey(g);

    for (const [, dels] of piecesOf(g)) {
      // The piece is done once ANY of its deliverables is approved: they are the
      // same file, so approving it on Instagram approves the artwork itself.
      const approvedDels = dels.filter((d) => d.status === "Approved");
      if (!approvedDels.length) continue;

      const stamps = approvedDels
        .flatMap((d) => approvals.get(`${d.platform}::${d.size}`) ?? [])
        .filter(Boolean)
        .sort();
      const approvedAt = stamps[0] ?? "";

      const piece: ArtworkPiece = {
        requestId: g.id,
        title: g.title,
        campaign: g.campaign,
        b: g.b,
        designer: g.designer,
        kind: workKind(g.type, g.requiredVideo || dels.some((d) => /video|reel/i.test(d.size))),
        size: dels[0].size,
        platforms: Array.from(new Set(dels.map((d) => d.platform))),
        approvedAt,
        month: monthOf(approvedAt),
        revisions: dels.reduce((sum, d) => sum + (revisions.get(`${d.platform}::${d.size}`) ?? 0), 0),
      };

      if (piece.month) pieces.push(piece);
      else undated.push(piece);
    }
  }

  return { pieces, undated };
}

export interface ArtworkTotal {
  designer: string;
  kind: WorkKind;
  pieces: number;
  /** Distinct requests those pieces came from — context, not a billing figure. */
  requests: number;
  revisions: number;
}

/** Totals for one month, per designer per work kind (rates differ by kind, so
 *  they are never added together). */
export function artworkTotals(pieces: ArtworkPiece[]): ArtworkTotal[] {
  const groups = new Map<string, ArtworkPiece[]>();
  for (const p of pieces) {
    const key = `${p.designer}::${p.kind}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }
  return Array.from(groups.values())
    .map((group) => ({
      designer: group[0].designer,
      kind: group[0].kind,
      pieces: group.length,
      requests: new Set(group.map((p) => p.requestId)).size,
      revisions: group.reduce((sum, p) => sum + p.revisions, 0),
    }))
    .sort((a, b) => b.pieces - a.pieces || a.designer.localeCompare(b.designer));
}

/** Months present in a set of pieces, newest first — drives the month picker. */
export function artworkMonths(pieces: ArtworkPiece[]): string[] {
  return Array.from(new Set(pieces.map((p) => p.month))).filter(Boolean).sort().reverse();
}

// ── Current workload (the "who is carrying what RIGHT NOW" table) ─────────
// The Artwork totals above answer "what got produced" — a billing question.
// This answers the managing question: per person, what is open, what is stuck
// in review or revision, what is late, and what lands within three days.

export interface WorkloadRow {
  designer: string;
  /** Open requests being worked on (not yet waiting review / in revision). */
  inProgress: number;
  /** Submitted, sitting with the approver. The designer is NOT the bottleneck here. */
  waitingReview: number;
  /** Sent back — active fixing work. */
  revision: number;
  /** Open and past due. */
  overdue: number;
  /** Open and due within the next `DUE_SOON_DAYS` days (today included). */
  dueSoon: number;
  /** Open requests per work kind, for the "4 graphic · 2 ตัด" mix line. */
  mix: Partial<Record<WorkKind, number>>;
}

export const DUE_SOON_DAYS = 3;

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Open (unapproved) requests grouped per designer. `today` is an ISO date —
 *  passed in, not read from the clock, so the maths is testable. */
export function creativeWorkload(graphics: Graphic[], today: string): WorkloadRow[] {
  const horizon = plusDays(today, DUE_SOON_DAYS);
  const rows = new Map<string, WorkloadRow>();

  for (const g of graphics) {
    const stage = stageFromDeliverables(g);
    if (stage === "Approved") continue;
    const designer = g.designer?.trim() || "Unassigned";
    const row = rows.get(designer) ?? { designer, inProgress: 0, waitingReview: 0, revision: 0, overdue: 0, dueSoon: 0, mix: {} };

    if (stage === "Revision Requested") row.revision++;
    else if (stage === "Waiting Feedback") row.waitingReview++;
    else row.inProgress++;

    const due = (g.dueIso || "").slice(0, 10);
    if (due && due < today) row.overdue++;
    else if (due && due <= horizon) row.dueSoon++;

    const kind = workKind(g.type, g.requiredVideo);
    row.mix[kind] = (row.mix[kind] ?? 0) + 1;
    rows.set(designer, row);
  }

  // Busiest first; "Unassigned" last — it's a queue, not a person.
  return Array.from(rows.values()).sort((a, b) => {
    if (a.designer === "Unassigned") return 1;
    if (b.designer === "Unassigned") return -1;
    const load = (r: WorkloadRow) => r.inProgress + r.revision;
    return load(b) - load(a) || a.designer.localeCompare(b.designer);
  });
}

/** Share of this month's approved pieces that needed at least one revision —
 *  0..1. Piece-based, not revision-count-based: one piece bounced five times
 *  is one problematic piece, not five. */
export function revisionRate(pieces: ArtworkPiece[]): number {
  if (!pieces.length) return 0;
  return pieces.filter((p) => p.revisions > 0).length / pieces.length;
}
