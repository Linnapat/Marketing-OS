"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useNotifications } from "@/lib/useNotifications";
import { notifMeta } from "@/lib/db/notifications";
import { conversationThreads, threadHref, jobTitleOf } from "@/lib/data/inbox";

/* The bell. My Tasks already shows the same rows, but only if you are on My
 * Tasks — and the thing being reported (a comment, a piece sent back) usually
 * arrives while you are somewhere else entirely.
 *
 * It opens as a panel down the right edge rather than a dropdown pinned to the
 * button. Two reasons, both from use: the dropdown was 320px of a 340px scroll
 * box, so a conversation was read three lines at a time; and it had to be
 * placed differently depending on which bell you pressed (sidebar footer vs
 * page header), which is how it once opened 210px past the right edge and put
 * a scrollbar on the whole page. A fixed panel has one position and one size.
 *
 * Two views of the same rows: what happened (แจ้งเตือน) and what is being
 * discussed (บทสนทนา, grouped per job by lib/data/inbox). Grouped, not
 * re-fetched — four notices about one Reel are one thing you are in the middle
 * of, not four interruptions.
 */

type View = "all" | "threads";

export function NotificationBell({ collapsed, tone = "dark" }: {
  collapsed?: boolean;
  /** "dark" for the navy sidebar, "light" for a white page header. */
  tone?: "dark" | "light";
}) {
  const { items, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("all");

  const threads = useMemo(() => conversationThreads(items), [items]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); };
  }, [open]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
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

      {open && (
        <>
          {/* Above the task and request drawers (z-200 / z-260 on My Tasks) and
              below the toaster (z-400): this is the thing just asked for. */}
          <div className="fixed inset-0 z-[320] bg-black/20" onClick={() => setOpen(false)} />
          <aside role="dialog" aria-label="กล่องข้อความ"
            className="fixed inset-y-0 right-0 z-[321] w-[400px] max-w-[94vw] flex flex-col shadow-2xl"
            style={{ background: "#fff", borderLeft: "1px solid #E5DECF" }}>
            <div className="flex items-center gap-2 px-4 py-[12px]" style={{ background: "#FBF1E9", borderBottom: "1px solid #EFE6D8" }}>
              <span className="text-[13px] font-bold text-ink">กล่องข้อความ</span>
              {unread.length > 0 && (
                <button onClick={() => markRead(unread.map((n) => n.id))}
                  className="ml-auto text-[11px] font-bold text-muted border border-line2 rounded-[7px] px-[9px] py-[3px] bg-white">
                  อ่านทั้งหมด
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="ปิด"
                className={`${unread.length > 0 ? "" : "ml-auto "}text-muted hover:text-ink p-[3px]`}>
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-1 px-3 pt-[10px] pb-[8px]" style={{ borderBottom: "1px solid #F4EFE5" }}>
              {([["all", "แจ้งเตือน", unread.length], ["threads", "บทสนทนา", threads.length]] as const).map(([id, label, count]) => (
                <button key={id} onClick={() => setView(id)}
                  className={`flex items-center gap-[6px] text-[12px] font-bold px-[11px] py-[6px] rounded-[9px] transition ${
                    view === id ? "text-ink" : "text-faint hover:text-muted"
                  }`}
                  style={view === id ? { background: "#F4EFE5" } : undefined}>
                  {label}
                  {count > 0 && (
                    <span className="text-[10px] font-bold px-[5px] py-[1px] rounded-pill"
                      style={{ background: view === id ? "#fff" : "#F4EFE5", color: "#8A879A" }}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {view === "all" ? (
                items.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[12px] text-faint">ไม่มีอะไรค้างอยู่ 🌿</div>
                ) : (
                  items.map((n) => {
                    const meta = notifMeta(n.event);
                    const body = (
                      <>
                        <div className="flex items-start gap-[6px]">
                          {!n.readAt && <span className="mt-[5px] w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "#B33A2E" }} />}
                          <div className="text-[12px] font-bold text-ink leading-[1.35]">{meta.icon} {n.title}</div>
                        </div>
                        {n.detail && <div className="text-[11px] text-muted leading-[1.45] mt-[3px] line-clamp-3">{n.detail}</div>}
                        <div className="text-[10px] text-faint mt-[4px]">
                          {n.actor ? `โดย ${n.actor} · ` : ""}{when(n.createdAt)}
                        </div>
                      </>
                    );
                    return (
                      <div key={n.id} className="px-4 py-[11px]"
                        style={{ borderTop: "1px solid #F4EFE5", background: n.readAt ? undefined : "#FFFCF5" }}>
                        {n.link ? (
                          <Link href={n.link} onClick={() => { markRead([n.id]); setOpen(false); }} className="block">{body}</Link>
                        ) : body}
                      </div>
                    );
                  })
                )
              ) : threads.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-faint leading-[1.7]">
                  ยังไม่มีงานที่มีบทสนทนา 🌿<br />
                  <span className="text-[11px]">ข้อความที่พิมพ์คุยกันในใบงานจะมารวมที่นี่</span>
                </div>
              ) : (
                threads.map((t) => {
                  const href = threadHref(t.link);
                  const body = (
                    <>
                      <div className="flex items-center gap-[6px]">
                        {t.unread > 0 && <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "#B33A2E" }} />}
                        <div className="text-[12.5px] font-bold text-ink leading-[1.35] flex-1 min-w-0 truncate">{jobTitleOf(t.title)}</div>
                        <span className="text-[10px] font-bold text-faint shrink-0">💬 {t.messages}</span>
                      </div>
                      <div className="text-[11.5px] text-muted leading-[1.45] mt-[3px] line-clamp-2">
                        {t.lastBy && <b className="text-ink font-bold">{t.lastBy}: </b>}{t.lastText || "—"}
                      </div>
                      <div className="text-[10px] text-faint mt-[4px]">
                        {when(t.lastAt)}{t.notices > 0 ? ` · อัปเดตอื่น ${t.notices}` : ""}
                      </div>
                    </>
                  );
                  return (
                    <div key={t.key} className="px-4 py-[11px]"
                      style={{ borderTop: "1px solid #F4EFE5", background: t.unread ? "#FFFCF5" : undefined }}>
                      {href ? (
                        // Opening the conversation is reading it — the whole
                        // thread is marked, not just the row that was clicked.
                        <Link href={href} onClick={() => { markRead(t.ids); setOpen(false); }} className="block">{body}</Link>
                      ) : body}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
