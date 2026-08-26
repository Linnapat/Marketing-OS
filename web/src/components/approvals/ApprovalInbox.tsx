"use client";

/* The approval queue as one component, so the two screens that show it cannot
 * drift apart.
 *
 * It is the body of the Approval lanes (/approval-center?tab=…) and of the
 * รออนุมัติ view on My Tasks — the same rows, the same filters, the same
 * buttons. They were one screen and then two, and two copies of "does this wait
 * on me" is exactly how a badge saying 3 ends up above a list showing 1. The
 * rules still live in useApprovalRows; the six reads behind them in
 * useApprovalData, shared and fetched once.
 *
 * `only` narrows it to one lane. Nothing else about the two callers differs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { CampaignCommandBar } from "@/components/campaign/CampaignHeadController";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { GraphicDrawer, GTab } from "@/components/graphic/GraphicDrawer";
import { useApprovalRows } from "@/lib/useApprovalRows";
import { useApprovalData } from "@/lib/useApprovalData";
import { useCreativeLeader } from "@/lib/useCreativeLeader";
import {
  ApprovalKind, expenseBudgetOf, approvalCampaigns, matchesApprovalBrand, matchesApprovalCampaign,
} from "@/lib/data/approvals";
import { BrandFilterValue } from "@/lib/brands";
import { useBrandVisibility } from "@/lib/brandVisibility";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { DateFilterBar, inDateFilter, DateFilter } from "@/components/ui/DateFilterBar";
import { ALL_TIME_FILTER, FilterSummary, filterWithReasons } from "@/components/ui/FilterSummary";
import { optimistic } from "@/lib/optimistic";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { workLink } from "@/lib/deepLink";
import { useAuth } from "@/lib/auth";
import { useMe } from "@/lib/useMe";
import { approveExpenseRequest, rejectExpenseRequest, ExpenseReq } from "@/lib/db/finance";

export function ApprovalInbox({ only = null }: { only?: ApprovalKind | null }) {
  const router = useRouter();
  const { member, user } = useAuth();
  const me = useMe();
  const { data, loading, reload, patchGraphic, patchPost, patchExpense, markTaskDone } = useApprovalData(true);
  const { campaigns, expenseReqs, graphics } = data;

  // Zero until the rows are in: Date.now() during render gives the server and
  // the client two different answers, which React reports as a hydration
  // mismatch.
  const [now, setNow] = useState(0);
  useEffect(() => { if (!loading) setNow(Date.now()); }, [loading]);

  const [graphicOpenId, setGraphicOpenId] = useState<number | null>(null);
  const [graphicOpenTab, setGraphicOpenTab] = useState<GTab>("brief");

  // Needed so a verdict given from a row still asks whoever owes the OTHER
  // lens for theirs — the notice PR #247 added, which a second write path is
  // exactly how you lose.
  const creativeLeader = useCreativeLeader();
  const allRows = useApprovalRows({ ...data, viewAs: me });

  // A marketer only ever sees their own brands: the rows are cut by
  // ctx.isVisible inside useApprovalRows, and the chip below can only offer the
  // brands they may see — never "all brands" meaning somebody else's.
  const brandVisibility = useBrandVisibility();
  const brandOptions = brandVisibility.visibleBrands;
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [campaign, setCampaign] = useState("all");
  // All time, not this month: a queue exists for the things that have been
  // waiting, and the oldest of them are exactly what a month view would hide.
  const [date, setDate] = useState<DateFilter>({ ...ALL_TIME_FILTER });
  useEffect(() => {
    const next = brandVisibility.normalize(brand);
    if (next !== brand) setBrand(next);
  }, [brand, brandVisibility]);

  // Counted within the lane on screen, not across every lane: "แสดง 3 จาก 10"
  // above a Caption panel holding one row is a sentence about a list nobody is
  // looking at. ApprovalQueue filters by `only` the same way (r.kind === only).
  const laneRows = useMemo(() => (only ? allRows.filter((r) => r.kind === only) : allRows), [allRows, only]);

  // Offered campaigns follow the brand chip, so picking a brand cannot leave a
  // campaign selected that has nothing under it.
  const campaignOptions = useMemo(
    () => approvalCampaigns(laneRows.filter((r) => matchesApprovalBrand(r, brand))),
    [laneRows, brand],
  );
  useEffect(() => {
    if (campaign !== "all" && !campaignOptions.some((c) => c.toLowerCase() === campaign.toLowerCase())) setCampaign("all");
  }, [campaign, campaignOptions]);

  const outcome = useMemo(() => filterWithReasons(laneRows, [
    { label: "แบรนด์อื่น", pass: (r) => matchesApprovalBrand(r, brand) },
    { label: "แคมเปญอื่น", pass: (r) => matchesApprovalCampaign(r, campaign) },
    { label: "นอกช่วงเวลา", pass: (r) => inDateFilter(date, r.waitingSince) },
  ]), [laneRows, brand, campaign, date]);
  const rows = outcome.rows;
  const clearFilters = useCallback(() => {
    setBrand("all"); setCampaign("all"); setDate({ ...ALL_TIME_FILTER });
  }, []);
  const budgetOf = useMemo(() => expenseBudgetOf(campaigns, expenseReqs), [campaigns, expenseReqs]);
  const approverName = member?.name || user?.email?.split("@")[0] || DEFAULT_APPROVER;

  const sameRow = (r: ExpenseReq) => (x: ExpenseReq) => x.ref === r.ref && x._id === r._id;
  const approveExpense = (r: ExpenseReq) => {
    void optimistic(
      () => patchExpense(sameRow(r), (x) => ({ ...x, status: "Approved", approved: x.requested })),
      () => patchExpense(sameRow(r), () => r),
      () => approveExpenseRequest(r, r.requested),
      "อนุมัติ Expense ไม่สำเร็จ",
    );
  };
  const rejectExpense = (r: ExpenseReq, reason: string) => {
    void optimistic(
      () => patchExpense(sameRow(r), (x) => ({ ...x, status: "Rejected", rejectReason: reason })),
      () => patchExpense(sameRow(r), () => r),
      () => rejectExpenseRequest(r, reason, approverName),
      "Reject Expense ไม่สำเร็จ",
    );
  };

  const openGraphic = graphicOpenId === null ? null : graphics.find((g) => g.id === graphicOpenId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <CampaignCommandBar
        action={
          <button onClick={() => void reload()} disabled={loading}
            className="flex items-center gap-[6px] text-[12.5px] font-bold px-4 py-[10px] rounded-[12px] border border-line2 bg-white text-muted disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> โหลดใหม่
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {/* Brand · Campaign · Period. The brand list is what this person may
              see and nothing else — a marketer scoped to one brand gets one
              brand here and "ทุกแบรนด์ที่ดูแล" means theirs. */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={brand} onChange={(e) => setBrand(e.target.value as BrandFilterValue)} style={SELECT_STYLE} aria-label="แบรนด์">
              <option value="all">{brandVisibility.allowAll ? "ทุกแบรนด์" : "ทุกแบรนด์ที่ดูแล"}</option>
              {brandOptions.map((id) => (
                <option key={id} value={id}>{brandVisibility.brandNames[id] ?? id}</option>
              ))}
            </select>
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={SELECT_STYLE} aria-label="แคมเปญ">
              <option value="all">ทุกแคมเปญ</option>
              {campaignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <DateFilterBar value={date} onChange={setDate} />
          </div>
          <div className="text-[12.5px] text-muted leading-[1.6]">
            {/* Artwork asks two people two different questions — the data check
                and Visual CI. Each card says which one is yours, and a piece
                only leaves the queue once both are in. */}
            อาร์ตเวิร์กและ VDO ต้องผ่านการตรวจ 2 ด้าน (ข้อมูล + Visual CI) โดยคนละคน —
            การ์ดจะบอกว่ารอบนี้คุณตรวจด้านไหน · สลับ “ทั้งทีม” เพื่อดูว่างานที่ยังไม่ขยับค้างอยู่ที่ใคร
            {!brandVisibility.allowAll && ` · คุณเห็นเฉพาะแบรนด์ที่ดูแล (${brandVisibility.scopeLabel})`}
          </div>
        </div>
      </CampaignCommandBar>

      {/* ช่วงเวลาใช้วันที่เริ่มรอ — แถวที่ไม่มีวันที่ให้นับจะไม่ถูกซ่อน */}
      <FilterSummary outcome={outcome} onClear={clearFilters} noun="รายการรออนุมัติ" />

      {loading && rows.length === 0 ? (
        <div className="text-[13px] text-faint px-1 py-8">กำลังโหลดคิวอนุมัติ…</div>
      ) : (
        <ApprovalQueue
          rows={rows} now={now} budgetOf={budgetOf} me={me} creativeLeader={creativeLeader}
          onOpenTask={(id) => router.push(workLink.task(id))}
          onOpenGraphic={(id, tab = "brief") => { setGraphicOpenId(id); setGraphicOpenTab(tab); }}
          onApprove={approveExpense} onReject={rejectExpense}
          onGraphicUpdate={patchGraphic}
          onContentUpdate={patchPost}
          onTaskApproved={(t) => markTaskDone(t.id)}
          only={only}
        />
      )}

      {openGraphic && (
        <GraphicDrawer g={openGraphic} initialTab={graphicOpenTab}
          onClose={() => setGraphicOpenId(null)}
          onUpdate={patchGraphic} />
      )}
    </div>
  );
}
