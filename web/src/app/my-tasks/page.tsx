"use client";

import { toastError } from "@/lib/toast";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TASKS, Task, CELEBRATIONS, daysUntilDue, isDueThisWeek } from "@/lib/data/tasks";
import { fetchTasks, createTaskDb, markDoneDb, reassignDb, updateTaskDb } from "@/lib/db/tasks";
import { fetchMembers } from "@/lib/db/settings";
import { notify } from "@/lib/notify";
import { DatePicker, fmtShort } from "@/components/ui/DatePicker";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { fetchCampaigns, updateCampaignBudget } from "@/lib/db/campaigns";
import { CampaignRow, campaignAwaitsMe } from "@/lib/data/campaigns";
import { fetchRequests } from "@/lib/db/requests";
import { RequestRow } from "@/lib/data/requests";
import { BRANDS, BrandId, brandName } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { baht } from "@/lib/format";
import { rateLabel, inferWhtRate } from "@/lib/data/expenseTax";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { useCanApproveExpense } from "@/lib/usePermGates";
import { canApproveCampaign } from "@/lib/roleGates";
import { optimistic } from "@/lib/optimistic";
import { fetchExpenseRequests, approveExpenseRequest, rejectExpenseRequest, ExpenseReq } from "@/lib/db/finance";
import { daysWaiting } from "@/components/finance/ExpenseTabs";
import { approveKolProposal } from "@/lib/db/kol";
import { fetchGraphics } from "@/lib/db/graphic";
import { Graphic } from "@/lib/data/graphic";
import { TaskGraphicBrief } from "@/components/graphic/TaskGraphicBrief";
import {
  WorkItem, WorkCard, WorkListView, WorkAction, WorkGroupHeader, StatMini,
  STATUS_MAP, PRIORITY_MAP, TYPE_COLORS, badge, init, chip, dueColorOf, brandCampaignLine,
} from "@/components/work/WorkViews";
import { GraphicDrawer } from "@/components/graphic/GraphicDrawer";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";

// Stages / statuses that still need someone in the approval tier to act.
const PENDING_REQ_STAGES = new Set(["Submitted", "CMO Review", "Revision"]);
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

// created_at is a full timestamp — fmtShort only reads a plain YYYY-MM-DD.
const fmtThaiDate = (iso: string) => fmtShort(iso.slice(0, 10)) || iso.slice(0, 10);

/** Campaign budget context shown to the approver on an expense request. */
type ExpenseBudgetInfo = { budget: number; committed: number; left: number; campaignId: string };


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
  const [activeTab, setActiveTab] = useState<"myDay" | "approval">("myDay");
  const [people, setPeople] = useState<Person[]>([]);
  // Personal view only — always the signed-in member (Team view lives in Team mood board).
  const [viewAs, setViewAs] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [expenseReqs, setExpenseReqs] = useState<ExpenseReq[]>([]);
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  // Expense approvals are a role gate, not a person filter. Read it from the
  // same permissions matrix the database checks (Finance >= Approve) rather
  // than string-matching "CMO" here, so this queue and
  // supabase/security_p12_expense_approval.sql can never disagree about who
  // may decide a request.
  const canApproveExpense = useCanApproveExpense();
  // Same idea for campaign briefs — one gate, shared with the page that holds
  // the Approve button, so this inbox can never offer what that page refuses.
  //
  // From useAuth, NOT useRole: useRole is the sidebar's "Viewing as" switcher,
  // which anyone can set to CMO. The Approve button on the campaign page reads
  // useAuth().role, so trusting the switcher here put Waiting-for-Approval
  // cards back in a designer's inbox — the exact dead end this queue was
  // narrowed to remove, just reachable by a dropdown instead of by default.
  const { member, user, role: authRole } = useAuth();
  const canApproveCampaignBrief = canApproveCampaign(authRole);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [scopeFilter, setScopeFilter] = useState("all");
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

  // Campaigns waiting on ME, not every campaign in flight. This queue used to
  // filter on status + brand alone, so a Designer with all-brand access opened
  // "My approvals" onto a dozen campaign briefs they cannot act on — the
  // approve button is CMO-only (CampaignDetailView's canApprove), and a
  // Waiting-for-Approval card offered to anyone else is a dead end that also
  // inflates the badge everyone is meant to work down to zero.
  //
  // The two pending statuses are waiting on different people:
  //   Waiting for Approval → the CMO decides
  //   Ready for Review     → nobody approves it; its owner still has to submit
  const approvalCampaigns = useMemo(
    () => campaigns.filter((c) =>
      brandVisibility.isVisible(c.b) && campaignAwaitsMe(c, { canApprove: canApproveCampaignBrief, me: viewAs })),
    [campaigns, brandVisibility, canApproveCampaignBrief, viewAs],
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
    // canSeeBrandLabel derives only from brandVisibility/brandOptions, already deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, viewAs, doneIds, brandOptions, brandVisibility],
  );
  const approvalGraphics = useMemo(
    () => graphics.filter((g) => g.requester === viewAs && brandVisibility.isVisible(g.b) && (g.deliverables ?? []).some((d) => d.status === "Waiting review")),
    [graphics, viewAs, brandVisibility],
  );
  const approvalCount = approvalCampaigns.length + approvalRequests.length + approvalExpenses.length + approvalTasks.length + approvalGraphics.length;
  // Budget context for an expense request: the campaign's budget, what's already
  // been approved against it, and what's left if this one goes through. Matches
  // on campaign_id when the row has it (a rename breaks name matching), else on
  // brand + name — never on name alone, since names repeat across brands.
  const budgetOf = useMemo(() => {
    const sameCampaign = (a: ExpenseReq, b: ExpenseReq) =>
      a.campaignId && b.campaignId ? a.campaignId === b.campaignId : a.b === b.b && a.campaign === b.campaign;
    return (r: ExpenseReq): ExpenseBudgetInfo | null => {
      const c = campaigns.find((x) => (r.campaignId ? x.id === r.campaignId : x.b === r.b && x.name === r.campaign));
      if (!c || !c.budget) return null;
      const committed = expenseReqs
        .filter((x) => x !== r && x.status === "Approved" && sameCampaign(x, r))
        .reduce((s, x) => s + (x.approved || 0), 0);
      return { budget: c.budget, committed, left: c.budget - committed - r.requested, campaignId: c.id };
    };
  }, [campaigns, expenseReqs]);
  // Approve / reject inline — sync the row locally so the card updates at once.
  const approverName = member?.name || user?.email?.split("@")[0] || DEFAULT_APPROVER;
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
  const approveExpense = (r: ExpenseReq) => {
    void optimistic(
      () => setExpenseReqs((xs) => xs.map((x) => (x === r ? { ...x, status: "Approved", approved: x.requested } : x))),
      () => setExpenseReqs((xs) => xs.map((x) => (x.ref === r.ref && x._id === r._id ? r : x))),
      () => approveExpenseRequest(r, r.requested),
      "อนุมัติ Expense ไม่สำเร็จ",
    );
  };
  const rejectExpense = (r: ExpenseReq, reason: string) => {
    void optimistic(
      () => setExpenseReqs((xs) => xs.map((x) => (x === r ? { ...x, status: "Rejected", rejectReason: reason } : x))),
      () => setExpenseReqs((xs) => xs.map((x) => (x.ref === r.ref && x._id === r._id ? r : x))),
      () => rejectExpenseRequest(r, reason, approverName),
      "Reject Expense ไม่สำเร็จ",
    );
  };

  const markDone = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (task?.approvalKind === "kolProposal" && task.relatedKolId != null) {
      approveKolProposal(task.relatedKolId).catch((error) => toastError(`อนุมัติ KOL ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
    }
    if (task?.approvalKind === "budgetRevision" && task.relatedCampaignId && task.requestedBudget) {
      updateCampaignBudget(task.relatedCampaignId, task.requestedBudget).catch((error) => toastError(`ปรับ Budget ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      setCampaigns((cs) => cs.map((c) => c.id === task.relatedCampaignId ? { ...c, budget: task.requestedBudget! } : c));
    }
    setDoneIds((s) => new Set(s).add(id));
    setDrawerId(null);
    markDoneDb(id).catch((error) => toastError(`บันทึก Done ไม่สำเร็จ: ${error?.message || "Unknown error"}`));
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
  // canSeeBrandLabel derives only from brandVisibility/brandOptions, already deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const myTasks = useMemo(() => tasks.filter((t) => t.assignee === viewAs && canSeeBrandLabel(t.brand) && inDateFilter(date, t.dueIso || t.due)), [tasks, viewAs, date, brandOptions, brandVisibility]);
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
        eyebrow="MY TASKS"
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
              </div>
            </div>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
        </CampaignCommandBar>
      </div>

      {activeTab === "myDay" ? (
        <div className="flex flex-col gap-[18px]">
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
                    <WorkGroupHeader g={g} count={groupTasks.length} />
                    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))" }}>
                      {groupTasks.map((t) => <TaskCard key={t.id} t={t} status={getStatus(t)} viewAs={viewAs} graphic={graphicOf(t)} onOpen={() => setDrawerId(t.id)} onOpenGraphic={setGraphicOpenId} onDone={() => markDone(t.id)} onStart={() => patchTask(t.id, { status: "In Progress", group: "doFirst" })} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <ListView tasks={scopedTasks} getStatus={getStatus} onOpen={setDrawerId} onOpenGraphic={setGraphicOpenId} colorOf={colorOf} graphicOf={graphicOf} />
          )}
        </div>
      ) : (
        <MyApprovalView graphics={approvalGraphics} campaigns={approvalCampaigns} requests={approvalRequests} expenses={approvalExpenses} tasks={approvalTasks} budgetOf={budgetOf} onOpenTask={setDrawerId} onOpenGraphic={setGraphicOpenId} onApprove={approveExpense} onReject={rejectExpense} />
      )}

      {drawerTask && <TaskDrawer t={drawerTask} status={getStatus(drawerTask)} me={viewAs} people={people} colorOf={colorOf} graphic={graphicOf(drawerTask)} onOpenGraphic={setGraphicOpenId} onClose={() => setDrawerId(null)} onDone={() => markDone(drawerTask.id)} onReassign={(to) => reassign(drawerTask.id, to)} onPatch={(p) => patchTask(drawerTask.id, p)} />}
      {/* The real request drawer, over My Tasks. Wrapped in its own stacking
          context so it sits above the task drawer (z-[200]) — GraphicDrawer is
          z-50 inside, which is correct on /graphic and too low here. */}
      {openGraphic && (
        <div className="relative z-[260]">
          <GraphicDrawer g={openGraphic} onClose={() => setGraphicOpenId(null)} onUpdate={patchGraphic} />
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

function MyApprovalView({ graphics, campaigns, requests, expenses, tasks, budgetOf, onOpenTask, onOpenGraphic, onApprove, onReject }: {
  graphics: Graphic[]; campaigns: CampaignRow[]; requests: RequestRow[]; expenses: ExpenseReq[]; tasks: Task[];
  budgetOf: (r: ExpenseReq) => ExpenseBudgetInfo | null;
  onOpenTask: (id: number) => void; onOpenGraphic: (id: number) => void;
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
              <button key={g.id} onClick={() => onOpenGraphic(g.id)} className="bg-surface border border-line rounded-card p-4 hover:border-accent transition block text-left w-full">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13.5px] font-bold text-ink truncate">{g.title}</span>
                  <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0" style={{ background: "#FBF8EE", color: "#C68A1E" }}>Waiting review</span>
                </div>
                <div className="text-[11.5px] text-faint mb-3">{brandName(g.b)} · {g.campaign} · {g.type}</div>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-muted">Designer {g.designer}</span>
                  <span className="text-[11.5px] font-bold text-accent">Review artwork →</span>
                </div>
              </button>
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
                <div className="text-[11.5px] text-faint mb-3">{brandCampaignLine(t.brand, t.campaign)}</div>
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
            {expenses.map((r) => <ExpenseApprovalCard key={r._id ?? r.ref ?? r.category} r={r} budget={budgetOf(r)} onApprove={onApprove} onReject={onReject} />)}
          </div>
        </div>
      )}
      {campaigns.length > 0 && (
        <div>
          <div className="flex items-center gap-[10px] mb-3">
            <span className="text-[17px]">🎯</span>
            <span className="text-[13.5px] font-bold">Campaigns waiting on you</span>
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
                  {/* Name the actual ask. "Review →" on a Ready-for-Review card
                      sent its owner looking for an approve button that is not
                      theirs to press — the campaign is waiting to be SUBMITTED. */}
                  <span className="text-[11.5px] font-bold text-accent">
                    {c.status === "Ready for Review" ? "ส่งขออนุมัติ →" : "Review & approve →"}
                  </span>
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
              <Link key={r.id} href="/status" className="bg-surface border border-line rounded-card p-4 hover:border-accent transition block">
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

/** One label→value line inside the expense detail panel. */
function DetailRow({ label, children, strong, danger }: { label: string; children: React.ReactNode; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[3px]">
      <span className="text-[11px] text-faint flex-shrink-0">{label}</span>
      <span className={`text-[11.5px] text-right ${strong ? "font-bold" : ""}`} style={danger ? { color: "#B33A2E" } : strong ? { color: "#211F1C" } : undefined}>{children}</span>
    </div>
  );
}

/** Inline expense-request approval card — approve or send back with a reason,
 *  right from My Tasks (the CMO's daily surface) instead of a separate queue.
 *  "ดูรายละเอียด" opens the full request (ref, tax breakdown, net payable and
 *  the campaign's remaining budget) so the approver never has to leave the page
 *  to know what they're signing off. */
function ExpenseApprovalCard({ r, budget, onApprove, onReject }: {
  r: ExpenseReq; budget: ExpenseBudgetInfo | null;
  onApprove: (r: ExpenseReq) => void; onReject: (r: ExpenseReq, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  // Latches on the first Approve/Reject click so a rapid second click can't fire
  // a duplicate approval before the card is removed from the queue.
  const [acted, setActed] = useState(false);
  const wait = daysWaiting(r.createdAt);
  const vat = r.vatAmt ?? 0;
  const wht = r.whtAmt ?? 0;
  const net = r.requested + vat - wht;
  const overBudget = budget !== null && budget.left < 0;
  return (
    <div className="bg-surface border border-line rounded-card p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13.5px] font-bold text-ink truncate">฿ {r.category}</span>
        <span className="text-[15px] font-extrabold flex-shrink-0" style={{ color: "#B8945A" }}>{baht(r.requested, { compact: true })}</span>
      </div>
      <div className="text-[11.5px] text-faint mb-2">
        {brandName(r.b)} · {r.campaign}
        {r.requester ? <> · โดย {r.requester}</> : null}
        {r.vendor ? <> · {r.vendor}</> : null}
        {wait !== null && <> · <b style={{ color: wait >= 2 ? "#B33A2E" : "#C68A1E" }}>รอมา {wait} วัน</b></>}
      </div>
      {/* Over-budget is the one thing the approver must see without opening anything. */}
      {overBudget && (
        <div className="text-[11px] font-bold rounded-[8px] px-[9px] py-[6px] mb-2" style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
          ⚠ เกินงบแคมเปญ {baht(Math.abs(budget!.left))}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="text-[11.5px] font-bold text-accent mb-2 hover:underline">
        {open ? "ซ่อนรายละเอียด ▴" : "ดูรายละเอียด ▾"}
      </button>
      {open && (
        <div className="rounded-[10px] px-[11px] py-[9px] mb-3" style={{ background: "#FAF8F4", border: "1px solid #ECE6DA" }}>
          {r.ref && <DetailRow label="เลขที่คำขอ">{r.ref}</DetailRow>}
          <DetailRow label="หมวดค่าใช้จ่าย">{r.category}</DetailRow>
          <DetailRow label="แบรนด์ · แคมเปญ">{brandName(r.b)} · {r.campaign}</DetailRow>
          {r.requester && <DetailRow label="ผู้ขอเบิก">{r.requester}</DetailRow>}
          {r.vendor && <DetailRow label="ผู้รับเงิน / Vendor">{r.vendor}</DetailRow>}
          {r.reimburseType && <DetailRow label="ประเภทการเบิก">{r.reimburseType}</DetailRow>}
          {r.createdAt && <DetailRow label="ส่งคำขอเมื่อ">{fmtThaiDate(r.createdAt)}{wait !== null ? ` (รอมา ${wait} วัน)` : ""}</DetailRow>}
          {r.due && r.due !== "—" && <DetailRow label="กำหนดจ่าย">{r.due}</DetailRow>}

          <div className="h-px my-[7px]" style={{ background: "#ECE6DA" }} />
          <DetailRow label="ยอดขอเบิก">{baht(r.requested)}</DetailRow>
          {vat > 0 && <DetailRow label="VAT 7%">+{baht(vat)}</DetailRow>}
          {/* The rate the request was actually withheld at — the card said 3%
              on every one of them, including the 2% advertising ones. */}
          {wht > 0 && <DetailRow label={`หัก ณ ที่จ่าย ${rateLabel(r.whtRate || inferWhtRate(wht, r.requested))}`}>−{baht(wht)}</DetailRow>}
          <DetailRow label="ยอดจ่ายสุทธิ" strong>{baht(net)}</DetailRow>

          {budget && (
            <>
              <div className="h-px my-[7px]" style={{ background: "#ECE6DA" }} />
              <DetailRow label="งบแคมเปญ">{baht(budget.budget)}</DetailRow>
              <DetailRow label="อนุมัติไปแล้ว">{baht(budget.committed)}</DetailRow>
              <DetailRow label="ถ้าอนุมัติจะเหลือ" strong danger={budget.left < 0}>
                {baht(budget.left)}
              </DetailRow>
            </>
          )}
          {budget?.campaignId && (
            <Link href={`/campaigns/${budget.campaignId}`} className="block text-[11.5px] font-bold text-accent mt-[7px] hover:underline">
              เปิดแคมเปญ →
            </Link>
          )}
        </div>
      )}
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ตีกลับ (จำเป็น)" autoFocus
            className="w-full text-[12.5px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
          <div className="flex gap-2">
            <button onClick={() => { if (reason.trim() && !acted) { setActed(true); onReject(r, reason.trim()); } }} disabled={!reason.trim() || acted}
              className="flex-1 text-[12px] font-bold text-white rounded-[9px] py-[8px] disabled:opacity-40" style={{ background: "#B33A2E" }}>
              Reject &amp; Send back
            </button>
            <button onClick={() => setRejecting(false)} className="text-[12px] font-semibold px-3 rounded-[9px] border border-line2 text-muted bg-white">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => { if (!acted) { setActed(true); onApprove(r); } }} disabled={acted}
            className="flex-1 text-[12px] font-bold text-white rounded-[9px] py-[8px] disabled:opacity-50" style={{ background: "#4E7A4E" }}>
            {acted ? "Approving…" : "Approve ✓"}
          </button>
          <button onClick={() => setRejecting(true)} className="text-[12px] font-bold px-3 rounded-[9px]" style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>
            ✕ Reject
          </button>
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
