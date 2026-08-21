"use client";

import { toastError, toastSuccess } from "@/lib/toast";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { workLink } from "@/lib/deepLink";
import { CampaignDetail, CampaignRow, CAMPAIGN_TABS, CAMPAIGN_TAB_LABELS, CampaignTab } from "@/lib/data/campaigns";
import { supabase } from "@/lib/supabase";
import { campaignTone } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Progress } from "@/components/ui/Progress";
import { baht, num, pct } from "@/lib/format";
import { CampaignResultRow, deriveResultRow, cpr, emptyResultRow, mergeBudgetAllocationRows } from "@/lib/data/campaignResult";
import { fetchResults, saveResults } from "@/lib/db/campaignResult";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchKols } from "@/lib/db/kol";
import { fetchCampaignKolEngagements, CampaignKolRow } from "@/lib/db/kolScorecard";
import { LineOaConfig, lineConfigFor, notionalCost, effectiveCost } from "@/lib/data/lineQuota";
import { fetchJsonSetting } from "@/lib/db/settings";
import { fmtFollow } from "@/lib/data/kol";
import { CampaignHub, HubStats, hubStats, createBudgetExpenseDrafts } from "@/lib/db/campaignHub";
import { CampaignBrief, BriefContentItem, budgetSummary, materialised, approvedButNothingMade, plannedItems } from "@/lib/data/brief";
import { logBriefApproval, saveCampaignBrief } from "@/lib/db/brief";
import { createRevisionTask } from "@/lib/db/tasks";
import { fetchMembers, fetchBrandConfigs } from "@/lib/db/settings";
import { resolveBrandLead } from "@/lib/db/assignments";
import { BrandCfg } from "@/lib/data/settings";
import { sameName } from "@/lib/identity";
import { brandName } from "@/lib/brands";
import { updateCampaignStatus } from "@/lib/db/campaigns";
import { useCanMakeApprovedPlan } from "@/lib/usePermGates";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { fmtDisplay } from "@/components/ui/DatePicker";

// Rough planning ratios used only until per-campaign actuals are wired in. These
// are NOT booked figures — any KPI derived from them is labelled "(ประมาณ)" so
// nobody mistakes an estimate for a real number. Tune per brand later (see audit
// P2-7 / P2-9): gross margin, and the share of budget/spend that goes to ads.
const EST_GROSS_MARGIN = 0.38;
const EST_AD_BUDGET_SHARE = 0.4;

// Everything that follows a campaign turning "Approved", shared by BOTH approve
// controls (the header's quick Approve and the Approval tab's) so they cannot
// drift apart: approval is the gate that materialises posts / graphic requests /
// KOL rows / tasks, and opens one Draft expense request per funded budget bucket.
async function materialiseApproved(row: CampaignRow, fresh: CampaignBrief, by: string) {
  notify("approved", `✅ แคมเปญอนุมัติแล้ว: ${fresh.name}`, `โดย ${by}`, workLink.campaign(row.id), { to: [fresh.plannerOwner || row.owner] });
  const made = await saveCampaignBrief(fresh).catch((error) => {
    toastError(`อนุมัติแล้ว แต่สร้างงานเข้าโมดูลไม่สำเร็จ: ${error?.message || "Unknown error"}`);
    return null;
  });
  if (made) {
    const c = made.created;
    notify("newTask", `📦 แตกงานจากแคมเปญ: ${fresh.name}`, `Content ${c.content} · Graphic ${c.graphics} · KOL ${c.kols} · Task ${c.tasks} — เข้า Content Plan / Graphic Request แล้ว`, workLink.campaign(row.id), { to: [fresh.plannerOwner || row.owner] });
  }
  // Approved budget flows straight into Finance as Draft expense requests —
  // one per funded bucket — so the finance team never re-keys the plan.
  const drafts = await createBudgetExpenseDrafts(row, fresh)
    .catch((error) => {
      toastError(`สร้าง Draft เบิกงบจาก Campaign ไม่สำเร็จ: ${error?.message || "Unknown error"}`);
      return 0;
    });
  if (drafts > 0) notify("approval", `💰 เปิด Draft เบิกงบ ${drafts} รายการจากงบแคมเปญ: ${fresh.name}`, `ตามงบที่อนุมัติ — ตรวจและกดส่งอนุมัติได้ในโมดูล Expenses`, "/expenses");
}
const EST_AD_SPEND_SHARE = 0.55;

export function CampaignDetailView({ detail, hub, onReload, brief, onBriefChange }: { detail: CampaignDetail; hub: CampaignHub | null; onReload: () => void; brief?: CampaignBrief | null; onBriefChange?: (b: CampaignBrief) => void }) {
  const [tab, setTab] = useState<CampaignTab>("overview");
  // Deep-link support: /campaigns/[id]?tab=approval opens that tab (client-only
  // read so the statically-rendered page doesn't need a Suspense boundary).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (CAMPAIGN_TABS as readonly string[]).includes(t)) setTab(t as CampaignTab);
  }, []);
  const c = detail.row;
  const effectiveStatus = brief?.status ?? c.status;
  const effectiveNextApproval = effectiveStatus === "Waiting for Approval"
    ? (brief?.approver || c.nextApproval || DEFAULT_APPROVER)
    : "None";
  const s = hub ? hubStats(hub) : null;
  // Temporary approval action while the Approval Queue module is "SOON": the CMO /
  // Admin (or the named approver) can approve or send back, so campaigns never get
  // stuck permanently in "Waiting for Approval".
  const { role, member } = useAuth();
  // Hoisted out of the tab switch: hooks cannot sit behind `tab === "content"`.
  const canMakePlan = useCanMakeApprovedPlan();
  const [approving, setApproving] = useState(false);
  // Status is the approval flow, so the CMO alone moves it — same gate as the
  // campaign list's status dropdown.
  const canApprove = role === "CMO";
  const decide = async (approve: boolean) => {
    setApproving(true);
    try {
      // Approving must run the brief pipeline, not just flip a column: it used
      // to write status "Active" — a value no status list knows — straight onto
      // the campaigns row, so the brief stayed "Waiting for Approval" and no
      // content/graphic/KOL/task rows were ever materialised. Same pipeline as
      // the Approval tab: log against the brief as the DATABASE holds it (null =
      // already in that status; the click that got there first owns the
      // follow-through), then let approval materialise the work. This button
      // used to fan out its own possibly-stale copy in parallel with the tab's
      // Approve — the two runs raced into content_posts_source_uniq and the
      // stale write silently ate the other's approval-log entries.
      const next = approve ? "Approved" as const : "Draft" as const;
      if (brief) {
        const by = member?.name || role || "—";
        const entry = { action: approve ? "Approved" : "Sent back to Draft", by, at: new Date().toISOString(), from: brief.status, to: next };
        const fresh = (await logBriefApproval(brief.id, entry, next))
          ?? (supabase() ? null : { ...brief, status: next, approvalLog: [...(brief.approvalLog ?? []), entry] });
        if (fresh && approve) await materialiseApproved(c, fresh, by);
      } else {
        await updateCampaignStatus(c.id, next, member?.name || role || "");
      }
      onReload();
    } catch (error) {
      toastError(`บันทึก Approval status ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setApproving(false); }
  };

  // Management strip — real counts once the hub has loaded, else the row's stored values.
  const strip = s
    ? { total: s.total, done: s.done, inProgress: s.inProgress, blocked: s.blocked, waiting: s.waiting }
    : { total: c.taskTotal, done: c.taskDone, inProgress: c.taskInProgress, blocked: c.taskBlocked, waiting: c.taskWaiting };

  return (
    <>
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-[12.5px] text-faint hover:text-ink font-semibold mb-3">
        <ArrowLeft size={14} /> All campaigns
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-[10px] flex-wrap">
            <span className="w-[10px] h-[10px] rounded-full" style={{ background: detail.color }} />
            <h1 className="text-[24px] font-extrabold letter-tightest">{c.name}</h1>
            {brief?.code && (
              <span className="text-[12px] font-extrabold rounded-pill px-2.5 py-[3px]" style={{ background: "#F2EEFF", color: "#6C5CE7" }}>
                #{brief.code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-[6px] flex-wrap text-[12.5px] text-faint">
            <span className="font-mono text-[11.5px] text-muted">{c.id}</span>
            <span>·</span><span>{detail.brand}</span>
            <span>·</span><span>{c.branch}</span>
            <span>·</span><span>{c.campType}</span>
            <span>·</span><span>{c.dates}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Same rule as the campaign list: editing the brief is campaign-
              management work — CMO or Marketing Manager/BGL (BUG-03, increment 1). */}
          {brief && (role === "CMO" || role === "Marketing Manager / BGL") && (
            <Link href={`/campaigns/new?edit=${encodeURIComponent(c.id)}`} className="text-[12px] font-bold rounded-[9px] px-3 py-[7px] border border-line2 bg-surface text-ink">
              ✏️ Edit Campaign
            </Link>
          )}
          <StatusBadge tone={campaignTone(effectiveStatus)}>{effectiveStatus}</StatusBadge>
          <StatusBadge tone={detail.hasResult ? "green" : "gold"}>{detail.hasResult ? "✓ Ready" : "⚠ Needs attention"}</StatusBadge>
        </div>
      </div>

      {/* Management summary strip */}
      <div className="mt-4 bg-panel text-white rounded-cardLg px-5 py-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))" }}>
        {[
          { label: "Tasks", value: strip.total, color: "#fff" },
          { label: "Done", value: strip.done, color: "#9de09d" },
          { label: "In Progress", value: strip.inProgress, color: "#9bb8ef" },
          { label: "Blocked", value: strip.blocked, color: strip.blocked ? "#f0a89f" : "#fff" },
          { label: "Waiting", value: strip.waiting, color: "#e8c87d" },
          { label: "Overdue", value: c.taskOverdue, color: c.taskOverdue ? "#f0a89f" : "#fff" },
          { label: "Bottleneck", value: c.bottleneckTeam, color: "#e8c87d", small: true },
          { label: "Next Approval", value: effectiveNextApproval, color: effectiveNextApproval === "None" ? "#9de09d" : "#B8945A", small: true },
        ].map((x) => (
          <div key={x.label}>
            <div className="text-[9.5px] uppercase tracking-[0.06em] text-white/45 font-bold mb-[5px]">{x.label}</div>
            <div className={`${x.small ? "text-[13px]" : "text-[22px]"} font-extrabold letter-tightest`} style={{ color: x.color }}>{x.value}</div>
          </div>
        ))}
      </div>

      {effectiveStatus === "Waiting for Approval" && (
        <div className="mt-4 rounded-card border px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "#FBF8EE", borderColor: "#E8CCA0" }}>
          <span className="text-[18px]">🕓</span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[13px] font-bold" style={{ color: "#8A6D1E" }}>Waiting for Approval · {effectiveNextApproval}</div>
            <div className="text-[11.5px] text-muted">{canApprove ? "อนุมัติเพื่อเริ่มแคมเปญ หรือส่งกลับให้แก้ไข (Approval Queue module กำลังจะมา)" : "รอผู้อนุมัติดำเนินการ — ระหว่างนี้ยังไม่ค้างถาวร ผู้อนุมัติ/Admin กดได้จากหน้านี้"}</div>
          </div>
          {canApprove && (
            <div className="flex gap-2">
              <button disabled={approving} onClick={() => decide(false)} className="text-[12px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[7px] bg-surface disabled:opacity-40">↩ Send back to Draft</button>
              <button disabled={approving} onClick={() => decide(true)} className="text-[12px] font-bold text-white rounded-[8px] px-4 py-[7px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>{approving ? "…" : "✓ Approve & Activate"}</button>
            </div>
          )}
        </div>
      )}

      {detail.needsResult && (
        <div className="mt-4 rounded-card border px-4 py-3 flex items-center gap-3" style={{ background: "#FFF5F4", borderColor: "#F5C8C4" }}>
          <span className="text-[18px]">🚫</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-status-red">Campaign marked Completed but no Result data</div>
            <div className="text-[11.5px] text-muted">A campaign cannot be closed out until its result report is uploaded.</div>
          </div>
          <button onClick={() => setTab("result")} className="text-[12px] font-bold text-status-red border border-[#F5C8C4] rounded-[8px] px-3 py-[6px]">Add Result Data →</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line pb-[2px]">
        {CAMPAIGN_TABS.map((t) => {
          const active = t === tab;
          const count = s ? tabCount(t, s) : null;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="text-[13px] font-semibold px-[14px] py-[9px] whitespace-nowrap border-b-2 -mb-[2px] transition"
              style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
              {CAMPAIGN_TAB_LABELS[t]}{count ? <span className="ml-1 text-[11px] text-faint">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "overview" && <OverviewTab detail={detail} hub={hub} s={s} nextApproval={effectiveNextApproval} />}
        {tab === "brief" && <BriefTab detail={detail} brief={brief} />}
        {tab === "content" && <ContentList hub={hub} brief={brief} canMake={canMakePlan} onReload={onReload} />}
        {tab === "kol" && <KolList hub={hub} detail={detail} />}
        {tab === "ads" && <AdsTab detail={detail} hub={hub} />}
        {tab === "budget" && <BudgetTab detail={detail} s={s} brief={brief} />}
        {tab === "assets" && <AssetsList hub={hub} />}
        {tab === "approval" && <ApprovalTab detail={detail} brief={brief} onBriefChange={onBriefChange} />}
        {tab === "result" && <ResultTab detail={detail} />}
      </div>
    </>
  );
}

function tabCount(t: CampaignTab, s: HubStats): number | null {
  if (t === "content") return s.content || null;
  if (t === "kol") return s.kols || null;
  if (t === "assets") return s.graphics || null;
  if (t === "budget") return s.expenses || null;
  return null;
}

function Panel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-line rounded-cardLg p-5 ${className ?? ""}`}>
      {title && <div className="text-[13px] font-bold mb-3">{title}</div>}
      {children}
    </div>
  );
}

function OverviewTab({ detail, hub, s, nextApproval }: { detail: CampaignDetail; hub: CampaignHub | null; s: HubStats | null; nextApproval: string }) {
  const c = detail.row;
  const kpis = [
    { label: "Budget", value: detail.budgetF },
    { label: "Spend", value: detail.spendF },
    { label: "Revenue", value: detail.revenue },
    { label: "Gross Profit (ประมาณ)", value: c.roi ? baht(Math.round(c.spend * c.roi * EST_GROSS_MARGIN), { compact: true }) : "—" },
    { label: "ROAS", value: c.roi ? `${c.roi}×` : "—" },
    { label: "ROI", value: c.roi ? `${(c.roi - 1).toFixed(1)}×` : "—", color: detail.roiColor },
  ];
  const spendPct = c.budget ? Math.round((c.spend / c.budget) * 100) : 0;
  const adsCount = hub ? hub.tasks.filter((t) => t.type === "Ads").length : 0;

  // Readiness + linked modules derived from real counts.
  const mark = (n: number) => (n > 0 ? { icon: "✓", color: "#4E7A4E" } : { icon: "—", color: "#9A9387" });
  const readiness = [
    { label: "Content Plan", ...mark(s?.content ?? 0) },
    { label: "KOL Plan", ...mark(s?.kols ?? 0) },
    { label: "Ads Plan", ...mark(adsCount) },
    { label: "Artwork", ...mark(s?.graphics ?? 0) },
    { label: "Result Report", ...(detail.hasResult ? { icon: "✓", color: "#4E7A4E" } : { icon: "—", color: "#9A9387" }) },
  ];
  const link = (icon: string, label: string, n: number, unit: string, iconBg: string) =>
    ({ icon, label, sub: n > 0 ? `${n} ${unit}` : `No ${unit} yet`, status: n > 0 ? "Active" : "Missing", tone: (n > 0 ? "green" : "gold") as "green" | "gold", iconBg });
  const moduleLinks = [
    link("📝", "Content Calendar", s?.content ?? 0, "posts", "#EEF4EE"),
    link("🤝", "KOL Plan", s?.kols ?? 0, "creators", "#FBF6ED"),
    link("📢", "Ads Plan", adsCount, "ad tasks", "#EEF1F8"),
    link("🎨", "Graphic / Asset", s?.graphics ?? 0, "artworks", "#F2EDE2"),
    link("✅", "Approval Queue", s?.expenses ?? 0, "budget requests", "#FBF3F1"),
    { icon: "📊", label: "Result / Report", sub: detail.hasResult ? "Report available" : "Report pending", status: detail.hasResult ? "Done" : "Pending", tone: (detail.hasResult ? "ink" : "neutral") as "ink" | "neutral", iconBg: "#EEF4EE" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))" }}>
        {kpis.map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-card p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold letter-tightest" style={{ color: k.color ?? "#211F1C" }}>{k.value}</div>
          </div>
        ))}
      </div>

      <Panel title="Budget Utilization">
        <div className="flex items-center justify-between text-[12px] text-muted mb-2">
          <span>{detail.spendF} of {detail.budgetF}</span>
          <span className="font-bold" style={{ color: spendPct > 100 ? "#B33A2E" : "#B8945A" }}>{spendPct}%</span>
        </div>
        <Progress value={spendPct} color={spendPct > 100 ? "#B33A2E" : "#B8945A"} height={8} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Campaign Readiness">
          <div className="flex flex-col gap-[10px]">
            {readiness.map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[13px] text-ink">{r.label}</span>
                <span className="text-[15px] font-bold" style={{ color: r.color }}>{r.icon}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Where is this campaign stuck?">
          {(s?.blocked ?? 0) > 0 ? (
            <div className="flex flex-col gap-[10px]">
              <div className="flex items-center gap-3 p-3 rounded-card bg-ivory border border-line3">
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-ink">{c.bottleneckTeam}</div>
                  <div className="text-[11.5px] text-faint">{s?.blocked} item(s) blocked</div>
                </div>
                <StatusBadge tone="red">Blocked</StatusBadge>
              </div>
              <div className="text-[11.5px] text-muted">Pending approver · <b>{nextApproval}</b></div>
            </div>
          ) : (
            <div className="text-[13px] text-faint py-4 text-center">No blockers — this campaign is flowing smoothly. 🌿</div>
          )}
        </Panel>
      </div>

      <Panel title="Linked Modules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {moduleLinks.map((m) => (
            <div key={m.label} className="flex items-center gap-3 p-3 rounded-card bg-ivory border border-line3">
              <span className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[14px]" style={{ background: m.iconBg }}>{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-ink">{m.label}</div>
                <div className="text-[11px] text-faint truncate">{m.sub}</div>
              </div>
              <StatusBadge tone={m.tone}>{m.status}</StatusBadge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BriefFromBuilder({ brief }: { brief: CampaignBrief }) {
  const bs = budgetSummary(brief);
  const field = (label: string, value: React.ReactNode) => (
    <div><div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{label}</div><div className="text-[13.5px] text-ink">{value || "—"}</div></div>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="flex flex-col gap-4">
        <Panel title="Campaign Brief">
          <div className="flex flex-col gap-4">
            {field("Objective", brief.objective)}
            {field("Period", `${fmtDisplay(brief.startDate)} – ${fmtDisplay(brief.endDate)}`)}
            {field("Target Audience", brief.audience)}
            {field("Main Message", brief.mainMessage)}
            {field("Offer / Promotion", brief.offer)}
            {field("Channels", brief.channels.join(", "))}
            {field("Concept", brief.concept)}
            {field("Key Visual Direction", brief.kvDirection)}
            {field("Success Metrics", brief.successMetrics.join(", "))}
            <div className="grid grid-cols-2 gap-4">{field("Planner", brief.plannerOwner)}{field("Approver", brief.approver)}</div>
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-4">
        <Panel title="Plan Summary">
          <div className="grid grid-cols-2 gap-3">
            {[["Content items", String(brief.content.length)], ["Graphics needed", String(brief.content.filter((c) => c.requiredGraphic).length)], ["KOL requirements", String(brief.kols.length)], ["Total budget", baht(brief.budget.total, { compact: true })]].map(([l, v]) => (
              <div key={l} className="bg-ivory border border-line3 rounded-card p-3"><div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{l}</div><div className="text-[16px] font-bold text-ink">{v}</div></div>
            ))}
          </div>
        </Panel>
        <Panel title="Budget Allocation">
          <div className="flex flex-col gap-2">
            {bs.byBucket.filter((b) => b.amount > 0).map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-[12px] text-muted w-36 flex-shrink-0">{b.label}</span>
                <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, b.pct)}%`, background: "#B8945A" }} /></div>
                <span className="text-[12px] font-bold text-ink w-16 text-right">{baht(b.amount, { compact: true })}</span>
              </div>
            ))}
            {bs.byBucket.every((b) => b.amount === 0) && <div className="text-[12.5px] text-faint">ยังไม่ได้จัดสรรงบ</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BriefTab({ detail, brief }: { detail: CampaignDetail; brief?: CampaignBrief | null }) {
  // When the campaign came from the Brief builder, show the real brief.
  if (brief) return <BriefFromBuilder brief={brief} />;
  const fields = [
    { label: "Objective", value: detail.objective },
    { label: "Target Customer", value: detail.target },
    { label: "Main Offer", value: detail.offer },
    { label: "Key Message", value: detail.keyMessage },
    { label: "Owner", value: detail.row.owner },
    { label: "Approver", value: detail.row.nextApproval },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Campaign Brief">
        <div className="flex flex-col gap-4">
          {fields.map((f) => (
            <div key={f.label}>
              <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{f.label}</div>
              <div className="text-[13.5px] text-ink">{f.value}</div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="KPI Targets">
          <div className="grid grid-cols-2 gap-3">
            {detail.kpiRows.map((k) => (
              <div key={k.label} className="bg-ivory border border-line3 rounded-card p-3">
                <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-[4px]">{k.label}</div>
                <div className="text-[16px] font-bold text-ink">{k.value}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Period">
          <div className="flex flex-col gap-3">
            {detail.periodRows.map((p) => (
              <div key={p.label} className="flex items-center justify-between">
                <span className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold">{p.label}</span>
                <span className="text-[13px] font-semibold text-ink">{p.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ── Linked-record tabs (real data) ─────────────────────────────────── */
function EmptyState({ title, note }: { title: string; note: string }) {
  return (
    <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-12 text-center">
      <div>
        <div className="text-[14px] font-bold text-ink">{title}</div>
        <div className="text-[12px] text-faint mt-1 max-w-sm mx-auto">{note}</div>
      </div>
    </div>
  );
}

function ContentList({ hub, brief, canMake, onReload }: {
  hub: CampaignHub | null; brief?: CampaignBrief | null; canMake?: boolean; onReload?: () => void;
}) {
  const [making, setMaking] = useState(false);
  // Re-run the fan-out for a plan that never became work. saveCampaignBrief is
  // idempotent (createXIfNew skips what exists), so this is safe to press twice
  // and safe on a campaign that is only partly made.
  const makeTheWork = async () => {
    if (!brief || making) return;
    setMaking(true);
    try {
      const res = await saveCampaignBrief(brief);
      const made = res.created.content + res.created.graphics + res.created.kols + res.created.tasks;
      if (made === 0) {
        toastError("ยังสร้างไม่ได้ — ไม่มีอะไรถูกสร้างเพิ่ม ลองเช็คว่าแผนมีหัวข้อครบไหม");
      } else {
        toastSuccess(`สร้างงานจากแผนแล้ว · โพสต์ ${res.created.content} · งานกราฟฟิก ${res.created.graphics} · task ${res.created.tasks}`);
        onReload?.();
      }
    } catch (error) {
      toastError(`สร้างงานจากแผนไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setMaking(false); }
  };

  if (!hub) return <div className="py-10 text-center text-faint text-[13px]">Loading…</div>;

  // Approved, but the plan never became anything. The status says the work
  // exists and the Content module disagrees; the plan is the thing that is
  // actually there, so show it — and say plainly that it has not been made.
  if (approvedButNothingMade(brief, hub.content.length)) {
    const planned = plannedItems(brief) as BriefContentItem[];
    return (
      <div className="bg-surface border rounded-cardLg overflow-hidden" style={{ borderColor: "#F0D5BC" }}>
        <div className="px-5 py-3 border-b" style={{ background: "#FBF1E9", borderColor: "#F0D5BC" }}>
          <div className="text-[12.5px] font-extrabold" style={{ color: "#B3641E" }}>
            ⚠ แคมเปญนี้อนุมัติแล้ว แต่แผน {planned.length} รายการยังไม่ถูกสร้างเป็นงานจริง
          </div>
          {/* Who is reading this decides what it can honestly say. The banner
              used to tell everyone to "กดปุ่มด้านล่าง" while the button rendered
              only for the planning side — so the Creative Leader whose seven
              planned items these are read an instruction pointing at nothing,
              and reported it as "กดเข้าไปสร้างไม่ได้". The button is now open to
              the whole team (canMakeApprovedPlan); this line is what an external
              agency, the one role still without it, sees instead. */}
          <div className="text-[11.5px] mt-1" style={{ color: "#8A5A1E" }}>
            {canMake
              ? "แผนยังอยู่ครบ ไม่ได้หายไปไหน — ตอนอนุมัติระบบสร้างโพสต์/ใบงานไม่สำเร็จ กดปุ่มด้านล่างเพื่อสร้างใหม่ได้เลย"
              : "แผนยังอยู่ครบ ไม่ได้หายไปไหน — ตอนอนุมัติระบบสร้างโพสต์/ใบงานไม่สำเร็จ แจ้งทีม Marketing ให้เปิดแท็บนี้แล้วกด “สร้างงานจากแผนนี้” ให้ (ใบงานฝั่งเราต้องเปิดจากทีมภายใน)"}
          </div>
          {canMake && (
            <button onClick={makeTheWork} disabled={making}
              className="mt-2 text-[12px] font-bold text-white rounded-[9px] px-4 py-[7px] disabled:opacity-40"
              style={{ background: "#B3641E" }}>
              {making ? "กำลังสร้าง…" : "สร้างงานจากแผนนี้"}
            </button>
          )}
        </div>
        {planned.map((ci) => (
          <div key={ci.id} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold truncate">{ci.title}</div>
              <div className="text-[11px] text-faint">{ci.type} · {ci.platforms.join(", ") || "—"}{ci.publishDate ? ` · ${fmtDisplay(ci.publishDate)}` : ""}</div>
            </div>
            {ci.requiredVideo && <StatusBadge tone="neutral">🎬 VDO</StatusBadge>}
            {ci.requiredGraphic && <StatusBadge tone="neutral">🎨 Graphic</StatusBadge>}
            <StatusBadge tone="orange">ยังไม่ถูกสร้าง</StatusBadge>
          </div>
        ))}
      </div>
    );
  }

  if (hub.content.length === 0) {
    // Before approval nothing is materialised into the Content module — but the
    // brief's plan exists, and "No content planned" here while Edit Campaign
    // shows three items reads as data loss. Show the plan, labelled as a plan.
    //
    // Only BEFORE approval, though. Once a campaign has been approved its posts
    // are real, and an empty list means they were deleted. Falling back to the
    // brief there redisplayed every deleted post as a plan row, so deleting a
    // post looked like it had not worked ("Content บางอันถูกลบแล้วแต่ยังไม่ลบ
    // ในแคมเปญ"). The plan lives in Edit Campaign; this tab tracks real work.
    const planned = materialised(brief) ? [] : (brief?.content?.filter((ci) => ci.title?.trim()) ?? []);
    if (planned.length) {
      return (
        <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-3 border-b border-line bg-ivory text-[11.5px] text-muted font-semibold">
            📋 แผนจาก Campaign Brief ({planned.length} รายการ) — จะถูกสร้างเป็นโพสต์จริงใน Content Plan เมื่อแคมเปญได้รับอนุมัติ
          </div>
          {planned.map((ci) => (
            <div key={ci.id} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold truncate">{ci.title}</div>
                <div className="text-[11px] text-faint">{ci.type} · {ci.platforms.join(", ") || "—"}{ci.publishDate ? ` · ${fmtDisplay(ci.publishDate)}` : ""}</div>
              </div>
              {ci.requiredVideo && <StatusBadge tone="neutral">🎬 VDO</StatusBadge>}
              {ci.requiredGraphic && <StatusBadge tone="neutral">🎨 Graphic</StatusBadge>}
              <StatusBadge tone="gold">Planned</StatusBadge>
            </div>
          ))}
        </div>
      );
    }
    return <EmptyState title="No content planned" note="Content items linked to this campaign will appear here. Add items in Edit Campaign → Content Plan, or add a post in the Content module." />;
  }
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      {hub.content.map((c) => (
        <div key={c.id} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
          <BrandDot brand={c.b} size={8} />
          <div className="flex-1 min-w-0"><div className="text-[13px] font-bold truncate">{c.title}</div><div className="text-[11px] text-faint">Jul {c.day} · {c.time} · {c.owner}</div></div>
          <StatusBadge tone="neutral">{c.status}</StatusBadge>
          <StatusBadge tone={c.approvalStatus === "Approved" ? "green" : "gold"}>{c.approvalStatus}</StatusBadge>
        </div>
      ))}
    </div>
  );
}

/** Plan (rows from the campaign-scoped `kols` table) and what actually happened
 *  (engagements). The tab used to show only the first, so a finished campaign
 *  reported no reach and no cost even when every post was on record. */
function KolList({ hub, detail }: { hub: CampaignHub | null; detail: CampaignDetail }) {
  const campaignId = detail.row.id;
  const campaignName = detail.row.name;
  const [done, setDone] = useState<CampaignKolRow[]>([]);
  const [loadingDone, setLoadingDone] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingDone(true);
    fetchCampaignKolEngagements(campaignId, campaignName)
      .then((r) => { if (alive) { setDone(r); setLoadingDone(false); } })
      .catch(() => { if (alive) setLoadingDone(false); });
    return () => { alive = false; };
  }, [campaignId, campaignName]);

  if (!hub) return <div className="py-10 text-center text-faint text-[13px]">Loading…</div>;
  if (hub.kols.length === 0 && !done.length && !loadingDone) {
    return <EmptyState title="No KOL assigned" note="Creators linked to this campaign will appear here. Assign them from the KOL module or the Planner tab." />;
  }

  const reach = done.reduce((s, r) => s + (r.actual_reach ?? 0), 0);
  const engage = done.reduce((s, r) => s + (r.actual_engagement ?? 0), 0);
  const cost = done.reduce((s, r) => s + (r.total_cost ?? 0), 0);
  const nameMatched = done.filter((r) => r.matched_by_name).length;

  return (
    <div className="flex flex-col gap-4">
      {done.length > 0 && (
        <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-3 border-b border-line4 flex items-baseline gap-3 flex-wrap">
            <span className="text-[13px] font-bold text-ink">ผลงานจริง</span>
            <span className="text-[11.5px] text-faint">
              {done.length} KOL · reach {fmtFollow(reach)} · engage {fmtFollow(engage)} · จ่าย {baht(cost, { compact: true })}
              {reach > 0 && ` · CPR ฿${(cost / reach).toFixed(3)}`}
            </span>
            {nameMatched > 0 && (
              <span className="ml-auto text-[10.5px] text-faint" title="งานก่อน ก.ค. 69 ไม่มี campaign_id ให้ผูก จับคู่ด้วยชื่อแคมเปญแทน">
                {nameMatched} รายการจับคู่ด้วยชื่อ
              </span>
            )}
          </div>
          {done.map((r) => (
            <Link key={r.collab_id} href={`/kol/${r.kol_id}`}
              className="grid gap-y-1 px-5 py-[10px] items-center border-b border-line4 last:border-0 hover:bg-ivory/50"
              style={{ gridTemplateColumns: "1.7fr 0.7fr 0.9fr 0.9fr 0.9fr 1fr" }}>
              <span className="flex items-center gap-2 min-w-0">
                <BrandDot brand={(r.brand ?? detail.row.b) as never} size={8} />
                <span className="text-[13px] font-bold text-ink truncate">{r.display_name}</span>
              </span>
              <span className="text-[11.5px] text-faint">{r.tier ?? "—"}</span>
              <span className="text-[12px] text-muted text-right">{r.actual_reach ? fmtFollow(r.actual_reach) : "—"}</span>
              <span className="text-[12px] text-muted text-right">{r.actual_engagement ? fmtFollow(r.actual_engagement) : "—"}</span>
              <span className="text-[12px] text-muted text-right">{r.total_cost ? baht(r.total_cost, { compact: true }) : "—"}</span>
              <span className="text-[11.5px] text-right text-faint truncate">{r.status ?? "—"}</span>
            </Link>
          ))}
        </div>
      )}

      {hub.kols.length > 0 && (
        <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="px-5 py-3 border-b border-line4 text-[13px] font-bold text-ink">
            แผน / ดีลในระบบ <span className="text-[11px] text-faint font-normal">· {hub.kols.length} รายการ</span>
          </div>
          {hub.kols.map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
              <BrandDot brand={k.b} size={8} />
              <div className="flex-1 min-w-0"><div className="text-[13px] font-bold truncate">{k.name}</div><div className="text-[11px] text-faint">{k.kolType} · {k.owner}</div></div>
              <StatusBadge tone="gold">{k.status}</StatusBadge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetsList({ hub }: { hub: CampaignHub | null }) {
  if (!hub) return <div className="py-10 text-center text-faint text-[13px]">Loading…</div>;
  if (hub.graphics.length === 0) return <EmptyState title="No assets yet" note="Graphic requests linked to this campaign will appear here. Create them from the Graphic module or the Planner tab." />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {hub.graphics.map((g) => (
        <div key={g.id} className="bg-surface border border-line rounded-cardLg p-4">
          <div className="flex items-center gap-2 mb-1"><BrandDot brand={g.b} size={8} /><span className="text-[13.5px] font-bold truncate">{g.title}</span></div>
          <div className="text-[11.5px] text-faint mb-2">{g.type} · {g.designer} · due {g.due}</div>
          <div className="flex items-center gap-2"><StatusBadge tone="blue">{g.stage}</StatusBadge>{!g.briefComplete && <StatusBadge tone="gold">Brief incomplete</StatusBadge>}</div>
        </div>
      ))}
    </div>
  );
}

const CREATIVE_APPROVED = /Approved|Delivered/i;

function AdsTab({ detail, hub }: { detail: CampaignDetail; hub: CampaignHub | null }) {
  const c = detail.row;
  const adBudget = Math.round(c.budget * EST_AD_BUDGET_SHARE);
  const adSpend = Math.round(c.spend * EST_AD_SPEND_SHARE);
  const adsTasks = hub ? hub.tasks.filter((t) => t.type === "Ads") : [];
  // An ad can only run on an approved creative. Gate on the campaign's graphics.
  const graphics = hub?.graphics ?? [];
  const approvedCreatives = graphics.filter((g) => CREATIVE_APPROVED.test(g.stage));
  const creativeReady = approvedCreatives.length > 0;
  return (
    <div className="flex flex-col gap-4">
      {/* Creative gate — block/warn before ads go live */}
      {adsTasks.length > 0 && (
        creativeReady ? (
          <div className="rounded-card px-4 py-3 flex items-center gap-2 text-[12.5px] font-semibold" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
            ✓ {approvedCreatives.length} approved creative{approvedCreatives.length > 1 ? "s" : ""} ready — ads are cleared to launch.
          </div>
        ) : (
          <div className="rounded-card px-4 py-3 text-[12.5px]" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
            <div className="font-bold mb-[2px]">⚠ No approved creative yet</div>
            <div>Ads can&apos;t launch until at least one graphic for this campaign is Approved. {graphics.length === 0 ? "Create a graphic in the Assets tab." : `${graphics.length} graphic(s) in progress — approve one in the Approval chain.`}</div>
          </div>
        )
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))" }}>
        {[
          { label: "Ads Budget (ประมาณ)", value: baht(adBudget, { compact: true }) },
          { label: "Ads Spent (ประมาณ)", value: baht(adSpend, { compact: true }) },
          { label: "Blended ROAS", value: c.roi ? `${c.roi}×` : "—" },
          { label: "Ad Tasks", value: String(adsTasks.length) },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-card p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold letter-tightest">{k.value}</div>
          </div>
        ))}
      </div>
      <Panel title="Ad Tasks">
        {adsTasks.length === 0 ? <div className="text-[12.5px] text-faint py-3 text-center">No ad tasks yet — generate from the Planner tab.</div> : adsTasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-3 border-b border-line4 last:border-0">
            <span className="text-[15px]">📣</span>
            <div className="flex-1 text-[13px] font-semibold">{t.title}</div>
            {!creativeReady && <StatusBadge tone="red">Creative pending</StatusBadge>}
            <StatusBadge tone="neutral">{t.status}</StatusBadge>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function BudgetTab({ detail, s, brief }: { detail: CampaignDetail; s: HubStats | null; brief?: CampaignBrief | null }) {
  const c = detail.row;
  const requested = s?.expenseTotal ?? 0;
  const [lineOaConfigs, setLineOaConfigs] = useState<LineOaConfig[]>([]);
  const [reachTotal, setReachTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchJsonSetting<LineOaConfig[]>("line_oa_config")
      .then((cfg) => { if (alive) setLineOaConfigs(cfg ?? []); }).catch(() => {});
    fetchResults(c.id)
      .then((rows) => { if (alive) setReachTotal(rows.reduce((n, r) => n + (r.reachActual || 0), 0)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [c.id]);
  const lineMessages = brief?.budget.lineMessages ?? 0;
  const lineCfg = lineConfigFor(c.b, lineOaConfigs);
  const lineNotional = notionalCost(lineMessages, lineCfg.ratePerMessage);
  const cashCost = s?.approvedTotal ?? 0;
  const effective = effectiveCost(cashCost, lineMessages, lineCfg);
  // Breakdown from the campaign's actual brief allocation; campaigns without a
  // brief only have a total — never a fabricated split.
  const bs = brief ? budgetSummary(brief) : null;
  const lines = bs
    ? [
        { label: "Total Planning Budget", value: baht(Math.max(brief!.budget.total || 0, bs.allocated), { compact: true }) },
        ...bs.byBucket.filter((b) => b.amount > 0).map((b) => ({ label: `${b.label} Budget`, value: baht(b.amount, { compact: true }) })),
      ]
    : detail.budgetLines;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Same money layers as Finance: Plan → Committed (allocated, not yet
            spent) → Requested (pending) → Actual (approved/paid only). */}
        {[
          { label: "Planning Budget", value: baht(c.budget, { compact: true }), pct: 100, color: "#B8945A" },
          { label: "Committed · Allocated", value: baht(c.spend, { compact: true }), pct: c.budget ? Math.round((c.spend / c.budget) * 100) : 0, color: "#6C5CE7" },
          { label: "Requested", value: baht(requested, { compact: true }), pct: c.budget ? Math.round((requested / c.budget) * 100) : 0, color: "#3E5C9A" },
          { label: "Actual Spend", value: baht(s?.approvedTotal ?? 0, { compact: true }), pct: c.budget ? Math.round(((s?.approvedTotal ?? 0) / c.budget) * 100) : 0, color: (s?.approvedTotal ?? 0) > c.budget ? "#B33A2E" : "#4E7A4E" },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-card p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold letter-tightest mb-3" style={{ color: k.color }}>{k.value}</div>
            <Progress value={k.pct} color={k.color} />
          </div>
        ))}
      </div>
      {/* A LINE broadcast inside the monthly allowance leaves the bank almost
          untouched while still consuming a finite, shared resource. Showing the
          two side by side rather than replacing the cash figure: people are
          already quoting the cash number, and silently redefining it would make
          old reports disagree with new ones for no visible reason. */}
      {lineMessages > 0 && (
        <div className="rounded-cardLg border px-5 py-4" style={{ background: "#F4F6FA", border: "1px solid #D5DEEF" }}>
          <div className="text-[12.5px] font-bold text-ink mb-2">
            LINE broadcast · {num(lineMessages)} ข้อความ
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold">จ่ายจริง</div>
              <div className="text-[17px] font-extrabold text-ink">{baht(cashCost)}</div>
              <div className="text-[10.5px] text-faint">เงินที่ออกจากบัญชี</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold">ต้นทุนเสมือน</div>
              <div className="text-[17px] font-extrabold" style={{ color: "#3E5C9A" }}>{baht(lineNotional)}</div>
              <div className="text-[10.5px] text-faint">{num(lineMessages)} × ฿{lineCfg.ratePerMessage}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold">ต้นทุนสำหรับวัดผล</div>
              <div className="text-[17px] font-extrabold" style={{ color: "#3E5C9A" }}>{baht(effective)}</div>
              <div className="text-[10.5px] text-faint">ใช้เทียบกับแคมเปญอื่น</div>
            </div>
            {reachTotal > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold">Cost / reach</div>
                <div className="text-[17px] font-extrabold" style={{ color: "#3E5C9A" }}>{cpr(effective / reachTotal)}</div>
                <div className="text-[10.5px] text-faint">จ่ายจริงคิดได้ {cpr(cashCost / reachTotal)} — เทียบกับใครไม่ได้</div>
              </div>
            )}
          </div>
        </div>
      )}

      <Panel title="Planning Budget Breakdown">
        {lines.map((b) => (
          <div key={b.label} className="flex items-center justify-between py-[10px] border-b border-line4 last:border-0">
            <span className="text-[13px] text-ink">{b.label}</span>
            <span className="text-[13px] font-semibold text-ink">{b.value}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

const BRIEF_TONE: Record<string, "neutral" | "gold" | "green" | "orange" | "blue"> = {
  Draft: "neutral", "Ready for Review": "blue", "Waiting for Approval": "gold",
  Approved: "green", "Need Revision": "orange", "In Progress": "blue", Completed: "green",
};

function ApprovalTab({ detail, brief, onBriefChange }: { detail: CampaignDetail; brief?: CampaignBrief | null; onBriefChange?: (b: CampaignBrief) => void }) {
  const { member, user, role } = useAuth();
  // RBAC round 2: any Editor could press Approve here — the gate was only the
  // STATUS. Deciding on a brief (approve / send back / start / complete) is the
  // CMO's, same as every other status move. Submitting FOR approval stays open:
  // that's how a planner asks.
  const isCmo = role === "CMO";
  const reviewer = member?.name ?? user?.email ?? "CMO";
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState("");
  // Real approver names from Settings for the fallback chain (no hardcoded people).
  // The brand lead is resolved for THIS campaign's brand — the old `find()` took
  // whichever member held Marketing Manager / BGL first by email, so a brand with
  // no manager of its own (Omakase Don) borrowed another brand's. null = nobody
  // scoped to the brand, and the row is dropped rather than filled with "—".
  const [brandLead, setBrandLead] = useState<string | null>(null);
  const [cmoName, setCmoName] = useState("CMO");
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMembers(), fetchBrandConfigs().catch(() => [] as BrandCfg[])]).then(([ms, configs]) => {
      if (!alive) return;
      const cmo = ms.find((m) => /cmo/i.test(m.role) || m.access === "Admin");
      setBrandLead(resolveBrandLead(detail.row.b, ms, configs.length ? configs : undefined));
      if (cmo) setCmoName(cmo.name);
    }).catch(() => {});
    return () => { alive = false; };
  }, [detail.row.b]);

  // Only campaigns created through the Brief builder carry a brief; older ones
  // fall back to the static chain view below.
  if (!brief) {
    const chain = [
      { role: "Marketing Executive", person: detail.row.owner, status: "Submitted", tone: "green" as const },
      // Same rule as the graphic ladder: no brand lead, or the lead is the person
      // who submitted it, and the step is not a step — it goes straight to CMO.
      ...(brandLead && !sameName(brandLead, detail.row.owner)
        ? [{ role: "Brand lead", person: brandLead, status: "Reviewed", tone: "green" as const }]
        : []),
      { role: "CMO", person: cmoName, status: detail.row.nextApproval === "CMO" ? "Pending" : "Approved", tone: detail.row.nextApproval === "CMO" ? "gold" as const : "green" as const },
    ];
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-cardLg px-5 py-4" style={{ background: detail.row.nextApproval === "None" ? "#EEF4EE" : "#FBF8EE" }}>
          <div className="text-[13px] font-bold" style={{ color: detail.row.nextApproval === "None" ? "#4E7A4E" : "#C68A1E" }}>
            {detail.row.nextApproval === "None" ? "✓ Fully approved" : `Waiting for ${detail.row.nextApproval} approval`}
          </div>
        </div>
        <Panel title="Approval Chain">
          <div className="flex flex-col gap-3">
            {chain.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-line4 last:border-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: s.tone === "green" ? "#4E7A4E" : "#C68A1E" }}>{i + 1}</div>
                <div className="flex-1"><div className="text-[13px] font-bold text-ink">{s.role}</div><div className="text-[11.5px] text-faint">{s.person}</div></div>
                <StatusBadge tone={s.tone}>{s.status}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  const status = brief.status;
  const act = async (nextStatus: string, action: string, comment?: string) => {
    setBusy(true);
    const entry = { action, by: reviewer, at: new Date().toISOString(), comment, from: status, to: nextStatus };
    // The brief as the DATABASE now holds it (fresh fetch + this entry), not this
    // component's copy — persisting the local copy verbatim has silently erased
    // approval-log entries other buttons or people wrote in the meantime. Null =
    // the campaign is already in that status: whichever click got there first
    // owns the follow-through, so this one stops instead of double-running the
    // fan-out. Without a database (demo) there is nobody to race — local is truth.
    let fresh: CampaignBrief | null = null;
    try {
      fresh = (await logBriefApproval(brief.id, entry, nextStatus))
        ?? (supabase() ? null : { ...brief, status: nextStatus as CampaignBrief["status"], approvalLog: [...(brief.approvalLog ?? []), entry] });
      if (fresh) onBriefChange?.(fresh);
    } finally { setBusy(false); }
    if (!fresh) {
      toastError(`แคมเปญนี้เป็นสถานะ "${nextStatus}" อยู่แล้ว — ไม่ได้ทำซ้ำ (refresh เพื่อดูข้อมูลล่าสุด)`);
      return;
    }
    // Approval-flow steps ping the team on LINE/email.
    if (nextStatus === "Waiting for Approval") notify("approval", `🎯 แคมเปญรออนุมัติ: ${brief.name}`, `โดย ${reviewer} → รอ ${brief.approver || DEFAULT_APPROVER}`, workLink.campaign(detail.row.id, "approval"), { to: [brief.approver || DEFAULT_APPROVER] });
    else if (nextStatus === "Approved") {
      // CMO approval is the gate: only now do content posts, graphic requests,
      // KOL rows and tasks materialise into their modules (idempotent).
      await materialiseApproved(detail.row, fresh, reviewer);
    }
    else if (nextStatus === "Need Revision") {
      // Bounce the whole campaign back to the planner's My Tasks to fix + resubmit.
      const planner = brief.plannerOwner || detail.row.owner;
      if (planner && planner !== "Unassigned") {
        await createRevisionTask({
          module: "Campaign", title: `แก้แคมเปญ — ${brief.name}`, assignee: planner,
          brand: brandName(brief.b), campaign: brief.name, reason: comment ?? "ขอให้แก้ก่อนอนุมัติ",
          by: reviewer, relatedBrief: brief.id, dueDays: 2,
        }).catch((error) => toastError(`สร้าง task แก้แคมเปญไม่สำเร็จ: ${error?.message || "Unknown error"}`));
      }
      notify("rejected", `↩️ แคมเปญถูกส่งกลับแก้: ${brief.name}`, `${comment ?? ""} — ถึง ${planner} · โดย ${reviewer}`, workLink.campaign(detail.row.id), { to: [planner] });
    }
  };
  const doRevision = () => {
    const r = reason.trim(); if (!r) return;
    act("Need Revision", "Requested revision", r);
    setReason(""); setRevising(false);
  };

  const canSubmit = status === "Draft" || status === "Need Revision" || status === "Ready for Review";
  const canApprove = status === "Waiting for Approval" && isCmo;
  const canStart = status === "Approved" && isCmo;
  const canComplete = status === "In Progress" && isCmo;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-cardLg px-5 py-4 flex items-center justify-between gap-3" style={{ background: "#FBF9F4" }}>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-faint mb-1">Campaign Brief Status</div>
          <StatusBadge tone={BRIEF_TONE[status] ?? "neutral"}>{status}</StatusBadge>
        </div>
        <div className="text-[11.5px] text-faint text-right">Planner {brief.plannerOwner || "—"}<br />Approver {brief.approver || "—"}</div>
      </div>

      {/* Actions */}
      {revising ? (
        <Panel title="Request Revision">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder="ต้องแก้อะไรก่อนอนุมัติ?"
            className="w-full text-[13px] px-[13px] py-[10px] rounded-[10px] border-[1.5px] border-line2 bg-ivory outline-none resize-none" />
          <div className="flex gap-2 mt-2">
            <button onClick={doRevision} disabled={!reason.trim() || busy} className="text-[13px] font-bold text-white rounded-[10px] px-4 py-[9px] disabled:opacity-40" style={{ background: "#C67A28" }}>Send Revision Request</button>
            <button onClick={() => { setRevising(false); setReason(""); }} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4 py-[9px]">Cancel</button>
          </div>
        </Panel>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {canSubmit && <button onClick={() => act("Waiting for Approval", "Submitted for approval")} disabled={busy} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[9px] disabled:opacity-40">Submit for Approval</button>}
          {canApprove && <button onClick={() => act("Approved", "Approved")} disabled={busy} className="text-[13px] font-bold text-white rounded-[10px] px-5 py-[9px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>✓ Approve</button>}
          {canApprove && <button onClick={() => setRevising(true)} disabled={busy} className="text-[13px] font-bold rounded-[10px] px-5 py-[9px] border-[1.5px] border-line2 text-status-orange disabled:opacity-40">↩ Request Revision</button>}
          {canStart && <button onClick={() => act("In Progress", "Moved to In Progress")} disabled={busy} className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[9px] disabled:opacity-40">Mark In Progress</button>}
          {canComplete && <button onClick={() => act("Completed", "Marked completed")} disabled={busy} className="text-[13px] font-bold text-white rounded-[10px] px-5 py-[9px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>Mark Completed</button>}
          {!isCmo && status === "Waiting for Approval" && (
            <span className="text-[12px] text-faint self-center" title="เฉพาะ CMO เท่านั้นที่อนุมัติ/ส่งกลับแก้ได้">
              รอ {brief.approver || DEFAULT_APPROVER} อนุมัติ — เฉพาะ CMO เท่านั้น
            </span>
          )}
        </div>
      )}

      {/* Approval log */}
      <Panel title="Approval Log">
        {(!brief.approvalLog || brief.approvalLog.length === 0) ? (
          <div className="text-[12.5px] text-faint py-2">ยังไม่มีประวัติ — เริ่มจากกด Submit for Approval</div>
        ) : (
          <div className="flex flex-col gap-2">
            {brief.approvalLog.slice().reverse().map((e, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-line4 last:border-0">
                <div className="w-2 h-2 rounded-full mt-[6px] flex-shrink-0" style={{ background: /revision/i.test(e.action) ? "#C67A28" : /approv/i.test(e.action) ? "#4E7A4E" : "#9A9387" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-bold text-ink">{e.action}{e.from && e.to ? <span className="text-faint font-normal"> · {e.from} → {e.to}</span> : null}</div>
                  {e.comment && <div className="text-[12px] text-muted mt-[1px]">“{e.comment}”</div>}
                  <div className="text-[11px] text-faint mt-[1px]">{e.by} · {new Date(e.at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// Result / Report — same editable ad-result table as Platform Performance,
// backed by the SAME campaign_results rows, so numbers stay in sync both ways.
function ResultTab({ detail }: { detail: CampaignDetail }) {
  const campaignId = detail.row.id;
  const [rows, setRows] = useState<CampaignResultRow[]>([]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load ONCE per campaign. This effect used to depend on `detail.row` — a NEW
  // object every time the parent refetched (which it does 2-3× while the page
  // settles), and each run setRows() over the table, WIPING a row the user had
  // just added or numbers they had just typed. That is the "กดเพิ่มแถวแล้วหาย /
  // กรอกแล้วเด้งกลับเป็น 0" the QA kept hitting: not a save failure — the reload
  // ate the edits before Save was ever pressed.
  const loadedFor = useRef<string | null>(null);
  // Ref mirror of `dirty` so the loader below can read it without re-running.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (loadedFor.current === campaignId) return;
    let alive = true;
    // Merge planned Ads/KOL allocation rows (with KOL actuals) so this tab shows
    // exactly what Platform Performance shows for the campaign — same rows, synced.
    Promise.all([fetchResults(campaignId), fetchAllBriefs(), fetchKols()]).then(([real, briefMap, kols]) => {
      if (!alive) return;
      loadedFor.current = campaignId;
      const brief = briefMap[detail.row.name];
      const merged = brief
        ? mergeBudgetAllocationRows(real, [detail.row], { [detail.row.name]: brief }, kols.filter((k) => k.campaignId === campaignId))
        : real;
      // Belt-and-braces: never clobber rows the user already touched.
      setRows((prev) => {
        const touched = prev.filter((r) => dirtyRef.current.has(r.id));
        const touchedIds = new Set(touched.map((r) => r.id));
        return [...merged.filter((m) => !touchedIds.has(m.id)), ...touched];
      });
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const patch = (id: string, key: keyof CampaignResultRow, value: number) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const addRow = () => {
    const row = { ...emptyResultRow(campaignId, rows.length + 1), ad: "" };
    setRows((rs) => [...rs, row]);
    setDirty((d) => new Set(d).add(row.id));
  };
  const save = async () => {
    if (!dirty.size) return;
    setSaving(true);
    try {
      await saveResults(rows.filter((r) => dirty.has(r.id)));
      setDirty(new Set());
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toastError(`บันทึกผลไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally { setSaving(false); }
  };

  const cell = "px-[9px] py-[6px] border-b border-line4";
  const setAd = (id: string, ad: string) => {
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ad } : x)));
    setDirty((s) => new Set(s).add(id));
  };
  // Plain render helper (not a component) so inputs never remount mid-typing.
  const editCell = (id: string, k: keyof CampaignResultRow, v: number) => (
    <td className="px-[9px] py-[5px] text-right">
      <input type="number" min={0} value={v || ""} placeholder="0" onChange={(e) => patch(id, k, Number(e.target.value) || 0)}
        className="w-[74px] text-right bg-white outline-none rounded-[6px] px-[6px] py-[3px] border border-line2 text-ink focus:border-accent" />
    </td>
  );

  if (loading) return <div className="text-[13px] text-faint py-8 text-center">กำลังโหลดผล…</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[12.5px] text-faint">
          รูปแบบเดียวกับ Platform Performance — กรอก Reach / Budget / Conv. / Marketing Visit แล้ว sync ข้อมูลกัน
        </div>
        <div className="flex items-center gap-2">
          {dirty.size > 0 && <span className="text-[12px] text-status-orange font-bold">แก้ไข {dirty.size} แถว</span>}
          <button onClick={save} disabled={saving || !dirty.size}
            className="text-[12.5px] font-bold text-white rounded-[10px] px-4 py-[8px] disabled:opacity-40" style={{ background: "#211F1C" }}>
            {saved ? "บันทึกแล้ว ✓" : saving ? "กำลังบันทึก…" : "บันทึกผล"}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-10 text-center">
          <div>
            <div className="text-[14px] font-bold text-ink">ยังไม่มีข้อมูลผล</div>
            <div className="text-[12px] text-faint mt-1 max-w-sm mx-auto">เพิ่มแถวผลของ ad ในแคมเปญนี้ — ข้อมูลจะ sync กับหน้า Platform Performance</div>
            <button onClick={addRow} className="mt-4 text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">+ เพิ่มแถวผล</button>
          </div>
        </div>
      ) : (
        <div className="rounded-cardLg border border-line bg-surface overflow-x-auto">
          <table className="w-full text-[11.5px] whitespace-nowrap border-collapse">
            <thead>
              <tr className="text-faint">
                {["Ad", "Target", "Budget", "Reach actual", "Budget actual", "Conv.", "Marketing Visit", "CV%", "CPR act", "% Deliver"].map((h, i) => (
                  <th key={i} className={`font-bold px-[9px] py-2 border-b border-line bg-ivory ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = deriveResultRow(r);
                return (
                  <tr key={r.id} className="border-b border-line4 last:border-0">
                    <td className={`${cell} text-left`}>
                      <input value={r.ad} placeholder="ชื่อ ad / งาน" onChange={(e) => setAd(r.id, e.target.value)}
                        className="w-[150px] bg-white outline-none rounded-[6px] px-[6px] py-[3px] border border-line2 text-ink focus:border-accent" />
                    </td>
                    <td className={`${cell} text-right text-muted`}>{num(r.target)}</td>
                    <td className={`${cell} text-right text-muted`}>{baht(r.budget, { compact: true })}</td>
                    {editCell(r.id, "reachActual", r.reachActual)}
                    {editCell(r.id, "budgetActual", r.budgetActual)}
                    {editCell(r.id, "conversions", r.conversions)}
                    {editCell(r.id, "marketingVisits", r.marketingVisits || 0)}
                    <td className={`${cell} text-right font-bold text-ink`}>{d.cvActual != null ? pct(d.cvActual * 100) : "—"}</td>
                    <td className={`${cell} text-right font-bold text-ink`}>{cpr(d.cprActual)}</td>
                    <td className={`${cell} text-right text-muted`}>{d.pctReach != null ? pct(d.pctReach * 100) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-line4">
            <button onClick={addRow} className="text-[11.5px] font-bold text-accent">+ เพิ่มแถวผล</button>
          </div>
        </div>
      )}
      <div className="text-[11px] text-faint px-1">CV% = Marketing Visit ÷ Reach · แก้ที่นี่หรือที่ Platform Performance ก็ sync กัน (ตาราง campaign_results เดียวกัน)</div>
    </div>
  );
}
