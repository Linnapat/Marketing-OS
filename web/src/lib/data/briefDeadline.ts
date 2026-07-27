/* When a graphic brief is late, over capacity, or both — and what that costs.
 *
 * Creative plans a month at a time, so work for month M has to be briefed by a
 * cutoff day in month M-1. On top of that sit two rules that already existed:
 * a five-business-day lead time per request, and a ceiling of N artwork pieces
 * of each kind on any one due date.
 *
 * All three used to be hard walls — the form simply refused, which is why they
 * were quietly worked around by moving a due date until the form went quiet.
 * They are now *breaches*: the brief still goes in, stamped with what it broke
 * and why it could not wait, and Creative Leader decides. A rule that can be
 * broken visibly is enforced better than one that can only be dodged.
 *
 * Pure on purpose: the answer must be identical in the form that warns, the
 * drawer that shows the pending decision, and any report that counts rush work. */

export const DEFAULT_BRIEF_CUTOFF_DAY = 25;

/** app_settings key holding the cutoff day. Stored as a plain string so the
 *  existing key/value table serves it; "0" switches the monthly rule off. */
export const BRIEF_CUTOFF_SETTING_KEY = "brief_cutoff_day";

export type RushCode = "deadline" | "leadTime" | "dailyCap";

export interface RushBreach {
  code: RushCode;
  /** Shown to the requester, so it says what to do, not just what is wrong. */
  label: string;
}

/** Last day to brief work that is due in `dueIso`'s month: `cutoffDay` of the
 *  month before. Returns null when the monthly deadline is switched off (0).
 *
 *  A cutoff past the end of a short month lands on its last day, so 31 never
 *  silently becomes the 3rd of the wrong month. */
export function briefDeadlineFor(dueIso: string, cutoffDay: number): string | null {
  if (!dueIso || !cutoffDay || cutoffDay < 1) return null;
  const [y, m] = dueIso.split("-").map(Number);
  if (!y || !m) return null;
  // Month before the due month, wrapping the year.
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const day = Math.min(cutoffDay, lastDay);
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface RushInput {
  /** When Creative must deliver. */
  graphicDueIso: string;
  /** Today, as the brief is being written. */
  requestIso: string;
  /** Day of the previous month briefs are due by; 0 turns the rule off. */
  cutoffDay: number;
  /** Earliest allowed due date for the lead time (minGraphicDueDate). */
  minDueIso: string;
  capLimit: number;
  capUsed: number;
  capAdding: number;
  /** "Graphic" / "VDO · งานตัด" … — named so the message says which queue is full. */
  kindLabel: string;
}

/** Every rule this brief breaks. Empty = it goes through normally. */
export function rushBreaches(input: RushInput): RushBreach[] {
  const { graphicDueIso, requestIso, cutoffDay, minDueIso, capLimit, capUsed, capAdding, kindLabel } = input;
  const out: RushBreach[] = [];
  if (!graphicDueIso) return out;

  const deadline = briefDeadlineFor(graphicDueIso, cutoffDay);
  if (deadline && requestIso > deadline) {
    out.push({
      code: "deadline",
      label: `เลยเดดไลน์ส่งบรีฟ — งานที่ส่งมอบเดือน ${graphicDueIso.slice(0, 7)} ต้องบรีฟภายใน ${deadline}`,
    });
  }

  if (minDueIso && graphicDueIso < minDueIso) {
    out.push({
      code: "leadTime",
      label: `กระชั้นกว่าที่ตกลงกัน — วันส่งงานเร็วสุดคือ ${minDueIso}`,
    });
  }

  if (capLimit > 0 && capUsed + capAdding > capLimit) {
    out.push({
      code: "dailyCap",
      label: `เกินโควตา ${kindLabel} วันที่ ${graphicDueIso} — ใช้แล้ว ${capUsed} + งานนี้ ${capAdding} จากโควตา ${capLimit}`,
    });
  }

  return out;
}

/** Rush sign-off state carried on a graphic request. "" = an ordinary brief. */
export type RushStatus = "" | "Pending" | "Approved" | "Rejected";

/** Work must not start while a rush brief is still waiting on a decision —
 *  that is the whole point of asking. Rejected stops it outright. */
export function rushBlocksProduction(status: RushStatus | undefined): boolean {
  return status === "Pending" || status === "Rejected";
}
