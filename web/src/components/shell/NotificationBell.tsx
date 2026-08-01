"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/lib/useNotifications";
import { notifMeta } from "@/lib/db/notifications";

/* The bell. My Tasks already shows the same rows, but only if you are on My
 * Tasks — and the thing being reported (a comment, a piece sent back) usually
 * arrives while you are somewhere else entirely. */

export function NotificationBell({ collapsed, tone = "dark" }: {
  collapsed?: boolean;
  /** "dark" for the navy sidebar, "light" for a white page header. */
  tone?: "dark" | "light";
}) {
  const { unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={unread.length ? `ยังไม่ได้อ่าน ${unread.length} รายการ` : "ไม่มีแจ้งเตือนใหม่"}
        aria-label={unread.length ? `แจ้งเตือน ${unread.length} รายการ` : "แจ้งเตือน"}
        className={`relative flex items-center justify-center w-9 h-9 rounded-[10px] transition ${
          tone === "light" ? "text-muted hover:text-ink hover:bg-ivory border border-line2" : "text-white/80 hover:text-white hover:bg-white/[0.08]"
        }`}
      >
        <span className="text-[16px]">🔔</span>
        {unread.length > 0 && (
          <span className="absolute -top-[2px] -right-[2px] min-w-[17px] h-[17px] px-[4px] rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: "#B33A2E", color: "#fff" }}>
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
        {!collapsed && <span className="sr-only">แจ้งเตือน</span>}
      </button>

      {/* Panel placement follows the bell, which is the thing that moved. In the
          sidebar footer it opens upward off the bottom-left, which is where the
          panel was pinned. In a page header — top of the screen, hard right —
          those same two rules opened it off the top and 210px past the right
          edge, which put a horizontal scrollbar on the whole page and dragged
          the header sideways with it. */}
      {open && (
        <div className={`absolute w-[320px] max-w-[86vw] rounded-[14px] overflow-hidden shadow-2xl z-50 ${
          tone === "light" ? "top-[46px] right-0" : "bottom-[46px] left-0"
        }`}
          style={{ background: "#fff", border: "1px solid #E5DECF" }}>
          <div className="flex items-center gap-2 px-4 py-[10px]" style={{ background: "#FBF1E9" }}>
            <span className="text-[12.5px] font-bold text-ink">แจ้งเตือน</span>
            {unread.length > 0 && (
              <button onClick={() => markRead(unread.map((n) => n.id))}
                className="ml-auto text-[11px] font-bold text-muted border border-line2 rounded-[7px] px-[9px] py-[3px] bg-white">
                อ่านทั้งหมด
              </button>
            )}
          </div>
          {unread.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-faint">ไม่มีอะไรค้างอยู่ 🌿</div>
          ) : (
            <div className="max-h-[340px] overflow-y-auto">
              {unread.slice(0, 12).map((n) => {
                const meta = notifMeta(n.event);
                const body = (
                  <>
                    <div className="text-[12px] font-bold text-ink leading-[1.35]">{meta.icon} {n.title}</div>
                    {n.detail && <div className="text-[11px] text-muted leading-[1.4] mt-[2px] line-clamp-2">{n.detail}</div>}
                    <div className="text-[10px] text-faint mt-[3px]">
                      {n.actor ? `โดย ${n.actor} · ` : ""}
                      {new Date(n.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </>
                );
                return (
                  <div key={n.id} className="px-4 py-[10px]" style={{ borderTop: "1px solid #F4EFE5" }}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => { markRead([n.id]); setOpen(false); }} className="block">{body}</Link>
                    ) : body}
                  </div>
                );
              })}
              {unread.length > 12 && (
                <Link href="/my-tasks" onClick={() => setOpen(false)}
                  className="block px-4 py-[9px] text-[11px] font-bold text-accent" style={{ borderTop: "1px solid #F4EFE5" }}>
                  ดูทั้งหมดใน My Tasks →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
