"use client";

import { toastError } from "@/lib/toast";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TASKS, Task, CELEBRATIONS, daysUntilDue, isDueThisWeek, byDueThenPriority } from "@/lib/data/tasks";
import { fetchTasks, createTaskDb, reassignDb, updateTaskDb } from "@/lib/db/tasks";
import { fetchMembers } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { APPROVAL_CENTER, OPEN_PARAM, resolveOpenTarget, workLink } from "@/lib/deepLink";
import { DatePicker, fmtShort } from "@/components/ui/DatePicker";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignRow } from "@/lib/data/campaigns";
import { BRANDS, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { personKeys, isSamePerson, memberRef } from "@/lib/identity";
import { notifMeta, pushNotifications } from "@/lib/db/notifications";
import { useNotifications } from "@/lib/useNotifications";


import { optimistic } from "@/lib/optimistic";
import { approveTask } from "@/lib/taskApproval";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { fetchGraphics } from "@/lib/db/graphic";
import { Graphic, Feedback, isMessage, replyAudience, MESSAGE_TYPE } from "@/lib/data/graphic";
import { fetchGraphicFeedback } from "@/lib/db/feedback";
import { postGraphicMessage } from "@/lib/graphicThread";
import { TaskGraphicBrief } from "@/components/graphic/TaskGraphicBrief";
import {
  WorkItem, WorkCard, WorkListView, WorkCalendarView, WorkAction, WorkGroupHeader, StatMini,
  STATUS_MAP, PRIORITY_MAP, TYPE_COLORS, badge, init, chip, dueColorOf, brandCampaignLine,
} from "@/components/work/WorkViews";
import { GraphicDrawer, GTab } from "@/components/graphic/GraphicDrawer";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";

// (PENDING_CAMPAIGN lived here — a flat set of both pending statuses. It is
// gone because the two are not interchangeable: they wait on different people,
// and approvalCampaigns now asks that question per status.)

// ── Team = real members from Settings → Users & Roles ──────────────
// The bundled demo names ("Aran P.", "Ken S."…) used to seed this page's state,
// so before fetchMembers() resolved the header read "Viewing as Aran P." and
// the task list was filtered by a person who does not work here. Start empty
// and let the real member land instead — a blank moment is honest, a fake
// colleague is not.
interface Person { name: string; role: string; color: string }
const BENTO_MESSAGES = ["You're almost there", "Small wins count ✓", "One task at a time", "Let's clear this gently", "Nearly done — just a few more"];




const GROUP_DEFS = [
  { id: "doFirst", label: "Do First", icon: "🎯", countBg: "#FFF5F4", countColor: "#B33A2E", warnMsg: "" },
  { id: "needApproval", label: "Need Approval", icon: "✅", countBg: "#F0F7F0", countColor: "#4E7A4E", warnMsg: "" },
  { id: "waitingMe", label: "Waiting for Me", icon: "✋", countBg: "#FBF8EE", countColor: "#C68A1E", warnMsg: "" },
  { id: "quickWins", label: "Quick Wins", icon: "✨", countBg: "#FBF6ED", countColor: "#B8945A", warnMsg: "" },
  { id: "stuck", label: "Stuck — Needs support", icon: "⚠️", countBg: "#FFF5F4", countColor: "#B33A2E", warnMsg: "Let your team know if you need help" },
  { id: "done", label: "Done", icon: "✓", countBg: "#EEF4EE", countColor: "#4E7A4E", warnMsg: "" },
];
/* Overview repeats what the task card and drawer already say — brand,
 * campaign, due, designer, next action — and it is not why anyone opens a
 * request from here. Module-level so the array identity is stable across
 * renders. */
const HIDDEN_GRAPHIC_TABS: readonly GTab[] = ["overview"];
/* …except when Overview IS the reason the drawer was opened: the storyboard
 * accept / send-back pair sits in the production panel there. */
const ALL_GRAPHIC_TABS: readonly GTab[] = [];

const SCOPE_FILTERS = [
  { id: "all", label: "All tasks" }, { id: "today", label: "Today" }, { id: "week", label: "This week" },
  { id: "stuck", label: "Stuck" },
];
// Whether finished work is unfolded on this board. Remembered per browser, the
// same way FinishedFold remembers a list — the choice is a habit, not a
// per-visit decision, and re-hiding it on every reload is its own annoyance.
const SHOW_DONE_KEY = "mytasks.showDone";

/** useSearchParams (for ?task=) opts the tree into client rendering, which
 *  Next requires a Suspense boundary around. */
export default function MyTasksPage() {
  return (
    <Suspense fallback={<div className="px-5 py-10 text-[13px] text-faint">Loading…</div>}>
      <MyTasksPageInner />
    </Suspense>
  );
}

function MyTasksPageInner() {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [people, setPeople] = useState<Person[]>([]);
  // Personal view only — always the signed-in member (Team view lives in Team mood board).
  const [viewAs, setViewAs] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  // Same idea for campaign briefs — one gate, shared with the page that holds
  // the Approve button, so this inbox can never offer what that page refuses.
  //
  // The role gates that used to live here moved into useApprovalRows with the
  // queue they served — including the useAuth-not-useRole rule they turn on.
  const { member, user } = useAuth();
  // Who counts as me. One string was never enough: the same person is filed
  // under a display name, a nickname and an email across these tables, and an
  // exact match on the member name silently hid two thirds of one manager's
  // work. See lib/identity.
  // Falls back to viewAs when there is no member row to read (demo mode, or a
  // member still loading): without it the identity set is empty and every
  // filter below returns nothing, which reads as "you have no work" rather
  // than "we do not know who you are yet".
  const myKeys = useMemo(() => {
    const keys = personKeys(memberRef(member), user);
    return keys.size ? keys : personKeys({ name: viewAs });
  }, [member, user, viewAs]);
  const [viewMode, setViewMode] = useState<"cards" | "list" | "calendar">("cards");
  // Which month the calendar grid is showing. Seeded from the period filter and
  // re-synced whenever that moves, so switching to Calendar lands on the month
  // you were already looking at — but it stays navigable on its own, because
  // the filter can be set to a whole year and one grid only draws one month.
  const [calMonth, setCalMonth] = useState(() => ({ month: DEFAULT_DATE_FILTER.month, year: DEFAULT_DATE_FILTER.year }));
  const [scopeFilter, setScopeFilter] = useState("all");
  // Done work only ever accumulates: nothing takes a finished task off this
  // board, so the Done column grew past everything still to do and pushed the
  // live groups sideways. Fold it away by default and keep the count on the
  // toggle — hidden, never lost, one click to read it back (same bargain as
  // FinishedFold). Starts false and is corrected from localStorage after mount,
  // because reading storage during render breaks the server/client match.
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    try { setShowDone(localStorage.getItem(SHOW_DONE_KEY) === "1"); } catch { /* no-op */ }
  }, []);
  const toggleShowDone = () => setShowDone((current) => {
    const next = !current;
    try { localStorage.setItem(SHOW_DONE_KEY, next ? "1" : "0"); } catch { /* no-op */ }
    return next;
  });
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set([1, 4, 7, 8, 12, 14, 18, 20]));
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  // The Graphic request drawer, opened over this page rather than at /graphic.
  // Held by id, not by value: the row it renders comes from `graphics`, so an
  // edit made inside the drawer updates the card behind it in the same tick
  // instead of leaving a stale copy pinned in state.
  const [graphicOpenId, setGraphicOpenId] = useState<number | null>(null);
  // Which tab that drawer lands on. Almost everything here wants the brief, but
  // the storyboard decision lives on Overview — the one tab this page normally
  // hides — so opening a storyboard card at the default would show the requester
  // a drawer with no approve button anywhere in it.
  const [graphicOpenTab, setGraphicOpenTab] = useState<GTab>("brief");
  const openGraphicAt = (id: number, tab: GTab = "brief") => { setGraphicOpenId(id); setGraphicOpenTab(tab); };
  // Same rows the sidebar bell reads — one shared inbox, or the two drift and
  // a bell saying 3 sits above a list showing 1.
  const { unread, markRead } = useNotifications();
  // /my-tasks?task=<id> — arriving from a Slack DM or the email about this one
  // card. `tasksLoaded` exists because `tasks` starts as the bundled demo seed:
  // a non-empty list says nothing about whether the real rows are in, and
  // deciding too early tells someone their task is gone a beat before it loads.
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get(OPEN_PARAM.task);
  // ?tab=approval — money has no page of its own to open, so its notifications
  // land here instead; without this they landed on My Day and the approver had
  // to know which tab the request was hiding behind.
  const wantsApprovals = searchParams.get(OPEN_PARAM.tab) === "approval";
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const openedRef = useRef<string | null>(null);


  const getStatus = (t: Task) => (doneIds.has(t.id) ? "Done" : t.status);
  const getGroup = (t: Task) => (doneIds.has(t.id) ? "done" : t.group);
  const drawerTask = drawerId !== null ? tasks.find((t) => t.id === drawerId) ?? null : null;
  // A Graphic task's brief lives on the request, never on the task row — the
  // designer's checklist says "Review brief" and the brief was one page away.
  // Index the requests so the card and the drawer can show it in place.
  const graphicOf = useMemo(() => {
    const byId = new Map(graphics.map((g) => [String(g.id), g]));
    return (t: Task): Graphic | null => (t.relatedGraphicId ? byId.get(String(t.relatedGraphicId)) ?? null : null);
  }, [graphics]);
  const openGraphic = graphicOpenId === null ? null : graphics.find((g) => g.id === graphicOpenId) ?? null;
  const patchGraphic = (next: Graphic) => setGraphics((gs) => gs.map((g) => (g.id === next.id ? next : g)));

  useEffect(() => {
    let alive = true;
    fetchTasks().then(({ tasks, doneIds }) => {
      if (!alive) return;
      setTasks(tasks);
      setDoneIds(new Set(doneIds));
      setTasksLoaded(true);
    }).catch(() => { if (alive) setTasksLoaded(true); });
    // Team = real members from Settings (internal, non-external accounts).
    fetchMembers().then((ms) => {
      if (!alive) return;
      const internal = ms.filter((m) => m.brandAccess !== "External only" && !/agency/i.test(m.role));
      if (internal.length) setPeople(internal.map((m) => ({ name: m.name, role: m.role, color: m.color || "#9A9387" })));
    }).catch(() => {});
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    fetchGraphics().then((g) => { if (alive) setGraphics(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Open the card the notification was about, once the real list is in. The
  // param is dropped afterwards so closing the drawer does not reopen it, and a
  // task that is gone says so instead of leaving the board looking normal.
  // ?tab=approval used to switch to a tab on this page. The queue is its own
  // module now, so the link forwards there instead of landing on a task board
  // with nothing to show — old Slack DMs and emails carry this param and will
  // keep arriving for months.
  useEffect(() => {
    if (wantsApprovals) router.replace(APPROVAL_CENTER);
  }, [wantsApprovals, router]);

  useEffect(() => {
    if (!openTaskId) { openedRef.current = null; return; }
    const { action, item } = resolveOpenTarget(openTaskId, tasks, tasksLoaded, openedRef.current);
    if (action === "idle" || action === "wait") return;
    openedRef.current = openTaskId;
    if (action === "open" && item) setDrawerId(item.id);
    else toastError(`ไม่พบงาน #${openTaskId} — อาจถูกลบไปแล้ว หรือถูกส่งต่อให้คนอื่น`);
    router.replace("/my-tasks");
  }, [openTaskId, tasks, tasksLoaded, router]);

  // Tasks carry a brand LABEL, not a BrandId, so they need their own
  // visibility test. "All brands" and a blank label are visible to everyone.
  const canSeeBrandLabel = (value?: string | null) => {
    if (brandVisibility.allowAll) return true;
    const raw = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!raw || raw === "allbrands") return true;
    return brandOptions.some((id) => raw.includes(id) || raw.includes(BRANDS[id].name.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  };

  const colorOf = (n: string) => people.find((p) => p.name === n)?.color ?? "#9A9387";

  // Lock the view to the signed-in member; keep viewAs valid when the member list loads.
  useEffect(() => {
    if (member?.name && people.some((p) => p.name === member.name)) { setViewAs(member.name); return; }
    // Signed in but no matching member row (usually a mismatched email in
    // Settings → Users) → show the user's OWN identity, never a teammate's
    // task list. Falling back to people[0] would silently show someone else.
    if (AUTH_REQUIRED && user) { setViewAs(member?.name || user.email?.split("@")[0] || "You"); return; }
    if (!people.some((p) => p.name === viewAs)) setViewAs(people[0]?.name ?? viewAs);
  }, [member, people, viewAs, user]);

  // Optimistic local patch + persist, with the undo the old version was
  // missing: a rejected write used to leave the card showing the new state.
  const patchTask = (id: number, p: Partial<Task>) => {
    const before = tasks.find((t) => t.id === id);
    void optimistic(
      () => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t))),
      () => { if (before) setTasks((ts) => ts.map((t) => (t.id === id ? before : t))); },
      () => updateTaskDb(id, p),
      "บันทึก Task ไม่สำเร็จ",
    );
  };

  const markDone = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    setDoneIds((s) => new Set(s).add(id));
    setDrawerId(null);
    // A "Need Approval" task stands for something — a KOL proposal, a revised
    // budget — and approving it has to apply that first. lib/taskApproval owns
    // both halves so Approval Center's list rows cannot say yes to the wrapper
    // and leave the thing behind it untouched.
    if (task) {
      void approveTask({
        task, by: member?.name || user?.email || "",
        onBudgetApplied: (campaignId, budget) =>
          setCampaigns((cs) => cs.map((c) => (c.id === campaignId ? { ...c, budget } : c))),
      });
    }
    const msg = CELEBRATIONS[id % CELEBRATIONS.length];
    setCelebration(msg);
    setTimeout(() => setCelebration((c) => (c === msg ? null : c)), 3000);
  };
  const createTask = (t: Task) => {
    createTaskDb(t)
      .then(() => { setTasks((ts) => [t, ...ts]); setNewOpen(false); })
      .catch((error) => toastError(`สร้าง Task ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
  };
  const reassign = (id: number, to: string) => { setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, assignee: to } : t))); reassignDb(id, to); };

  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  // Follow the period filter while it is on a single month. Year/Range select a
  // span no single grid can draw, so the calendar keeps whatever month it is on
  // and reports the rest as "อยู่นอกเดือนนี้" rather than jumping somewhere the
  // filter never named.
  useEffect(() => {
    if (date.mode !== "month") return;
    setCalMonth((c) => (c.month === date.month && c.year === date.year ? c : { month: date.month, year: date.year }));
  }, [date.mode, date.month, date.year]);
  // canSeeBrandLabel derives only from brandVisibility/brandOptions, already deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const myTasks = useMemo(() => tasks.filter((t) => isSamePerson(t.assignee, myKeys) && canSeeBrandLabel(t.brand) && inDateFilter(date, t.dueIso || t.due)), [tasks, myKeys, date, brandOptions, brandVisibility]);
  // Today's focus = due today or overdue (real calendar) or stuck.
  const todayTasks = myTasks.filter((t) => (daysUntilDue(t) ?? 1) <= 0 || getStatus(t) === "Stuck");
  const todayDone = todayTasks.filter((t) => getStatus(t) === "Done").length;
  const todayTotal = todayTasks.length;
  const todayFocusCount = todayTasks.filter((t) => getStatus(t) !== "Done").length;
  const myDone = myTasks.filter((t) => getStatus(t) === "Done").length;
  const myStuck = myTasks.filter((t) => getStatus(t) === "Stuck").length;
  const myApprovals = myTasks.filter((t) => getStatus(t) === "Need Approval").length;
  const myWaiting = myTasks.filter((t) => getStatus(t) === "Waiting").length;
  const bentoMsg = BENTO_MESSAGES[myTasks.length ? Math.min(4, Math.floor((myDone / myTasks.length) * 5)) : 0];


  const matchScope = (t: Task) => {
    const st = getStatus(t);
    if (scopeFilter === "today") return (daysUntilDue(t) ?? 1) <= 0 || st === "Stuck";
    if (scopeFilter === "week") return isDueThisWeek(t) || ["In Progress", "Stuck", "Waiting", "Need Approval"].includes(st);
    if (scopeFilter === "stuck") return st === "Stuck";
    return true;
  };
  const scopedTasks = myTasks.filter(matchScope);
  // Finished is two facts, not one: the status a task reports and the column it
  // sits in. They come apart — a row whose group is already "done" can still
  // carry an older status — and asking only one question left those cards on a
  // board that was meant to be clear of them.
  const isDone = (t: Task) => getStatus(t) === "Done" || getGroup(t) === "done";
  const doneCount = scopedTasks.filter(isDone).length;
  // One filter above the view switch, so Cards, List and Calendar can never
  // disagree about whether finished work is showing.
  const visibleTasks = showDone ? scopedTasks : scopedTasks.filter((t) => !isDone(t));

  return (
    <div style={{ paddingBottom: 40 }}>
      <CampaignPageHeaderSection
        eyebrow="MY TASKS"
        title="My Tasks"
        description="Personal workspace and team workload in one calm command center. งานที่รออนุมัติย้ายไป Approval Center แล้ว"
        right={<NotificationBell tone="light" />}
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={() => setNewOpen(true)} style={{ ...chip(true), padding: "10px 16px", borderRadius: 12 }}>+ New Task</button>}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-faint">
                Viewing as {viewAs} · focus work and team support in one place
              </div>
              {/* Sign-off left this page for Approval Center — a personal task
                  board and a queue of decisions are two different jobs, and the
                  queue was invisible as a chip on somebody else's screen. */}
              <Link href={APPROVAL_CENTER} className="text-[12.5px] font-bold text-accent hover:underline">
                รออนุมัติ → Approval Center
              </Link>
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>
      </div>

      {(
        <div className="flex flex-col gap-[18px]">
          {/* The inbox. Comments and sent-back work used to go only to a LINE
              group and an inbox nobody opened, so the person they were for had
              nothing on their own screen — which is exactly how it was
              reported: "My Tasks ไม่ขึ้นเตือนเมื่อมีคอมเมนต์หรือตีกลับงาน". */}
          {unread.length > 0 && (
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
                {unread.slice(0, 8).map((n) => {
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
                {unread.length > 8 && (
                  <div className="px-5 py-2 text-[11px] text-faint" style={{ borderTop: "1px solid #F4EFE5" }}>
                    และอีก {unread.length - 8} รายการ
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BENTO (greeting card removed per request) */}
          <div className="flex gap-[14px] flex-wrap">
            <div className="flex flex-col gap-2 flex-1 min-w-[240px]">
              <div className="rounded-[18px] px-5 py-[18px] text-white" style={{ background: "#211F1C" }}>
                <div className="text-[10px] tracking-[0.08em] uppercase font-bold mb-2" style={{ color: "#B8945A" }}>Today&apos;s Focus 🍱</div>
                <div className="text-[40px] font-extrabold leading-none mb-1">{todayFocusCount}</div>
                <div className="text-[12px] italic mb-3" style={{ color: "#C0B8AD" }}>{bentoMsg}</div>
                <div className="h-[5px] rounded-[3px] overflow-hidden" style={{ background: "#3A3630" }}><div className="h-[5px] rounded-[3px]" style={{ background: "#B8945A", width: `${todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0}%` }} /></div>
                <div className="text-[11px] mt-[5px]" style={{ color: "#9A9387" }}>{todayDone} / {todayTotal} done today</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatMini label="Done ✓" val={myDone} fg="#4E7A4E" bg="#EEF4EE" />
                <StatMini label="Stuck ⚠" val={myStuck} fg="#B33A2E" bg="#FFF5F4" />
                <StatMini label="Approval ✅" val={myApprovals} fg="#4E7A4E" bg="#F0F7F0" />
                <StatMini label="Waiting" val={myWaiting} fg="#C68A1E" bg="#FBF8EE" />
              </div>
            </div>
          </div>

          {/* FILTER + VIEW */}
          <div className="flex items-center justify-between flex-wrap gap-[10px]">
            <div className="flex gap-[7px] flex-wrap">
              {SCOPE_FILTERS.map((f) => (
                <span
                  key={f.id}
                  onClick={() => setScopeFilter(f.id)}
                  style={chip(scopeFilter === f.id)}
                >
                  {f.label}
                </span>
              ))}
            </div>
            <div className="flex gap-[6px] items-center flex-wrap">
              {/* Nothing finished in this period → no toggle and no divider,
                  rather than a control that reads as broken because pressing
                  it changes nothing on screen. */}
              {doneCount > 0 && (
                <>
                  <span onClick={toggleShowDone} style={chip(showDone)} role="button" aria-pressed={showDone}
                    title={showDone ? "ซ่อนงานที่เสร็จแล้วออกจากบอร์ด" : "แสดงงานที่เสร็จแล้วบนบอร์ด"}>
                    ✓ {showDone ? "ซ่อนงานที่เสร็จ" : "ดูงานที่เสร็จ"} {doneCount}
                  </span>
                  <span className="w-px h-[18px] self-center" style={{ background: "#E5DECF" }} aria-hidden />
                </>
              )}
              <span onClick={() => setViewMode("cards")} style={chip(viewMode === "cards")}>⊞ Cards</span>
              <span onClick={() => setViewMode("list")} style={chip(viewMode === "list")}>≡ List</span>
              <span onClick={() => setViewMode("calendar")} style={chip(viewMode === "calendar")}>🗓 Calendar</span>
            </div>
          </div>

          {viewMode === "cards" ? (
            /* Kanban: the groups sit side by side and each one scrolls its own
               cards. Stacked vertically, a group with one card left a whole
               empty row and the later groups fell below the fold — you could
               not see "what needs approval" and "what is stuck" at once, which
               is the only reason to look at this screen. */
            <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
              {GROUP_DEFS.map((g) => {
                // ลำดับเดียวกับมุม List — คนหนึ่งเปิด Cards อีกคนเปิด List
                // แล้วเห็น "งานถัดไป" คนละใบ คือความสับสนที่ไม่มีใครเดาถูก
                const groupTasks = visibleTasks.filter((t) => getGroup(t) === g.id).sort(byDueThenPriority);
                if (groupTasks.length === 0) return null;
                return (
                  <div key={g.id} className="flex-shrink-0 flex flex-col" style={{ width: 340 }}>
                    <WorkGroupHeader g={g} count={groupTasks.length} />
                    <div className="flex flex-col gap-3">
                      {groupTasks.map((t) => <TaskCard key={t.id} t={t} status={getStatus(t)} viewAs={viewAs} graphic={graphicOf(t)} onOpen={() => setDrawerId(t.id)} onOpenGraphic={openGraphicAt} onDone={() => markDone(t.id)} onStart={() => patchTask(t.id, { status: "In Progress", group: "doFirst" })} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "calendar" ? (
            <WorkCalendarView
              items={visibleTasks.map((t) => taskToWorkItem(t, getStatus(t), graphicOf(t)))}
              month={calMonth.month}
              year={calMonth.year}
              onNavigate={(month, year) => setCalMonth({ month, year })}
              onOpen={(item) => setDrawerId(Number(item.key))}
              onOpenGraphic={openGraphicAt}
            />
          ) : (
            <ListView tasks={visibleTasks} getStatus={getStatus} onOpen={setDrawerId} onOpenGraphic={openGraphicAt} colorOf={colorOf} graphicOf={graphicOf} />
          )}
        </div>
      )}

      {drawerTask && <TaskDrawer t={drawerTask} status={getStatus(drawerTask)} me={viewAs} people={people} colorOf={colorOf} graphic={graphicOf(drawerTask)} onOpenGraphic={openGraphicAt} onClose={() => setDrawerId(null)} onDone={() => markDone(drawerTask.id)} onReassign={(to) => reassign(drawerTask.id, to)} onPatch={(p) => patchTask(drawerTask.id, p)} />}
      {/* The real request drawer, over My Tasks. Wrapped in its own stacking
          context so it sits above the task drawer (z-[200]) — GraphicDrawer is
          z-50 inside, which is correct on /graphic and too low here. */}
      {openGraphic && (
        <div className="relative z-[260]">
          <GraphicDrawer g={openGraphic} initialTab={graphicOpenTab}
            hideTabs={graphicOpenTab === "overview" ? ALL_GRAPHIC_TABS : HIDDEN_GRAPHIC_TABS}
            onClose={() => setGraphicOpenId(null)} onUpdate={patchGraphic} />
        </div>
      )}
      {newOpen && <NewTaskModal owner={viewAs} people={people} campaigns={campaigns.filter((c) => brandVisibility.isVisible(c.b))} brandOptions={brandOptions} nextId={Math.max(...tasks.map((t) => t.id)) + 1} onClose={() => setNewOpen(false)} onCreate={createTask} />}
      {celebration && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 rounded-[16px] px-6 py-[14px] shadow-2xl" style={{ bottom: 28, background: "#211F1C", color: "#fff" }}>
          <span className="text-[18px]">🌿</span>
          <div><div className="text-[13.5px] font-bold">{celebration}</div><div className="text-[11.5px] mt-[2px]" style={{ color: "#C0B8AD" }}>Small wins count — keep it going.</div></div>
        </div>
      )}
    </div>
  );
}

/** A Task as the shared card renders it. The mapping is the only Task-shaped
 *  code left in the card path — everything visual comes from WorkViews, so a
 *  change to the card shows up on the Agency Portal too. */
function taskToWorkItem(t: Task, status: string, graphic: Graphic | null): WorkItem {
  return {
    key: String(t.id),
    title: t.title,
    moduleIcon: t.moduleIcon,
    moduleColor: t.moduleColor,
    type: t.type,
    brand: t.brand,
    campaign: t.campaign,
    status,
    priority: t.priority,
    group: t.group,
    due: t.due,
    dueIso: t.dueIso,
    nextAction: t.nextAction,
    blocker: t.blocker,
    pendingApprover: t.pendingApprover,
    assignee: t.assignee,
    isQuickWin: t.isQuickWin,
    graphic,
  };
}

function TaskCard({ t, status, viewAs, graphic, onOpen, onOpenGraphic, onDone, onStart }: { t: Task; status: string; viewAs: string; graphic: Graphic | null; onOpen: () => void; onOpenGraphic: (id: number) => void; onDone: () => void; onStart: () => void }) {
  return (
    <WorkCard
      item={taskToWorkItem(t, status, graphic)}
      viewer={viewAs}
      onOpen={onOpen}
      onOpenGraphic={onOpenGraphic}
      actions={<>
        {graphic && <WorkAction label="🎨 เปิดบรีฟ / ส่งงาน" bg="#C2691E" onClick={() => onOpenGraphic(graphic.id)} />}
        {(status === "In Progress" || status === "Revision") && <WorkAction label="Mark Done ✓" bg="#4E7A4E" onClick={onDone} />}
        {status === "Need Approval" && <WorkAction label="Approve ✓" bg="#4E7A4E" onClick={onDone} />}
        {status === "Stuck" && <WorkAction label="Ask for Help" bg="#FFF5F4" fg="#B33A2E" border="#F5C8C4" onClick={onOpen} />}
        {status === "Todo" && <WorkAction label="Start" bg="#3E5C9A" onClick={onStart} />}
        {status === "Waiting" && <WorkAction label="Check in" bg="#FBF8EE" fg="#C68A1E" border="#EDCC7A" onClick={onOpen} />}
        <WorkAction label="Details" bg="#fff" fg="#6b6258" border="#E5DECF" onClick={onOpen} />
      </>}
    />
  );
}

function ListView({ tasks, getStatus, onOpen, onOpenGraphic, colorOf, graphicOf }: { tasks: Task[]; getStatus: (t: Task) => string; onOpen: (id: number) => void; onOpenGraphic: (id: number) => void; colorOf: (n: string) => string; graphicOf: (t: Task) => Graphic | null }) {
  return (
    <WorkListView
      items={tasks.map((t) => taskToWorkItem(t, getStatus(t), graphicOf(t)))}
      viewerColorOf={colorOf}
      onOpen={(item) => onOpen(Number(item.key))}
      onOpenGraphic={onOpenGraphic}
      groupByStatus
    />
  );
}


function TaskDrawer({ t, status, me, people, colorOf, graphic, onOpenGraphic, onClose, onDone, onReassign, onPatch }: {
  t: Task; status: string; me: string; people: Person[]; colorOf: (n: string) => string; graphic: Graphic | null;
  onOpenGraphic: (id: number) => void;
  onClose: () => void; onDone: () => void; onReassign: (to: string) => void; onPatch: (p: Partial<Task>) => void;
}) {
  const [typeFg, typeBg] = TYPE_COLORS[t.type] ?? ["#6b6258", "#F0EDE6"];
  const [asking, setAsking] = useState(false);
  const [helpMsg, setHelpMsg] = useState("");
  const [revising, setRevising] = useState(false);
  const [reviseMsg, setReviseMsg] = useState("");
  const [comment, setComment] = useState("");
  // A task about a graphic request is a window onto that request, not a place
  // of its own: the conversation belongs to the request, so both screens read
  // and write the same thread. Tasks with no request keep their own comments.
  const [thread, setThread] = useState<Feedback[]>([]);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!graphic) { setThread([]); return; }
    let alive = true;
    fetchGraphicFeedback(graphic.id).then((f) => { if (alive) setThread(f); }).catch(() => {});
    return () => { alive = false; };
  }, [graphic]);
  const replyTo = graphic ? replyAudience(graphic, thread, me) : [];
  const checklistDone = new Set(t.checklistDone ?? []);

  const start = () => onPatch({ status: "In Progress", group: "doFirst" });
  const askHelp = () => {
    if (!helpMsg.trim()) return;
    onPatch({
      status: "Stuck", group: "stuck", blocker: `${me} — ${helpMsg.trim()}`,
      comments: [...(t.comments ?? []), { by: me, text: `🆘 ${helpMsg.trim()}`, at: new Date().toISOString() }],
    });
    // Asking for help has no room to shout into — it reaches the people the
    // task already belongs to, the same pair the in-app inbox notifies.
    notify("mention", `🆘 ${me} ขอความช่วยเหลือ: ${t.title}`, helpMsg.trim(), workLink.task(t.id), { to: [t.assignee, t.pendingApprover] });
    setAsking(false); setHelpMsg("");
  };
  const requestRevision = () => {
    if (!reviseMsg.trim()) return;
    onPatch({
      status: "Revision", group: "doFirst", nextAction: `Revision requested: ${reviseMsg.trim()}`,
      comments: [...(t.comments ?? []), { by: me, text: `✏️ Revision: ${reviseMsg.trim()}`, at: new Date().toISOString() }],
    });
    setRevising(false); setReviseMsg("");
  };
  const addComment = async () => {
    const text = comment.trim();
    if (!text || sending) return;
    // On a graphic task the reply goes to the REQUEST, where the person who
    // asked the question is reading. It used to go into the task's own blob,
    // which the request never reads — so Creative asked, the requester
    // answered, and the answer landed somewhere Creative could not open.
    if (graphic) {
      setSending(true);
      try {
        const saved = await postGraphicMessage({ graphic, text, me, thread });
        setThread((ts) => [saved ?? {
          id: Date.now(), gid: graphic.id, owner: me, team: "Conversation", ownerColor: colorOf(me),
          type: MESSAGE_TYPE, text, version: "", status: "Open", assignedTo: "", due: null,
          createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        }, ...ts]);
        setComment("");
      } catch (error) {
        toastError(`ส่งข้อความไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally { setSending(false); }
      return;
    }
    onPatch({ comments: [...(t.comments ?? []), { by: me, text, at: new Date().toISOString() }] });
    // The comment reaches the people the task belongs to. Before this it went
    // into the task blob and nowhere else: you saw it only if you happened to
    // open that drawer.
    void pushNotifications([t.assignee, t.pendingApprover], {
      event: "comment", actor: me,
      title: `คอมเมนต์ใหม่: ${t.title}`,
      detail: text,
      link: workLink.task(t.id),
    });
    setComment("");
  };
  const toggleCheck = (i: number) => {
    const next = new Set(checklistDone);
    if (next.has(i)) next.delete(i); else next.add(i);
    onPatch({ checklistDone: [...next].sort((a, b) => a - b) });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex justify-end" style={{ background: "rgba(33,31,28,.42)" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white h-full overflow-y-auto" style={{ width: 440, maxWidth: "100vw", boxShadow: "-8px 0 40px rgba(0,0,0,.14)" }}>
        <div className="sticky top-0 bg-white z-[1]" style={{ padding: "22px 24px 18px", borderBottom: "1px solid #ECE6DA" }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-[7px] mb-2 flex-wrap">
                <span className="text-[14px]">{t.moduleIcon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: typeBg, color: typeFg }}>{t.type}</span>
                <span style={badge(t.priority, PRIORITY_MAP)}>{t.priority}</span>
                <span style={badge(status, STATUS_MAP)}>{status}</span>
              </div>
              <div className="text-[16px] font-extrabold leading-[1.3] mb-[5px]">{t.title}</div>
              <div className="text-[12px] text-faint">{brandCampaignLine(t.brand, t.campaign)}</div>
            </div>
            <span onClick={onClose} className="text-[18px] text-faint cursor-pointer p-1 leading-none flex-shrink-0">✕</span>
          </div>
        </div>
        <div style={{ margin: "18px 24px 0" }}>
          <div className="rounded-[14px] p-4" style={{ background: "linear-gradient(135deg,#FDF6E8,#F5E8CE)", border: "1px solid #E8D5AA" }}>
            <div className="text-[10px] tracking-[0.08em] uppercase font-bold mb-[7px]" style={{ color: "#B8945A" }}>What to do next</div>
            <div className="text-[13.5px] font-semibold leading-[1.55]" style={{ color: "#211F1C" }}>{t.nextAction}</div>
          </div>
        </div>
        <div style={{ padding: "18px 24px" }}>
          {/* The graphic brief, above the task's own fields: on a design job it
              IS the task, and reading it used to mean leaving this page. */}
          {graphic && <TaskGraphicBrief g={graphic} onOpenFull={() => onOpenGraphic(graphic.id)} />}
          <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[11px]">Task Details</div>
          <div className="grid grid-cols-2 gap-[9px] mb-[14px]">
            <Detail label="Due date" value={t.due} valueColor={dueColorOf(t)} />
            <Detail label="Brand" value={t.brand} />
            <Detail label="Owner" value={t.assignee} />
            <Detail label="Pending approver" value={t.pendingApprover ?? "—"} valueColor={t.pendingApprover ? "#C68A1E" : "#9A9387"} />
          </div>
          {t.blocker && (
            <div className="rounded-[10px] px-[14px] py-3 mb-[14px]" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
              <div className="text-[10px] font-bold tracking-[0.05em] uppercase mb-1" style={{ color: "#B33A2E" }}>⚠ Blocker</div>
              <div className="text-[13px] font-semibold" style={{ color: "#B33A2E" }}>{t.blocker}</div>
            </div>
          )}
          {t.checklist.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[10px]">Checklist</div>
              {t.checklist.map((c, i) => {
                const on = checklistDone.has(i);
                return (
                  <div key={i} onClick={() => toggleCheck(i)} className="flex items-center gap-[10px] py-2 cursor-pointer" style={{ borderBottom: "1px solid #F4EFE5" }}>
                    <span className="w-4 h-4 rounded-[4px] flex-shrink-0 flex items-center justify-center text-[10px]"
                      style={on ? { background: "#4E7A4E", border: "2px solid #4E7A4E", color: "#fff" } : { border: "2px solid #DDD4C4", color: "transparent" }}>✓</span>
                    <span className={"text-[13px] " + (on ? "line-through text-faint" : "text-ink")}>{c}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Hand off / reassign */}
          <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[10px]">Hand off to</div>
          <div className="flex flex-wrap gap-2">
            {people.map(({ name: p }) => {
              const active = p === t.assignee;
              return (
                <button key={p} onClick={() => onReassign(p)} disabled={active} className="flex items-center gap-[6px] rounded-pill transition disabled:cursor-default"
                  style={active ? { fontSize: 12, fontWeight: 700, padding: "5px 11px", background: "#211F1C", color: "#fff" } : { fontSize: 12, fontWeight: 500, padding: "5px 11px", border: "1px solid #E5DECF", color: "#6b6258", background: "#fff" }}>
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: colorOf(p) }}>{init(p)}</span>
                  {p.split(" ")[0]}{active ? " · current" : ""}
                </button>
              );
            })}
          </div>

          {/* Comments. On a graphic task this IS the request's thread — same
              messages the Creative side sees in the request drawer. */}
          <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mt-5 mb-[10px]">
            {graphic ? "คุยกันในใบงานนี้" : "Comments"} {graphic ? (thread.length ? `(${thread.length})` : "") : (t.comments?.length ? `(${t.comments.length})` : "")}
          </div>
          <div className="flex flex-col gap-2 mb-2">
            {graphic ? thread.map((f) => (
              <div key={f.id} className="rounded-[10px] px-3 py-[9px]" style={{ background: isMessage(f) ? "#F7F2FF" : "#FAF8F4" }}>
                <div className="flex items-center gap-2 mb-[3px] flex-wrap">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ background: f.ownerColor }}>{init(f.owner)}</span>
                  <span className="text-[11px] font-bold text-ink">{f.owner}</span>
                  <span className="text-[10px] text-faint">{f.createdAt}</span>
                  {/* Revision reasons live in this thread too — labelled, so a
                      request to change the work does not read as small talk. */}
                  {!isMessage(f) && <span className="text-[9.5px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: "#FBF1E9", color: "#C2691E" }}>{f.type}</span>}
                </div>
                <div className="text-[12.5px] text-muted leading-[1.5]">{f.text}</div>
              </div>
            )) : (t.comments ?? []).map((c, i) => (
              <div key={i} className="rounded-[10px] px-3 py-[9px]" style={{ background: "#FAF8F4" }}>
                <div className="flex items-center gap-2 mb-[3px]">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ background: colorOf(c.by) }}>{init(c.by)}</span>
                  <span className="text-[11px] font-bold text-ink">{c.by}</span>
                  <span className="text-[10px] text-faint">{new Date(c.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="text-[12.5px] text-muted leading-[1.5]">{c.text}</div>
              </div>
            ))}
            {graphic && thread.length === 0 && (
              <div className="text-[11.5px] text-faint">ยังไม่มีใครคุยในใบงานนี้ — พิมพ์ตอบได้เลย</div>
            )}
          </div>
          <div className="flex gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addComment()}
              placeholder={graphic ? "ตอบกลับในใบงานนี้…" : "เขียนคอมเมนต์ถึงทีม…"} className="flex-1 text-[12.5px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
            <button onClick={() => void addComment()} disabled={!comment.trim() || sending} className="text-[12px] font-bold text-white rounded-[9px] px-3 disabled:opacity-40" style={{ background: "#211F1C" }}>{sending ? "…" : "Send"}</button>
          </div>
          {graphic && replyTo.length > 0 && (
            <div className="text-[10.5px] text-faint mt-[6px]">ข้อความจะแจ้งเตือนถึง <b className="text-muted">{replyTo.join(", ")}</b></div>
          )}
        </div>
        <div className="sticky bottom-0" style={{ padding: "16px 24px", borderTop: "1px solid #ECE6DA", background: "#FBF9F4" }}>
          <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mb-[10px]">Actions</div>
          {revising && (
            <div className="flex gap-2 mb-2">
              <input value={reviseMsg} onChange={(e) => setReviseMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && requestRevision()} autoFocus
                placeholder="ต้องแก้อะไร… (จำเป็น)" className="flex-1 text-[12.5px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-white outline-none" />
              <button onClick={requestRevision} disabled={!reviseMsg.trim()} className="text-[12px] font-bold text-white rounded-[9px] px-3 disabled:opacity-40" style={{ background: "#C2691E" }}>Send back</button>
            </div>
          )}
          {asking && (
            <div className="flex gap-2 mb-2">
              <input value={helpMsg} onChange={(e) => setHelpMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askHelp()} autoFocus
                placeholder="ติดตรงไหน อยากให้ทีมช่วยอะไร… (จำเป็น)" className="flex-1 text-[12.5px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-white outline-none" />
              <button onClick={askHelp} disabled={!helpMsg.trim()} className="text-[12px] font-bold text-white rounded-[9px] px-3 disabled:opacity-40" style={{ background: "#B33A2E" }}>Ask</button>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {(status === "In Progress" || status === "Revision") && <span onClick={onDone} style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, background: "#4E7A4E", color: "#fff", cursor: "pointer" }}>Mark Done ✓</span>}
            {status === "Need Approval" && <>
              <span onClick={onDone} style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, background: "#4E7A4E", color: "#fff", cursor: "pointer" }}>Approve ✓</span>
              <span onClick={() => { setRevising((v) => !v); setAsking(false); }} style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, background: "#FBF1E9", color: "#C2691E", border: "1px solid #F0D5BC", cursor: "pointer" }}>Request revision</span>
            </>}
            {status === "Todo" && <span onClick={start} style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, background: "#3E5C9A", color: "#fff", cursor: "pointer" }}>Start</span>}
            {(status === "Stuck" || status === "Waiting" || status === "In Progress") && (
              <span onClick={() => { setAsking((v) => !v); setRevising(false); }} style={{ fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 10, background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4", cursor: "pointer" }}>Ask for Help</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return <div className="rounded-[10px] px-3 py-[10px]" style={{ background: "#FAF8F4" }}><div className="text-[10px] font-semibold text-faint mb-[3px]">{label}</div><div className="text-[13px] font-bold" style={{ color: valueColor ?? "#211F1C" }}>{value}</div></div>;
}

/** Work types offered when raising a task, in the order the team asked for.
 *  The old short types (Graphic, Ads, Budget…) stay in TYPE_META below as
 *  aliases so tasks already saved under them keep their icon and colour. */
const WORK_TYPES = [
  "Campaign", "Content", "Design / Artwork", "Photo / Video", "Paid Ads",
  "KOL / Influencer", "CRM / LINE OA", "Website / Digital", "Event / Activation",
  "Menu / Product", "Report / Analysis", "Admin / Other",
] as const;

const TYPE_META: Record<string, { module: string; icon: string; color: string }> = {
  // Current work types
  Campaign: { module: "Campaign", icon: "🎯", color: "#B8945A" },
  Content: { module: "Content", icon: "✍️", color: "#3E5C9A" },
  "Design / Artwork": { module: "Graphic", icon: "🎨", color: "#C2691E" },
  "Photo / Video": { module: "Graphic", icon: "🎬", color: "#9A5B33" },
  "Paid Ads": { module: "Ads", icon: "📣", color: "#C68A1E" },
  "KOL / Influencer": { module: "KOL", icon: "🌟", color: "#B5577E" },
  "CRM / LINE OA": { module: "CRM", icon: "💬", color: "#4E7A4E" },
  "Website / Digital": { module: "Content", icon: "🌐", color: "#3E7A8A" },
  "Event / Activation": { module: "Campaign", icon: "🎪", color: "#B33A2E" },
  "Menu / Product": { module: "Campaign", icon: "🍽️", color: "#8A6A3E" },
  "Report / Analysis": { module: "Campaign", icon: "📊", color: "#6b6258" },
  "Admin / Other": { module: "Campaign", icon: "🗂️", color: "#7A7268" },
  // Legacy types — still held by saved tasks, so keep resolving them.
  KOL: { module: "KOL", icon: "🌟", color: "#B5577E" },
  Graphic: { module: "Graphic", icon: "🎨", color: "#C2691E" },
  Budget: { module: "Finance", icon: "฿", color: "#4E7A4E" },
  Ads: { module: "Ads", icon: "📣", color: "#C68A1E" },
  Report: { module: "Campaign", icon: "📊", color: "#B33A2E" },
};


function NewTaskModal({ owner, people, campaigns, brandOptions, nextId, onClose, onCreate }: { owner: string; people: Person[]; campaigns: CampaignRow[]; brandOptions: BrandId[]; nextId: number; onClose: () => void; onCreate: (t: Task) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Content");
  const [assignee, setAssignee] = useState(owner);
  const [brand, setBrand] = useState<BrandId>(brandOptions[0] ?? "teppen");
  const [campaign, setCampaign] = useState("");
  const [dueIso, setDueIso] = useState("");
  const [priority, setPriority] = useState<"High" | "Med" | "Low">("Med");
  const [group, setGroup] = useState("doFirst");
  const [nextAction, setNextAction] = useState("");
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  // Real campaigns for the chosen brand.
  useEffect(() => { if (!brandOptions.includes(brand)) setBrand(brandOptions[0] ?? "teppen"); }, [brand, brandOptions]);
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.b === brand), [campaigns, brand]);
  useEffect(() => {
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign]);
  // Campaign is optional: plenty of real work (a monthly report, a menu shoot,
  // an admin errand) belongs to no campaign, and forcing one made people attach
  // tasks to whatever campaign happened to be in the list.
  const canCreate = !!title.trim();
  const create = () => {
    if (!canCreate) return;
    const meta = TYPE_META[type] ?? TYPE_META["Admin / Other"];
    onCreate({ id: nextId, title: title.trim(), module: meta.module, moduleIcon: meta.icon, moduleColor: meta.color, type, assignee, brand: brandName(brand), campaign: campaign.trim(), status: "Todo", priority, group, due: fmtShort(dueIso) || "TBD", dueIso, blocker: null, pendingApprover: null, isQuickWin: group === "quickWins", nextAction: nextAction.trim() || "Start when you're ready.", checklist: [] });
  };
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink text-[18px] leading-none">✕</button>
        <div className="text-[16px] font-extrabold mb-4">New Task</div>
        <div className="flex flex-col gap-4">
          <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Task Title <span style={{ color: "#B33A2E" }}>*</span></label><input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Draft Wagyu launch caption" autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Work Type</label><select value={type} onChange={(e) => setType(e.target.value)} className={field}>{WORK_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t].icon} {t}</option>)}</select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Assign to</label><select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>{people.map(({ name: p }) => <option key={p} value={p}>{p}{p === owner ? " (me)" : ""}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={brand} onChange={(e) => setBrand(e.target.value as BrandId)} className={field}>{brandOptions.map((id) => <option key={id} value={id}>{brandName(id)}</option>)}</select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign / Project <span className="text-faint font-normal">· optional</span></label><select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}><option value="">{brandCampaigns.length ? "— ไม่ผูกกับแคมเปญ —" : "ยังไม่มีแคมเปญของแบรนด์นี้"}</option>{brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Due</label><DatePicker value={dueIso || null} onChange={setDueIso} /></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Priority</label><select value={priority} onChange={(e) => setPriority(e.target.value as "High" | "Med" | "Low")} className={field}><option>High</option><option>Med</option><option>Low</option></select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Focus group</label><select value={group} onChange={(e) => setGroup(e.target.value)} className={field}>{GROUP_DEFS.filter((g) => g.id !== "done").map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
          </div>
          <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Next action</label><input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={field} placeholder="One clear next step…" /></div>
        </div>
        <button onClick={create} disabled={!canCreate} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Create Task</button>
      </div>
    </div>
  );
}
