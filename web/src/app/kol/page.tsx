"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { KolDrawer } from "@/components/kol/KolDrawer";
import { KolItemForm } from "@/components/kol/KolItemForm";
import { SELECT_STYLE } from "@/components/ui/selectStyle";
import { BrandFilterValue, BrandId, brandName, brandColor } from "@/lib/brands";
import { platformIcon, channelUrl } from "@/lib/platforms";
import { kolTone } from "@/lib/status";
import { baht } from "@/lib/format";
import {
  KOLS, ALL_STAGES, SPECIALISTS, Kol, KolPost, initials, fmtFollow,
  kolKpis, kolAlerts, stageProgress, normalizeStage, kolPosts, postsTotals,
} from "@/lib/data/kol";
import { fetchKols, createKolIfNew, buildKol, updateKol } from "@/lib/db/kol";
import { resolveKolAssignment } from "@/lib/db/assignments";
import { searchKolProfiles, ensureKolProfile, KolMasterRow } from "@/lib/db/kolMaster";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { appendBriefKolItem, syncBriefKolFromRows } from "@/lib/db/brief";
import { createTaskDb } from "@/lib/db/tasks";
import { Task } from "@/lib/data/tasks";
import { CampaignRow } from "@/lib/data/campaigns";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { DateFilterBar, DEFAULT_DATE_FILTER, inDateFilter } from "@/components/ui/DateFilterBar";
import { BriefKolItem, emptyKolItem, fmtPct } from "@/lib/data/brief";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelDate(iso: string): string { if (!iso) return "TBD"; const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : "TBD"; }
/** ISO date n days from today — used for the ≤3-day approval due date. */
function plusDaysIso(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
/** Stages where the specialist can still submit work from the row. */
const TABS = [["list", "KOL / Creator Request List"], ["pipeline", "Status"], ["plan", "KOL Plan"], ["performance", "Performance"], ["database", "KOL Library"]] as const;
type Tab = (typeof TABS)[number][0];

export default function KolPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [campaign, setCampaign] = useState<string>("all");
  const [drawer, setDrawer] = useState<{ kol: Kol; tab: "profile" | "comments" } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [kols, setKols] = useState<Kol[]>(KOLS);

  useEffect(() => {
    let alive = true;
    fetchKols().then((k) => { if (alive) setKols(k); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Campaign filter options follow the brand filter; reset when out of range.
  const campaignOptions = useMemo(
    () => Array.from(new Set(kols.filter((k) => brand === "all" || k.b === brand).map((k) => k.campaign).filter((c) => c && c !== "—"))).sort(),
    [kols, brand],
  );
  useEffect(() => { if (campaign !== "all" && !campaignOptions.includes(campaign)) setCampaign("all"); }, [campaignOptions, campaign]);

  // Create a request: persist EACH requested page as its own row (a request for
  // 5 pages = 5 independently-trackable records), then sync ONE requirement item
  // back into the campaign's KOL Plan.
  const addKol = async (kolsToCreate: Kol[], item: BriefKolItem | null, campaignName: string) => {
    setRequestOpen(false);
    const results = await Promise.all(kolsToCreate.map((k) => createKolIfNew(k)));
    const created = results.filter((r) => r.created).map((r) => r.kol);
    setKols((ks) => [...created, ...ks]);
    if (item && campaignName && campaignName !== "—") appendBriefKolItem(campaignName, item).catch(() => {});
  };

  // Drop a "Need Approval" task into the requester's task list, due in 3 days —
  // fired when a KOL first moves into the "In Review" stage.
  const createReviewTask = async (kol: Kol) => {
    const requester = kol.requester || kol.owner;
    const dueIso = plusDaysIso(3);
    const task: Task = {
      id: Date.now(), title: `Approve KOL — ${kol.name}`, module: "KOL", moduleIcon: "🌟", moduleColor: "#B5577E",
      type: "KOL", assignee: requester, brand: brandName(kol.b), campaign: kol.campaign,
      status: "Need Approval", priority: "High", group: "needApproval", due: labelDate(dueIso),
      blocker: null, pendingApprover: requester, isQuickWin: false,
      nextAction: `Review proposed KOL ${kol.name} (${kol.h}) and approve within 3 days.`,
      checklist: [], dueIso,
    };
    await createTaskDb(task);
  };

  // Drawer saves flow through here: update the row, and when a KOL first enters
  // "In Review" (draft submitted for approval), raise the approval task.
  const handleKolUpdate = (next: Kol) => {
    const prev = kols.find((k) => k.id === next.id);
    setKols((ks) => ks.map((x) => (x.id === next.id ? next : x)));
    if (prev && normalizeStage(prev.status) !== "In Review" && normalizeStage(next.status) === "In Review") {
      createReviewTask(next).catch(() => {});
    }
    // Reverse two-way sync: reflect the edit back into the campaign's KOL Plan.
    syncBriefKolFromRows(next).catch(() => {});
  };

  const filtered = kols.filter((k) => (brand === "all" || k.b === brand) && (campaign === "all" || k.campaign === campaign) && inDateFilter(date, k.postDueDate ?? k.postingDate));
  const kpi = kolKpis(filtered);
  const alerts = kolAlerts(filtered);

  const KPIS: { label: string; value: string; tone?: string; dark?: boolean }[] = [
    // "Total Requests" = every KOL request row; "Active" = only in-flight
    // (Producing/In Review/Approved/Posted), so the numbers can't mislead.
    { label: "Total Requests", value: String(kpi.total) },
    { label: "Active", value: String(kpi.active), tone: "gold" },
    { label: "In Review", value: String(kpi.inReview), tone: kpi.inReview ? "gold" : undefined },
    { label: "Posted", value: String(kpi.posted), tone: "green" },
    { label: "Completed", value: String(kpi.completed) },
    { label: "Avg ROAS", value: kpi.avgRoas ? `${kpi.avgRoas.toFixed(1)}×` : "—", dark: true },
  ];

  return (
    <>
      <PageHeader
        eyebrow="KOL / Creator"
        title="KOL / Creator"
        subtitle={`${filtered.length} creators · deal, brief, review, and track every collaboration`}
        right={<button onClick={() => setRequestOpen(true)} className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[8px]">+ Request KOL</button>}
      />

      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <BrandFilter value={brand} onChange={setBrand} />
        <label className="flex items-center gap-[7px]">
          <span className="text-[11px] font-bold text-faint uppercase tracking-[0.05em]">Campaign</span>
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} style={SELECT_STYLE}>
            <option value="all">All Campaigns</option>
            {campaignOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {/* Period filter — by post due date; undated collaborations stay visible */}
      <div className="mt-3">
        <DateFilterBar value={date} onChange={setDate} />
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-card p-4 border"
            style={k.dark ? { background: "#211F1C", borderColor: "#211F1C" } : { background: "#fff", borderColor: "#ECE6DA" }}>
            <div className="text-[10px] uppercase tracking-[0.06em] font-bold mb-[6px]" style={{ color: k.dark ? "#B8945A" : "#9A9387" }}>{k.label}</div>
            <div className="text-[22px] font-extrabold letter-tightest" style={{ color: k.dark ? "#fff" : k.tone === "red" ? "#B33A2E" : k.tone === "gold" ? "#C68A1E" : "#211F1C" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Needs Attention */}
      {alerts.length > 0 && (
        <div className="mt-4 bg-status-goldBg border border-accent-border rounded-cardLg p-4">
          <div className="text-[12px] font-bold text-status-gold mb-3">⚠ Needs Attention · {alerts.length}</div>
          <div className="flex flex-col gap-2">
            {alerts.map((k) => (
              <button key={k.id} onClick={() => setDrawer({ kol: k, tab: "comments" })} className="flex items-center gap-3 text-left bg-surface rounded-card px-3 py-2 hover:bg-ivory transition">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: brandColor(k.b) }}>{initials(k.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{k.name}</div>
                  <div className="text-[11px] text-faint">{k.campaign}</div>
                </div>
                <span className="text-[11.5px] font-semibold text-status-gold flex-shrink-0">
                  {k.isOverdue ? "⚠ Overdue" : k.status === "Revision Requested" ? "↩ Revision needed" : k.openComments > 0 ? `💬 ${k.openComments} open` : "⏳ Waiting review"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line pb-[2px]">
        {TABS.map(([id, label]) => {
          const active = id === tab;
          return (
            <button key={id} onClick={() => setTab(id)} className="text-[13px] font-semibold px-[14px] py-[9px] whitespace-nowrap border-b-2 -mb-[2px]"
              style={active ? { color: "#211F1C", borderColor: "#B8945A" } : { color: "#9A9387", borderColor: "transparent" }}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === "list" && <CreatorList list={filtered} onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
        {tab === "pipeline" && <PipelineList kols={filtered} brand="all" onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
        {tab === "plan" && <KolPlan kols={filtered} brand="all" onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
        {tab === "performance" && <KolPerformance list={filtered} onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} onUpdate={handleKolUpdate} />}
        {tab === "database" && <KolDatabase />}
      </div>

      {drawer && (
        <KolDrawer
          kol={drawer.kol}
          initialTab={drawer.tab}
          onClose={() => setDrawer(null)}
          onUpdate={(k) => {
            setDrawer((d) => (d ? { ...d, kol: k } : d));
            handleKolUpdate(k);
          }}
        />
      )}
      {requestOpen && <RequestModal nextId={Math.max(0, ...kols.map((k) => k.id)) + 1} onClose={() => setRequestOpen(false)} onCreate={addKol} />}
    </>
  );
}

function CreatorRow({ kol, onOpen }: { kol: Kol; onOpen: (k: Kol) => void }) {
  const pi = platformIcon(kol.plat);
  const { idx } = stageProgress(kol.status);
  const url = channelUrl(kol.plat, kol.h);
  return (
    <div className="border-b border-line4 last:border-0">
      <div onClick={() => onOpen(kol)} className="w-full grid grid-cols-1 md:grid-cols-[2fr_1.4fr_1fr_1fr_1.4fr] gap-y-2 px-5 py-[13px] items-center text-left cursor-pointer hover:bg-ivory/60 transition">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: brandColor(kol.b) }}>{initials(kol.name)}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-[6px]">
              <span className="text-[13.5px] font-bold text-ink truncate">{kol.name}</span>
              <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
            </div>
            <div className="text-[11px] text-faint truncate">
              {url ? <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-accent font-semibold hover:underline">{kol.h} ↗</a> : kol.h} · {brandName(kol.b)}
            </div>
          </div>
        </div>
        <div className="text-[12px] text-muted">{kol.campaign}<div className="text-[10.5px] text-faint">Due {kol.postDueDate}</div></div>
        <div className="text-[12.5px] text-muted">{fmtFollow(kol.followers)}<div className="text-[10.5px] text-faint">followers</div></div>
        <div className="text-[13px] font-semibold text-ink">{baht(kol.fee, { compact: true })}</div>
        <div>
          <StatusBadge tone={kolTone(kol.status)}>{kol.status}</StatusBadge>
          <div className="flex gap-[2px] mt-2">
            {ALL_STAGES.map((_, i) => (
              <span key={i} className="h-[4px] flex-1 rounded-full" style={{ background: i < idx ? "#B8945A" : i === idx ? "#211F1C" : "#ECE6DA" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreatorList({ list, onOpen }: { list: Kol[]; onOpen: (k: Kol) => void }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "2fr 1.4fr 1fr 1fr 1.4fr" }}>
        <div>Creator</div><div>Campaign</div><div>Followers</div><div>Fee</div><div>Stage</div>
      </div>
      {list.map((k) => <CreatorRow key={k.id} kol={k} onOpen={onOpen} />)}
      {list.length === 0 && <div className="text-[12.5px] text-faint text-center py-8">No creators match these filters.</div>}
    </div>
  );
}

function PipelineList({ kols, brand, onOpen }: { kols: Kol[]; brand: BrandFilterValue; onOpen: (k: Kol) => void }) {
  const stages = [...ALL_STAGES, "Paused"];
  const groups = stages
    .map((st) => ({ stage: st, kols: kols.filter((k) => normalizeStage(k.status) === st && (brand === "all" || k.b === brand)) }))
    .filter((g) => g.kols.length > 0);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const totalFee = g.kols.reduce((s, k) => s + k.fee, 0);
        return (
          <div key={g.stage} className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-line4">
              <StatusBadge tone={kolTone(g.stage)}>{g.stage}</StatusBadge>
              <span className="text-[12px] text-faint font-semibold">{g.kols.length}</span>
              <span className="text-[12px] text-faint ml-auto">{baht(totalFee, { compact: true })}</span>
            </div>
            {g.kols.map((k) => {
              const pi = platformIcon(k.plat);
              return (
                <button key={k.id} onClick={() => onOpen(k)} className="w-full grid grid-cols-[2fr_1.4fr_1fr_1fr] gap-y-1 px-5 py-3 items-center text-left border-b border-line4 last:border-0 hover:bg-ivory/60">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                    {k.name}
                  </span>
                  <span className="text-[12px] text-muted">{k.campaign}</span>
                  <span className="text-[12px] text-muted">{k.owner}</span>
                  <span className="text-[12.5px] font-semibold text-ink">{baht(k.fee, { compact: true })}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function KolPlan({ kols, brand, onOpen }: { kols: Kol[]; brand: BrandFilterValue; onOpen: (k: Kol) => void }) {
  const list = kols.filter((k) => brand === "all" || k.b === brand);
  return (
    <div className="flex flex-col gap-4">
      {/* Specialist dashboard */}
      <div className="bg-panel text-white rounded-cardLg p-5">
        <div className="text-[13px] font-bold mb-4">Specialist Task Dashboard — can they deal on plan?</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SPECIALISTS.map((s) => (
            <div key={s.name} className="bg-white/[0.06] rounded-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: s.color }}>{s.init}</span>
                <span className="text-[13.5px] font-bold text-white">{s.name}</span>
              </div>
              <div className="flex gap-4 text-[11px] text-white/60 mb-3">
                <span>{s.kols} KOLs</span><span>{s.active} active</span><span>{s.done} done</span>
                {s.waiting > 0 && <span className="text-[#e8c87d]">{s.waiting} waiting</span>}
              </div>
              <Progress value={s.pct} color="#B8945A" track="rgba(255,255,255,.1)" />
              <div className="text-[10.5px] text-white/50 mt-[5px]">{s.pct}% completion · {s.comments} open comments</div>
            </div>
          ))}
        </div>
      </div>

      {/* Deal timeline — grouped by post due date */}
      <div className="bg-surface border border-line rounded-cardLg p-5">
        <div className="text-[13px] font-bold mb-4">Deal Plan — by post due date</div>
        <div className="flex flex-col gap-2">
          {[...list].sort((a, b) => a.postDueDate.localeCompare(b.postDueDate)).map((k) => {
            const pi = platformIcon(k.plat);
            return (
              <button key={k.id} onClick={() => onOpen(k)} className="flex items-center gap-3 text-left rounded-card border border-line3 bg-ivory px-4 py-3 hover:border-accent transition">
                <div className="text-[11px] font-bold text-faint w-14 flex-shrink-0">{k.postDueDate}</div>
                <span className="w-[20px] h-[20px] rounded-[5px] flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{k.name}</div>
                  <div className="text-[11px] text-faint">{k.campaign} · {brandName(k.b)}</div>
                </div>
                <StatusBadge tone={kolTone(k.status)}>{k.status}</StatusBadge>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Per-post performance grouped by campaign: enter Reach + Engagement per post
// link, roll up to each creator, then to a campaign total.
function KolPerformance({ list, onOpen, onUpdate }: { list: Kol[]; onOpen: (k: Kol) => void; onUpdate: (k: Kol) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Kol[]>();
    for (const k of list) { const c = k.campaign || "—"; const arr = m.get(c); if (arr) arr.push(k); else m.set(c, [k]); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  // Update one post's result numbers (state only, so typing is smooth); the DB
  // write happens on blur. Keeps top-level actuals = sum of posts.
  const editPostResult = (k: Kol, idx: number, patch: Partial<KolPost>) => {
    const posts = kolPosts(k).map((p, j) => (j === idx ? { ...p, ...patch } : p));
    const totals = postsTotals(posts);
    onUpdate({ ...k, posts, actualReach: totals.reach, actualEngagement: totals.engagement });
  };

  const rate = (reach: number, eng: number) => (reach ? (eng / reach) * 100 : 0);
  const cols = "1.7fr 1.1fr 1.1fr 1fr 1fr 0.7fr";
  const numCls = "w-full text-[12px] px-2 py-[5px] rounded-[7px] border border-line2 bg-ivory outline-none text-right";
  if (list.length === 0) return <div className="text-[12.5px] text-faint text-center py-10">No performance data for these filters.</div>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map(([campaign, ks]) => {
        const cReach = ks.reduce((s, k) => s + postsTotals(kolPosts(k)).reach, 0);
        const cEng = ks.reduce((s, k) => s + postsTotals(kolPosts(k)).engagement, 0);
        const cFee = ks.reduce((s, k) => s + k.fee, 0);
        const roiVals = ks.filter((k) => k.roi > 0).map((k) => k.roi);
        const avgRoi = roiVals.length ? roiVals.reduce((s, v) => s + v, 0) / roiVals.length : 0;
        return (
          <div key={campaign} className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-line4">
              <span className="text-[13px] font-bold text-ink">{campaign}</span>
              <span className="text-[11.5px] text-faint">· {ks.length} creator{ks.length > 1 ? "s" : ""}</span>
            </div>
            <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: cols }}>
              <div>Creator · Post</div><div className="text-right">Reach</div><div className="text-right">Engagement</div><div className="text-right">Eng. Rate</div><div className="text-right">Fee</div><div className="text-right">ROAS</div>
            </div>
            {ks.map((k) => {
              const posts = kolPosts(k);
              const kt = postsTotals(posts);
              const pi = platformIcon(k.plat);
              return (
                <div key={k.id} className="border-b border-line4 last:border-0">
                  {/* Creator subtotal row */}
                  <button onClick={() => onOpen(k)} className="w-full grid gap-y-1 px-5 py-[10px] items-center text-left hover:bg-ivory/50" style={{ gridTemplateColumns: cols }}>
                    <span className="flex items-center gap-2 text-[13px] font-bold text-ink min-w-0">
                      <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                      <span className="truncate">{k.name}</span>
                      <span className="text-[10.5px] text-faint font-semibold">· {posts.length} post{posts.length !== 1 ? "s" : ""}</span>
                    </span>
                    <span className="text-[12.5px] text-ink font-semibold text-right">{fmtFollow(kt.reach)}</span>
                    <span className="text-[12.5px] text-ink font-semibold text-right">{fmtFollow(kt.engagement)}</span>
                    <span className="text-[12.5px] text-muted text-right">{fmtPct(rate(kt.reach, kt.engagement))}</span>
                    <span className="text-[12.5px] font-semibold text-ink text-right">{baht(k.fee, { compact: true })}</span>
                    <span className="text-[12.5px] font-semibold text-right" style={{ color: k.roi >= 1 ? "#4E7A4E" : "#9A9387" }}>{k.roi ? `${k.roi.toFixed(1)}×` : "—"}</span>
                  </button>
                  {/* One editable row per post link */}
                  {posts.map((p, pi2) => (
                    <div key={pi2} className="grid gap-y-1 px-5 py-2 items-center bg-ivory/40" style={{ gridTemplateColumns: cols }}>
                      <span className="flex items-center gap-2 text-[11.5px] text-muted min-w-0 pl-6">
                        <span className="font-semibold">{p.platform}</span>
                        {p.link
                          ? <a href={p.link.startsWith("http") ? p.link : `https://${p.link}`} target="_blank" rel="noreferrer" className="text-accent truncate hover:underline">{p.link} ↗</a>
                          : <span className="text-faint italic">no link</span>}
                      </span>
                      <input type="number" value={p.reach || ""} placeholder="0" onChange={(e) => editPostResult(k, pi2, { reach: Number(e.target.value) || 0 })} onBlur={() => updateKol(k)} className={numCls} />
                      <input type="number" value={p.engagement || ""} placeholder="0" onChange={(e) => editPostResult(k, pi2, { engagement: Number(e.target.value) || 0 })} onBlur={() => updateKol(k)} className={numCls} />
                      <span className="text-[11.5px] text-faint text-right">{fmtPct(rate(p.reach || 0, p.engagement || 0))}</span>
                      <span></span><span></span>
                    </div>
                  ))}
                  {posts.length === 0 && <div className="px-5 py-2 pl-11 text-[11.5px] text-faint bg-ivory/40">ยังไม่มีโพสต์ — เพิ่ม platform + link ใน drawer ของ KOL คนนี้</div>}
                </div>
              );
            })}
            <div className="grid px-5 py-3 items-center bg-ivory/70 text-ink font-bold" style={{ gridTemplateColumns: cols }}>
              <span className="text-[12px]">Campaign total</span>
              <span className="text-[12.5px] text-right">{fmtFollow(cReach)}</span>
              <span className="text-[12.5px] text-right">{fmtFollow(cEng)}</span>
              <span className="text-[12.5px] text-right">{fmtPct(rate(cReach, cEng))}</span>
              <span className="text-[12.5px] text-right">{baht(cFee, { compact: true })}</span>
              <span className="text-[12.5px] text-right">{avgRoi ? `${avgRoi.toFixed(1)}×` : "—"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Campaign-independent KOL master library (kol_profiles) — search + rank badges.
function KolDatabase() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<KolMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchKolProfiles(q, 100)
        .then((r) => { if (alive) { setRows(r); setLoading(false); } })
        .catch(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const cols = "1.8fr 1.4fr 1fr 0.9fr 1fr 1.2fr 0.9fr";
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card px-4 py-[10px] text-[11.5px]" style={{ background: "#EEF1F8", border: "1px solid #D5DEEF", color: "#3E5C9A" }}>
        <b>KOL Library</b> = ทะเบียนกลางของ KOL (Master Profile) ไม่ผูกแคมเปญ — ใช้ค้นและดึงมาใช้ซ้ำ พร้อมประวัติผลงาน/rank สะสมข้ามแคมเปญ · ต่างจาก <b>Request List</b> ที่เป็นดีลราย KOL ต่อ 1 แคมเปญ
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ KOL หรือ @handle…"
          className="flex-1 min-w-[220px] text-[13px] px-[13px] py-[9px] rounded-[10px] border border-line2 bg-ivory outline-none" />
        <span className="text-[12px] text-faint">{rows.length} profile{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
        <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: cols }}>
          <div>KOL / Page</div><div>Handle</div><div>Type</div><div>Tier</div><div>Followers</div><div>Platforms</div><div>Rank</div>
        </div>
        {rows.map((r) => {
          const url = channelUrl(r.platforms?.[0] ?? "Instagram", r.primary_handle ?? "");
          return (
            <div key={r.kol_id} className="grid gap-y-1 px-5 py-3 items-center border-b border-line4 last:border-0" style={{ gridTemplateColumns: cols }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: "#6b6258" }}>{initials(r.display_name)}</span>
                <span className="text-[13px] font-bold text-ink truncate">{r.display_name}</span>
              </span>
              <span className="text-[12px] text-faint truncate">{url ? <a href={url} target="_blank" rel="noreferrer" className="text-accent font-semibold hover:underline">{r.primary_handle} ↗</a> : (r.primary_handle ?? "—")}</span>
              <span className="text-[12px] text-muted">{r.kol_type ?? "—"}</span>
              <span className="text-[12px] text-muted">{r.tier ?? "—"}</span>
              <span className="text-[12.5px] text-muted">{r.total_followers != null ? fmtFollow(r.total_followers) : "—"}</span>
              <span className="text-[11.5px] text-muted truncate">{(r.platforms ?? []).join(", ") || "—"}</span>
              <span>{r.rank_label
                ? <span className="text-[11px] font-bold px-[8px] py-[2px] rounded-pill bg-ivory border border-line3">{r.rank_label}{r.rank_score != null ? ` · ${r.rank_score}` : ""}</span>
                : <span className="text-[12px] text-faint">—</span>}</span>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-[12.5px] text-faint text-center py-10">
            {loading ? "Loading…" : "ยังไม่มี KOL ในคลัง — โปรไฟล์จะสะสมเมื่อเริ่มทำงานกับ KOL แต่ละราย"}
          </div>
        )}
      </div>
    </div>
  );
}

const KOL_BRAND_TO_ID: Record<string, BrandId> = { TEPPEN: "teppen", "Omakase Don": "omakase", Mainichi: "mainichi", Touka: "touka" };

function RequestModal({ nextId, onClose, onCreate }: { nextId: number; onClose: () => void; onCreate: (kols: Kol[], item: BriefKolItem, campaign: string) => void }) {
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const [brandSel, setBrandSel] = useState("TEPPEN");
  const [campaign, setCampaign] = useState("");
  const [requester, setRequester] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  // Same KOL-item template as the Campaign Builder's KOL Plan (syncs both ways).
  const [item, setItem] = useState<BriefKolItem>(() => emptyKolItem(nextId));
  const onChange = (patch: Partial<BriefKolItem>) => setItem((it) => ({ ...it, ...patch }));
  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const brandId = KOL_BRAND_TO_ID[brandSel] ?? "teppen";
  const brandCampaigns = campaigns.filter((c) => c.b === brandId);
  useEffect(() => {
    if (campaign && !brandCampaigns.some((c) => c.name === campaign)) setCampaign("");
  }, [brandCampaigns, campaign]);

  // Requester specifies the requirement only — the real page (and the master-DB
  // link) is proposed later by the KOL specialist, so there's no name/handle here.
  const count = Math.max(1, item.count || 1);
  const canCreate = count > 0;
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!canCreate || busy) return;
    setBusy(true);
    const expEng = (item.likes || 0) + (item.comments || 0) + (item.shares || 0) + (item.saves || 0) + (item.clicks || 0);
    // Owner from the picked value, else the KOL team; Approver from the approval
    // matrix — never a demo user. Campaign id links back relationally.
    const assign = await resolveKolAssignment().catch(() => ({ owner: "Unassigned", approver: "Unassigned" }));
    const owner = (item.owner || "").trim() || assign.owner;
    const campaignId = campaigns.find((c) => c.name === campaign)?.id;
    const reqStamp = Date.now();
    // A request for N pages becomes N independent rows so each page is tracked,
    // reviewed, and updated on its own. Budget is split per page.
    const perPageBudget = Math.round((item.budget || 0) / count);
    const kols = Array.from({ length: count }, (_, i) => buildKol({
      id: nextId + i, campaign: campaign || "—", b: brandId, kolType: item.kolType,
      count: 1, budget: perPageBudget,
      deliverables: item.contentRequired.join(" + "), notes: item.note,
      expectedReach: item.expectedReach, expectedEngagement: expEng,
      postingDate: item.postingStart, postingEnd: item.postingEnd, followers: item.followers,
      owner, approver: assign.approver, requester, branch: item.area, platform: item.platforms[0],
      name: item.name ? (count > 1 ? `${item.name} #${i + 1}` : item.name) : (count > 1 ? `New Request — ${item.kolType} #${i + 1}` : undefined),
      campaignId, sourceKolRequirementId: `manual-${reqStamp}#${i + 1}`,
    }));
    onCreate(kols, item, campaign.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-1">Request KOL</div>
        <div className="text-[11.5px] text-faint mb-4">ระบุ requirement ที่ต้องการ (ยังไม่ต้องรู้ชื่อเพจ) — KOL specialist จะเสนอเพจจริงทีหลัง · ฟอร์มเดียวกับ KOL Plan และ sync กลับเข้า Campaign อัตโนมัติ</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label>
            <select value={brandSel} onChange={(e) => setBrandSel(e.target.value)} className={field}><option>TEPPEN</option><option>Omakase Don</option><option>Mainichi</option><option>Touka</option></select>
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign</label>
            <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field}>
              <option value="">{brandCampaigns.length ? "Select campaign…" : "No campaigns for this brand"}</option>
              {brandCampaigns.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Requester <span className="text-faint font-normal">· งาน approve จะเด้งเข้า task list ของคนนี้</span></label>
            <OwnerSelect value={requester} onChange={setRequester} team="Planner" />
          </div>
        </div>
        <KolItemForm item={item} onChange={onChange} hidePage />
        <button onClick={submit} disabled={!canCreate || busy} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">{busy ? "Creating…" : "Create KOL Request"}</button>
      </div>
    </div>
  );
}
