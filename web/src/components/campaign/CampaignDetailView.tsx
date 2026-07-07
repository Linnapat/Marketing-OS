"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CampaignDetail, CAMPAIGN_TABS, CAMPAIGN_TAB_LABELS, CampaignTab } from "@/lib/data/campaigns";
import { campaignTone } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { Progress } from "@/components/ui/Progress";
import { baht } from "@/lib/format";
import { CampaignHub, HubStats, hubStats, createPlannerTasks, createBudgetExpenseDrafts } from "@/lib/db/campaignHub";
import { CampaignBrief, budgetSummary } from "@/lib/data/brief";
import { logBriefApproval } from "@/lib/db/brief";
import { updateCampaignStatus } from "@/lib/db/campaigns";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { fmtDisplay } from "@/components/ui/DatePicker";

export function CampaignDetailView({ detail, hub, onReload, brief, onBriefChange }: { detail: CampaignDetail; hub: CampaignHub | null; onReload: () => void; brief?: CampaignBrief | null; onBriefChange?: (b: CampaignBrief) => void }) {
  const [tab, setTab] = useState<CampaignTab>("overview");
  // Deep-link support: /campaigns/[id]?tab=approval opens that tab (client-only
  // read so the statically-rendered page doesn't need a Suspense boundary).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (CAMPAIGN_TABS as readonly string[]).includes(t)) setTab(t as CampaignTab);
  }, []);
  const c = detail.row;
  const s = hub ? hubStats(hub) : null;
  // Temporary approval action while the Approval Queue module is "SOON": the CMO /
  // Admin (or the named approver) can approve or send back, so campaigns never get
  // stuck permanently in "Waiting for Approval".
  const { role, member } = useAuth();
  const [approving, setApproving] = useState(false);
  const canApprove = role === "CMO / Admin" || role === "Brand Lead" || member?.name === c.nextApproval;
  const decide = async (status: string) => {
    setApproving(true);
    try { await updateCampaignStatus(c.id, status); onReload(); } finally { setApproving(false); }
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
          <div className="flex items-center gap-[10px]">
            <span className="w-[10px] h-[10px] rounded-full" style={{ background: detail.color }} />
            <h1 className="text-[24px] font-extrabold letter-tightest">{c.name}</h1>
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
          <StatusBadge tone={campaignTone(c.status)}>{c.status}</StatusBadge>
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
          { label: "Next Approval", value: c.nextApproval, color: "#B8945A", small: true },
        ].map((x) => (
          <div key={x.label}>
            <div className="text-[9.5px] uppercase tracking-[0.06em] text-white/45 font-bold mb-[5px]">{x.label}</div>
            <div className={`${x.small ? "text-[13px]" : "text-[22px]"} font-extrabold letter-tightest`} style={{ color: x.color }}>{x.value}</div>
          </div>
        ))}
      </div>

      {c.status === "Waiting for Approval" && (
        <div className="mt-4 rounded-card border px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "#FBF8EE", borderColor: "#E8CCA0" }}>
          <span className="text-[18px]">🕓</span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[13px] font-bold" style={{ color: "#8A6D1E" }}>Waiting for Approval · {c.nextApproval}</div>
            <div className="text-[11.5px] text-muted">{canApprove ? "อนุมัติเพื่อเริ่มแคมเปญ หรือส่งกลับให้แก้ไข (Approval Queue module กำลังจะมา)" : "รอผู้อนุมัติดำเนินการ — ระหว่างนี้ยังไม่ค้างถาวร ผู้อนุมัติ/Admin กดได้จากหน้านี้"}</div>
          </div>
          {canApprove && (
            <div className="flex gap-2">
              <button disabled={approving} onClick={() => decide("Draft")} className="text-[12px] font-semibold text-muted border border-line2 rounded-[8px] px-3 py-[7px] bg-surface disabled:opacity-40">↩ Send back to Draft</button>
              <button disabled={approving} onClick={() => decide("Active")} className="text-[12px] font-bold text-white rounded-[8px] px-4 py-[7px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>{approving ? "…" : "✓ Approve & Activate"}</button>
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
        {tab === "overview" && <OverviewTab detail={detail} hub={hub} s={s} />}
        {tab === "brief" && <BriefTab detail={detail} brief={brief} />}
        {tab === "planner" && <PlannerTab detail={detail} hub={hub} onReload={onReload} />}
        {tab === "content" && <ContentList hub={hub} />}
        {tab === "kol" && <KolList hub={hub} />}
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

function OverviewTab({ detail, hub, s }: { detail: CampaignDetail; hub: CampaignHub | null; s: HubStats | null }) {
  const c = detail.row;
  const kpis = [
    { label: "Budget", value: detail.budgetF },
    { label: "Spend", value: detail.spendF },
    { label: "Revenue", value: detail.revenue },
    { label: "Gross Profit", value: c.roi ? baht(Math.round(c.spend * c.roi * 0.38), { compact: true }) : "—" },
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
              <div className="text-[11.5px] text-muted">Pending approver · <b>{c.nextApproval}</b></div>
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

const TEMPLATES = ["Lunch Awareness", "New Menu Launch", "Anniversary Event", "LINE Coupon", "Grand Opening", "CRM Repeater"];
const TIMELINE = ["Brief", "Content", "Graphic", "KOL", "Ads", "Approval", "Launch", "Result"];

function PlannerTab({ detail, hub, onReload }: { detail: CampaignDetail; hub: CampaignHub | null; onReload: () => void }) {
  const [template, setTemplate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = (hub?.content.length ?? 0) + (hub?.graphics.length ?? 0) + (hub?.kols.length ?? 0) > 0;

  const draftTasks = [
    { icon: "📝", label: "Content tasks", count: "4 tasks", module: "Content" },
    { icon: "🎨", label: "Graphic tasks", count: "3 tasks", module: "Graphic" },
    { icon: "🤝", label: "KOL tasks", count: "2 tasks", module: "KOL" },
    { icon: "📢", label: "Ads tasks", count: "2 tasks", module: "Ads" },
    { icon: "💰", label: "Budget requests", count: "1 task", module: "Budget" },
    { icon: "📊", label: "Report tasks", count: "1 task", module: "Report" },
  ];

  const confirm = async () => {
    setBusy(true);
    try { await createPlannerTasks(detail.row); onReload(); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Dependency Timeline">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {TIMELINE.map((step, i) => (
            <div key={step} className="flex items-center gap-1 flex-shrink-0">
              <div className="flex flex-col items-center gap-[6px]">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                  style={{ background: i < 3 ? "#4E7A4E" : i === 3 ? "#211F1C" : "#E5DECF", color: i <= 3 ? "#fff" : "#9A9387" }}>{i + 1}</div>
                <span className="text-[10.5px] font-semibold whitespace-nowrap" style={{ color: i === 3 ? "#211F1C" : i < 3 ? "#4E7A4E" : "#9A9387" }}>{step}</span>
              </div>
              {i < TIMELINE.length - 1 && <div className="w-8 h-[2px] mb-4" style={{ background: i < 3 ? "#4E7A4E" : "#E5DECF" }} />}
            </div>
          ))}
        </div>
      </Panel>

      {created && (
        <div className="rounded-card px-4 py-3 flex items-center gap-2 text-[12.5px] font-semibold" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
          ✓ Tasks are live for this campaign — see the Content, KOL, Assets, and Budget tabs.
        </div>
      )}

      {!template ? (
        <Panel title="Choose a Campaign Template">
          <div className="text-[12px] text-faint mb-4">Pick a template to auto-generate real tasks across Content, Graphic, KOL, Ads, Budget, and Report — all linked to this campaign.</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button key={t} onClick={() => setTemplate(t)} className="text-left p-4 rounded-card border border-line2 bg-ivory hover:border-accent transition">
                <div className="text-[13.5px] font-bold text-ink">{t}</div>
                <div className="text-[11px] text-faint mt-1">Generates ~13 tasks</div>
              </button>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setTemplate(null)} className="text-[12px] text-faint hover:text-ink font-semibold">← Change Template</button>
              <span className="text-[13px] font-bold">{template}</span>
            </div>
            <button onClick={confirm} disabled={busy} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px] disabled:opacity-50">
              {busy ? "Creating…" : "Confirm & Create Tasks"}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {draftTasks.map((t) => (
              <div key={t.module} className="p-4 rounded-card border border-line3 bg-ivory">
                <div className="flex items-center gap-2 mb-2"><span className="text-[16px]">{t.icon}</span><span className="text-[12.5px] font-bold text-ink">{t.module}</span></div>
                <div className="text-[11.5px] text-muted">{t.count}</div>
                <StatusBadge tone={created ? "green" : "neutral"} className="mt-2">{created ? "Live" : "Draft"}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      )}
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

function ContentList({ hub }: { hub: CampaignHub | null }) {
  if (!hub) return <div className="py-10 text-center text-faint text-[13px]">Loading…</div>;
  if (hub.content.length === 0) return <EmptyState title="No content planned" note="Content items linked to this campaign will appear here. Generate them from the Planner tab or add a post in the Content module." />;
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

function KolList({ hub }: { hub: CampaignHub | null }) {
  if (!hub) return <div className="py-10 text-center text-faint text-[13px]">Loading…</div>;
  if (hub.kols.length === 0) return <EmptyState title="No KOL assigned" note="Creators linked to this campaign will appear here. Assign them from the KOL module or the Planner tab." />;
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      {hub.kols.map((k) => (
        <div key={k.id} className="flex items-center gap-3 px-5 py-3 border-b border-line4 last:border-0">
          <BrandDot brand={k.b} size={8} />
          <div className="flex-1 min-w-0"><div className="text-[13px] font-bold truncate">{k.name}</div><div className="text-[11px] text-faint">{k.kolType} · {k.owner}</div></div>
          <StatusBadge tone="gold">{k.status}</StatusBadge>
        </div>
      ))}
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
  const adBudget = Math.round(c.budget * 0.4);
  const adSpend = Math.round(c.spend * 0.55);
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
          { label: "Ads Budget", value: baht(adBudget, { compact: true }) },
          { label: "Ads Spent", value: baht(adSpend, { compact: true }) },
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Planning Budget", value: baht(c.budget, { compact: true }), pct: 100, color: "#B8945A" },
          { label: "Requested", value: baht(requested, { compact: true }), pct: c.budget ? Math.round((requested / c.budget) * 100) : 0, color: "#3E5C9A" },
          { label: "Actual Spend", value: baht(c.spend, { compact: true }), pct: c.budget ? Math.round((c.spend / c.budget) * 100) : 0, color: c.spend > c.budget ? "#B33A2E" : "#4E7A4E" },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-card p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold letter-tightest mb-3" style={{ color: k.color }}>{k.value}</div>
            <Progress value={k.pct} color={k.color} />
          </div>
        ))}
      </div>
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
  const { member, user } = useAuth();
  const reviewer = member?.name ?? user?.email ?? "CMO";
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [reason, setReason] = useState("");

  // Only campaigns created through the Brief builder carry a brief; older ones
  // fall back to the static chain view below.
  if (!brief) {
    const chain = [
      { role: "Planner", person: detail.row.owner, status: "Submitted", tone: "green" as const },
      { role: "Brand Lead", person: "Mei T.", status: "Reviewed", tone: "green" as const },
      { role: "CMO", person: "Linnapat D.", status: detail.row.nextApproval === "CMO" ? "Pending" : "Approved", tone: detail.row.nextApproval === "CMO" ? "gold" as const : "green" as const },
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
    const next: CampaignBrief = { ...brief, status: nextStatus as CampaignBrief["status"], approvalLog: [...(brief.approvalLog ?? []), entry] };
    try { await logBriefApproval(brief.id, entry, nextStatus); onBriefChange?.(next); } finally { setBusy(false); }
    // Approval-flow steps ping the team on LINE/email.
    if (nextStatus === "Waiting for Approval") notify("approval", `🎯 แคมเปญรออนุมัติ: ${brief.name}`, `โดย ${reviewer} → รอ ${brief.approver || "CMO"}`, "/my-tasks");
    else if (nextStatus === "Approved") {
      notify("approved", `✅ แคมเปญอนุมัติแล้ว: ${brief.name}`, `โดย ${reviewer}`, "/campaigns");
      // Approved budget flows straight into Finance as Draft expense requests —
      // one per funded bucket — so the finance team never re-keys the plan.
      const drafts = await createBudgetExpenseDrafts(detail.row, next).catch(() => 0);
      if (drafts > 0) notify("approval", `💰 เปิด Draft เบิกงบ ${drafts} รายการจากงบแคมเปญ: ${brief.name}`, `ตามงบที่อนุมัติ — ตรวจและกดส่งอนุมัติได้ในโมดูล Expenses`, "/expenses");
    }
    else if (nextStatus === "Need Revision") notify("rejected", `↩️ แคมเปญถูกส่งกลับแก้: ${brief.name}`, `${comment ?? ""} — โดย ${reviewer}`, "/campaigns");
  };
  const doRevision = () => {
    const r = reason.trim(); if (!r) return;
    act("Need Revision", "Requested revision", r);
    setReason(""); setRevising(false);
  };

  const canSubmit = status === "Draft" || status === "Need Revision" || status === "Ready for Review";
  const canApprove = status === "Waiting for Approval";
  const canStart = status === "Approved";
  const canComplete = status === "In Progress";

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

function ResultTab({ detail }: { detail: CampaignDetail }) {
  const c = detail.row;
  const results = detail.hasResult ? [
    { label: "Revenue", value: detail.revenue },
    { label: "Visits", value: detail.reach === "—" ? "—" : "2,840" },
    { label: "New Visits", value: "1,120" },
    { label: "Reach", value: detail.reach },
    { label: "ROAS", value: `${c.roi}×` },
    { label: "CPV", value: "฿137" },
  ] : [];
  return detail.hasResult ? (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))" }}>
      {results.map((r) => (
        <div key={r.label} className="bg-surface border border-line rounded-card p-4">
          <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{r.label}</div>
          <div className="text-[20px] font-extrabold letter-tightest">{r.value}</div>
        </div>
      ))}
    </div>
  ) : (
    <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-12 text-center">
      <div>
        <div className="text-[14px] font-bold text-ink">No result data yet</div>
        <div className="text-[12px] text-faint mt-1 max-w-sm mx-auto">Upload post links, revenue, and visit data once the campaign has run to compute ROI and ROAS.</div>
        <button className="mt-4 text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">Upload Result Data</button>
      </div>
    </div>
  );
}
