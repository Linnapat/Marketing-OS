// What the system already knows about a KOL specialist's month — the same idea
// as teamKpiSignals.ts, which reads Graphic Requests for the Creative team.
// The KOL Specialist card had no signals at all, so their review was the only
// one done entirely from memory.
//
// On the on-time question, this deliberately reuses on_time_delivery rather
// than recomputing "was the post late": that field is already false only when
// the delay was attributed to the creator. A post held up by our own approval
// is late but is nobody's KPI here — and a specialist scored on raw lateness
// would simply pad every agreed date, which is the opposite of the point.
//
// Advisory, never automatic. The reviewer sees the numbers and decides.

export interface KolKpiRow {
  owner: string | null;
  month_key: string | null;
  status: string | null;
  performance_tag: string | null;
  on_time_delivery: boolean | null;
  agreed_post_at: string | null;
  posted_at: string | null;
  delay_reason: string | null;
  total_cost: number | null;
  actual_reach: number | null;
}

export interface KolKpiSignals {
  owner: string;
  month: string;
  /** Bookings this specialist ran in the month. */
  engagements: number;
  resulted: number;
  cancelled: number;
  /** Deliveries the creator made on time — see the note above on attribution. */
  onTime: number;
  late: number;
  /** 0..100 over judgeable deliveries. null when none could be judged, which is
   *  NOT 0% and must never be shown as a score. */
  onTimeRate: number | null;
  /** Late, but nobody has said whose fault — the specialist owes this answer. */
  unattributedLate: number;
  /** Finished but never summed up: no Performance tag. The loop left open. */
  unclosed: number;
  totalCost: number;
  totalReach: number;
  /** Blended cost per reach across the month. null when no reach landed. */
  costPerReach: number | null;
}

const empty = (owner: string, month: string): KolKpiSignals => ({
  owner, month,
  engagements: 0, resulted: 0, cancelled: 0,
  onTime: 0, late: 0, onTimeRate: null, unattributedLate: 0, unclosed: 0,
  totalCost: 0, totalReach: 0, costPerReach: null,
});

/** Same comparison rule the Creative signals use — names are typed by hand in
 *  two different screens, so "Ken S. " and "ken s." are one person. */
export const nameKey = (name: string) => (name ?? "").trim().toLowerCase();

const UNOWNED = /^(unassigned|-|—|tbd|n\/a)$/i;
const isPerson = (name: string | null) => !!nameKey(name ?? "") && !UNOWNED.test(nameKey(name ?? ""));

function tally(target: KolKpiSignals, r: KolKpiRow): void {
  target.engagements += 1;
  if (r.status === "Resulted") {
    target.resulted += 1;
    if (!r.performance_tag) target.unclosed += 1;
  }
  if (r.status === "Cancel") target.cancelled += 1;

  if (r.on_time_delivery === true) target.onTime += 1;
  else if (r.on_time_delivery === false) target.late += 1;

  if (r.agreed_post_at && r.posted_at && r.posted_at > r.agreed_post_at && !r.delay_reason) {
    target.unattributedLate += 1;
  }
  target.totalCost += r.total_cost ?? 0;
  target.totalReach += r.actual_reach ?? 0;
}

function finish(s: KolKpiSignals): KolKpiSignals {
  const judged = s.onTime + s.late;
  s.onTimeRate = judged ? (s.onTime / judged) * 100 : null;
  s.costPerReach = s.totalReach > 0 ? s.totalCost / s.totalReach : null;
  return s;
}

/** One signal set per specialist for the month. Rows with no owner are skipped
 *  here and surface in the team total instead — everything imported from the
 *  sheet is unowned, so attributing it to somebody would be an invention. */
export function kolKpiSignals(rows: KolKpiRow[], month: string): KolKpiSignals[] {
  const byOwner = new Map<string, KolKpiSignals>();
  for (const r of rows) {
    if (r.month_key !== month || !isPerson(r.owner)) continue;
    const key = nameKey(r.owner!);
    const sig = byOwner.get(key) ?? empty(r.owner!.trim(), month);
    tally(sig, r);
    byOwner.set(key, sig);
  }
  return [...byOwner.values()].map(finish);
}

/** The month's KOL work as a whole, owned or not. */
export function kolTeamSignals(rows: KolKpiRow[], month: string): KolKpiSignals {
  const total = empty("ทีม KOL", month);
  for (const r of rows) {
    if (r.month_key !== month) continue;
    tally(total, r);
  }
  return finish(total);
}

export function kolSignalsFor(name: string, list: KolKpiSignals[]): KolKpiSignals | null {
  const key = nameKey(name);
  return list.find((s) => nameKey(s.owner) === key) ?? null;
}
