"use client";

import { useEffect, useMemo, useState, CSSProperties } from "react";
import Link from "next/link";
import { TASKS, Task, PEOPLE, GREETINGS, CELEBRATIONS, PERSON_ROLE, daysUntilDue, isDueToday, isDueThisWeek } from "@/lib/data/tasks";
import { fetchTasks, createTaskDb, markDoneDb, reassignDb, updateTaskDb } from "@/lib/db/tasks";
import { fetchMembers } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { DatePicker, fmtShort } from "@/components/ui/DatePicker";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignRow } from "@/lib/data/campaigns";
import { fetchRequests } from "@/lib/db/requests";
import { RequestRow } from "@/lib/data/requests";
import { BRANDS, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { baht } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { fetchExpenseRequests, approveExpenseRequest, rejectExpenseRequest, ExpenseReq } from "@/lib/db/finance";
import { daysWaiting } from "@/components/finance/ExpenseTabs";
import { approveKolProposal } from "@/lib/db/kol";
import { fetchGraphics } from "@/lib/db/graphic";
import { Graphic } from "@/lib/data/graphic";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  FilterBar,
} from "@/components/campaign/CampaignHeadController";

// Stages / statuses that still need someone in the approval tier to act.
const PENDING_REQ_STAGES = new Set(["Submitted", "CMO Review", "Revision"]);
const PENDING_CAMPAIGN = new Set(["Waiting for Approval", "Ready for Review"]);

// ── Team = real members from Settings → Users & Roles ──────────────
// (bundled mock names/colors remain the offline fallback)
interface Person { name: string; role: string; color: string }
const FALLBACK_COLORS: Record<string, string> = {
  "Aran P.": "#B8945A", "Ken S.": "#3E5C9A", Boss: "#4E7A4E",
  "Nok W.": "#6b6258", "Ploy R.": "#B5577E", "Mei T.": "#C2691E",
};
const MOCK_PEOPLE: Person[] = PEOPLE.map((name) => ({ name, role: PERSON_ROLE[name] ?? "", color: FALLBACK_COLORS[name] ?? "#9A9387" }));
const STATUS_MAP: Record<string, [string, string]> = {
  Done: ["#4E7A4E", "#EEF4EE"], "In Progress": ["#3E5C9A", "#EEF1F8"], Waiting: ["#C68A1E", "#FBF8EE"],
  "Need Approval": ["#4E7A4E", "#F0F7F0"], Stuck: ["#B33A2E", "#FFF5F4"], Revision: ["#C2691E", "#FBF1E9"], Todo: ["#9A9387", "#F2F0EB"],
};
const PRIORITY_MAP: Record<string, [string, string]> = {
  High: ["#B33A2E", "#FFF5F4"], Med: ["#C68A1E", "#FBF8EE"], Low: ["#9A9387", "#F2F0EB"],
};
const TYPE_COLORS: Record<string, [string, string]> = {
  Content: ["#3E5C9A", "#EEF1F8"], KOL: ["#B5577E", "#FBF0F5"], Graphic: ["#C2691E", "#FBF1E9"],
  Budget: ["#4E7A4E", "#EEF4EE"], Ads: ["#C68A1E", "#FBF8EE"], Report: ["#6b6258", "#F0EDE6"], Campaign: ["#B8945A", "#FBF6ED"],
};
const BENTO_MESSAGES = ["You're almost there", "Small wins count ✓", "One task at a time", "Let's clear this gently", "Nearly done — just a few more"];

const badge = (s: string, map: Record<string, [string, string]>): CSSProperties => {
  const [fg, bg] = map[s] ?? ["#6b6258", "#F0EDE6"];
  return { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: bg, color: fg, display: "inline-block", whiteSpace: "nowrap" };
};
const init = (n: string) => (n.slice(0, 1) + (n.split(" ")[1] || "").slice(0, 1)).toUpperCase();
const chip = (active: boolean): CSSProperties => active
  ? { fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 999, background: "#211F1C", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }
  : { fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 999, border: "1px solid #E5DECF", color: "#6b6258", cursor: "pointer", background: "#fff", whiteSpace: "nowrap" };

const GROUP_DEFS = [
  { id: "doFirst", label: "Do First", icon: "🎯", countBg: "#FFF5F4", countColor: "#B33A2E", warnMsg: "" },
  { id: "needApproval", label: "Need Approval", icon: "✅", countBg: "#F0F7F0", countColor: "#4E7A4E", warnMsg: "" },
  { id: "waitingMe", label: "Waiting for Me", icon: "✋", countBg: "#FBF8EE", countColor: "#C68A1E", warnMsg: "" },
  { id: "quickWins", label: "Quick Wins", icon: "✨", countBg: "#FBF6ED", countColor: "#B8945A", warnMsg: "" },
  { id: "stuck", label: "Stuck — Needs support", icon: "⚠️", countBg: "#FFF5F4", countColor: "#B33A2E", warnMsg: "Let your team know if you need help" },
  { id: "done", label: "Done", icon: "✓", countBg: "#EEF4EE", countColor: "#4E7A4E", warnMsg: "" },
];
const SCOPE_FILTERS = [
  { id: "all", label: "All tasks" }, { id: "today", label: "Today" }, { id: "week", label: "This week" },
  { id: "approvals", label: "My approvals" }, { id: "stuck", label: "Stuck" },
];

export default function MyTasksPage() {
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [activeTab, setActiveTab] = useState<"myDay" | "approval" | "team">("myDay");
  const [people, setPeople] = useState<Person[]>(MOCK_PEOPLE);
  const [viewAs, setViewAs] = useState(MOCK_PEOPLE[0].name);
  const [viewAsPicked, setViewAsPicked] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [expenseReqs, setExpenseReqs] = useState<ExpenseReq[]>([]);
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const { role } = useRole();
  // Expense approvals are a role gate (CMO), not a person filter — Marketing
  // expenses route to the CMO tier only (no CFO).
  const canApproveExpense = role === "CMO";
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set([1, 4, 7, 8, 12, 14, 18, 20]));
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const getStatus = (t: Task) => (doneIds.has(t.id) ? "Done" : t.status);
  const getGroup = (t: Task) => (doneIds.has(t.id) ? "done" : t.group);
  const drawerTask = drawerId !== null ? tasks.find((t) => t.id === drawerId) ?? null : null;

  useEffect(() => {
    let alive = true;
    fetchTasks().then(({ tasks, doneIds }) => {
      if (!alive) return;
      setTasks(tasks);
      setDoneIds(new Set(doneIds));
    }).catch(() => {});
    // Team = real members from Settings (internal, non-external accounts).
    fetchMembers().then((ms) => {
      if (!alive) return;
      const internal = ms.filter((m) => m.brandAccess !== "External only" && !/agency/i.test(m.role));
      if (internal.length) setPeople(internal.map((m) => ({ name: m.name, role: m.role, color: m.color || "#9A9387" })));
    }).catch(() => {});
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    fetchRequests().then((r) => { if (alive) setRequests(r); }).catch(() => {});
    fetchExpenseRequests().then((r) => { if (alive) setExpenseReqs(r); }).catch(() => {});
    fetchGraphics().then((g) => { if (alive) setGraphics(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // My Approval inbox — campaigns + requests where the current person is the
  // approver (available to anyone in an approval tier).
  const canSeeBrandLabel = (value?: string | null) => {
    if (brandVisibility.allowAll) return true;
    const raw = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!raw || raw === "allbrands") return true;
    return brandOptions.some((id) => raw.includes(id) || raw.includes(BRANDS[id].name.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  };

  const approvalCampaigns = useMemo(
    () => campaigns.filter((c) => PENDING_CAMPAIGN.has(c.status) && brandVisibility.isVisible(c.b)),
    [campaigns, brandVisibility],
  );
  const approvalRequests = useMemo(
    // Budget cards are excluded — they're shown as actionable expense requests below.
    () => requests.filter((r) => PENDING_REQ_STAGES.has(r.stage) && r.approver === viewAs && r.type !== "Budget" && brandVisibility.isVisible(r.b)),
    [requests, viewAs, brandVisibility],
  );
  const approvalExpenses = useMemo(
    () => (canApproveExpense ? expenseReqs.filter((r) => r.status === "Waiting Approval" && brandVisibility.isVisible(r.b)) : []),
    [expenseReqs, canApproveExpense, brandVisibility],
  );
  const approvalTasks = useMemo(
    () => tasks.filter((t) => t.assignee === viewAs && !doneIds.has(t.id) && t.status === "Need Approval" && canSeeBrandLabel(t.brand)),
    [tasks, viewAs, doneIds, brandOptions, brandVisibility],
  );
  const approvalGraphics = useMemo(
    () => graphics.filter((g) => g.requester === viewAs && brandVisibility.isVisible(g.b) && (g.deliverables ?? []).some((d) => d.status === "Waiting review")),
    [graphics, viewAs, brandVisibility],
  );
  const approvalCount = approvalCampaigns.length + approvalRequests.length + approvalExpenses.length + approvalTasks.length + approvalGraphics.length;
  // Approve / reject inline — sync the row locally so the card updates at once.
  const { member, user } = useAuth();
  const approverName = member?.name || user?.email?.split("@")[0] || "CMO";
  const colorOf = (n: string) => people.find((p) => p.name === n)?.color ?? FALLBACK_COLORS[n] ?? "#9A9387";

  // Default the "viewing as" person to the signed-in member (until the user
  // picks someone explicitly); keep viewAs valid when the member list loads.
  useEffect(() => {
    if (viewAsPicked) return;
    if (member?.name && people.some((p) => p.name === member.name)) setViewAs(member.name);
    else if (!people.some((p) => p.name === viewAs)) setViewAs(people[0]?.name ?? viewAs);
  }, [member, people, viewAs, viewAsPicked]);
  const pickViewAs = (n: string) => { setViewAsPicked(true); setViewAs(n); };

  // Optimistic local patch + persist — powers every action button.
  const patchTask = (id: number, p: Partial<Task>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
    updateTaskDb(id, p);
  };
  const approveExpense = (r: ExpenseReq) => {
    setExpenseReqs((xs) => xs.map((x) => (x === r ? { ...x, status: "Approved", approved: x.requested } : x)));
    approveExpenseRequest(r, r.requested);
  };
  const rejectExpense = (r: ExpenseReq, reason: string) => {
    setExpenseReqs((xs) => xs.map((x) => (x === r ? { ...x, status: "Rejected", rejectReason: reason } : x)));
    rejectExpenseRequest(r, reason, approverName);
  };

  const markDone = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (task?.approvalKind === "kolProposal" && task.relatedKolId != null) {
      approveKolProposal(task.relatedKolId).catch(() => {});
    }
    setDoneIds((s) => new Set(s).add(id));
    setDrawerId(null);
    markDoneDb(id);
    const msg = CELEBRATIONS[id % CELEBRATIONS.length];
    setCelebration(msg);
    setTimeout(() => setCelebration((c) => (c === msg ? null : c)), 3000);
  };
  const createTask = (t: Task) => { setTasks((ts) => [t, ...ts]); setNewOpen(false); createTaskDb(t); };
  const reassign = (id: number, to: string) => { setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, assignee: to } : t))); reassignDb(id, to); };

  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const myTasks = useMemo(() => tasks.filter((t) => t.assignee === viewAs && canSeeBrandLabel(t.brand) && inDateFilter(date, t.dueIso || t.due)), [tasks, viewAs, date, brandOptions, brandVisibility]);
  const [greetText, greetSubtext] = GREETINGS[viewAs] ?? [`Good to see you, ${viewAs.split(" ")[0]} 🌿`, "Let's move things forward today."];

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
  const totalOpenTasks = myTasks.filter((t) => getStatus(t) !== "Done").length;

  const openMyDay = () => {
    setActiveTab("myDay");
    if (scopeFilter === "approvals") setScopeFilter("all");
  };
  const openMyApprovals = () => {
    setScopeFilter("approvals");
    setActiveTab("approval");
  };

  const matchScope = (t: Task) => {
    const st = getStatus(t);
    if (scopeFilter === "today") return (daysUntilDue(t) ?? 1) <= 0 || st === "Stuck";
    if (scopeFilter === "week") return isDueThisWeek(t) || ["In Progress", "Stuck", "Waiting", "Need Approval"].includes(st);
    if (scopeFilter === "approvals") return st === "Need Approval";
    if (scopeFilter === "stuck") return st === "Stuck";
    return true;
  };
  const scopedTasks = myTasks.filter(matchScope);

  return (
    <div style={{ paddingBottom: 40 }}>
      <CampaignPageHeaderSection
        eyebrow="BUSY BUT BRILLIANT"
        title="My Tasks"
        description="Personal workspace, approvals, and team workload in one calm command center."
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={<button onClick={() => setNewOpen(true)} style={{ ...chip(true), padding: "10px 16px", borderRadius: 12 }}>+ New Task</button>}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[13px] font-semibold text-faint">
                Viewing as {viewAs} · approvals, focus work, and team support in one place
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span onClick={openMyDay} style={chip(activeTab === "myDay")}>My Day</span>
                <span onClick={openMyApprovals} style={chip(activeTab === "approval")} className="relative">
                  My approvals{approvalCount > 0 && <span className="ml-[6px] text-[10px] font-bold px-[6px] py-[1px] rounded-pill" style={{ background: "#B33A2E", color: "#fff" }}>{approvalCount}</span>}
                </span>
                <span onClick={() => setActiveTab("team")} style={chip(activeTab === "team")}>Team View</span>
              </div>
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>

        <FilterBar>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-[6px] bg-white border border-line2 rounded-pill px-3 py-[5px]">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: colorOf(viewAs) }}>{init(viewAs)}</span>
              <span className="text-[12px] font-semibold text-ink">{viewAs.split(" ")[0]}</span>
            </div>
            <div className="flex gap-[7px] flex-wrap">
              {people.map(({ name: p }) => {
                const active = viewAs === p;
                return <span key={p} onClick={() => pickViewAs(p)} style={active
                  ? { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#211F1C", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }
                  : { fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 999, border: "1px solid #E5DECF", color: "#6b6258", cursor: "pointer", background: "#fff", whiteSpace: "nowrap" }}>{p.split(" ")[0]}</span>;
              })}
            </div>
          </div>
        </FilterBar>
      </div>

      {activeTab === "myDay" ? (
        <div className="flex flex-col gap-[18px]">
          {/* GREETING + BENTO */}
          <div className="flex gap-[14px] flex-wrap">
            <div className="flex-1 min-w-[260px] rounded-[24px] px-[30px] py-[26px]" style={{ background: "linear-gradient(135deg,#FDF6E8 0%,#F5E8CE 100%)", border: "1px solid #E8D5AA" }}>
              <div className="text-[11px] tracking-[0.08em] uppercase font-bold mb-2" style={{ color: "#B8945A" }}>{new Date().toLocaleDateString("en-US", { weekday: "long" })} · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
              <div className="text-[26px] font-extrabold tracking-[-0.02em] mb-[6px]">{greetText}</div>
              <div className="text-[14.5px] text-muted leading-[1.55]">{greetSubtext}</div>
            </div>
            <div className="flex flex-col gap-2 min-w-[240px] max-w-[276px]">
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
                  onClick={() => f.id === "approvals" ? openMyApprovals() : setScopeFilter(f.id)}
                  style={chip(scopeFilter === f.id)}
                >
                  {f.label}
                </span>
              ))}
            </div>
            <div className="flex gap-[6px]">
              <span onClick={() => setViewMode("cards")} style={chip(viewMode === "cards")}>⊞ Cards</span>
              <span onClick={() => setViewMode("list")} style={chip(viewMode === "list")}>≡ List</span>
            </div>
          </div>

          {viewMode === "cards" ? (
            <div className="flex flex-col gap-[26px]">
              {GROUP_DEFS.map((g) => {
                const groupTasks = scopedTasks.filter((t) => getGroup(t) === g.id);
                if (groupTasks.length === 0) return null;
                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-[10px] mb-[13px]">
                      <span className="text-[17px]">{g.icon}</span>
                      <span className="text-[13.5px] font-bold tracking-[-0.01em]">{g.label}</span>
                      <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: g.countBg, color: g.countColor }}>{groupTasks.length}</span>
                      {g.warnMsg && <span className="text-[11.5px] italic" style={{ color: "#B33A2E" }}>{g.warnMsg}</span>}
                    </div>
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}>
                      {groupTasks.map((t) => <TaskCard key={t.id} t={t} status={getStatus(t)} viewAs={viewAs} onOpen={() => setDrawerId(t.id)} onDone={() => markDone(t.id)} onStart={() => patchTask(t.id, { status: "In Progress", group: "doFirst" })} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <ListView tasks={scopedTasks} getStatus={getStatus} onOpen={setDrawerId} colorOf={colorOf} />
          )}
        </div>
      ) : activeTab === "approval" ? (
        <MyApprovalView graphics={approvalGraphics} campaigns={approvalCampaigns} requests={approvalRequests} expenses={approvalExpenses} tasks={approvalTasks} onOpenTask={setDrawerId} onApprove={approveExpense} onReject={rejectExpense} />
      ) : (
        <TeamView tasks={tasks.filter((t) => canSeeBrandLabel(t.brand) && inDateFilter(date, t.dueIso || t.due))} getStatus={getStatus} people={people} onSelect={(p) => { pickViewAs(p); setActiveTab("myDay"); }} />
      )}

      {drawerTask && <TaskDrawer t={drawerTask} status={getStatus(drawerTask)} me={viewAs} people={people} colorOf={colorOf} onClose={() => setDrawerId(null)} onDone={() => markDone(drawerTask.id)} onReassign={(to) => reassign(drawerTask.id, to)} onPatch={(p) => patchTask(drawerTask.id, p)} />}
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

function MyApprovalView({ graphics, campaigns, requests, expenses, tasks, onOpenTask, onApprove, onReject }: {
  graphics: Graphic[]; campaigns: CampaignRow[]; requests: RequestRow[]; expenses: ExpenseReq[]; tasks: Task[];
  onOpenTask: (id: number) => void;
  onApprove: (r: ExpenseReq) => void; onReject: (r: ExpenseReq, reason: string) => void;
}) {
  const total = graphics.length + campaigns.length + requests.length + expenses.length + tasks.length;
  if (total === 0) {
    return (
      <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-16 text-center">
        <div>
          <div className="text-[15px] font-bold text-ink">ไม่มีงานรออนุมัติ 🎉</div>
          <div className="text-[12.5px] text-faint mt-1">แคมเปญ คำขอ และการเบิกงบที่รอคุณอนุมัติจะมาโผล่ที่นี่</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {graphics.length > 0 && (
        <div>
          <div className="flex items-center gap-[10px] mb-3">
            <span className="text-[17px]">🎨</span>
            <span className="text-[13.5px] font-bold">Graphic work waiting for your approval</span>
            <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: "#FBF1E9", color: "#C2691E" }}>{graphics.length}</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {graphics.map((g) => (
              <Link key={g.id} href="/graphic" className="bg-surface border border-line rounded-card p-4 hover:border-accent transition block">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13.5px] font-bold text-ink truncate">{g.title}</span>
                  <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0" style={{ background: "#FBF8EE", color: "#C68A1E" }}>Waiting review</span>
                </div>
                <div className="text-[11.5px] text-faint mb-3">{brandName(g.b)} · {g.campaign} · {g.type}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">Designer {g.designer}</span>
                  <span className="text-[11.5px] font-bold text-accent">Review artwork →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <div className="flex items-center gap-[10px] mb-3">
            <span className="text-[17px]">🌟</span>
            <span className="text-[13.5px] font-bold">KOL proposals waiting for approval</span>
            <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: "#F0F7F0", color: "#4E7A4E" }}>{tasks.length}</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {tasks.map((t) => (
              <button key={t.id} onClick={() => onOpenTask(t.id)} className="bg-surface border border-line rounded-card p-4 hover:border-accent transition text-left">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13.5px] font-bold text-ink truncate">{t.title}</span>
                  <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0" style={{ background: "#F0F7F0", color: "#4E7A4E" }}>Need Approval</span>
                </div>
                <div className="text-[11.5px] text-faint mb-3">{t.brand} · {t.campaign}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">Requested for {t.assignee}</span>
                  <span className="text-[11.5px] font-bold text-accent">Review →</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {expenses.length > 0 && (
        <div>
          <div className="flex items-center gap-[10px] mb-3">
            <span className="text-[17px]">฿</span>
            <span className="text-[13.5px] font-bold">Expense requests waiting for approval</span>
            <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>{expenses.length}</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {expenses.map((r) => <ExpenseApprovalCard key={r._id ?? r.ref ?? r.category} r={r} onApprove={onApprove} onReject={onReject} />)}
          </div>
        </div>
      )}
      {campaigns.length > 0 && (
        <div>
          <div className="flex items-center gap-[10px] mb-3">
            <span className="text-[17px]">🎯</span>
            <span className="text-[13.5px] font-bold">Campaigns waiting for approval</span>
            <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: "#FBF1E9", color: "#C2691E" }}>{campaigns.length}</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {campaigns.map((c) => (
              <Link key={c.id} href={`/campaigns/${c.id}?tab=approval`} className="bg-surface border border-line rounded-card p-4 hover:border-accent transition block">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13.5px] font-bold text-ink truncate">{c.name}</span>
                  <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0" style={{ background: "#FBF8EE", color: "#C68A1E" }}>{c.status}</span>
                </div>
                <div className="text-[11.5px] text-faint mb-3">{brandName(c.b)} · {c.branch || "—"} · {c.campType}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">Owner {c.owner}</span>
                  <span className="text-[11.5px] font-bold text-accent">Review →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      {requests.length > 0 && (
        <div>
          <div className="flex items-center gap-[10px] mb-3">
            <span className="text-[17px]">📋</span>
            <span className="text-[13.5px] font-bold">Requests waiting for approval</span>
            <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill" style={{ background: "#EEF1F8", color: "#3E5C9A" }}>{requests.length}</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
            {requests.map((r) => (
              <Link key={r.id} href="/approvals" className="bg-surface border border-line rounded-card p-4 hover:border-accent transition block">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13.5px] font-bold text-ink truncate">{r.typeIcon} {r.title}</span>
                  <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0" style={{ background: "#FBF8EE", color: "#C68A1E" }}>{r.stage}</span>
                </div>
                <div className="text-[11.5px] text-faint mb-3">{brandName(r.b)} · {r.campaign} · {r.type}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">{r.requester} → {r.approver}</span>
                  <span className="text-[11.5px] font-bold text-accent">Review →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline expense-request approval card — approve or send back with a reason,
 *  right from My Tasks (the CMO's daily surface) instead of a separate queue. */
function ExpenseApprovalCard({ r, onApprove, onReject }: {
  r: ExpenseReq; onApprove: (r: ExpenseReq) => void; onReject: (r: ExpenseReq, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const wait = daysWaiting(r.createdAt);
  return (
    <div className="bg-surface border border-line rounded-card p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13.5px] font-bold text-ink truncate">฿ {r.category}</span>
        <span className="text-[15px] font-extrabold flex-shrink-0" style={{ color: "#B8945A" }}>{baht(r.requested, { compact: true })}</span>
      </div>
      <div className="text-[11.5px] text-faint mb-3">
        {brandName(r.b)} · {r.campaign}
        {r.requester ? <> · โดย {r.requester}</> : null}
        {r.vendor ? <> · {r.vendor}</> : null}
        {wait !== null && <> · <b style={{ color: wait >= 2 ? "#B33A2E" : "#C68A1E" }}>รอมา {wait} วัน</b></>}
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ตีกลับ (จำเป็น)" autoFocus
            className="w-full text-[12.5px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
          <div className="flex gap-2">
            <button onClick={() => reason.trim() && onReject(r, reason.trim())} disabled={!reason.trim()}
              className="flex-1 text-[12px] font-bold text-white rounded-[9px] py-[8px] disabled:opacity-40" style={{ background: "#B33A2E" }}>
              Reject &amp; Send back
            </button>
            <button onClick={() => setRejecting(false)} className="text-[12px] font-semibold px-3 rounded-[9px] border border-line2 text-muted bg-white">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => onApprove(r)} className="flex-1 text-[12px] font-bold text-white rounded-[9px] py-[8px]" style={{ background: "#4E7A4E" }}>
            Approve ✓
          </button>
          <button onClick={() => setRejecting(true)} className="text-[12px] font-bold px-3 rounded-[9px]" style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}

function StatMini({ label, val, fg, bg }: { label: string; val: number; fg: string; bg: string }) {
  return (
    <div className="rounded-[13px] px-[14px] py-[13px]" style={{ background: bg }}>
      <div className="text-[9.5px] font-bold tracking-[0.05em] uppercase" style={{ color: fg }}>{label}</div>
      <div className="text-[26px] font-bold mt-[3px]" style={{ color: fg }}>{val}</div>
    </div>
  );
}

// Due-date urgency against the real calendar: overdue/today red, within 2 days gold.
const dueColorOf = (t: Task) => {
  const n = daysUntilDue(t);
  return n === null ? "#6b6258" : n <= 0 ? "#B33A2E" : n <= 2 ? "#C68A1E" : "#6b6258";
};

function TaskCard({ t, status, viewAs, onOpen, onDone, onStart }: { t: Task; status: string; viewAs: string; onOpen: () => void; onDone: () => void; onStart: () => void }) {
  const [typeFg, typeBg] = TYPE_COLORS[t.type] ?? ["#6b6258", "#F0EDE6"];
  const cardBorder = status === "Stuck" ? "#F5C8C4" : status === "Need Approval" ? "#B8E0B8" : "#ECE6DA";
  const hasApprover = !!t.pendingApprover && t.pendingApprover !== viewAs;
  const blockerShort = t.blocker ? t.blocker.split("—")[0].trim() : "";
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div onClick={onOpen} className="relative overflow-hidden cursor-pointer" style={{ background: "#fff", border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "18px 18px 14px 22px" }}>
      <div className="absolute left-0 top-0 bottom-0" style={{ width: 4, background: t.moduleColor }} />
      <div className="flex items-center gap-[7px] mb-[10px] flex-wrap">
        <span className="text-[13px]">{t.moduleIcon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: typeBg, color: typeFg }}>{t.type}</span>
        <span style={badge(t.priority, PRIORITY_MAP)}>{t.priority}</span>
        {t.isQuickWin && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "#FBF6ED", color: "#B8945A" }}>✨ Quick win</span>}
        <span className="ml-auto"><span style={badge(status, STATUS_MAP)}>{status}</span></span>
      </div>
      <div className="text-[14.5px] font-bold leading-[1.35] mb-[5px]">{t.title}</div>
      <div className="text-[11.5px] text-faint mb-[10px]">{t.brand} · {t.campaign}</div>
      <div className="text-[12px] text-muted rounded-[9px] px-3 py-[9px] mb-3 italic leading-[1.5]" style={{ background: "#FAF8F4" }}>{t.nextAction}</div>
      <div className="flex items-center gap-[10px] mb-3 flex-wrap">
        <span className="text-[11px] font-semibold" style={{ color: dueColorOf(t) }}>📅 {t.due}</span>
        {hasApprover && <span className="text-[11px] font-semibold" style={{ color: "#C68A1E" }}>⏳ {t.pendingApprover}</span>}
        {t.blocker && <span className="text-[11px] font-semibold" style={{ color: "#B33A2E" }}>⚠ {blockerShort}</span>}
      </div>
      <div className="flex gap-[7px] flex-wrap">
        {(status === "In Progress" || status === "Revision") && <span onClick={(e) => { stop(e); onDone(); }} style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "#4E7A4E", color: "#fff", cursor: "pointer" }}>Mark Done ✓</span>}
        {status === "Need Approval" && <span onClick={(e) => { stop(e); onDone(); }} style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "#4E7A4E", color: "#fff", cursor: "pointer" }}>Approve ✓</span>}
        {status === "Stuck" && <span onClick={(e) => { stop(e); onOpen(); }} style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4", cursor: "pointer" }}>Ask for Help</span>}
        {status === "Todo" && <span onClick={(e) => { stop(e); onStart(); }} style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "#3E5C9A", color: "#fff", cursor: "pointer" }}>Start</span>}
        {status === "Waiting" && <span onClick={(e) => { stop(e); onOpen(); }} style={{ fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "#FBF8EE", color: "#C68A1E", border: "1px solid #EDCC7A", cursor: "pointer" }}>Check in</span>}
        <span onClick={(e) => { stop(e); onOpen(); }} style={{ fontSize: 12, fontWeight: 500, padding: "6px 13px", borderRadius: 9, border: "1px solid #E5DECF", color: "#6b6258", cursor: "pointer", background: "#fff" }}>Details</span>
      </div>
    </div>
  );
}

function ListView({ tasks, getStatus, onOpen, colorOf }: { tasks: Task[]; getStatus: (t: Task) => string; onOpen: (id: number) => void; colorOf: (n: string) => string }) {
  const cols = "2.5fr 0.7fr 1fr 1.3fr 0.65fr 0.8fr 0.85fr";
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="grid gap-2 px-5 py-[11px] text-[10px] font-bold tracking-[0.06em] uppercase text-faint" style={{ gridTemplateColumns: cols, background: "#FBF9F4", borderBottom: "1px solid #ECE6DA" }}>
        <span>Task</span><span>Module</span><span>Assignee</span><span>Campaign</span><span>Due</span><span>Priority</span><span>Status</span>
      </div>
      {tasks.length === 0 && <div className="py-12 text-center text-faint text-[13.5px]">No tasks match — try a wider filter.</div>}
      {tasks.map((t) => {
        const status = getStatus(t);
        const [typeFg, typeBg] = TYPE_COLORS[t.type] ?? ["#6b6258", "#F0EDE6"];
        const rowBg = status === "Stuck" ? "#FFFAF9" : status === "Need Approval" ? "#FAFFF9" : "#fff";
        const blockerShort = t.blocker ? t.blocker.split("—")[0].trim() : "";
        return (
          <div key={t.id} onClick={() => onOpen(t.id)} className="grid gap-2 px-5 py-[13px] items-center cursor-pointer" style={{ gridTemplateColumns: cols, borderBottom: "1px solid #F4EFE5", background: rowBg }}>
            <div><div className="text-[13px] font-semibold truncate">{t.moduleIcon} {t.title}</div>{t.blocker && <div className="text-[10.5px] font-semibold mt-[1px]" style={{ color: "#B33A2E" }}>⚠ {blockerShort}</div>}</div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: typeBg, color: typeFg, justifySelf: "start" }}>{t.type}</span>
            <div className="flex items-center gap-[6px] min-w-0"><span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0" style={{ background: colorOf(t.assignee) }}>{init(t.assignee)}</span><span className="text-[12px] font-semibold truncate">{t.assignee}</span></div>
            <span className="text-[12px] text-muted truncate">{t.campaign}</span>
            <span className="text-[12px] font-semibold" style={{ color: dueColorOf(t) }}>{t.due}</span>
            <span style={{ ...badge(t.priority, PRIORITY_MAP), justifySelf: "start" }}>{t.priority}</span>
            <span style={{ ...badge(status, STATUS_MAP), justifySelf: "start" }}>{status}</span>
          </div>
        );
      })}
    </div>
  );
}

function TeamView({ tasks, getStatus, people, onSelect }: { tasks: Task[]; getStatus: (t: Task) => string; people: Person[]; onSelect: (p: string) => void }) {
  const count = (s: string) => tasks.filter((t) => getStatus(t) === s).length;
  const teamKpis = [
    { label: "Total Tasks", val: tasks.length, color: "#fff" },
    { label: "Done", val: count("Done"), color: "#B8E0B8" },
    { label: "In Progress", val: count("In Progress"), color: "#B8C8E8" },
    { label: "Stuck", val: count("Stuck"), color: "#F5C8C4" },
    { label: "Need Approval", val: count("Need Approval"), color: "#B8E0B8" },
  ];
  const stuckAll = count("Stuck"), apprAll = count("Need Approval");
  const parts: string[] = [];
  if (stuckAll > 0) parts.push(`${stuckAll} task${stuckAll > 1 ? "s" : ""} stuck and need support`);
  if (apprAll > 0) parts.push(`${apprAll} approval${apprAll > 1 ? "s" : ""} waiting`);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] px-7 py-6 text-white" style={{ background: "linear-gradient(135deg,#211F1C,#3A3630)" }}>
        <div className="text-[11px] tracking-[0.08em] uppercase font-bold mb-3" style={{ color: "#B8945A" }}>Team Summary · {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
          {teamKpis.map((k) => <div key={k.label}><div className="text-[10.5px] font-semibold mb-1" style={{ color: "#9A9387" }}>{k.label}</div><div className="text-[30px] font-extrabold" style={{ color: k.color }}>{k.val}</div></div>)}
        </div>
      </div>
      {parts.length > 0 && (
        <div className="rounded-[14px] px-5 py-[14px] flex items-center gap-[14px] flex-wrap" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
          <span className="text-[18px]">⚠</span>
          <div className="flex-1 min-w-[200px]"><div className="text-[13px] font-bold mb-[2px]" style={{ color: "#B33A2E" }}>Needs support today</div><div className="text-[12.5px] text-muted">{parts.join(" · ")}</div></div>
        </div>
      )}
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))" }}>
        {people.map(({ name: p, color }) => {
          const pts = tasks.filter((t) => t.assignee === p);
          const done = pts.filter((t) => getStatus(t) === "Done").length;
          const stuck = pts.filter((t) => getStatus(t) === "Stuck").length;
          const wait = pts.filter((t) => getStatus(t) === "Waiting").length;
          const act = pts.filter((t) => ["In Progress", "Revision"].includes(getStatus(t))).length;
          const appr = pts.filter((t) => getStatus(t) === "Need Approval").length;
          const pct = pts.length ? Math.round((done / pts.length) * 100) : 0;
          const healthStyle: CSSProperties = stuck > 0
            ? { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#FFF5F4", color: "#B33A2E" }
            : pct >= 70 ? { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#EEF4EE", color: "#4E7A4E" }
            : { fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#FBF8EE", color: "#C68A1E" };
          const pctColor = pct >= 70 ? "#4E7A4E" : pct >= 40 ? "#C68A1E" : "#B33A2E";
          return (
            <div key={p} onClick={() => onSelect(p)} className="cursor-pointer" style={{ background: "#fff", border: "1px solid #ECE6DA", borderRadius: 18, padding: 20 }}>
              <div className="flex items-center gap-3 mb-[14px]">
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0" style={{ background: color }}>{init(p)}</span>
                <div className="flex-1 min-w-0"><div className="text-[14.5px] font-bold">{p}</div><div className="text-[11.5px] text-faint">{pts.length} tasks</div></div>
                <span style={healthStyle}>{stuck > 0 ? "Needs support" : pct >= 70 ? "Healthy" : "Busy"}</span>
              </div>
              <div className="grid grid-cols-4 gap-[6px] mb-3">
                <TeamStat label="Done" val={done} fg="#4E7A4E" bg="#EEF4EE" />
                <TeamStat label="Active" val={act} fg="#3E5C9A" bg="#EEF1F8" />
                <TeamStat label="Wait" val={wait} fg="#C68A1E" bg="#FBF8EE" />
                <TeamStat label="Stuck" val={stuck} fg={stuck > 0 ? "#B33A2E" : "#9A9387"} bg={stuck > 0 ? "#FFF5F4" : "#F5F2ED"} />
              </div>
              <div className="h-[5px] rounded-[3px] overflow-hidden mb-[5px]" style={{ background: "#F0EBE0" }}><div className="h-[5px] rounded-[3px]" style={{ background: pctColor, width: `${pct}%` }} /></div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-faint">{pct}% done</span>
                {appr > 0 && <span className="text-[11px] font-semibold" style={{ color: "#C68A1E" }}>{appr} pending approval</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamStat({ label, val, fg, bg }: { label: string; val: number; fg: string; bg: string }) {
  return <div className="text-center rounded-[9px] px-1 py-2" style={{ background: bg }}><div className="text-[9px] font-bold" style={{ color: fg }}>{label}</div><div className="text-[18px] font-bold" style={{ color: fg }}>{val}</div></div>;
}

function TaskDrawer({ t, status, me, people, colorOf, onClose, onDone, onReassign, onPatch }: {
  t: Task; status: string; me: string; people: Person[]; colorOf: (n: string) => string;
  onClose: () => void; onDone: () => void; onReassign: (to: string) => void; onPatch: (p: Partial<Task>) => void;
}) {
  const [typeFg, typeBg] = TYPE_COLORS[t.type] ?? ["#6b6258", "#F0EDE6"];
  const [asking, setAsking] = useState(false);
  const [helpMsg, setHelpMsg] = useState("");
  const [revising, setRevising] = useState(false);
  const [reviseMsg, setReviseMsg] = useState("");
  const [comment, setComment] = useState("");
  const checklistDone = new Set(t.checklistDone ?? []);

  const start = () => onPatch({ status: "In Progress", group: "doFirst" });
  const askHelp = () => {
    if (!helpMsg.trim()) return;
    onPatch({
      status: "Stuck", group: "stuck", blocker: `${me} — ${helpMsg.trim()}`,
      comments: [...(t.comments ?? []), { by: me, text: `🆘 ${helpMsg.trim()}`, at: new Date().toISOString() }],
    });
    notify("mention", `🆘 ${me} ขอความช่วยเหลือ: ${t.title}`, helpMsg.trim(), "/my-tasks");
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
  const addComment = () => {
    if (!comment.trim()) return;
    onPatch({ comments: [...(t.comments ?? []), { by: me, text: comment.trim(), at: new Date().toISOString() }] });
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
              <div className="text-[12px] text-faint">{t.brand} · {t.campaign}</div>
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

          {/* Comments — stored with the task so the whole team sees them */}
          <div className="text-[10px] tracking-[0.08em] uppercase font-bold text-faint mt-5 mb-[10px]">Comments {t.comments?.length ? `(${t.comments.length})` : ""}</div>
          <div className="flex flex-col gap-2 mb-2">
            {(t.comments ?? []).map((c, i) => (
              <div key={i} className="rounded-[10px] px-3 py-[9px]" style={{ background: "#FAF8F4" }}>
                <div className="flex items-center gap-2 mb-[3px]">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ background: colorOf(c.by) }}>{init(c.by)}</span>
                  <span className="text-[11px] font-bold text-ink">{c.by}</span>
                  <span className="text-[10px] text-faint">{new Date(c.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="text-[12.5px] text-muted leading-[1.5]">{c.text}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()}
              placeholder="เขียนคอมเมนต์ถึงทีม…" className="flex-1 text-[12.5px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
            <button onClick={addComment} disabled={!comment.trim()} className="text-[12px] font-bold text-white rounded-[9px] px-3 disabled:opacity-40" style={{ background: "#211F1C" }}>Send</button>
          </div>
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

const TYPE_META: Record<string, { module: string; icon: string; color: string }> = {
  Content: { module: "Content", icon: "✍️", color: "#3E5C9A" }, KOL: { module: "KOL", icon: "🌟", color: "#B5577E" },
  Graphic: { module: "Graphic", icon: "🎨", color: "#C2691E" }, Budget: { module: "Finance", icon: "฿", color: "#4E7A4E" },
  Ads: { module: "Ads", icon: "📣", color: "#C68A1E" }, Report: { module: "Campaign", icon: "🎯", color: "#B33A2E" }, Campaign: { module: "Campaign", icon: "🎯", color: "#B8945A" },
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
  const canCreate = title.trim() && campaign.trim();
  const create = () => {
    if (!canCreate) return;
    const meta = TYPE_META[type];
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
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Type</label><select value={type} onChange={(e) => setType(e.target.value)} className={field}>{Object.keys(TYPE_META).map((t) => <option key={t} value={t}>{TYPE_META[t].icon} {t}</option>)}</select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Assign to</label><select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>{people.map(({ name: p }) => <option key={p} value={p}>{p}{p === owner ? " (me)" : ""}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={brand} onChange={(e) => setBrand(e.target.value as BrandId)} className={field}>{brandOptions.map((id) => <option key={id} value={id}>{brandName(id)}</option>)}</select></div>
            <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign <span style={{ color: "#B33A2E" }}>*</span></label><select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}><option value="">{brandCampaigns.length ? "Select campaign…" : "No campaigns for this brand"}</option>{brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
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
