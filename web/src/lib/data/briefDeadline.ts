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

import { thirdFriday } from "@/lib/data/artworkSchedule";
import { workingDayOnOrBefore } from "@/lib/data/teamHolidays";

/** On by default. Any non-zero value means "on" — see briefDeadlineFor. */
export const DEFAULT_BRIEF_CUTOFF_DAY = 25;

/** app_settings key for the monthly brief deadline. Named for the day number
 *  it once held; it is now a switch — "0" is off, anything else is on. */
export const BRIEF_CUTOFF_SETTING_KEY = "brief_cutoff_day";

/** app_settings key for rounds whose brief deadline was pushed back.
 *
 *  JSON: { "<the round's own third Friday>": "<last day briefs are taken>" }.
 *  The third Friday is the rule; this is the exception a person grants for one
 *  round — January's briefs were still coming in two days after 20 Nov, and
 *  without it every one of them had to be cleared as a rush by hand. Keyed by
 *  the round's date so an extension can never leak into another month. */
export const BRIEF_EXTENSION_SETTING_KEY = "brief_deadline_extensions";

export type BriefExtensions = Record<string, string>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Read the stored map. Anything unreadable, and any entry that does not move
 *  the deadline LATER, is dropped — a bad setting must fall back to the rule,
 *  never loosen or tighten it by accident. */
export function parseBriefExtensions(raw: string | null | undefined): BriefExtensions {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: BriefExtensions = {};
    for (const [round, until] of Object.entries(parsed as Record<string, unknown>)) {
      if (ISO_DAY.test(round) && typeof until === "string" && ISO_DAY.test(until) && until > round) out[round] = until;
    }
    return out;
  } catch { return {}; }
}

/** Set (or, with an empty `until`, clear) one round's extension. */
export function withBriefExtension(map: BriefExtensions, roundIso: string, until: string): BriefExtensions {
  const next = { ...map };
  if (until && until > roundIso) next[roundIso] = until; else delete next[roundIso];
  return next;
}

/** The round whose deadline is in play today: this month's third Friday —
 *  still ahead, or just closed. That is the one an extension is asked for. */
export function currentBriefRound(todayIso: string): string {
  return thirdFriday((todayIso ?? "").slice(0, 7));
}

export type RushCode = "deadline" | "leadTime" | "dailyCap";

export interface RushBreach {
  code: RushCode;
  /** Shown to the requester, so it says what to do, not just what is wrong. */
  label: string;
}

/** Last day to brief work that is due in `dueIso`'s month: the THIRD FRIDAY of
 *  the month before — the Creative round's Final Brief day (artworkSchedule).
 *
 *  It used to be a day number the CMO typed (the 20th), which only matched the
 *  round in months whose third Friday happened to fall on it: 20 Nov was right,
 *  20 Dec would have been two days after the real deadline of the 18th. The
 *  date now follows the round by itself (CMO, Nov 2026).
 *
 *  `cutoffDay` survives as the on/off switch the setting always carried: 0
 *  turns the monthly rule off and returns null, anything else turns it on. The
 *  number itself no longer picks the day. */
export function briefDeadlineFor(dueIso: string, cutoffDay: number, extensions?: BriefExtensions, holidays: readonly string[] = []): string | null {
  if (!dueIso || !cutoffDay || cutoffDay < 1) return null;
  const [y, m] = dueIso.split("-").map(Number);
  if (!y || !m) return null;
  // Month before the due month, wrapping the year.
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const round = thirdFriday(`${prevYear}-${String(prevMonth).padStart(2, "0")}`);
  if (!round) return null;
  const extended = extensions?.[round];
  // An extension is a date a person chose, so it stands as typed; the rule's
  // own Friday steps back off a day the team has off.
  return extended && extended > round ? extended : workingDayOnOrBefore(round, holidays);
}

export interface RushInput {
  /** When Creative must deliver. */
  graphicDueIso: string;
  /** Today, as the brief is being written. */
  requestIso: string;
  /** Monthly brief deadline switch: 0 = off, anything else = on. */
  cutoffDay: number;
  /** Rounds whose deadline was pushed back (parseBriefExtensions). */
  extensions?: BriefExtensions;
  /** Days the team has off (parseTeamHolidays). */
  holidays?: readonly string[];
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
  const { graphicDueIso, requestIso, cutoffDay, extensions, holidays, minDueIso, capLimit, capUsed, capAdding, kindLabel } = input;
  const out: RushBreach[] = [];
  if (!graphicDueIso) return out;

  const deadline = briefDeadlineFor(graphicDueIso, cutoffDay, extensions, holidays);
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
