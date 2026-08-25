"use client";

// Approval Center — the module that owns every decision the team has open.
//
// It began as a filter chip inside /my-tasks ("My approvals"), and that is
// where it kept getting stuck: a personal task board and a queue of decisions
// are two different jobs, and nobody opens someone else's board looking for
// their own sign-offs. So captions, artwork and storyboards aged behind a tab
// that only the people who already knew about it ever pressed. It is a module
// now, with its own place in the rail — and My Tasks links here rather than
// keeping a copy, because two screens showing the same queue is how they start
// disagreeing about what is open.
//
// Lanes, not one "Graphic" pile: Caption, Artwork and VDO each hold a lane
// whether or not they have work today. VDO spent a long time folded into
// "Graphic work" even though workKind() has classified it separately since it
// existed, and a lane that vanishes on a quiet week is how it gets folded back.
//
// The path is /approval-center rather than /approvals: that one is a PERMANENT
// (308) redirect to the Status Board in next.config.mjs, cached by every
// browser that ever followed it, and nothing we deploy clears it from their
// disk. See APPROVAL_CENTER in lib/deepLink.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { GraphicDrawer, GTab } from "@/components/graphic/GraphicDrawer";
import { useApprovalRows } from "@/lib/useApprovalRows";
import { ApprovalKind, expenseBudgetOf } from "@/lib/data/approvals";
import { optimistic } from "@/lib/optimistic";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { APPROVAL_CENTER, OPEN_PARAM, workLink } from "@/lib/deepLink";
import { useAuth, AUTH_REQUIRED } from "@/lib/auth";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchRequests } from "@/lib/db/requests";
import { fetchGraphics } from "@/lib/db/graphic";
import { fetchContent } from "@/lib/db/content";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchMembers } from "@/lib/db/settings";
import {
  fetchExpenseRequests, approveExpenseRequest, rejectExpenseRequest, ExpenseReq,
} from "@/lib/db/finance";
import { CampaignRow } from "@/lib/data/campaigns";
import { RequestRow } from "@/lib/data/requests";
import { ContentItem } from "@/lib/data/content";
import { Graphic } from "@/lib/data/graphic";
import { Task, TASKS } from "@/lib/data/tasks";

/** Lanes that have their own entry on the rail. Anything else in the query is
 *  ignored rather than rendering an empty page for a typo'd link. */
const RAIL_LANES = ["caption", "artwork", "vdo"] as const;

export default function ApprovalCenterPage() {
  return (
    <Suspense fallback={<div className="px-5 py-10 text-[13px] text-faint">Loading…</div>}>
      <ApprovalCenterInner />
    </Suspense>
  );
}

function ApprovalCenterInner() {
  const router = useRouter();
  const { member, user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [expenseReqs, setExpenseReqs] = useState<ExpenseReq[]>([]);
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  // Zero until mount: Date.now() during render gives the server and the client
  // two different answers, which React reports as a hydration mismatch.
  const [now, setNow] = useState(0);
  const [graphicOpenId, setGraphicOpenId] = useState<number | null>(null);
  const [graphicOpenTab, setGraphicOpenTab] = useState<GTab>("brief");

  // Which lane the rail asked for. Caption / Artwork / VDO are their own entries
  // under Approval Center and all four share this pathname, so the query is
  // the only thing that changes and the page never remounts — first paint reads
  // the URL, and the sidebar tells us directly after that (same contract /kol
  // uses; see Sidebar's nav:tab dispatch).
  const [lane, setLane] = useState<ApprovalKind | null>(null);
  useEffect(() => {
    const read = (value: string | null) =>
      setLane(value && (RAIL_LANES as readonly string[]).includes(value) ? value as ApprovalKind : null);
    read(new URLSearchParams(window.location.search).get(OPEN_PARAM.tab));
    const onNavTab = (e: Event) => {
      const detail = (e as CustomEvent<{ href?: string; tab?: string }>).detail;
      if (detail?.href === APPROVAL_CENTER) read(detail.tab ?? null);
    };
    const onPop = () => read(new URLSearchParams(window.location.search).get(OPEN_PARAM.tab));
    window.addEventListener("nav:tab", onNavTab);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("nav:tab", onNavTab);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Same fallback identity My Tasks uses — the signed-in member's name, or
  // their own login when Settings has no matching row. Never a teammate's.
  const viewAs = member?.name || (AUTH_REQUIRED && user ? user.email?.split("@")[0] ?? "You" : "");
  const [fallbackName, setFallbackName] = useState("");
  const me = viewAs || fallbackName;

  const load = useCallback(() => {
    setLoading(true);
    return Promise.allSettled([
      fetchCampaigns().then(setCampaigns),
      fetchRequests().then(setRequests),
      fetchExpenseRequests().then(setExpenseReqs),
      fetchGraphics().then(setGraphics),
      fetchContent().then(setPosts),
      fetchTasks().then(({ tasks, doneIds }) => { setTasks(tasks); setDoneIds(new Set(doneIds)); }),
    ]).then(() => { setLoading(false); setNow(Date.now()); });
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Demo mode has no signed-in member; fall back to the first internal member so
  // the queue is not filtered by a person who does not exist.
  useEffect(() => {
    if (viewAs) return;
    fetchMembers()
      .then((ms) => {
        const internal = ms.filter((m) => m.brandAccess !== "External only" && !/agency/i.test(m.role));
        if (internal.length) setFallbackName(internal[0].name);
      })
      .catch(() => {});
  }, [viewAs]);

  const rows = useApprovalRows({ campaigns, requests, expenseReqs, graphics, posts, tasks, doneIds, viewAs: me });
  const budgetOf = useMemo(() => expenseBudgetOf(campaigns, expenseReqs), [campaigns, expenseReqs]);
  const approverName = member?.name || user?.email?.split("@")[0] || DEFAULT_APPROVER;

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

  const openGraphic = graphicOpenId === null ? null : graphics.find((g) => g.id === graphicOpenId) ?? null;

  return (
    <div style={{ paddingBottom: 40 }}>
      <CampaignPageHeaderSection
        eyebrow="APPROVAL CENTER"
        title="ศูนย์อนุมัติงาน"
        description="ทุกงานที่ยังรออนุมัติ รวมไว้ที่เดียว แยกเลนตามชนิดงาน เรียงตามงานที่รอนานที่สุด · เห็นทั้งทีมได้ กดได้เฉพาะที่เป็นของคุณ"
        right={<NotificationBell tone="light" />}
      />

      <div className="mt-5 flex flex-col gap-5">
        <CampaignCommandBar
          action={
            <button onClick={() => void load()} disabled={loading}
              className="flex items-center gap-[6px] text-[12.5px] font-bold px-4 py-[10px] rounded-[12px] border border-line2 bg-white text-muted disabled:opacity-50">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> โหลดใหม่
            </button>
          }
        >
          <div className="text-[12.5px] text-muted leading-[1.6]">
            {/* Artwork asks two people two different questions — the data check
                and Visual CI. Each card says which one is yours, and a piece
                only leaves the queue once both are in. */}
            อาร์ตเวิร์กและ VDO ต้องผ่านการตรวจ 2 ด้าน (ข้อมูล + Visual CI) โดยคนละคน —
            การ์ดจะบอกว่ารอบนี้คุณตรวจด้านไหน · สลับ “ทั้งทีม” เพื่อดูว่างานที่ยังไม่ขยับค้างอยู่ที่ใคร
          </div>
        </CampaignCommandBar>

        {loading && rows.length === 0 ? (
          <div className="text-[13px] text-faint px-1 py-8">กำลังโหลดคิวอนุมัติ…</div>
        ) : (
          <ApprovalQueue
            rows={rows} now={now} budgetOf={budgetOf}
            onOpenTask={(id) => router.push(workLink.task(id))}
            onOpenGraphic={(id, tab = "brief") => { setGraphicOpenId(id); setGraphicOpenTab(tab); }}
            onApprove={approveExpense} onReject={rejectExpense}
            only={lane}
          />
        )}
      </div>

      {openGraphic && (
        <GraphicDrawer g={openGraphic} initialTab={graphicOpenTab}
          onClose={() => setGraphicOpenId(null)}
          onUpdate={(next) => setGraphics((gs) => gs.map((g) => (g.id === next.id ? next : g)))} />
      )}
    </div>
  );
}
