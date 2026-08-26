"use client";

/* ประกาศเดดไลน์ — the month's dates, said out loud.
 *
 * Every date here already governs something: the Campaign Builder refuses a
 * brief after its window, the Graphic form will not take a due date inside the
 * lead time. But the dates themselves lived only in a 31-column grid on the
 * Team Calendar, so the way people actually found out was to ask, and the way
 * they were answered was a screenshot.
 *
 * Read straight from the calendar through useDeadlines — the same rows, the
 * same overrides. There is no second copy of a date anywhere in here, which is
 * the only reason a board like this can be trusted a month from now.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDeadlines } from "@/lib/useDeadlines";
import { monthKeyOfIso } from "@/lib/data/deadlinePolicy";
import { deadlineBoard, countdownLabel, deadlinesLandingIn, DeadlineRow, DeadlineState } from "@/lib/data/deadlineBoard";
import { fmtShort } from "@/components/ui/DatePicker";

const TONE: Record<DeadlineState, { fg: string; bg: string; ring: string }> = {
  overdue: { fg: "#B33A2E", bg: "#FFF3F1", ring: "#F0C9C2" },
  today:   { fg: "#B3641E", bg: "#FDF3E7", ring: "#EFD3B0" },
  soon:    { fg: "#C68A1E", bg: "#FBF8EE", ring: "#EBDFC0" },
  ahead:   { fg: "#5E7A4E", bg: "#F2F6EE", ring: "#D6E2CB" },
};

/** Today, as the calendar means it — set after mount, because Date.now() during
 *  render gives the server and the client two different answers. */
function useTodayIso(): string {
  const [iso, setIso] = useState("");
  useEffect(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    setIso(local.toISOString().slice(0, 10));
  }, []);
  return iso;
}

export function DeadlineBoard({ month, compact = false }: {
  /** "YYYY-MM" — the month whose DATES to show. Defaults to the current month.
   *  Not the month the work is for: a brief for September falls due in June,
   *  and a board answers "what is due now". */
  month?: string;
  /** Row per line instead of cards, for a page that already has a lot on it. */
  compact?: boolean;
}) {
  const deadlines = useDeadlines();
  const todayIso = useTodayIso();
  const forMonth = month || monthKeyOfIso(todayIso);
  if (!deadlines.ready || !todayIso || !forMonth) return null;

  const rows = deadlineBoard(deadlinesLandingIn(forMonth, deadlines.all), todayIso);
  if (rows.length === 0) {
    // Silent rather than a card saying nothing: a month the calendar has not
    // been filled in for is a Team Calendar problem, and that is where the page
    // that can fix it lives.
    return null;
  }

  const next = rows.find((r) => r.daysLeft >= 0) ?? rows[rows.length - 1];

  return (
    <section className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #E7DFD1", background: "#fff" }}>
      <header className="flex items-center gap-2 px-5 py-[11px] flex-wrap" style={{ background: "#FBF6EC", borderBottom: "1px solid #EFE6D8" }}>
        <span className="text-[15px]">📌</span>
        <span className="text-[13px] font-bold text-ink">เดดไลน์เดือนนี้</span>
        <span className="text-[11.5px] text-faint">· จาก Team Calendar</span>
        {next && (
          <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill"
            style={{ background: TONE[next.state].bg, color: TONE[next.state].fg }}>
            ถัดไป: {next.label} · {countdownLabel(next.daysLeft)}
          </span>
        )}
        <Link href="/workflow" className="ml-auto text-[11.5px] font-bold text-accent whitespace-nowrap">
          เปิดปฏิทินทีม →
        </Link>
      </header>

      <div className={compact ? "" : "grid gap-2 p-3"} style={compact ? undefined : { gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
        {rows.map((r) => (compact ? <CompactRow key={r.key} row={r} /> : <Card key={r.key} row={r} />))}
      </div>
    </section>
  );
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** Which month's work this deadline is for — the fact that makes a date three
 *  months early read as planning rather than as a mistake. */
function forWorkLabel(row: DeadlineRow): string {
  const m = Number(row.forMonth.slice(5, 7));
  return TH_MONTHS[m - 1] ? `งานเดือน ${TH_MONTHS[m - 1]}` : row.forMonth;
}

function Card({ row }: { row: DeadlineRow }) {
  const tone = TONE[row.state];
  return (
    <div className="rounded-[14px] px-4 py-[13px]" style={{ background: tone.bg, border: `1px solid ${tone.ring}` }}>
      <div className="text-[11px] font-bold" style={{ color: tone.fg }}>{countdownLabel(row.daysLeft)}</div>
      <div className="text-[13.5px] font-bold text-ink leading-[1.35] mt-[3px]">{row.label}</div>
      <div className="text-[11.5px] text-muted leading-[1.45] mt-[2px]">{row.governs}</div>
      <div className="text-[11px] text-faint mt-[6px]">{fmtShort(row.iso) || row.iso} · {forWorkLabel(row)}</div>
    </div>
  );
}

function CompactRow({ row }: { row: DeadlineRow }) {
  const tone = TONE[row.state];
  return (
    <div className="flex items-center gap-3 px-5 py-[10px] flex-wrap" style={{ borderTop: "1px solid #F4EFE5" }}>
      <span className="text-[11px] font-bold px-[8px] py-[2px] rounded-pill whitespace-nowrap"
        style={{ background: tone.bg, color: tone.fg }}>{countdownLabel(row.daysLeft)}</span>
      <span className="text-[13px] font-bold text-ink">{row.label}</span>
      <span className="text-[11.5px] text-muted flex-1 min-w-[140px] truncate">{row.governs}</span>
      <span className="text-[11px] text-faint whitespace-nowrap">{forWorkLabel(row)}</span>
      <span className="text-[11.5px] text-faint whitespace-nowrap">{fmtShort(row.iso) || row.iso}</span>
    </div>
  );
}
