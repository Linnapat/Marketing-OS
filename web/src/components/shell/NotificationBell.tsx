"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, ChevronDown } from "lucide-react";
import { useNotifications } from "@/lib/useNotifications";
import { notifMeta } from "@/lib/db/notifications";
import { conversationThreads, threadHref, jobTitleOf, graphicIdOf, type InboxThread } from "@/lib/data/inbox";
import { fetchGraphicFeedback } from "@/lib/db/feedback";
import { fetchGraphicById } from "@/lib/db/graphic";
import { fetchMembers, Member } from "@/lib/db/settings";
import { isOutsourceRole } from "@/lib/roleGates";
import { Feedback, isMessage, threadAudience } from "@/lib/data/graphic";
import { isSamePerson, personKeys, memberRef } from "@/lib/identity";

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

/** What the panel knows about one opened conversation. Fetched on expand, one
 *  job at a time and once per session — the bell is on every page, and reading
 *  every thread up front to show a two-line preview would be the whole table. */
type ThreadState = "loading" | "error" | { rows: Feedback[]; people: string[] };

const threadCacheKey = (t: InboxThread) => `${t.key}@${t.lastAt}`;

export function NotificationBell({ collapsed, tone = "dark" }: {
  collapsed?: boolean;
  /** "dark" for the navy sidebar, "light" for a white page header. */
  tone?: "dark" | "light";
}) {
  const { items, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("all");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [threadRows, setThreadRows] = useState<Record<string, ThreadState>>({});
  // Names on a request are just names; who is IN-HOUSE and who is the studio
  // it was outsourced to is in the member list. Read once, and only once a
  // conversation is actually opened.
  const [people, setPeople] = useState<Member[]>([]);
  const askedForPeople = useRef(false);
  const outsource = (name: string) =>
    isOutsourceRole(people.find((m) => isSamePerson(name, personKeys(memberRef(m))))?.role);

  const threads = useMemo(() => conversationThreads(items), [items]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); };
  }, [open]);

  /** Open one conversation in place. Opening it is reading it, so the whole
   *  thread is marked — the row is the notification. */
  const toggleThread = (t: InboxThread) => {
    const next = openThread === t.key ? null : t.key;
    setOpenThread(next);
    if (!next) return;
    if (t.unread > 0) markRead(t.ids);
    if (!people.length && !askedForPeople.current) {
      askedForPeople.current = true;
      fetchMembers().then(setPeople).catch(() => { askedForPeople.current = false; });
    }
    const gid = graphicIdOf(t.link);
    // Keyed by the last thing said, not by the job: a thread read an hour ago
    // and replied to since must not be served from the session cache.
    const cacheKey = threadCacheKey(t);
    if (gid === null || threadRows[cacheKey]) return;
    setThreadRows((m) => ({ ...m, [cacheKey]: "loading" }));
    // The request as well as the thread: everyone the job is ON — the studio
    // it was handed to included — not only whoever has spoken so far.
    Promise.all([fetchGraphicFeedback(gid), fetchGraphicById(gid).catch(() => null)])
      .then(([rows, g]) => setThreadRows((m) => ({
        ...m, [cacheKey]: { rows, people: threadAudience(g ?? {}, rows, "") },
      })))
      .catch(() => setThreadRows((m) => ({ ...m, [cacheKey]: "error" })));
  };

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
                  <span className="text-[11px]">ข้อความที่พิมพ์คุยกันในใบงานจะมารวมที่นี่ · กดที่ชื่องานเพื่อกางอ่านทั้งเธรด</span>
                </div>
              ) : (
                threads.map((t) => {
                  const href = threadHref(t.link);
                  const expanded = openThread === t.key;
                  const rows = threadRows[threadCacheKey(t)];
                  const loaded = typeof rows === "object" ? rows : null;
                  return (
                    <div key={t.key} style={{ borderTop: "1px solid #F4EFE5", background: t.unread ? "#FFFCF5" : undefined }}>
                      <button onClick={() => toggleThread(t)} aria-expanded={expanded}
                        className="w-full text-left px-4 py-[11px] hover:bg-ivory/60 transition">
                        <div className="flex items-center gap-[6px]">
                          {t.unread > 0 && <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: "#B33A2E" }} />}
                          <div className="text-[12.5px] font-bold text-ink leading-[1.35] flex-1 min-w-0 truncate">{jobTitleOf(t.title)}</div>
                          <span className="text-[10px] font-bold text-faint shrink-0">💬 {t.messages}</span>
                          <ChevronDown size={14} className={`text-faint shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </div>
                        {!expanded && (
                          <div className="text-[11.5px] text-muted leading-[1.45] mt-[3px] line-clamp-2">
                            {t.lastBy && <b className="text-ink font-bold">{t.lastBy}: </b>}{t.lastText || "—"}
                          </div>
                        )}
                        <div className="text-[10px] text-faint mt-[4px]">
                          {when(t.lastAt)}{t.notices > 0 ? ` · อัปเดตอื่น ${t.notices}` : ""}
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-4 pb-[12px] flex flex-col gap-[8px]">
                          {rows === "loading" && <div className="text-[11.5px] text-faint py-2">กำลังโหลดบทสนทนา…</div>}
                          {rows === "error" && <div className="text-[11.5px] text-status-red py-2">โหลดบทสนทนาไม่สำเร็จ — เปิดในใบงานแทนได้</div>}
                          {/* Who this conversation is between, the outsourced
                              studio included — a thread you can read without
                              knowing who is on the job is half an answer. */}
                          {loaded && loaded.people.length > 0 && (
                            <div className="flex items-center gap-[5px] flex-wrap text-[10px] text-faint">
                              <span>ในงานนี้:</span>
                              {loaded.people.map((name) => (
                                <span key={name} className="font-bold px-[7px] py-[2px] rounded-pill border"
                                  style={outsource(name)
                                    ? { background: "#F3EFFA", borderColor: "#DCD2F0", color: "#6C5CE7" }
                                    : { background: "#fff", borderColor: "#EDE7DA", color: "#6b6258" }}>
                                  {name}{outsource(name) ? " · Outsource" : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {loaded && loaded.rows.length === 0 && (
                            <div className="text-[11.5px] text-faint py-2">ยังไม่มีข้อความในใบงานนี้</div>
                          )}
                          {/* Oldest first: a conversation reads down the page.
                              The list itself arrives newest-first, which is
                              right for an inbox and backwards for a thread. */}
                          {loaded && [...loaded.rows].reverse().slice(-20).map((f) => (
                            <div key={f.id} className="rounded-card px-3 py-[8px]" style={{ background: "#F9F6F0" }}>
                              <div className="flex items-center gap-[6px] flex-wrap">
                                <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                  style={{ background: f.ownerColor || "#9A9387" }}>{(f.owner || "?").slice(0, 1)}</span>
                                <span className="text-[11.5px] font-bold text-ink">{f.owner || "—"}</span>
                                {outsource(f.owner) && (
                                  <span className="text-[9.5px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: "#F3EFFA", color: "#6C5CE7" }}>Outsource</span>
                                )}
                                {!isMessage(f) && (
                                  <span className="text-[9.5px] font-bold text-muted px-[6px] py-[1px] rounded-pill bg-white border border-line3">
                                    {f.type}{f.version ? ` · ${f.version}` : ""}
                                  </span>
                                )}
                                <span className="text-[10px] text-faint ml-auto">
                                  {f.createdAtIso ? when(f.createdAtIso) : f.createdAt}
                                </span>
                              </div>
                              <div className="text-[11.5px] text-muted leading-[1.5] mt-[3px] whitespace-pre-wrap">{f.text}</div>
                            </div>
                          ))}
                          {/* No fetch to make for a thread that is not a graphic
                              request — show what the bell already holds. */}
                          {rows === undefined && (
                            items.filter((n) => t.ids.includes(n.id)).map((n) => (
                              <div key={n.id} className="rounded-card px-3 py-[8px]" style={{ background: "#F9F6F0" }}>
                                <div className="text-[11.5px] font-bold text-ink leading-[1.35]">{notifMeta(n.event).icon} {n.title}</div>
                                {n.detail && <div className="text-[11.5px] text-muted leading-[1.5] mt-[2px] whitespace-pre-wrap">{n.detail}</div>}
                                <div className="text-[10px] text-faint mt-[3px]">{when(n.createdAt)}</div>
                              </div>
                            ))
                          )}
                          {href && (
                            <Link href={href} onClick={() => setOpen(false)}
                              className="text-[11.5px] font-bold text-accent self-start">
                              เปิดในใบงานเพื่อตอบกลับ →
                            </Link>
                          )}
                        </div>
                      )}
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
