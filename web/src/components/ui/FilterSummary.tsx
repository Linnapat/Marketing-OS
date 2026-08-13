"use client";

/* ── "ของหายไปไหน" ────────────────────────────────────────────────────────
 *
 * Every list in this app opens on the current month. That default is right for
 * planning and wrong for finding: a screen showing 8 campaigns and a screen
 * showing 8 of 11 look identical, so a row the filter hides reads as a row that
 * does not exist. Brand Awareness sat in the database for ten days that way —
 * nobody could tell the difference between "not there" and "not shown".
 *
 * So a list that hides something says so, and says how to get it back. This is
 * the counterpart to the rule already in DateFilterBar: a row whose date cannot
 * be parsed stays visible. Between them, nothing leaves the screen silently.
 *
 * Reasons are attributed to the FIRST test a row fails, so the per-reason counts
 * always add up to the total hidden — a row outside the month AND off-brand is
 * counted once, under whichever the caller listed first. Order the tests the way
 * you would explain them to someone: the filter they most likely forgot, first. */

export interface FilterTest<T> {
  /** Shown to the user, so name the filter, not the field: "นอกช่วงเวลา". */
  label: string;
  pass: (row: T) => boolean;
}

export interface HiddenReason { label: string; count: number }

export interface FilterOutcome<T> {
  rows: T[];
  /** Only the reasons that actually hid something, in the order given. */
  hidden: HiddenReason[];
  hiddenTotal: number;
  total: number;
}

/** Filter and keep count of what each filter took away.
 *
 *  Pass rows the viewer is ALLOWED to see — run brand-scope/permission checks
 *  before this. A row hidden because it belongs to a brand you don't manage is
 *  not something "ล้างตัวกรอง" can bring back, and offering it would be a lie. */
export function filterWithReasons<T>(rows: T[], tests: FilterTest<T>[]): FilterOutcome<T> {
  const kept: T[] = [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const failed = tests.find((t) => !t.pass(row));
    if (!failed) { kept.push(row); continue; }
    counts.set(failed.label, (counts.get(failed.label) ?? 0) + 1);
  }
  const hidden = tests
    .map((t) => ({ label: t.label, count: counts.get(t.label) ?? 0 }))
    .filter((r) => r.count > 0);
  return { rows: kept, hidden, hiddenTotal: rows.length - kept.length, total: rows.length };
}

/**
 * The one line a filtered list owes its reader: how much it is showing, how much
 * it is holding back, why, and how to see everything.
 *
 * Renders nothing when nothing is hidden — a list showing all it has should not
 * spend a row saying so.
 */
export function FilterSummary<T>({
  outcome,
  onClear,
  noun = "รายการ",
}: {
  outcome: FilterOutcome<T>;
  /** Reset every filter this list has. Omit and the button is not offered. */
  onClear?: () => void;
  /** What the rows are called, for the sentence: "แสดง 8 จาก 11 แคมเปญ". */
  noun?: string;
}) {
  const { rows, total, hidden, hiddenTotal } = outcome;
  if (hiddenTotal <= 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-[9px] rounded-[12px] border text-[12px]"
      style={{ borderColor: "#EADFC4", background: "#FDF8EC", color: "#6B6577" }}
    >
      <span className="font-bold text-ink">
        แสดง {rows.length} จาก {total} {noun}
      </span>
      <span aria-hidden>·</span>
      <span className="font-semibold">
        ซ่อนอยู่ {hiddenTotal} — {hidden.map((r) => `${r.label} ${r.count}`).join(" · ")}
      </span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-[11.5px] font-bold rounded-[9px] px-3 py-[5px] border bg-white text-[#5B4FD8] whitespace-nowrap hover:bg-[#F6F4FF] transition"
          style={{ borderColor: "#DCD6F7" }}
        >
          ล้างตัวกรอง · ดูทั้งหมด
        </button>
      )}
    </div>
  );
}

/** The DateFilter value meaning "every period" — what ล้างตัวกรอง resets to.
 *  Range mode with both ends blank; filterWindow reads that as ±Infinity and
 *  DateFilterBar labels it "ทุกช่วงเวลา". */
export const ALL_TIME_FILTER = { mode: "range", month: 0, year: new Date().getFullYear(), start: "", end: "" } as const;
