// Scores the system can work out on its own, so the review isn't retyping what
// the board already knows.
//
// Only KPIs with a real source are filled. The rest stay blank on purpose: a
// number nobody can trace back to an event is worse than an empty box, because
// it still lands in someone's KPI Score.
//
// What can be derived today, all from Graphic Requests:
//   On-time            → share of the month's due work delivered on time
//   Design Quality     → share approved without a single revision (a PROXY —
//                        first-pass acceptance, not an art director's opinion)
//   Approval Rate      → same first-pass share, as a Higher KPI against 100
//
// What cannot, and why (checked 2026-07-28):
//   Hook Rate / Watch Time      — Platform Performance rows carry no creator,
//                                 so a view count can't be attributed to a person
//   Reach Engagement Index      — reach exists per brand, not per person
//   Performance Support         — no event in the system represents it
//   Engagement Quality (KOL)    — collaborations record reach and cost, not who
//                                 judged the content
//
// An auto value NEVER overwrites a reviewer's entry: the review screen merges
// per field, with the typed value winning. That keeps "the system counted this"
// and "the CMO decided this" separable after the fact.

import { KpiDef, KpiInput, inputKey } from "@/lib/data/teamKpi";
import { KpiSignals } from "@/lib/data/teamKpiSignals";

export interface AutoValue {
  /** The KPI this fills. */
  kpi: string;
  /** Ready-to-merge input — only the fields this KPI actually reads. */
  input: KpiInput;
  /** Short label for the badge: where the number came from. */
  source: string;
  /** The counts behind it, so a disputed score can be traced. */
  basis: string;
  /** True when the number stands in for a judgement rather than measuring it. */
  proxy?: boolean;
}

const one = (value: number) => Number(value.toFixed(1));

/** Auto values for one person, keyed by `${personId}::${kpiName}`. Absent key =
 *  nothing to derive; the row stays the reviewer's to fill. */
export function autoInputs(
  personId: string,
  defs: KpiDef[],
  signals: KpiSignals | null,
): Record<string, AutoValue> {
  const out: Record<string, AutoValue> = {};
  if (!signals) return out;

  const settled = signals.onTime + signals.late;

  for (const def of defs) {
    const name = def.name.toLowerCase();

    // On-time — the delivery record, straight from due dates.
    if (def.direction === "Manual" && /on-time/.test(name) && signals.onTimeRate !== null) {
      out[inputKey(personId, def.name)] = {
        kpi: def.name,
        input: { score: one(signals.onTimeRate) },
        source: "การส่งงานบนบอร์ด",
        basis: `${signals.onTime} ตรงเวลา · ${signals.late} สาย จาก ${settled} งานที่สรุปได้`,
      };
      continue;
    }

    // Design Quality — first-pass acceptance. A proxy, and labelled as one.
    if (def.direction === "Manual" && /design quality/.test(name) && signals.cleanRate !== null) {
      out[inputKey(personId, def.name)] = {
        kpi: def.name,
        input: { score: one(signals.cleanRate) },
        source: "ผ่านรวดเดียว (proxy)",
        basis: `${signals.pieces - signals.piecesRevised} จาก ${signals.pieces} ชิ้นที่อนุมัติโดยไม่ถูกขอแก้`,
        proxy: true,
      };
      continue;
    }

    // Approval Rate — the same first-pass share, read as a Higher KPI so the
    // target stays visible and editable (100 = every piece accepted first time).
    if (def.direction === "Higher" && /approval rate/.test(name) && signals.cleanRate !== null) {
      out[inputKey(personId, def.name)] = {
        kpi: def.name,
        input: { target: 100, actual: one(signals.cleanRate) },
        source: "ผ่านรวดเดียว",
        basis: `${signals.pieces - signals.piecesRevised} จาก ${signals.pieces} ชิ้นที่อนุมัติโดยไม่ถูกขอแก้`,
      };
    }
  }

  return out;
}

/** What the scoring should actually use: auto values, with any field the
 *  reviewer typed winning over the derived one. Merged per FIELD, not per row —
 *  a hand-set target must not throw away the counted actual beside it. */
export function mergeInputs(
  auto: Record<string, AutoValue>,
  manual: Record<string, KpiInput>,
): Record<string, KpiInput> {
  const merged: Record<string, KpiInput> = {};
  for (const [key, value] of Object.entries(auto)) merged[key] = { ...value.input };
  for (const [key, input] of Object.entries(manual)) {
    const base = merged[key] ?? {};
    const patch: KpiInput = { ...base };
    if (input.target !== null && input.target !== undefined) patch.target = input.target;
    if (input.actual !== null && input.actual !== undefined) patch.actual = input.actual;
    if (input.score !== null && input.score !== undefined) patch.score = input.score;
    if (input.note) patch.note = input.note;
    merged[key] = patch;
  }
  return merged;
}

/** Did the reviewer override this KPI's derived value? Drives the "แก้เอง" tag
 *  and the "คืนค่าอัตโนมัติ" action. */
export function isOverridden(auto: AutoValue | undefined, manual: KpiInput | undefined): boolean {
  if (!auto || !manual) return false;
  const fields: (keyof KpiInput)[] = ["target", "actual", "score"];
  return fields.some((f) => {
    const typed = manual[f];
    if (typed === null || typed === undefined) return false;
    return typed !== auto.input[f];
  });
}
