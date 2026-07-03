"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CampaignDetail, CAMPAIGN_TABS, CAMPAIGN_TAB_LABELS, CampaignTab } from "@/lib/data/campaigns";
import { campaignTone } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { baht } from "@/lib/format";

export function CampaignDetailView({ detail }: { detail: CampaignDetail }) {
  const [tab, setTab] = useState<CampaignTab>("overview");
  const c = detail.row;

  return (
    <>
      {/* Back */}
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
          <StatusBadge tone={detail.hasResult ? "green" : "gold"}>
            {detail.hasResult ? "✓ Ready" : "⚠ Needs attention"}
          </StatusBadge>
        </div>
      </div>

      {/* Management summary strip */}
      <div className="mt-4 bg-panel text-white rounded-cardLg px-5 py-4 grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))" }}>
        {[
          { label: "Tasks", value: c.taskTotal, color: "#fff" },
          { label: "Done", value: c.taskDone, color: "#9de09d" },
          { label: "In Progress", value: c.taskInProgress, color: "#9bb8ef" },
          { label: "Blocked", value: c.taskBlocked, color: c.taskBlocked ? "#f0a89f" : "#fff" },
          { label: "Waiting", value: c.taskWaiting, color: "#e8c87d" },
          { label: "Overdue", value: c.taskOverdue, color: c.taskOverdue ? "#f0a89f" : "#fff" },
          { label: "Bottleneck", value: c.bottleneckTeam, color: "#e8c87d", small: true },
          { label: "Next Approval", value: c.nextApproval, color: "#B8945A", small: true },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[9.5px] uppercase tracking-[0.06em] text-white/45 font-bold mb-[5px]">{s.label}</div>
            <div className={`${s.small ? "text-[13px]" : "text-[22px]"} font-extrabold letter-tightest`} style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Needs-result warning */}
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
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-[13px] font-semibold px-[14px] py-[9px] whitespace-nowrap border-b-2 -mb-[2px] transition"
              style={active
                ? { color: "#211F1C", borderColor: "#B8945A" }
                : { color: "#9A9387", borderColor: "transparent" }}
            >
              {CAMPAIGN_TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "overview" && <OverviewTab detail={detail} />}
        {tab === "brief" && <BriefTab detail={detail} />}
        {tab === "planner" && <PlannerTab detail={detail} />}
        {tab === "content" && <EmptyLinked kind="content" />}
        {tab === "kol" && <EmptyLinked kind="kol" />}
        {tab === "ads" && <AdsTab detail={detail} />}
        {tab === "budget" && <BudgetTab detail={detail} />}
        {tab === "assets" && <AssetsTab />}
        {tab === "approval" && <ApprovalTab detail={detail} />}
        {tab === "result" && <ResultTab detail={detail} />}
      </div>
    </>
  );
}

function Panel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-line rounded-cardLg p-5 ${className ?? ""}`}>
      {title && <div className="text-[13px] font-bold mb-3">{title}</div>}
      {children}
    </div>
  );
}

function OverviewTab({ detail }: { detail: CampaignDetail }) {
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
            {detail.readinessItems.map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-[13px] text-ink">{r.label}</span>
                <span className="text-[15px] font-bold" style={{ color: r.color }}>{r.icon}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Where is this campaign stuck?">
          {detail.hasBottlenecks ? (
            <div className="flex flex-col gap-[10px]">
              {detail.bottleneckItems.map((b, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-card bg-ivory border border-line3">
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-ink">{b.team}</div>
                    <div className="text-[11.5px] text-faint">{b.issue}</div>
                  </div>
                  <StatusBadge tone={b.tone}>{b.severity}</StatusBadge>
                </div>
              ))}
              <div className="text-[11.5px] text-muted">Pending approver · <b>{c.nextApproval}</b></div>
            </div>
          ) : (
            <div className="text-[13px] text-faint py-4 text-center">No blockers — this campaign is flowing smoothly. 🌿</div>
          )}
        </Panel>
      </div>

      {/* Channel coverage */}
      <Panel title="Channel Coverage">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Online", items: detail.channelOnline },
            { title: "Offline", items: detail.channelOffline },
            { title: "Support", items: detail.channelSupport },
          ].map((col) => (
            <div key={col.title}>
              <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-2">{col.title}</div>
              <div className="flex flex-col gap-2">
                {col.items.map((ch) => (
                  <div key={ch.name} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-[7px] flex items-center justify-center text-[10px] font-bold" style={{ background: ch.bg, color: ch.fg }}>{ch.icon}</span>
                    <span className="text-[12.5px] text-ink flex-1">{ch.name}</span>
                    <span className="text-[11px] text-faint">{ch.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Linked modules */}
      <Panel title="Linked Modules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {detail.moduleLinks.map((m) => (
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

function BriefTab({ detail }: { detail: CampaignDetail }) {
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

function PlannerTab({ detail }: { detail: CampaignDetail }) {
  const [template, setTemplate] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const draftTasks = [
    { icon: "📝", label: "Content tasks", count: "4 tasks", module: "Content" },
    { icon: "🎨", label: "Graphic tasks", count: "3 tasks", module: "Graphic" },
    { icon: "🤝", label: "KOL tasks", count: "2 tasks", module: "KOL" },
    { icon: "📢", label: "Ads tasks", count: "2 tasks", module: "Ads" },
    { icon: "💰", label: "Budget requests", count: "1 task", module: "Budget" },
    { icon: "📊", label: "Report tasks", count: "1 task", module: "Report" },
  ];
  return (
    <div className="flex flex-col gap-4">
      {/* Dependency timeline */}
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

      {!template ? (
        <Panel title="Choose a Campaign Template">
          <div className="text-[12px] text-faint mb-4">Pick a template to auto-generate draft tasks across Content, Graphic, KOL, Ads, Budget, and Report — all sharing this campaign_id.</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button key={t} onClick={() => setTemplate(t)}
                className="text-left p-4 rounded-card border border-line2 bg-ivory hover:border-accent hover:bg-accent-soft transition">
                <div className="text-[13.5px] font-bold text-ink">{t}</div>
                <div className="text-[11px] text-faint mt-1">Generates ~13 draft tasks</div>
              </button>
            ))}
          </div>
        </Panel>
      ) : (
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => { setTemplate(null); setConfirmed(false); }} className="text-[12px] text-faint hover:text-ink font-semibold">← Change Template</button>
              <span className="text-[13px] font-bold">{template}</span>
            </div>
            {confirmed
              ? <StatusBadge tone="green">✓ Tasks created</StatusBadge>
              : <button onClick={() => setConfirmed(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">Confirm &amp; Create Tasks</button>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {draftTasks.map((t) => (
              <div key={t.module} className="p-4 rounded-card border border-line3 bg-ivory">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[16px]">{t.icon}</span>
                  <span className="text-[12.5px] font-bold text-ink">{t.module}</span>
                </div>
                <div className="text-[11.5px] text-muted">{t.count}</div>
                <StatusBadge tone={confirmed ? "green" : "neutral"} className="mt-2">{confirmed ? "Live" : "Draft"}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function AdsTab({ detail }: { detail: CampaignDetail }) {
  const c = detail.row;
  const adBudget = Math.round(c.budget * 0.4);
  const adSpend = Math.round(c.spend * 0.55);
  const channels = [
    { name: "Meta Ads", budget: Math.round(adBudget * 0.5), spent: Math.round(adSpend * 0.5), roas: c.roi ? (c.roi * 1.1).toFixed(1) : "—" },
    { name: "Google Ads", budget: Math.round(adBudget * 0.3), spent: Math.round(adSpend * 0.3), roas: c.roi ? (c.roi * 0.8).toFixed(1) : "—" },
    { name: "LINE Ads", budget: Math.round(adBudget * 0.2), spent: Math.round(adSpend * 0.2), roas: c.roi ? (c.roi * 0.9).toFixed(1) : "—" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))" }}>
        {[
          { label: "Ads Budget", value: baht(adBudget, { compact: true }) },
          { label: "Ads Spent", value: baht(adSpend, { compact: true }) },
          { label: "Blended ROAS", value: c.roi ? `${c.roi}×` : "—" },
          { label: "Channels", value: String(channels.length) },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-card p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold letter-tightest">{k.value}</div>
          </div>
        ))}
      </div>
      <Panel title="Ad Channels">
        <div className="grid grid-cols-[2fr_1fr_1fr_0.8fr] px-2 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4">
          <div>Channel</div><div>Budget</div><div>Spent</div><div>ROAS</div>
        </div>
        {channels.map((ch) => (
          <div key={ch.name} className="grid grid-cols-[2fr_1fr_1fr_0.8fr] px-2 py-3 items-center border-b border-line4 last:border-0">
            <div className="text-[13px] font-semibold text-ink">{ch.name}</div>
            <div className="text-[13px] text-muted">{baht(ch.budget, { compact: true })}</div>
            <div className="text-[13px] text-muted">{baht(ch.spent, { compact: true })}</div>
            <div className="text-[13px] font-bold text-status-green">{ch.roas}×</div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function BudgetTab({ detail }: { detail: CampaignDetail }) {
  const c = detail.row;
  const planning = c.budget;
  const approved = Math.round(c.budget * 0.9);
  const actual = c.spend;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Planning Budget", value: baht(planning, { compact: true }), pct: 100, color: "#B8945A" },
          { label: "Approved Budget", value: baht(approved, { compact: true }), pct: 90, color: "#3E5C9A" },
          { label: "Actual Spend", value: baht(actual, { compact: true }), pct: planning ? Math.round((actual / planning) * 100) : 0, color: actual > approved ? "#B33A2E" : "#4E7A4E" },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-card p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold letter-tightest mb-3" style={{ color: k.color }}>{k.value}</div>
            <Progress value={k.pct} color={k.color} />
          </div>
        ))}
      </div>
      <Panel title="Planning Budget Breakdown">
        {detail.budgetLines.map((b) => (
          <div key={b.label} className="flex items-center justify-between py-[10px] border-b border-line4 last:border-0">
            <span className="text-[13px] text-ink">{b.label}</span>
            <span className="text-[13px] font-semibold text-ink">{b.value}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function AssetsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {["Key Visual V2", "Reel Cover", "Menu Board"].map((a) => (
        <div key={a} className="bg-surface border border-line rounded-cardLg overflow-hidden">
          <div className="h-32 flex items-center justify-center"
            style={{ background: "repeating-linear-gradient(45deg,#F4EFE5,#F4EFE5 10px,#EFE9DC 10px,#EFE9DC 20px)" }}>
            <span className="text-[11px] font-mono text-faint">artwork preview</span>
          </div>
          <div className="p-3">
            <div className="text-[13px] font-bold text-ink">{a}</div>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge tone="green">Approved</StatusBadge>
              <span className="text-[11px] text-accent font-semibold cursor-pointer">Drive ↗</span>
              <span className="text-[11px] text-accent font-semibold cursor-pointer">Canva ↗</span>
            </div>
          </div>
        </div>
      ))}
      <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-[13px] font-bold text-faint">Drop asset link</div>
          <div className="text-[11px] text-faint mt-1">Google Drive · Canva · final artwork</div>
        </div>
      </div>
    </div>
  );
}

function ApprovalTab({ detail }: { detail: CampaignDetail }) {
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
              <div className="flex-1">
                <div className="text-[13px] font-bold text-ink">{s.role}</div>
                <div className="text-[11.5px] text-faint">{s.person}</div>
              </div>
              <StatusBadge tone={s.tone}>{s.status}</StatusBadge>
            </div>
          ))}
        </div>
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

function EmptyLinked({ kind }: { kind: "content" | "kol" }) {
  const copy = kind === "content"
    ? { title: "No content planned", note: "Content items linked to this campaign_id will appear here. Generate them from the Planner tab." }
    : { title: "No KOL assigned", note: "Creators linked to this campaign_id will appear here. Assign them from the KOL module or the Planner tab." };
  return (
    <div className="border-2 border-dashed border-line2 rounded-cardLg flex items-center justify-center p-12 text-center">
      <div>
        <div className="text-[14px] font-bold text-ink">{copy.title}</div>
        <div className="text-[12px] text-faint mt-1 max-w-sm mx-auto">{copy.note}</div>
      </div>
    </div>
  );
}
