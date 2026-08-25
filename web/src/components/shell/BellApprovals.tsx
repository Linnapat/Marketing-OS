"use client";

/* The bell's รออนุมัติ tab — what is waiting on YOU, in one short list.
 *
 * Not a second queue: no filters, no buttons, no rules of its own. It answers
 * "is there anything for me" from wherever you happen to be standing, and every
 * row hands you to the place that can actually decide it (My Tasks → รออนุมัติ,
 * which renders the real queue). Deciding here would mean a third copy of the
 * approve/return plumbing, and the two that exist are already one component
 * precisely so they cannot disagree.
 *
 * Rendered only while its tab is open — the six reads behind an approval queue
 * are not a cost the bell should pay on every page.
 */

import Link from "next/link";
import { useApprovalData } from "@/lib/useApprovalData";
import { useApprovalRows } from "@/lib/useApprovalRows";
import { useMe } from "@/lib/useMe";
import { APPROVAL_META, approvalTitle, waitingDays } from "@/lib/data/approvals";
import { useEffect, useMemo, useState } from "react";

const MY_APPROVALS = "/my-tasks?tab=approval";

export function BellApprovals({ onNavigate }: { onNavigate: () => void }) {
  const me = useMe();
  const { data, loading } = useApprovalData(true);
  const rows = useApprovalRows({ ...data, viewAs: me });
  // Yours only. The full queue shows the team's too — a bell that lists work
  // nobody expects you to touch is a bell people stop reading.
  const mine = useMemo(() => rows.filter((r) => r.mine), [rows]);

  // Ages are measured on the client after mount, for the same hydration reason
  // the queue itself does it.
  const [now, setNow] = useState(0);
  useEffect(() => { if (!loading) setNow(Date.now()); }, [loading]);

  if (loading && !rows.length) {
    return <div className="px-4 py-10 text-center text-[12px] text-faint">กำลังโหลดคิวอนุมัติ…</div>;
  }
  if (!mine.length) {
    return (
      <div className="px-4 py-10 text-center text-[12px] text-faint leading-[1.7]">
        ไม่มีอะไรรอคุณอนุมัติ 🌿<br />
        <span className="text-[11px]">งานของคนอื่นดูได้ที่ My Tasks → รออนุมัติ</span>
      </div>
    );
  }

  return (
    <>
      {mine.slice(0, 20).map((row) => {
        const meta = APPROVAL_META[row.kind];
        const days = now ? waitingDays(row.waitingSince, now) : null;
        return (
          <Link key={row.key} href={MY_APPROVALS} onClick={onNavigate}
            className="block px-4 py-[11px]" style={{ borderTop: "1px solid #F4EFE5" }}>
            <div className="flex items-center gap-[6px] flex-wrap">
              <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill"
                style={{ background: meta.bg, color: meta.fg }}>{meta.icon} {meta.label}</span>
              {days !== null && days >= 7 && (
                <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill" style={{ background: "#FFF0F0", color: "#E15B5B" }}>
                  ค้าง {days} วัน
                </span>
              )}
            </div>
            <div className="text-[12px] font-bold text-ink leading-[1.35] mt-[4px]">{approvalTitle(row)}</div>
            <div className="text-[10px] text-faint mt-[3px]">
              {days === null ? "ไม่มีวันที่เริ่มรอ" : days === 0 ? "วันนี้" : `รอมา ${days} วัน`}
            </div>
          </Link>
        );
      })}
      {mine.length > 20 && (
        <Link href={MY_APPROVALS} onClick={onNavigate}
          className="block px-4 py-[10px] text-[11.5px] font-bold text-accent" style={{ borderTop: "1px solid #F4EFE5" }}>
          อีก {mine.length - 20} รายการ — เปิดคิวเต็ม →
        </Link>
      )}
    </>
  );
}
