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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ApprovalKind, ApprovalRow, APPROVAL_META, APPROVAL_KIND_ORDER, waitingDays, platformLabel,
} from "@/lib/data/approvals";
import { Graphic, LENS_META, workKind, lensesFor } from "@/lib/data/graphic";
import { useProductionOwners, useCmoName, useCiBackup } from "@/lib/useCreativeLeader";
import { decideStoryboard, giveLensVerdict } from "@/lib/graphicVerdict";
import { approveTask } from "@/lib/taskApproval";
import { Task } from "@/lib/data/tasks";
import { toastError, toastSuccess } from "@/lib/toast";
import { ChevronDown } from "lucide-react";
import { GTab } from "@/components/graphic/GraphicDrawer";
import { usePanelCollapsed } from "@/components/campaign/CampaignHeadController";
import { ContentItem, captionOwner } from "@/lib/data/content";
import { decideCaption } from "@/lib/captionDecision";
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

/** A week is the line. Past it the queue is not slow, it has stopped — and the
 *  header says so in red rather than leaving it to be noticed row by row. */
const STALE_DAYS = 7;

/** Rows or cards, remembered per browser — a habit, not a per-visit decision. */
const VIEW_KEY = "approvals.view";

/** Red past a week, amber past two days — the same line the expense card has
 *  always drawn, now applied to every kind. */
const ageColor = (d: number) => (d >= STALE_DAYS ? "#B33A2E" : d >= 2 ? "#C68A1E" : "#8A8175");

function AgePill({ iso, now }: { iso: string; now: number }) {
  const d = waitingDays(iso, now);
  if (d === null) return null;
  return (
    <span className="text-[10.5px] font-bold flex-shrink-0" style={{ color: ageColor(d) }}>
      รอมา {d} วัน
    </span>
  );
}

/** Who handed it in, when, and the day it has to go out.
 *
 *  One block, fixed widths, rendered in the same place on every row so the list
 *  reads down as three columns rather than three facts buried in three
 *  different meta lines. "รอมา N วัน" stays beside the title where it always
 *  was — it is the thing you scan for, not a column you compare.
 *
 *  Hidden below md: at that width the columns would wrap under the title and
 *  stop being columns; the row still carries the same facts in its meta line. */
function MetaColumns({ row }: { row: ApprovalRow }) {
  const cell = (label: string, value: string) => (
    <span className="flex flex-col leading-[1.3] min-w-0">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ color: "#B3ADA2" }}>{label}</span>
      <span className="text-[11.5px] text-muted truncate">{value || "—"}</span>
    </span>
  );
  return (
    <span className="hidden md:flex items-center gap-4 flex-shrink-0">
      <span className="w-[104px]">{cell("ส่งโดย", row.submittedBy)}</span>
      <span className="w-[86px]">{cell("ส่งวันที่", row.waitingSince ? fmtThaiDate(row.waitingSince) : "")}</span>
      <span className="w-[86px]">{cell("Post date", row.postDate ? fmtThaiDate(row.postDate) : "")}</span>
    </span>
  );
}

/* The "รอ X · เซ็นแทนได้" note used to sit on every row you could sign but did
   not own. On the VDO queue it told the CMO "รอ Gik · เซ็นแทนได้" — Gik reading
   that he may cover for Gik — because `mine` is only true for the Creative
   Leader, while lensAskWho resolves the same row to the CMO. Removed: the row
   is in your queue and you can act on it, which the buttons already say. The
   plain "รอ {waitingOn}" on rows you CANNOT act on stays; that one names
   somebody else, and is the whole point of the row. */

/** The right-hand end of a card: the thing to do, or the person to chase.
 *  Never both, and never an action word on a row whose buttons are not there —
 *  "Review →" on somebody else's decision is how you teach people that the
 *  arrow means nothing. */
function Cta({ row, action }: { row: ApprovalRow; action: string }) {
  if (row.canAct) return <span className="text-[11.5px] font-bold text-accent flex-shrink-0">{action}</span>;
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

export function ApprovalQueue({ rows, now, budgetOf, me, creativeLeader, onOpenTask, onOpenGraphic, onApprove, onReject, onGraphicUpdate, onContentUpdate, onTaskApproved, only }: {
  rows: ApprovalRow[];
  /** Passed in rather than read here so every age on the page is measured from
   *  the same instant — and so tests can pin it. */
  now: number;
  budgetOf: (r: ExpenseReq) => ExpenseBudgetInfo | null;
  onOpenTask: (id: number) => void;
  onOpenGraphic: (id: number, tab?: GTab) => void;
  onApprove: (r: ExpenseReq) => void;
  onReject: (r: ExpenseReq, reason: string) => void;
  /** Who is signing — the name recorded on a verdict given from a row. */
  me: string;
  /** The Creative Leader by name, so a verdict given here still asks whoever
   *  owes the other lens for theirs. See useCreativeLeader. */
  creativeLeader?: string;
  /** A request changed under a row (a lens verdict). The page owns the list, so
   *  it re-renders and the row leaves the queue on its own. */
  onGraphicUpdate?: (g: Graphic) => void;
  /** Same, for a post whose caption was just decided. */
  onContentUpdate?: (c: ContentItem) => void;
  /** A task-shaped approval (KOL proposal, budget revision) just went through. */
  onTaskApproved?: (t: Task) => void;
  /** Render just this one lane — the rail's Caption / Artwork / VDO entries.
   *  Null shows every lane. A lane opened deliberately is never folded shut:
   *  the remembered collapse is for the full page, and honouring it here would
   *  send someone who clicked "Artwork" to an artwork panel with nothing in it. */
  only?: ApprovalKind | null;
}) {
  const codeOf = useCampaignCodes();
  // Yours by default. The team view is the answer to "why is this late", not
  // the daily working set — opening onto forty rows, thirty-six of which you
  // cannot act on, is how a queue stops being read at all.
  const [scope, setScope] = useState<"mine" | "all">("mine");
  // Rows by default: the point of this screen is scanning a lane and clearing
  // it, and a row carries the file link and the verdict buttons just as well as
  // a card does. Cards stay available for the kinds that are genuinely worth
  // reading in full — a caption you want to see the words of. Remembered per
  // browser, corrected from storage after mount so the markup matches on the
  // server.
  const [view, setView] = useState<"list" | "cards">("list");
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "cards") setView("cards"); } catch { /* no-op */ }
  }, []);
  const chooseView = (next: "list" | "cards") => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* no-op */ }
  };
  const mineRows = useMemo(() => rows.filter((r) => r.mine), [rows]);
  const scoped = scope === "mine" ? mineRows : rows;
  // Everything the header talks about is scoped to the open lane. Reading the
  // whole queue here put "ค้างเกิน 7 วัน 2 รายการ" above an empty VDO lane —
  // a real number about work that was nowhere on the screen.
  const inLane = (list: ApprovalRow[]) => (only ? list.filter((r) => r.kind === only) : list);
  const laneRows = useMemo(() => inLane(scoped), [scoped, only]);   // eslint-disable-line react-hooks/exhaustive-deps
  const laneTeam = useMemo(() => inLane(rows), [rows, only]);       // eslint-disable-line react-hooks/exhaustive-deps
  // Anything past a week is the queue failing, not the queue working.
  const stalled = useMemo(
    () => laneRows.filter((r) => (waitingDays(r.waitingSince, now) ?? 0) >= STALE_DAYS).length,
    [laneRows, now],
  );
  // Every kind that gets a panel, and the rows inside it. Caption, Artwork and
  // VDO hold a panel whether or not they have work today: VDO spent a long time
  // folded into "Graphic work" even though workKind() has classified it
  // separately since it existed, and a section that vanishes on a quiet week is
  // how it gets folded back in. The panels are the shape of the work, not a
  // summary of today's rows. Everything else appears when it has something.
  const panels = useMemo(() => {
    const byKind = new Map<ApprovalKind, ApprovalRow[]>();
    for (const r of scoped) {
      const list = byKind.get(r.kind);
      if (list) list.push(r); else byKind.set(r.kind, [r]);
    }
    return APPROVAL_KIND_ORDER
      .filter((k) => (only ? k === only : ALWAYS_SHOWN.includes(k) || (byKind.get(k)?.length ?? 0) > 0))
      .map((k) => ({ kind: k, rows: byKind.get(k) ?? [] }));
  }, [scoped, only]);

  const scopeToggle = (
    <div className="flex items-center gap-[3px] p-[3px] rounded-pill flex-shrink-0" style={{ background: "#F2EFE9" }}>
      <ScopeTab label="ของฉัน" count={mineRows.length} on={scope === "mine"} onClick={() => setScope("mine")} />
      <ScopeTab label="ทั้งทีม" count={rows.length} on={scope === "all"} onClick={() => setScope("all")} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[13px] font-semibold text-faint">
          {scope === "mine" ? "รอคุณตัดสินใจ" : "ค้างอยู่ทั้งทีม"}
          {only ? ` · ${APPROVAL_META[only].label}` : ""} {laneRows.length} รายการ
          {stalled > 0 && (
            <span className="ml-[8px] font-bold" style={{ color: "#B33A2E" }}>· ค้างเกิน {STALE_DAYS} วัน {stalled} รายการ</span>
          )}
          {/* Clear on your side but the team still has work stuck: say so here
              rather than let a quiet screen read as "all done". */}
          {scope === "mine" && laneRows.length === 0 && laneTeam.length > 0 && (
            <button onClick={() => setScope("all")} className="ml-[8px] font-bold text-accent hover:underline">
              · ทีมยังค้าง {laneTeam.length} รายการ →
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-[3px] p-[3px] rounded-pill flex-shrink-0" style={{ background: "#F2EFE9" }}>
            <ScopeTab label="รายการ" on={view === "list"} onClick={() => chooseView("list")} />
            <ScopeTab label="การ์ด" on={view === "cards"} onClick={() => chooseView("cards")} />
          </div>
          {scopeToggle}
        </div>
      </div>

      {panels.map(({ kind, rows: kindRows }) => (
        <KindPanel key={kind} kind={kind} rows={kindRows} now={now} forceOpen={!!only} view={view}>
          {kindRows.map((row) => (view === "list"
            ? renderRow(row, now, { codeOf, budgetOf, me, creativeLeader, onOpenTask, onOpenGraphic, onApprove, onReject, onGraphicUpdate, onContentUpdate, onTaskApproved })
            : renderCard(row, now, { codeOf, budgetOf, onOpenTask, onOpenGraphic, onApprove, onReject })))}
        </KindPanel>
      ))}
    </div>
  );
}

/** One card, by kind. An artwork card and an expense card are not the same
 *  object — they answer different questions and carry different controls — so
 *  this stays a switch rather than a generic row renderer. TypeScript checks it
 *  is exhaustive: a kind added to ApprovalRow cannot compile past here without
 *  a card to draw it.
 *
 *  Deps are passed rather than read from context because the callers are two
 *  different pages with two different sets of handlers. */
function renderCard(row: ApprovalRow, now: number, deps: {
  codeOf: (id?: string, name?: string) => string | undefined;
  budgetOf: (r: ExpenseReq) => ExpenseBudgetInfo | null;
  onOpenTask: (id: number) => void;
  onOpenGraphic: (id: number, tab?: GTab) => void;
  onApprove: (r: ExpenseReq) => void;
  onReject: (r: ExpenseReq, reason: string) => void;
}) {
  const { codeOf, budgetOf, onOpenTask, onOpenGraphic, onApprove, onReject } = deps;
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
              {platformLabel(row.platforms, row.deliverable.platform)} · {row.deliverable.size}
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
}

/** The facts every kind can answer, so the compact list is ONE renderer rather
 *  than a second copy of the card switch. Cards stay bespoke on purpose: they
 *  show the caption text, the lens checklist and the budget maths, none of
 *  which fit on a row. A row is for scanning forty of them and picking one. */
function describe(row: ApprovalRow, codeOf: (id?: string, name?: string) => string | undefined): {
  note?: string; title: string; meta: string; action: string;
} {
  switch (row.kind) {
    case "caption":
      return {
        title: row.post.title,
        meta: `${brandName(row.post.b)} · ${row.post.campaign} · เขียนโดย ${captionOwner(row.post) || "—"}`,
        action: "อ่านและอนุมัติ →",
      };
    case "artwork": case "vdo": case "photo":
      return {
        note: LENS_META[row.lens].short,
        title: row.g.title,
        meta: [
          `${brandName(row.g.b)} · ${row.g.campaign}`,
          codeOf(row.g.campaignId, row.g.campaign),
          `${row.deliverable.platform} · ${row.deliverable.size}`,
          `ตรวจ: ${LENS_META[row.lens].label}`,
        ].filter(Boolean).join(" · "),
        action: "เปิดตรวจ →",
      };
    case "storyboard":
      return {
        title: row.g.title,
        meta: `${brandName(row.g.b)} · ${row.g.campaign} · Storyboard ${row.g.storyboardSubmittedBy || row.g.storyboardOwner || "Creative"}`,
        action: "อนุมัติ storyboard →",
      };
    case "briefUnlock":
      return {
        title: row.g.title,
        meta: `${brandName(row.g.b)} · ${row.g.campaign} · ขอโดย ${row.g.briefUnlock?.requestedBy || row.g.requester}`,
        action: "ปล่อยให้เติมบรีฟ →",
      };
    case "campaign":
      return {
        note: row.c.status,
        title: row.c.name,
        meta: `${brandName(row.c.b)} · ${row.c.branch || "—"} · Owner ${row.c.owner}`,
        action: row.c.status === "Ready for Review" ? "ส่งขออนุมัติ →" : "Review & approve →",
      };
    case "request":
      return {
        note: row.r.stage,
        title: `${row.r.typeIcon} ${row.r.title}`,
        meta: `${brandName(row.r.b)} · ${row.r.campaign} · ${row.r.requester} → ${row.r.approver}`,
        action: "Review →",
      };
    case "expense":
      return {
        title: `฿ ${row.r.category}`,
        meta: [brandName(row.r.b), row.r.campaign, row.r.requester, row.r.vendor].filter(Boolean).join(" · "),
        action: "",
      };
    case "kol":
      return {
        title: row.t.title,
        meta: `${row.t.brand || "—"} · ${row.t.campaign || "—"} · Requested for ${row.t.assignee}`,
        action: "Review →",
      };
  }
}

const rowCx = "w-full flex items-center gap-3 px-[13px] py-[10px] rounded-[11px] border border-line bg-surface hover:border-accent transition text-left";

/** One line per decision. Same rules as the card — no buttons on somebody
 *  else's row, the badge says which lens is yours — just dense enough to read a
 *  whole lane without scrolling. */
function renderRow(row: ApprovalRow, now: number, deps: {
  codeOf: (id?: string, name?: string) => string | undefined;
  budgetOf: (r: ExpenseReq) => ExpenseBudgetInfo | null;
  me: string;
  creativeLeader?: string;
  onOpenTask: (id: number) => void;
  onOpenGraphic: (id: number, tab?: GTab) => void;
  onApprove: (r: ExpenseReq) => void;
  onReject: (r: ExpenseReq, reason: string) => void;
  onGraphicUpdate?: (g: Graphic) => void;
  onContentUpdate?: (c: ContentItem) => void;
  onTaskApproved?: (t: Task) => void;
}) {
  const { codeOf, budgetOf, me, creativeLeader, onOpenTask, onOpenGraphic, onApprove, onReject, onGraphicUpdate, onContentUpdate, onTaskApproved } = deps;
  // Money keeps its own row: the amount and the two buttons are the reason
  // anyone opens this lane, and a shared row cannot carry them.
  if (row.kind === "expense") {
    return <ExpenseRow key={row.key} row={row} budget={budgetOf(row.r)} now={now} codeOf={codeOf}
      onApprove={onApprove} onReject={onReject} />;
  }
  // Artwork / VDO / Photo: the asset and the verdict, on the row. Opening a
  // drawer to look at one file and press one button was the whole reason these
  // aged — see LensRow.
  if (row.kind === "artwork" || row.kind === "vdo" || row.kind === "photo") {
    return <LensRow key={row.key} row={row} now={now} codeOf={codeOf} me={me} creativeLeader={creativeLeader}
      onOpenGraphic={onOpenGraphic} onGraphicUpdate={onGraphicUpdate} />;
  }
  // Captions: the words themselves, and the verdict. An easy yes should not
  // need a page load — the whole thing being approved is right here.
  if (row.kind === "caption") {
    return <CaptionRow key={row.key} row={row} now={now} me={me} onContentUpdate={onContentUpdate} />;
  }
  if (row.kind === "storyboard") {
    return <StoryboardRow key={row.key} row={row} now={now} me={me} onOpenGraphic={onOpenGraphic} onGraphicUpdate={onGraphicUpdate} />;
  }
  if (row.kind === "kol") {
    return <TaskApprovalRow key={row.key} row={row} now={now} me={me} onOpenTask={onOpenTask} onTaskApproved={onTaskApproved} />;
  }
  const d = describe(row, codeOf);
  const inner = (
    <>
      <KindBadge kind={row.kind} note={d.note} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold text-ink truncate">{d.title}</span>
        <span className="block text-[11.5px] text-faint truncate">{d.meta}</span>
      </span>
      <AgePill iso={row.waitingSince} now={now} />
      <MetaColumns row={row} />
      <Cta row={row} action={d.action} />
    </>
  );
  if (row.kind === "campaign") {
    return <Link key={row.key} href={`/campaigns/${row.c.id}?tab=approval`} className={rowCx}>{inner}</Link>;
  }
  if (row.kind === "request") {
    return <Link key={row.key} href="/status" className={rowCx}>{inner}</Link>;
  }
  return (
    <button key={row.key} onClick={() => onOpenGraphic(row.g.id, GRAPHIC_TAB[row.kind])} className={rowCx}>
      {inner}
    </button>
  );
}

/** A storyboard row: the board to look at, and accept / send back.
 *
 *  Storyboards block everything downstream — nobody shoots or cuts until one
 *  passes — so they are the rows where an unopened drawer costs the most. The
 *  link goes to whatever the author submitted; the buttons sit next to it. */
function StoryboardRow({ row, now, me, onOpenGraphic, onGraphicUpdate }: {
  row: Extract<ApprovalRow, { kind: "storyboard" }>;
  now: number; me: string;
  onOpenGraphic: (id: number, tab?: GTab) => void;
  onGraphicUpdate?: (g: Graphic) => void;
}) {
  const [revising, setRevising] = useState(false);
  const [note, setNote] = useState("");
  const [acted, setActed] = useState(false);
  const g = row.g;
  const board = (g.storyboardLink || "").trim();

  const decide = (approved: boolean, reason?: string) => {
    if (acted) return;
    setActed(true);
    const next = decideStoryboard({ g, approved, by: me, note: reason, onUpdate: onGraphicUpdate });
    // Refused (a send-back with no real reason) → let them fix it and try again.
    if (!next) { setActed(false); return; }
    onGraphicUpdate?.(next);
    toastSuccess(approved ? "อนุมัติ storyboard แล้ว" : "ส่ง storyboard กลับไปแก้แล้ว");
  };

  return (
    <div className={`${rowCx} flex-wrap items-center`} style={{ cursor: "default" }}>
      <KindBadge kind="storyboard" />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onOpenGraphic(g.id, GRAPHIC_TAB.storyboard)}
            className="text-[13px] font-bold text-ink hover:text-accent transition truncate">{g.title}</button>
          <AgePill iso={row.waitingSince} now={now} />
        </span>
        <span className="block text-[11.5px] text-faint truncate">
          {brandName(g.b)} · {g.campaign} · {g.type} · โดย {g.storyboardSubmittedBy || g.storyboardOwner || "Creative"}
        </span>
      </span>

      <MetaColumns row={row} />

      <span className="flex items-center gap-3 flex-shrink-0 ml-auto">
        {board ? (
          <a href={board} target="_blank" rel="noopener noreferrer"
            className="text-[11.5px] font-bold text-accent hover:underline">เปิด storyboard ↗</a>
        ) : (
          <span className="text-[11.5px] text-faint">ไม่มีลิงก์ storyboard</span>
        )}
        {!row.canAct ? (
          <span className="text-[11.5px] font-semibold" style={{ color: "#8A8175" }}>รอ {row.waitingOn}</span>
        ) : revising ? (
          <span className="flex items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เหตุผลที่ส่งกลับแก้" autoFocus
              className="text-[12px] px-[9px] py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none w-[200px]" />
            <button onClick={() => decide(false, note)} disabled={note.trim().length < 5 || acted}
              className="text-[11.5px] font-bold text-white rounded-[8px] px-[10px] py-[6px] disabled:opacity-40" style={{ background: "#B33A2E" }}>ส่งกลับแก้</button>
            <button onClick={() => setRevising(false)} className="text-[11.5px] font-semibold px-[8px] py-[6px] rounded-[8px] border border-line2 text-muted bg-white">Cancel</button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <button onClick={() => decide(true)} disabled={acted}
              className="text-[11.5px] font-bold text-white rounded-[8px] px-[11px] py-[6px] disabled:opacity-50" style={{ background: "#4E7A4E" }}>
              {acted ? "…" : "✓ อนุมัติ"}
            </button>
            <button onClick={() => setRevising(true)} disabled={acted}
              className="text-[11.5px] font-bold px-[9px] py-[6px] rounded-[8px] disabled:opacity-50"
              style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>↩ ขอแก้</button>
          </span>
        )}
      </span>
    </div>
  );
}

/** A KOL proposal (or a budget revision) waiting on a yes.
 *
 *  What the row shows is the NUMBER, because that is what is being approved:
 *  a KOL proposal commits ค่าตัว + ค่าอาหาร, and a budget revision moves a
 *  campaign's envelope. Approving goes through lib/taskApproval, which applies
 *  the thing behind the task before marking it done — a yes that ticked the
 *  wrapper and left the proposal pending is the failure worth preventing here.
 *
 *  There is no inline "no": sending a proposal back means editing the quote,
 *  and that only exists in the KOL drawer. "ดูรายละเอียด" goes there. */
function TaskApprovalRow({ row, now, me, onOpenTask, onTaskApproved }: {
  row: Extract<ApprovalRow, { kind: "kol" }>;
  now: number; me: string;
  onOpenTask: (id: number) => void;
  onTaskApproved?: (t: Task) => void;
}) {
  const [acted, setActed] = useState(false);
  const t = row.t;
  const amount = t.approvalKind === "budgetRevision" ? t.requestedBudget : undefined;

  const approve = async () => {
    if (acted) return;
    setActed(true);
    await approveTask({ task: t, by: me });
    onTaskApproved?.(t);
    toastSuccess(`อนุมัติแล้ว: ${t.title}`);
  };

  return (
    <div className={`${rowCx} flex-wrap items-center`} style={{ cursor: "default" }}>
      <KindBadge kind="kol" note={t.approvalKind === "budgetRevision" ? "งบ" : undefined} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onOpenTask(t.id)} className="text-[13px] font-bold text-ink hover:text-accent transition truncate">{t.title}</button>
          <AgePill iso={row.waitingSince} now={now} />
        </span>
        <span className="block text-[11.5px] text-faint truncate">
          {[t.brand, t.campaign, `ขอโดย ${t.assignee}`].filter(Boolean).join(" · ")}
        </span>
      </span>

      <MetaColumns row={row} />

      <span className="flex items-center gap-3 flex-shrink-0 ml-auto">
        {amount ? (
          <span className="text-[13.5px] font-extrabold" style={{ color: "#B8945A" }}>{baht(amount, { compact: true })}</span>
        ) : null}
        <button onClick={() => onOpenTask(t.id)} className="text-[11.5px] font-bold text-accent hover:underline">ดูรายละเอียด →</button>
        {!row.canAct ? (
          <span className="text-[11.5px] font-semibold" style={{ color: "#8A8175" }}>รอ {row.waitingOn}</span>
        ) : (
          <button onClick={() => void approve()} disabled={acted}
            className="text-[11.5px] font-bold text-white rounded-[8px] px-[11px] py-[6px] disabled:opacity-50" style={{ background: "#4E7A4E" }}>
            {acted ? "…" : "✓ อนุมัติ"}
          </button>
        )}
      </span>
    </div>
  );
}

/** A caption row that can be read and signed off without leaving the page.
 *
 *  The words are the whole object under review — unlike an artwork, there is no
 *  file to open — so they sit on the row in full rather than clipped to three
 *  lines. Hashtags and CTA come too: a caption approved without them is a
 *  caption approved without half of what gets published.
 *
 *  The title still links to the post for anything the row cannot answer (the
 *  brief guide, the artwork beside it, the publish settings). */
function CaptionRow({ row, now, me, onContentUpdate }: {
  row: Extract<ApprovalRow, { kind: "caption" }>;
  now: number;
  me: string;
  onContentUpdate?: (c: ContentItem) => void;
}) {
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState("");
  const [acted, setActed] = useState(false);
  const p = row.post;
  const words = (p.caption ?? "").trim();
  const extras = [p.hashtags, p.cta].map((x) => (x ?? "").trim()).filter(Boolean).join(" · ");

  const decide = async (decision: "approve" | "revise", note?: string) => {
    if (acted) return;
    setActed(true);
    const next = await decideCaption({ item: p, decision, by: me, reason: note, onUpdate: onContentUpdate });
    // Refused (nothing waiting, no reason, or the write failed) → let them try
    // again rather than leaving a row that looks pressed and did nothing.
    if (!next) setActed(false);
  };

  return (
    <div className={`${rowCx} flex-wrap items-start`} style={{ cursor: "default" }}>
      <KindBadge kind="caption" />
      <span className="flex-1 min-w-[240px]">
        <span className="flex items-center gap-2 flex-wrap">
          <Link href={workLink.post(p.id)} className="text-[13px] font-bold text-ink hover:text-accent transition truncate">
            {p.title}
          </Link>
          <AgePill iso={row.waitingSince} now={now} />
        </span>
        <span className="block text-[11.5px] text-faint truncate">
          {brandName(p.b)} · {p.campaign} · {p.plat}
          <span className="md:hidden"> · เขียนโดย {row.submittedBy || "—"}</span>
        </span>
        <span className="block text-[12px] text-muted leading-[1.55] mt-[4px] whitespace-pre-wrap">
          {words || "— ไม่มีข้อความ —"}
        </span>
        {extras && <span className="block text-[11px] text-faint mt-[2px]">{extras}</span>}
      </span>

      <MetaColumns row={row} />

      <span className="flex items-center gap-3 flex-shrink-0 ml-auto">
        {!row.canAct ? (
          <span className="text-[11.5px] font-semibold" style={{ color: "#8A8175" }}>รอ {row.waitingOn}</span>
        ) : revising ? (
          <span className="flex items-center gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="สิ่งที่ต้องแก้" autoFocus
              className="text-[12px] px-[9px] py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none w-[200px]" />
            <button onClick={() => { if (reason.trim()) void decide("revise", reason.trim()); }} disabled={!reason.trim() || acted}
              className="text-[11.5px] font-bold text-white rounded-[8px] px-[10px] py-[6px] disabled:opacity-40" style={{ background: "#B33A2E" }}>ส่งกลับแก้</button>
            <button onClick={() => setRevising(false)} className="text-[11.5px] font-semibold px-[8px] py-[6px] rounded-[8px] border border-line2 text-muted bg-white">Cancel</button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <button onClick={() => void decide("approve")} disabled={acted}
              className="text-[11.5px] font-bold text-white rounded-[8px] px-[11px] py-[6px] disabled:opacity-50" style={{ background: "#4E7A4E" }}>
              {acted ? "…" : "✓ อนุมัติ"}
            </button>
            <button onClick={() => setRevising(true)} disabled={acted}
              className="text-[11.5px] font-bold px-[9px] py-[6px] rounded-[8px] disabled:opacity-50"
              style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>↩ ขอแก้</button>
          </span>
        )}
      </span>
    </div>
  );
}

/** An artwork / VDO / photo row that can be signed off without opening
 *  anything: the file to look at, the checklist for your half of the review,
 *  and the two buttons.
 *
 *  This is the point of the list. The old path was open the drawer → find the
 *  Assets tab → find the row → open the file in another tab → come back →
 *  press. Five steps for a yes, on work whose whole problem was that it aged.
 *  "ขอแก้" still asks for a reason inline, because a send-back with no reason
 *  is a piece that comes straight back.
 *
 *  The verdict itself goes through lib/graphicVerdict — the same call the
 *  drawer makes, so a piece signed off here files into the Asset Library and
 *  raises its revision task exactly as one signed off there does. */
function LensRow({ row, now, codeOf, me, creativeLeader, onOpenGraphic, onGraphicUpdate }: {
  row: Extract<ApprovalRow, { kind: "artwork" | "vdo" | "photo" }>;
  now: number;
  codeOf: (id?: string, name?: string) => string | undefined;
  me: string;
  creativeLeader?: string;
  onOpenGraphic: (id: number, tab?: GTab) => void;
  onGraphicUpdate?: (g: Graphic) => void;
}) {
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState("");
  // Latches on the first press so a double click cannot record two verdicts
  // before the row leaves the list.
  const [acted, setActed] = useState(false);
  const lens = LENS_META[row.lens];
  // Video is signed off once (lensesFor), so naming the lane on the button says
  // nothing — "ผ่าน CI" reads as one of two steps when it is the only step.
  const oneLens = lensesFor(row.g).length === 1;
  const d = row.deliverable;
  const asset = (d.assetLink || "").trim();
  // Who could take it when the request names nobody — same fallback the drawer
  // uses, so a verdict given from the list tells the same people.
  const productionOwners = useProductionOwners();
  const cmoName = useCmoName();
  const ciBackup = useCiBackup();

  const decide = (verdict: "pass" | "revise", note?: string) => {
    if (acted) return;
    setActed(true);
    const ng = giveLensVerdict({
      g: row.g, deliverables: row.g.deliverables ?? [], index: row.index,
      lens: row.lens, verdict, me, note, creativeLeader, cmoName, ciBackup,
      productionOwners: productionOwners(workKind(row.g.type, row.g.requiredVideo)),
      onUpdate: onGraphicUpdate,
    });
    if (!ng) {
      setActed(false);
      toastError("บันทึกผลตรวจไม่สำเร็จ — อาจมีคนตรวจด้านนี้ไปแล้ว");
      return;
    }
    onGraphicUpdate?.(ng);
    toastSuccess(verdict === "pass"
      ? `${oneLens ? "อนุมัติ" : `ผ่าน ${lens.short}`}: ${row.g.title}`
      : `ส่งกลับแก้: ${row.g.title}`);
  };

  return (
    <div className={`${rowCx} flex-wrap items-center`} style={{ cursor: "default" }}>
      <KindBadge kind={row.kind} note={lens.short} />
      <span className="flex-1 min-w-[220px]">
        <span className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onOpenGraphic(row.g.id, GRAPHIC_TAB[row.kind])}
            className="text-[13px] font-bold text-ink hover:text-accent transition truncate">
            {row.g.title}
          </button>
          <AgePill iso={row.waitingSince} now={now} />
        </span>
        <span className="block text-[11.5px] text-faint truncate">
          {/* ส่งโดย moved to its own column — see MetaColumns. Below md the
              columns are hidden, so it comes back into this line there. */}
          {[`${brandName(row.g.b)} · ${row.g.campaign}`, codeOf(row.g.campaignId, row.g.campaign),
            `${platformLabel(row.platforms, d.platform)} · ${d.size}${d.version ? ` · v${d.version}` : ""}`].filter(Boolean).join(" · ")}
          <span className="md:hidden"> · ส่งโดย {row.submittedBy || "—"}</span>
        </span>
        <span className="block text-[11px] mt-[3px]" style={{ color: APPROVAL_META[row.kind].fg }}>
          <b>ตรวจ {lens.label}:</b> <span className="text-faint">{lens.checks}</span>
        </span>
      </span>

      <MetaColumns row={row} />

      {/* The file and the verdict travel together: on a narrow row they wrap as
          one cluster, rather than the buttons dropping to their own line while
          the link they belong to stays up beside the title. */}
      <span className="flex items-center gap-3 flex-shrink-0 ml-auto">
      {asset ? (
        <a href={asset} target="_blank" rel="noopener noreferrer"
          className="text-[11.5px] font-bold text-accent hover:underline flex-shrink-0">
          เปิดไฟล์ ↗
        </a>
      ) : (
        <span className="text-[11.5px] text-faint flex-shrink-0">ไม่มีลิงก์ไฟล์</span>
      )}
      {(d.refLink || "").trim() && (
        <a href={d.refLink} target="_blank" rel="noopener noreferrer"
          className="text-[11.5px] text-muted hover:underline flex-shrink-0">อ้างอิง ↗</a>
      )}

      {!row.canAct ? (
        <span className="text-[11.5px] font-semibold flex-shrink-0" style={{ color: "#8A8175" }}>รอ {row.waitingOn}</span>
      ) : revising ? (
        <span className="flex items-center gap-2 flex-shrink-0">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`สิ่งที่ต้องแก้ (${lens.short})`} autoFocus
            className="text-[12px] px-[9px] py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none w-[200px]" />
          <button onClick={() => { if (reason.trim()) decide("revise", reason.trim()); }} disabled={!reason.trim() || acted}
            className="text-[11.5px] font-bold text-white rounded-[8px] px-[10px] py-[6px] disabled:opacity-40" style={{ background: "#B33A2E" }}>ส่งกลับแก้</button>
          <button onClick={() => setRevising(false)} className="text-[11.5px] font-semibold px-[8px] py-[6px] rounded-[8px] border border-line2 text-muted bg-white">Cancel</button>
        </span>
      ) : (
        <span className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => decide("pass")} disabled={acted}
            className="text-[11.5px] font-bold text-white rounded-[8px] px-[11px] py-[6px] disabled:opacity-50" style={{ background: "#4E7A4E" }}>
            {acted ? "…" : oneLens ? "✓ Approve" : `✓ ผ่าน ${lens.short}`}
          </button>
          <button onClick={() => setRevising(true)} disabled={acted}
            className="text-[11.5px] font-bold px-[9px] py-[6px] rounded-[8px] disabled:opacity-50"
            style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>↩ ขอแก้</button>
        </span>
      )}
      </span>
    </div>
  );
}

/** The expense row: amount, age, and — only when it is yours — the two buttons.
 *  Reject still asks for a reason, inline, because a send-back with no reason
 *  is a request that comes straight back. */
function ExpenseRow({ row, budget, now, codeOf, onApprove, onReject }: {
  row: Extract<ApprovalRow, { kind: "expense" }>;
  budget: ExpenseBudgetInfo | null; now: number;
  codeOf: (id?: string, name?: string) => string | undefined;
  onApprove: (r: ExpenseReq) => void; onReject: (r: ExpenseReq, reason: string) => void;
}) {
  const r = row.r;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [acted, setActed] = useState(false);
  const over = budget !== null && budget.left < 0;
  const d = describe(row, codeOf);
  return (
    <div className={`${rowCx} flex-wrap`} style={{ cursor: "default" }}>
      <KindBadge kind="expense" />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-bold text-ink truncate">{d.title}</span>
        <span className="block text-[11.5px] text-faint truncate">{d.meta}</span>
      </span>
      {over && (
        <span className="text-[11px] font-bold" style={{ color: "#B33A2E" }}>⚠ เกินงบ {baht(Math.abs(budget!.left), { compact: true })}</span>
      )}
      <span className="text-[13.5px] font-extrabold flex-shrink-0" style={{ color: "#B8945A" }}>{baht(r.requested, { compact: true })}</span>
      <AgePill iso={row.waitingSince} now={now} />
      <MetaColumns row={row} />
      {!row.canAct ? (
        <span className="text-[11.5px] font-semibold flex-shrink-0" style={{ color: "#8A8175" }}>รอ {row.waitingOn}</span>
      ) : rejecting ? (
        <span className="flex items-center gap-2 flex-shrink-0">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผลที่ตีกลับ" autoFocus
            className="text-[12px] px-[9px] py-[6px] rounded-[8px] border border-line2 bg-ivory outline-none w-[180px]" />
          <button onClick={() => { if (reason.trim() && !acted) { setActed(true); onReject(r, reason.trim()); } }} disabled={!reason.trim() || acted}
            className="text-[11.5px] font-bold text-white rounded-[8px] px-[10px] py-[6px] disabled:opacity-40" style={{ background: "#B33A2E" }}>ส่งกลับ</button>
          <button onClick={() => setRejecting(false)} className="text-[11.5px] font-semibold px-[8px] py-[6px] rounded-[8px] border border-line2 text-muted bg-white">Cancel</button>
        </span>
      ) : (
        <span className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => { if (!acted) { setActed(true); onApprove(r); } }} disabled={acted}
            className="text-[11.5px] font-bold text-white rounded-[8px] px-[11px] py-[6px] disabled:opacity-50" style={{ background: "#4E7A4E" }}>
            {acted ? "…" : "Approve ✓"}
          </button>
          <button onClick={() => setRejecting(true)} className="text-[11.5px] font-bold px-[9px] py-[6px] rounded-[8px]"
            style={{ background: "#FFF5F4", color: "#B33A2E", border: "1px solid #F5C8C4" }}>✕</button>
        </span>
      )}
    </div>
  );
}

/** Kinds that keep a panel on an empty week — see the note in `panels`. */
const ALWAYS_SHOWN: ApprovalKind[] = ["caption", "artwork", "vdo"];

/** One foldable section of the centre: a kind of work, how much of it is open,
 *  how long the worst of it has waited, and the cards themselves.
 *
 *  Folded state is remembered per browser through the same hook the summary
 *  cards use, so somebody who never signs off artwork can collapse that panel
 *  once and keep a short page. A panel with nothing in it renders its header
 *  and no chevron: there is nothing to unfold, and a control that opens an
 *  empty box is a control that teaches people not to press it. */
function KindPanel({ kind, rows, now, forceOpen, view, children }: {
  kind: ApprovalKind; rows: ApprovalRow[]; now: number; forceOpen?: boolean;
  view: "list" | "cards"; children: React.ReactNode;
}) {
  const meta = APPROVAL_META[kind];
  const { collapsed, toggle } = usePanelCollapsed("approval-kind", kind);
  const oldest = useMemo(() => {
    const ages = rows.map((r) => waitingDays(r.waitingSince, now)).filter((d): d is number => d !== null);
    return ages.length ? Math.max(...ages) : null;
  }, [rows, now]);
  const empty = rows.length === 0;
  const open = !empty && (forceOpen || !collapsed);

  return (
    <section className="rounded-cardLg border border-line bg-surface">
      <button onClick={empty ? undefined : toggle} disabled={empty}
        aria-expanded={empty ? undefined : !collapsed}
        aria-label={empty ? undefined : `${collapsed ? "เปิด" : "ยุบ"} ${meta.label}`}
        className="w-full flex items-center gap-[10px] px-4 py-[13px] text-left"
        style={{ cursor: empty ? "default" : "pointer", opacity: empty ? 0.6 : 1 }}>
        <span className="text-[16px] flex-shrink-0">{meta.icon}</span>
        <span className="text-[13.5px] font-extrabold text-ink flex-shrink-0">{meta.label}</span>
        <span className="text-[11.5px] font-bold px-[9px] py-[2px] rounded-pill flex-shrink-0"
          style={{ background: meta.bg, color: meta.fg }}>{rows.length}</span>
        {oldest !== null && oldest > 0 && (
          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: ageColor(oldest) }}>
            ค้างสุด {oldest} วัน
          </span>
        )}
        <span className="flex-1" />
        {empty
          ? <span className="text-[11.5px] text-faint flex-shrink-0">ไม่มีงานค้าง</span>
          : (
            /* A span, not the shared CollapseButton: the whole header row is
               already the button, and a <button> inside a <button> is invalid
               markup that fired toggle twice on one click. */
            <span aria-hidden className="w-7 h-7 rounded-[9px] border border-line2 bg-white/78 flex items-center justify-center text-faint flex-shrink-0">
              <ChevronDown size={14} className="transition-transform" style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }} />
            </span>
          )}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {view === "list" ? (
            <div className="flex flex-col gap-2">{children}</div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}>
              {children}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ScopeTab({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-[12px] font-bold px-[12px] py-[6px] rounded-pill transition ${on ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
      {label}
      {count !== undefined && <span className="ml-[6px] text-[11px] font-extrabold" style={{ opacity: 0.6 }}>{count}</span>}
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
      {!row.canAct ? (
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
