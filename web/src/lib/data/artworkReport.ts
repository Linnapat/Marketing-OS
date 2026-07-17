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
import { Graphic, GraphicDeliverable, WorkKind, deriveDeliverables, normSize, workKind } from "@/lib/data/graphic";

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
        kind: workKind(g.type, dels.some((d) => /video|reel/i.test(d.size))),
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
