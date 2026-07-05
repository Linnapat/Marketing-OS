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
  KOLS, ALL_STAGES, SPECIALISTS, Kol, initials, fmtFollow,
  kolKpis, kolAlerts, stageProgress,
} from "@/lib/data/kol";
import { fetchKols, createKol, buildKol, updateKol } from "@/lib/db/kol";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { appendBriefKolItem } from "@/lib/db/brief";
import { createTaskDb } from "@/lib/db/tasks";
import { Task } from "@/lib/data/tasks";
import { CampaignRow } from "@/lib/data/campaigns";
import { OwnerSelect } from "@/components/ui/OwnerSelect";
import { BriefKolItem, emptyKolItem, fmtPct } from "@/lib/data/brief";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelDate(iso: string): string { if (!iso) return "TBD"; const [, m, d] = iso.split("-").map(Number); return m ? `${MON[m - 1]} ${d}` : "TBD"; }
/** ISO date n days from today — used for the ≤3-day approval due date. */
function plusDaysIso(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
/** Stages where the specialist can still submit work from the row. */
const SUBMITTABLE = (status: string) => !["Completed", "Posted"].includes(status);

const TABS = [["list", "Creator List"], ["pipeline", "Pipeline"], ["plan", "KOL Plan"], ["performance", "Performance"]] as const;
type Tab = (typeof TABS)[number][0];

export default function KolPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [campaign, setCampaign] = useState<string>("all");
  const [drawer, setDrawer] = useState<{ kol: Kol; tab: "profile" | "comments" } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
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

  // Create a request: persist the Kol AND sync it back into the campaign's KOL Plan.
  const addKol = async (k: Kol, item: BriefKolItem | null, campaignName: string) => {
    setRequestOpen(false);
    const created = await createKol(k);
    setKols((ks) => [created, ...ks]);
    if (item && campaignName && campaignName !== "—") appendBriefKolItem(campaignName, item).catch(() => {});
  };

  // Specialist submits work in the row → update the KOL and drop a "Need Approval"
  // task into the requester's task list, due within 3 days.
  const submitRow = async (kol: Kol, link: string) => {
    const next: Kol = { ...kol, postLink: link.trim() || kol.postLink, status: "Waiting Review" };
    setKols((ks) => ks.map((x) => (x.id === kol.id ? next : x)));
    await updateKol(next);
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

  const filtered = kols.filter((k) => (brand === "all" || k.b === brand) && (campaign === "all" || k.campaign === campaign));
  const kpi = kolKpis(filtered);
  const alerts = kolAlerts(filtered);

  const KPIS: { label: string; value: string; tone?: string; dark?: boolean }[] = [
    { label: "Active Creators", value: String(kpi.active) },
    { label: "Waiting Review", value: String(kpi.waitingReview), tone: "gold" },
    { label: "Open Comments", value: String(kpi.openComments), tone: kpi.openComments ? "red" : undefined },
    { label: "Total Fees", value: baht(kpi.fees, { compact: true }) },
    { label: "Expected Reach", value: fmtFollow(kpi.expReach) },
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
        {tab === "list" && <CreatorList list={filtered} onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} onSubmitWork={submitRow} />}
        {tab === "pipeline" && <PipelineList kols={filtered} brand="all" onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
        {tab === "plan" && <KolPlan kols={filtered} brand="all" onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
        {tab === "performance" && <KolPerformance list={filtered} onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
      </div>

      {drawer && (
        <KolDrawer
          kol={drawer.kol}
          initialTab={drawer.tab}
          onClose={() => setDrawer(null)}
          onUpdate={(k) => {
            setDrawer((d) => (d ? { ...d, kol: k } : d));
            setKols((ks) => ks.map((x) => (x.id === k.id ? k : x)));
          }}
        />
      )}
      {requestOpen && <RequestModal nextId={Math.max(0, ...kols.map((k) => k.id)) + 1} onClose={() => setRequestOpen(false)} onCreate={addKol} />}
    </>
  );
}

function CreatorRow({ kol, onOpen, onSubmitWork }: { kol: Kol; onOpen: (k: Kol) => void; onSubmitWork: (k: Kol, link: string) => Promise<void> }) {
  const pi = platformIcon(kol.plat);
  const { idx } = stageProgress(kol.status);
  const url = channelUrl(kol.plat, kol.h);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!link.trim() || busy) return;
    setBusy(true);
    try { await onSubmitWork(kol, link); setLink(""); } finally { setBusy(false); }
  };
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
      {SUBMITTABLE(kol.status) && (
        <div className="flex items-center gap-2 px-5 pb-3 -mt-[2px]" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] text-faint">🔗</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste post / draft link and submit for review…"
            className="flex-1 text-[12px] px-3 py-[7px] rounded-[8px] border border-line2 bg-ivory outline-none" />
          <button onClick={submit} disabled={!link.trim() || busy} className="text-[12px] font-bold text-white bg-panel rounded-[8px] px-4 py-[7px] disabled:opacity-40 whitespace-nowrap">{busy ? "…" : "Submit"}</button>
        </div>
      )}
    </div>
  );
}

function CreatorList({ list, onOpen, onSubmitWork }: { list: Kol[]; onOpen: (k: Kol) => void; onSubmitWork: (k: Kol, link: string) => Promise<void> }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
      <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
        style={{ gridTemplateColumns: "2fr 1.4fr 1fr 1fr 1.4fr" }}>
        <div>Creator</div><div>Campaign</div><div>Followers</div><div>Fee</div><div>Stage</div>
      </div>
      {list.map((k) => <CreatorRow key={k.id} kol={k} onOpen={onOpen} onSubmitWork={onSubmitWork} />)}
      {list.length === 0 && <div className="text-[12.5px] text-faint text-center py-8">No creators match these filters.</div>}
    </div>
  );
}

function PipelineList({ kols, brand, onOpen }: { kols: Kol[]; brand: BrandFilterValue; onOpen: (k: Kol) => void }) {
  const stages = [...ALL_STAGES, "Paused"];
  const groups = stages
    .map((st) => ({ stage: st, kols: kols.filter((k) => k.status === st && (brand === "all" || k.b === brand)) }))
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

// Per-creator performance grouped by campaign, with a campaign roll-up total —
// so the same campaign's KOLs are compared individually and summed once.
function KolPerformance({ list, onOpen }: { list: Kol[]; onOpen: (k: Kol) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Kol[]>();
    for (const k of list) { const c = k.campaign || "—"; const arr = m.get(c); if (arr) arr.push(k); else m.set(c, [k]); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);
  const rate = (k: Kol) => { const base = k.actualReach || k.expectedReach || k.followers || 0; return base ? ((k.actualEngagement || 0) / base) * 100 : 0; };
  const cols = "1.8fr 1fr 1fr 1fr 1fr 0.8fr";
  if (list.length === 0) return <div className="text-[12.5px] text-faint text-center py-10">No performance data for these filters.</div>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map(([campaign, ks]) => {
        const reach = ks.reduce((s, k) => s + (k.actualReach || 0), 0);
        const eng = ks.reduce((s, k) => s + (k.actualEngagement || 0), 0);
        const fee = ks.reduce((s, k) => s + k.fee, 0);
        const roiVals = ks.filter((k) => k.roi > 0).map((k) => k.roi);
        const avgRoi = roiVals.length ? roiVals.reduce((s, v) => s + v, 0) / roiVals.length : 0;
        const blended = reach ? (eng / reach) * 100 : 0;
        return (
          <div key={campaign} className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-line4">
              <span className="text-[13px] font-bold text-ink">{campaign}</span>
              <span className="text-[11.5px] text-faint">· {ks.length} creator{ks.length > 1 ? "s" : ""}</span>
            </div>
            <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4" style={{ gridTemplateColumns: cols }}>
              <div>Creator</div><div>Reach</div><div>Engagement</div><div>Eng. Rate</div><div>Fee</div><div>ROAS</div>
            </div>
            {ks.map((k) => {
              const pi = platformIcon(k.plat);
              return (
                <button key={k.id} onClick={() => onOpen(k)} className="w-full grid gap-y-1 px-5 py-[11px] items-center text-left border-b border-line4 last:border-0 hover:bg-ivory/60" style={{ gridTemplateColumns: cols }}>
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-ink min-w-0">
                    <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
                    <span className="truncate">{k.name}</span>
                  </span>
                  <span className="text-[12.5px] text-muted">{fmtFollow(k.actualReach || 0)}</span>
                  <span className="text-[12.5px] text-muted">{fmtFollow(k.actualEngagement || 0)}</span>
                  <span className="text-[12.5px] text-muted">{fmtPct(rate(k))}</span>
                  <span className="text-[12.5px] font-semibold text-ink">{baht(k.fee, { compact: true })}</span>
                  <span className="text-[12.5px] font-semibold" style={{ color: k.roi >= 1 ? "#4E7A4E" : "#9A9387" }}>{k.roi ? `${k.roi.toFixed(1)}×` : "—"}</span>
                </button>
              );
            })}
            <div className="grid px-5 py-3 items-center bg-ivory/70 text-ink font-bold" style={{ gridTemplateColumns: cols }}>
              <span className="text-[12px]">Campaign total</span>
              <span className="text-[12.5px]">{fmtFollow(reach)}</span>
              <span className="text-[12.5px]">{fmtFollow(eng)}</span>
              <span className="text-[12.5px]">{fmtPct(blended)}</span>
              <span className="text-[12.5px]">{baht(fee, { compact: true })}</span>
              <span className="text-[12.5px]">{avgRoi ? `${avgRoi.toFixed(1)}×` : "—"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const KOL_BRAND_TO_ID: Record<string, BrandId> = { TEPPEN: "teppen", "Omakase Don": "omakase", Mainichi: "mainichi", Touka: "touka" };

function RequestModal({ nextId, onClose, onCreate }: { nextId: number; onClose: () => void; onCreate: (k: Kol, item: BriefKolItem, campaign: string) => void }) {
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
  const canCreate = (item.count || 0) > 0;
  const submit = () => {
    if (!canCreate) return;
    const expEng = (item.likes || 0) + (item.comments || 0) + (item.shares || 0) + (item.saves || 0) + (item.clicks || 0);
    const k = buildKol({
      id: nextId, campaign: campaign || "—", b: brandId, kolType: item.kolType,
      count: item.count || 1, budget: item.budget || 0,
      deliverables: item.contentRequired.join(" + "), notes: item.note,
      expectedReach: item.expectedReach, expectedEngagement: expEng,
      postingDate: item.postingStart, followers: item.followers,
      owner: item.owner, requester, branch: item.area, platform: item.platforms[0],
    });
    onCreate(k, item, campaign.trim());
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
        <button onClick={submit} disabled={!canCreate} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Create KOL Request</button>
      </div>
    </div>
  );
}
