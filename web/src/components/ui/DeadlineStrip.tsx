"use client";

// The Team Calendar's deadlines, shown where the work is done.
//
// Every module used to carry its own idea of when things were due, and none of
// them was the calendar the team actually keeps. This renders the calendar's
// own answer for a month, so the deadline you read in Content Plan is the one
// on the wall — and moving it on the wall moves it here.

import { MilestoneKey, inProcessOrder, outOfSequence } from "@/lib/data/deadlinePolicy";
import { useDeadlines } from "@/lib/useDeadlines";

const fmt = (iso: string) => {
  const [, m, d] = iso.split("-");
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${Number(d)} ${months[Number(m) - 1] ?? m}`;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function DeadlineStrip({ forMonth, only, note }: {
  /** The month the work is FOR ("YYYY-MM"). */
  forMonth: string;
  /** Show just these milestones; omit for all of them. */
  only?: MilestoneKey[];
  note?: string;
}) {
  const deadlines = useDeadlines();
  if (!forMonth) return null;
  // Read in PROCESS order (brief → plan → storyboard → artwork), not date
  // order: that is the order the work happens in, and showing it by date hides
  // it when the calendar has them the wrong way round.
  const items = inProcessOrder(deadlines.all(forMonth)).filter((d) => !only || only.includes(d.key));
  if (!items.length) return null;
  const today = todayIso();
  const broken = outOfSequence(items);

  return (
    <div className="rounded-cardLg border px-4 py-[10px]" style={{ background: "#F7F2FF", borderColor: "#DDD1FF" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11.5px] font-extrabold" style={{ color: "#2C2553" }}>
          🗓 เดดไลน์จากปฏิทินทีม · งานของเดือน {forMonth}
        </span>
        {items.map((d) => {
          // Past its date is not a warning about the future — it has already
          // slipped, and saying "เหลือ 0 วัน" would read as "still fine".
          const late = d.iso < today;
          return (
            <span key={d.key} className="text-[11.5px] font-bold rounded-pill px-2.5 py-[3px]"
              style={late
                ? { background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }
                : { background: "#fff", color: "#6C5CE7", border: "1px solid #DDD1FF" }}
              title={`${d.governs} · อ่านจากปฏิทินเดือน ${d.fromMonth}`}>
              {d.label} {fmt(d.iso)}{late ? " · เลยกำหนด" : ""}
            </span>
          );
        })}
      </div>
      {broken.length > 0 && (
        <div className="mt-[6px] text-[11px] font-semibold" style={{ color: "#B33A2E" }}>
          ⚠ ลำดับเดดไลน์เดือนนี้สลับกัน — ปฏิทินกำหนดให้ทำขั้นหลังก่อนขั้นหน้า ควรแก้วันในหน้า Team Calendar
        </div>
      )}
      <div className="mt-1 text-[11px]" style={{ color: "#7D70CC" }}>
        {note ?? "แก้วันได้ที่ Team Calendar — ทุกโมดูลอ่านจากที่เดียวกัน"}
      </div>
    </div>
  );
}
