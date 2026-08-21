"use client";

// The approval inbox — every decision the team has open, as one queue.
//
// It used to be six stacked sections inside /my-tasks, holding only work
// addressed to the reader. Both of those changed:
//
//  - Sections became one list ordered by how long each decision has waited,
//    with chips to narrow to a kind when you want to batch. Six headings meant
//    you scrolled past five to find four items, and could not see which of the
//    forty had been sitting a week.
//
//  - The list holds the whole team's open decisions, brand-scoped, so a piece
//    stuck on somebody else is visible instead of invisible. "ของฉัน" is the
//    default view and the badge; "ทั้งทีม" is one click away.
//
// Seeing is not deciding. A row that is not yours renders with no buttons and
// says who is holding it — the rules for who may act did not move (and the
// database enforces its own half regardless).
//
// Rendering is per-kind (an artwork card and an expense card are not the same
// card), but the ORDER is global — see buildApprovalRows.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ApprovalKind, ApprovalRow, APPROVAL_META, APPROVAL_KIND_ORDER, countByKind, waitingDays,
} from "@/lib/data/approvals";
import { LENS_META } from "@/lib/data/graphic";
import { GTab } from "@/components/graphic/GraphicDrawer";
import { captionOwner } from "@/lib/data/content";
import { brandName } from "@/lib/brands";
import { baht } from "@/lib/format";
import { rateLabel, inferWhtRate } from "@/lib/data/expenseTax";
import { CampaignCode, campaignLabel } from "@/components/ui/CampaignCode";
import { useCampaignCodes } from "@/lib/useCampaignCodes";
import { brandCampaignLine } from "@/components/work/WorkViews";
import { daysWaiting } from "@/components/finance/ExpenseTabs";
import { workLink } from "@/lib/deepLink";
import { fmtShort } from "@/components/ui/DatePicker";
import type { ExpenseReq } from "@/lib/db/finance";

/** Campaign budget context shown to the approver on an expense request. */
export type ExpenseBudgetInfo = { budget: number; committed: number; left: number; campaignId: string };

// created_at is a full timestamp — fmtShort only reads a plain YYYY-MM-DD.
const fmtThaiDate = (iso: string) => fmtShort(iso.slice(0, 10)) || iso.slice(0, 10);

/** Which drawer tab each graphic decision is actually made on.
 *
 *  Artwork lands on ASSETS, not the brief. The old card sent it to the brief —
 *  correct back when sign-off was one button on the request, and stale since it
 *  became a per-lens verdict on each deliverable row. Those rows live in
 *  DeliverablesEditor on the Assets tab, so "Review artwork →" was opening a
 *  drawer with no review control anywhere on it and letting the reviewer find
 *  the right tab themselves.
 *
 *  The storyboard accept / send-back pair sits in the production panel on
 *  Overview; a brief top-up is released where it would be typed, on the brief. */
const GRAPHIC_TAB: Record<string, GTab> = {
  artwork: "assets", vdo: "assets", photo: "assets", storyboard: "overview", briefUnlock: "brief",
};

/** Red past two days, amber before it — the same line the expense card has
 *  always drawn, now applied to every kind. */
const ageColor = (d: number) => (d >= 7 ? "#B33A2E" : d >= 2 ? "#C68A1E" : "#8A8175");

function AgePill({ iso, now }: { iso: string; now: number }) {
  const d = waitingDays(iso, now);
  if (d === null) return null;
  return (
    <span className="text-[10.5px] font-bold flex-shrink-0" style={{ color: ageColor(d) }}>
      รอมา {d} วัน
    </span>
  );
}

/** The right-hand end of a card: the thing to do, or the person to chase.
 *  Never both, and never an action word on a row whose buttons are not there —
 *  "Review →" on somebody else's decision is how you teach people that the
 *  arrow means nothing. */
function Cta({ row, action }: { row: ApprovalRow; action: string }) {
  if (row.mine) return <span className="text-[11.5px] font-bold text-accent flex-shrink-0">{action}</span>;
  return (
    <span className="text-[11.5px] font-semibold flex-shrink-0" style={{ color: "#8A8175" }}>
      รอ {row.waitingOn}
    </span>
  );
}

function KindBadge({ kind, note }: { kind: ApprovalKind; note?: string }) {
  const m = APPROVAL_META[kind];
  return (
    <span className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill flex-shrink-0"
      style={{ background: m.bg, color: m.fg }}>
      {note ? `${m.label} · ${note}` : m.label}
    </span>
  );
}

const cardCx = "bg-surface border border-line rounded-card p-4 hover:border-accent transition block text-left w-full";

export function ApprovalQueue({ rows, now, budgetOf, onOpenTask, onOpenGraphic, onApprove, onReject, emptyHint }: {
  rows: ApprovalRow[];
  /** Passed in rather than read here so every age on the page is measured from
   *  the same instant — and so tests can pin it. */
  now: number;
  budgetOf: (r: ExpenseReq) => ExpenseBudgetInfo | null;
  onOpenTask: (id: number) => void;
  onOpenGraphic: (id: number, tab?: GTab) => void;
  onApprove: (r: ExpenseReq) => void;
  onReject: (r: ExpenseReq, reason: string) => void;
  emptyHint?: string;
}) {
  const codeOf = useCampaignCodes();
  const [kind, setKind] = useState<ApprovalKind | "all">("all");
  // Yours by default. The team view is the answer to "why is this late", not
  // the daily working set — opening onto forty rows, thirty-six of which you
  // cannot act on, is how a queue stops being read at all.
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const mineRows = useMemo(() => rows.filter((r) => r.mine), [rows]);
  const scoped = scope === "mine" ? mineRows : rows;
  const counts = useMemo(() => countByKind(scoped), [scoped]);
  // A chip for a kind with nothing in it is a dead button; only draw the ones
  // that have work. "all" always shows so there is a way back.
  const chips = useMemo(
    () => APPROVAL_KIND_ORDER.filter((k) => counts[k] > 0),
    [counts],
  );
  // Narrowing to a kind and then clearing the last of it would otherwise leave
  // an empty list under a chip that no longer exists.
  const active = kind !== "all" && counts[kind] === 0 ? "all" : kind;
  const visible = useMemo(
    () => (active === "all" ? scoped : scoped.filter((r) => r.kind === active)),
    [scoped, active],
  );

  const scopeToggle = (
    <div className="flex items-center gap-[3px] p-[3px] rounded-pill flex-shrink-0" style={{ background: "#F2EFE9" }}>
      <ScopeTab label="ของฉัน" count={mineRows.length} on={scope === "mine"} onClick={() => setScope("mine")} />
      <ScopeTab label="ทั้งทีม" count={rows.length} on={scope === "all"} onClick={() => setScope("all")} />
    </div>
  );

  if (scoped.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">{scopeToggle}</div>
        <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-16 text-center">
          <div>
            <div className="text-[15px] font-bold text-ink">
              {scope === "mine" ? "ไม่มีงานรอคุณอนุมัติ 🎉" : "ไม่มีงานค้างอนุมัติในทีม 🎉"}
            </div>
            <div className="text-[12.5px] text-faint mt-1">
              {emptyHint ?? "แคปชั่น อาร์ตเวิร์ก VDO แคมเปญ และการเบิกงบที่รอคุณอนุมัติจะมาโผล่ที่นี่"}
            </div>
            {/* Clear on your side but the team still has work stuck: say so
                here rather than let an empty screen read as "all done". */}
            {scope === "mine" && rows.length > 0 && (
              <button onClick={() => setScope("all")} className="text-[12.5px] font-bold text-accent mt-3 hover:underline">
                ทีมยังมีค้างอยู่ {rows.length} รายการ — ดูทั้งทีม →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-[7px] flex-wrap">
          <Chip label="ทั้งหมด" count={scoped.length} on={active === "all"} onClick={() => setKind("all")} />
          {chips.map((k) => (
            <Chip key={k} label={`${APPROVAL_META[k].icon} ${APPROVAL_META[k].label}`} count={counts[k]}
              on={active === k} onClick={() => setKind(k)} />
          ))}
        </div>
        {scopeToggle}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
        {visible.map((row) => {
          switch (row.kind) {
            case "caption":
              return (
                <Link key={row.key} href={workLink.post(row.post.id)} className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.post.title}</span>
                    <KindBadge kind="caption" />
                  </div>
                  <div className="text-[11.5px] text-faint mb-2 flex items-center gap-[6px] flex-wrap">
                    <span>{brandCampaignLine(brandName(row.post.b), row.post.campaign)}</span>
                    <AgePill iso={row.waitingSince} now={now} />
                  </div>
                  {/* The words themselves, so an easy yes needs no click. */}
                  <div className="text-[12px] text-muted leading-[1.5] mb-3"
                    style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {(row.post.caption ?? "").trim() || "— ไม่มีข้อความ —"}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted">เขียนโดย {captionOwner(row.post) || "—"}</span>
                    <Cta row={row} action="อ่านและอนุมัติ →" />
                  </div>
                </Link>
              );

            case "artwork":
            case "vdo":
            case "photo": {
              const lens = LENS_META[row.lens];
              return (
                <button key={row.key} onClick={() => onOpenGraphic(row.g.id, GRAPHIC_TAB[row.kind])} className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.g.title}</span>
                    <KindBadge kind={row.kind} note={lens.short} />
                  </div>
                  <div className="text-[11.5px] text-faint mb-2 flex items-center gap-[5px] flex-wrap">
                    <span>{brandName(row.g.b)} · {row.g.campaign}</span>
                    <CampaignCode code={codeOf(row.g.campaignId, row.g.campaign)} />
                    <AgePill iso={row.waitingSince} now={now} />
                  </div>
                  {/* Which piece, and which of the two checks is yours. Without
                      the second line a Creative Leader could not tell a CI row
                      from the requester's data check on the same artwork. */}
                  <div className="text-[11.5px] mb-2">
                    <div className="text-muted truncate">
                      {row.deliverable.platform} · {row.deliverable.size}
                      {row.deliverable.version ? ` · v${row.deliverable.version}` : ""}
                    </div>
                    <div className="font-bold mt-[2px]" style={{ color: APPROVAL_META[row.kind].fg }}>
                      ตรวจ: {lens.label}
                    </div>
                    <div className="text-faint text-[11px] mt-[1px] leading-[1.45]">{lens.checks}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted truncate">
                      ส่งโดย {row.deliverable.submittedBy || row.g.designer || "—"}
                    </span>
                    <Cta row={row} action="เปิดตรวจ →" />
                  </div>
                </button>
              );
            }

            case "storyboard":
              return (
                <button key={row.key} onClick={() => onOpenGraphic(row.g.id, GRAPHIC_TAB.storyboard)} className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.g.title}</span>
                    <KindBadge kind="storyboard" />
                  </div>
                  <div className="text-[11.5px] text-faint mb-3 flex items-center gap-[5px] flex-wrap">
                    <span>{brandName(row.g.b)} · {row.g.campaign} · {row.g.type}</span>
                    <CampaignCode code={codeOf(row.g.campaignId, row.g.campaign)} />
                    <AgePill iso={row.waitingSince} now={now} />
                  </div>
                  <div className="flex items-center justify-between">
                    {/* Whose work is waiting on you — the storyboard is the
                        Creative Content person's, not the designer's. */}
                    <span className="text-[11.5px] text-muted truncate">
                      Storyboard {row.g.storyboardSubmittedBy || row.g.storyboardOwner || "Creative"}
                    </span>
                    <Cta row={row} action="อนุมัติ storyboard →" />
                  </div>
                </button>
              );

            case "briefUnlock":
              return (
                <button key={row.key} onClick={() => onOpenGraphic(row.g.id, GRAPHIC_TAB.briefUnlock)} className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.g.title}</span>
                    <KindBadge kind="briefUnlock" />
                  </div>
                  <div className="text-[11.5px] text-faint mb-3 flex items-center gap-[5px] flex-wrap">
                    <span>{brandName(row.g.b)} · {row.g.campaign} · {row.g.type}</span>
                    <AgePill iso={row.waitingSince} now={now} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted truncate">
                      ขอโดย {row.g.briefUnlock?.requestedBy || row.g.requester}
                      {row.g.briefUnlock?.reason ? ` · ${row.g.briefUnlock.reason}` : ""}
                    </span>
                    <Cta row={row} action="ปล่อยให้เติมบรีฟ →" />
                  </div>
                </button>
              );

            case "expense":
              return <ExpenseApprovalCard key={row.key} row={row} budget={budgetOf(row.r)} onApprove={onApprove} onReject={onReject} />;

            case "campaign":
              return (
                <Link key={row.key} href={`/campaigns/${row.c.id}?tab=approval`} className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.c.name}</span>
                    <KindBadge kind="campaign" note={row.c.status} />
                  </div>
                  <div className="text-[11.5px] text-faint mb-3">{brandName(row.c.b)} · {row.c.branch || "—"} · {row.c.campType}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted">Owner {row.c.owner}</span>
                    {/* Name the actual ask. "Review →" on a Ready-for-Review card
                        sent its owner looking for an approve button that is not
                        theirs to press — the campaign is waiting to be SUBMITTED. */}
                    <Cta row={row} action={row.c.status === "Ready for Review" ? "ส่งขออนุมัติ →" : "Review & approve →"} />
                  </div>
                </Link>
              );

            case "request":
              return (
                <Link key={row.key} href="/status" className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.r.typeIcon} {row.r.title}</span>
                    <KindBadge kind="request" note={row.r.stage} />
                  </div>
                  <div className="text-[11.5px] text-faint mb-3 flex items-center gap-[5px] flex-wrap">
                    <span>{brandName(row.r.b)} · {row.r.campaign} · {row.r.type}</span>
                    {/* Requests carry only the campaign name, so this resolves by
                        name and stays blank when two campaigns share one. */}
                    <CampaignCode code={codeOf(undefined, row.r.campaign)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted">{row.r.requester} → {row.r.approver}</span>
                    <Cta row={row} action="Review →" />
                  </div>
                </Link>
              );

            case "kol":
              return (
                <button key={row.key} onClick={() => onOpenTask(row.t.id)} className={cardCx}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13.5px] font-bold text-ink truncate">{row.t.title}</span>
                    <KindBadge kind="kol" />
                  </div>
                  <div className="text-[11.5px] text-faint mb-3">{brandCampaignLine(row.t.brand, row.t.campaign)}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-muted">Requested for {row.t.assignee}</span>
                    <Cta row={row} action="Review →" />
                  </div>
                </button>
              );
          }
        })}
      </div>
    </div>
  );
}

/** ของฉัน / ทั้งทีม. A segmented pair rather than a checkbox: the two are
 *  different readings of the same queue, and neither is a setting you turn on. */
function ScopeTab({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-[12px] font-bold px-[12px] py-[6px] rounded-pill transition ${on ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
      {label}
      <span className="ml-[6px] text-[11px] font-extrabold" style={{ opacity: 0.6 }}>{count}</span>
    </button>
  );
}

function Chip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-[12px] font-bold px-[11px] py-[6px] rounded-pill border transition ${on ? "text-white" : "text-muted bg-white hover:border-accent"}`}
      style={on ? { background: "#211F1C", borderColor: "#211F1C" } : { borderColor: "#ECE6DA" }}>
      {label}
      <span className="ml-[6px] text-[11px] font-extrabold" style={{ opacity: on ? 0.8 : 0.55 }}>{count}</span>
    </button>
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
 *  right in the inbox instead of a separate queue. "ดูรายละเอียด" opens the full
 *  request (ref, tax breakdown, net payable and the campaign's remaining budget)
 *  so the approver never has to leave the page to know what they're signing off.
 *
 *  Everyone who can READ a request sees the card, because "the money has been
 *  sitting for nine days" is exactly the thing a queue should make visible. The
 *  buttons are another matter: money is CMO-only and the database says so too
 *  (supabase/security_p12_expense_approval.sql), so a row that is not yours
 *  renders the numbers and who is holding it, and nothing to click. */
function ExpenseApprovalCard({ row, budget, onApprove, onReject }: {
  row: Extract<ApprovalRow, { kind: "expense" }>; budget: ExpenseBudgetInfo | null;
  onApprove: (r: ExpenseReq) => void; onReject: (r: ExpenseReq, reason: string) => void;
}) {
  const r = row.r;
  const codeOf = useCampaignCodes();
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
        <CampaignCode code={codeOf(r.campaignId, r.campaign)} className="ml-[5px] align-middle" />
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
          <DetailRow label="แบรนด์ · แคมเปญ">{campaignLabel(codeOf(r.campaignId, r.campaign), `${brandName(r.b)} · ${r.campaign}`)}</DetailRow>
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
      {!row.mine ? (
        <div className="text-[11.5px] font-semibold text-center rounded-[9px] py-[8px]"
          style={{ background: "#F7F4EE", color: "#8A8175" }}>
          รอ {row.waitingOn} อนุมัติ
        </div>
      ) : rejecting ? (
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
