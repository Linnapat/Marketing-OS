"use client";

/* The unread inbox, in place on the page rather than behind the bell.
 *
 * Comments and sent-back work used to go only to a LINE group and an inbox
 * nobody opened, so the person they were for had nothing on their own screen —
 * "My Tasks ไม่ขึ้นเตือนเมื่อมีคอมเมนต์หรือตีกลับงาน". This is the answer to
 * that, and it is a component rather than markup on one page because the people
 * who most need it are the ones NOT on My Tasks: an external agency gets no
 * Slack DM at all (their email is outside the workspace, so the bot cannot
 * resolve a user), which makes this the only place a message reaches them.
 *
 * Renders nothing when there is nothing unread — a screen that says "0 new"
 * is a row spent on silence.
 */

import Link from "next/link";
import { useNotifications } from "@/lib/useNotifications";
import { notifMeta } from "@/lib/db/notifications";

export function UnreadPanel({ limit = 8 }: { limit?: number }) {
  const { unread, markRead } = useNotifications();
  if (unread.length === 0) return null;
  return (
    <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #F0D5BC" }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ background: "#FBF1E9" }}>
        <span className="text-[15px]">🔔</span>
        <span className="text-[13px] font-bold text-ink">ยังไม่ได้อ่าน</span>
        <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: "#B33A2E", color: "#fff" }}>{unread.length}</span>
        <button onClick={() => markRead(unread.map((n) => n.id))}
          className="ml-auto text-[11.5px] font-bold text-muted border border-line2 rounded-[8px] px-3 py-[5px] bg-white">
          อ่านทั้งหมดแล้ว
        </button>
      </div>
      <div className="bg-white">
        {unread.slice(0, limit).map((n) => {
          const meta = notifMeta(n.event);
          return (
            <div key={n.id} className="flex items-start gap-3 px-5 py-[11px]" style={{ borderTop: "1px solid #F4EFE5" }}>
              <span className="text-[14px] mt-[1px]">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-bold text-ink">{n.title}</div>
                {n.detail && <div className="text-[11.5px] text-muted leading-[1.45]">{n.detail}</div>}
                <div className="text-[10.5px] text-faint mt-[2px]">
                  {meta.label}{n.actor ? ` · โดย ${n.actor}` : ""} · {new Date(n.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {n.link && (
                  <Link href={n.link} onClick={() => markRead([n.id])}
                    className="text-[11.5px] font-bold text-accent whitespace-nowrap">เปิดดู →</Link>
                )}
                <button onClick={() => markRead([n.id])} className="text-[11px] text-faint whitespace-nowrap">อ่านแล้ว</button>
              </div>
            </div>
          );
        })}
        {unread.length > limit && (
          <div className="px-5 py-2 text-[11px] text-faint" style={{ borderTop: "1px solid #F4EFE5" }}>
            และอีก {unread.length - limit} รายการ
          </div>
        )}
      </div>
    </div>
  );
}
