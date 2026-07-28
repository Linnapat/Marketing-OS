// Team KPI scoring — the logic the Marketing KPI Bonus Calculator sheet runs on,
// lifted into the app so a KPI review can be done here instead of in a
// spreadsheet full of salary columns.
//
// The sheet's chain is: Target/Actual (or a manual 0–1 score) → Achievement% →
// capped at 120% → × weight → Weighted Score → sum = KPI Score → multiplier
// band. This file owns that chain and nothing else: no fetching, no React, no
// money. Bonus is deliberately out of scope — the review screen shows
// performance only, so it can be discussed with the person being reviewed.
//
// Pure by design so scripts/test-team-kpi.ts can exercise it against fixtures.

export type KpiDirection = "Higher" | "Lower" | "Manual";

export interface KpiDef {
  position: string;
  name: string;
  /** Share of the position's KPI Score, as a fraction (0.7 = 70%). */
  weight: number;
  direction: KpiDirection;
  /** Grouping used by the review summary ("what is this team strong at?"). */
  focus: string;
}

/** KPI_Template, for the positions this screen reviews. Weights per position
 *  must total 1 — enforced by the tests, the same rule the sheet states. */
export const KPI_TEMPLATE: KpiDef[] = [
  { position: "Creative Leader", name: "Reach Engagement Index", weight: 0.7, direction: "Higher", focus: "Reach" },
  { position: "Creative Leader", name: "On-time", weight: 0.2, direction: "Manual", focus: "Execution" },
  { position: "Creative Leader", name: "Approval Rate", weight: 0.1, direction: "Higher", focus: "Quality" },

  { position: "Graphic Designer", name: "Design Quality", weight: 0.5, direction: "Manual", focus: "Quality" },
  { position: "Graphic Designer", name: "On-time", weight: 0.3, direction: "Manual", focus: "Execution" },
  { position: "Graphic Designer", name: "Performance Support", weight: 0.2, direction: "Manual", focus: "Quality" },

  { position: "Creative Executive", name: "Hook Rate", weight: 0.6, direction: "Higher", focus: "Performance" },
  { position: "Creative Executive", name: "Watch Time", weight: 0.2, direction: "Higher", focus: "Performance" },
  { position: "Creative Executive", name: "On-time", weight: 0.2, direction: "Manual", focus: "Execution" },

  { position: "Video Creator", name: "Hook Rate", weight: 0.6, direction: "Higher", focus: "Performance" },
  { position: "Video Creator", name: "Watch Time", weight: 0.2, direction: "Higher", focus: "Performance" },
  { position: "Video Creator", name: "On-time", weight: 0.2, direction: "Manual", focus: "Execution" },

  { position: "KOL Specialist", name: "Reach Efficiency", weight: 0.4, direction: "Higher", focus: "Reach" },
  { position: "KOL Specialist", name: "Engagement Quality", weight: 0.3, direction: "Manual", focus: "Quality" },
  { position: "KOL Specialist", name: "On-time or Purchase Sale", weight: 0.3, direction: "Manual", focus: "Execution" },
];

/** The Creative team proper. KOL Specialist is reviewed on the same screen but
 *  kept out of these totals — it reports elsewhere, and folding it in would
 *  quietly change the team average the CMO reads. */
export const CREATIVE_POSITIONS: string[] = ["Creative Leader", "Graphic Designer", "Creative Executive", "Video Creator"];
export const SIDE_POSITIONS: string[] = ["KOL Specialist"];
export const ALL_POSITIONS: string[] = [...CREATIVE_POSITIONS, ...SIDE_POSITIONS];

export const isCreativePosition = (position: string) => CREATIVE_POSITIONS.includes(position);
export const isSidePosition = (position: string) => SIDE_POSITIONS.includes(position);

export const kpisFor = (position: string): KpiDef[] => KPI_TEMPLATE.filter((k) => k.position === position);

/** Achievement is capped before it is weighted: 130% on one KPI must not
 *  bankroll a miss on another. 120% is the sheet's top multiplier band too. */
export const ACHIEVEMENT_CAP = 120;

export interface KpiPerson {
  id: string;
  name: string;
  position: string;
  /** The name this person is filed under on the Graphic board, when it differs
   *  from their name here. Spelling drifts between screens ("Jeeno" vs "Jino"),
   *  and a review must not silently lose someone's work to a typo — so the link
   *  is stored once, explicitly, instead of being re-guessed every month. */
  boardName?: string;
  note?: string;
}

/** Which KPI set a member's role is reviewed against. Roles the review doesn't
 *  cover (CMO, Co-ordinator…) map to nothing and the reviewer picks manually. */
export const ROLE_TO_POSITION: Record<string, string> = {
  "Creative Leader": "Creative Leader",
  "Senior Graphic Designer": "Graphic Designer",
  "VDO Editor": "Video Creator",
  "Content Creator": "Creative Executive",
  "KOL Specialist": "KOL Specialist",
};

/** The name to look this person up by on the board. */
export const boardNameOf = (person: KpiPerson) => (person.boardName || person.name).trim();

/** One KPI's raw input for one person. Which fields matter depends on the
 *  KPI's direction: Higher/Lower read target+actual, Manual reads score. */
export interface KpiInput {
  target?: number | null;
  actual?: number | null;
  /** Manual KPIs only: the reviewer's score as a percentage (95 = 95%). */
  score?: number | null;
  note?: string;
}

/** A month's review. `inputs` is keyed `${personId}::${kpiName}` — a position
 *  never repeats a KPI name, so that is unique per person. */
export interface TeamKpiMonth {
  month: string;
  people: KpiPerson[];
  inputs: Record<string, KpiInput>;
  updatedAt?: string;
}

export const inputKey = (personId: string, kpiName: string) => `${personId}::${kpiName}`;

export const emptyMonth = (month: string): TeamKpiMonth => ({ month, people: [], inputs: {} });

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Achievement% for one KPI, or null when the row has not been filled in.
 *  null ≠ 0: an unscored KPI is missing data, not a failed one, and the two
 *  must not read the same on a review screen. */
export function achievement(def: KpiDef, input: KpiInput | undefined): number | null {
  if (!input) return null;
  if (def.direction === "Manual") return isNum(input.score) ? input.score : null;
  const { target, actual } = input;
  if (!isNum(target) || !isNum(actual)) return null;
  if (def.direction === "Lower") return actual > 0 ? (target / actual) * 100 : null;
  return target > 0 ? (actual / target) * 100 : null;
}

export const capped = (value: number | null): number | null => (value === null ? null : Math.min(value, ACHIEVEMENT_CAP));

/** Weighted contribution of one KPI to the person's KPI Score. */
export function weighted(def: KpiDef, input: KpiInput | undefined): number | null {
  const c = capped(achievement(def, input));
  return c === null ? null : c * def.weight;
}

export interface KpiRowResult {
  def: KpiDef;
  input: KpiInput;
  achievement: number | null;
  capped: number | null;
  weighted: number | null;
}

export interface PersonResult {
  person: KpiPerson;
  rows: KpiRowResult[];
  /** Sum of weighted scores over the KPIs that have data. */
  score: number;
  /** Share of the position's weight that has been filled in (1 = complete). */
  filledWeight: number;
  complete: boolean;
  multiplier: number;
  band: KpiBand;
}

export type KpiBand = "none" | "low" | "near" | "on" | "over";

/** Multiplier table from the sheet (SECTION 1). Kept here because the band it
 *  implies is what the review screen colours by, even though the money it
 *  eventually multiplies lives elsewhere. */
export function multiplier(score: number): number {
  if (score >= 120) return 1.2;
  if (score >= 110) return 1.1;
  if (score >= 100) return 1.0;
  if (score >= 95) return 0.5;
  if (score >= 90) return 0.25;
  return 0;
}

export function band(score: number, complete: boolean): KpiBand {
  if (!complete && score === 0) return "none";
  if (score >= 110) return "over";
  if (score >= 100) return "on";
  if (score >= 90) return "near";
  return "low";
}

export function scorePerson(person: KpiPerson, inputs: Record<string, KpiInput>): PersonResult {
  const defs = kpisFor(person.position);
  const rows: KpiRowResult[] = defs.map((def) => {
    const input = inputs[inputKey(person.id, def.name)] ?? {};
    const a = achievement(def, input);
    return { def, input, achievement: a, capped: capped(a), weighted: weighted(def, input) };
  });
  const score = rows.reduce((sum, r) => sum + (r.weighted ?? 0), 0);
  const filledWeight = rows.reduce((sum, r) => sum + (r.weighted === null ? 0 : r.def.weight), 0);
  const complete = defs.length > 0 && filledWeight > 0.999;
  return { person, rows, score, filledWeight, complete, multiplier: multiplier(score), band: band(score, complete) };
}

export interface TeamSummary {
  people: number;
  /** Average KPI Score over people whose review is complete. */
  avgScore: number;
  scored: number;
  onTarget: number;   // ≥ 100%
  atRisk: number;     // < 90% (and complete)
  incomplete: number;
  /** Share of all required KPI rows that carry data. */
  completeness: number;
  /** Average capped achievement per KPI Focus — where the team is strong/weak. */
  byFocus: { focus: string; avg: number; rows: number }[];
}

export function summarize(results: PersonResult[]): TeamSummary {
  const scored = results.filter((r) => r.complete);
  const avgScore = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : 0;

  const allRows = results.flatMap((r) => r.rows);
  const filled = allRows.filter((r) => r.capped !== null);

  const focusMap = new Map<string, { total: number; rows: number }>();
  for (const row of filled) {
    const entry = focusMap.get(row.def.focus) ?? { total: 0, rows: 0 };
    entry.total += row.capped as number;
    entry.rows += 1;
    focusMap.set(row.def.focus, entry);
  }

  return {
    people: results.length,
    avgScore,
    scored: scored.length,
    onTarget: scored.filter((r) => r.score >= 100).length,
    atRisk: scored.filter((r) => r.score < 90).length,
    incomplete: results.length - scored.length,
    completeness: allRows.length ? filled.length / allRows.length : 0,
    byFocus: [...focusMap.entries()]
      .map(([focus, v]) => ({ focus, avg: v.total / v.rows, rows: v.rows }))
      .sort((a, b) => b.avg - a.avg),
  };
}

/** Month keys for the picker: the current month and the 11 before it. */
export function recentMonths(today: Date, count = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Defensive parse for whatever comes back from storage — a hand-edited row or
 *  an older shape must not crash the review screen. */
export function parseMonth(month: string, raw: unknown): TeamKpiMonth {
  const base = emptyMonth(month);
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<TeamKpiMonth>;
  const people = Array.isArray(value.people)
    ? value.people
        .filter((p): p is KpiPerson => !!p && typeof p.id === "string" && typeof p.name === "string")
        .filter((p) => ALL_POSITIONS.includes(p.position))
        .map((p) => ({ id: p.id, name: p.name, position: p.position, boardName: p.boardName ?? "", note: p.note ?? "" }))
    : [];
  const inputs: Record<string, KpiInput> = {};
  if (value.inputs && typeof value.inputs === "object") {
    for (const [key, input] of Object.entries(value.inputs as Record<string, KpiInput>)) {
      if (!input || typeof input !== "object") continue;
      inputs[key] = {
        target: isNum(input.target) ? input.target : null,
        actual: isNum(input.actual) ? input.actual : null,
        score: isNum(input.score) ? input.score : null,
        note: typeof input.note === "string" ? input.note : "",
      };
    }
  }
  return { month, people, inputs, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined };
}
