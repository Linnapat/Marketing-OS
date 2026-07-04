"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Progress } from "@/components/ui/Progress";
import { KolDrawer } from "@/components/kol/KolDrawer";
import { BrandFilterValue, BrandId, brandName, brandColor } from "@/lib/brands";
import { platformIcon } from "@/lib/platforms";
import { kolTone } from "@/lib/status";
import { baht } from "@/lib/format";
import {
  KOLS, ALL_STAGES, SPECIALISTS, Kol, initials, fmtFollow,
  kolKpis, kolAlerts, stageProgress,
} from "@/lib/data/kol";
import { fetchKols, createKol, buildKol } from "@/lib/db/kol";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { CampaignRow } from "@/lib/data/campaigns";

const TABS = [["list", "Creator List"], ["pipeline", "Pipeline"], ["plan", "KOL Plan"]] as const;
type Tab = (typeof TABS)[number][0];

export default function KolPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [drawer, setDrawer] = useState<{ kol: Kol; tab: "profile" | "comments" } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [kols, setKols] = useState<Kol[]>(KOLS);

  useEffect(() => {
    let alive = true;
    fetchKols().then((k) => { if (alive) setKols(k); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const addKol = async (k: Kol) => {
    setRequestOpen(false);
    const created = await createKol(k);
    setKols((ks) => [created, ...ks]);
  };

  const filtered = kols.filter((k) => brand === "all" || k.b === brand);
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

      <div className="mt-4"><BrandFilter value={brand} onChange={setBrand} /></div>

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
        {tab === "pipeline" && <PipelineList kols={kols} brand={brand} onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
        {tab === "plan" && <KolPlan kols={kols} brand={brand} onOpen={(k) => setDrawer({ kol: k, tab: "profile" })} />}
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

function CreatorRow({ kol, onOpen }: { kol: Kol; onOpen: (k: Kol) => void }) {
  const pi = platformIcon(kol.plat);
  const { idx } = stageProgress(kol.status);
  return (
    <button onClick={() => onOpen(kol)} className="w-full grid grid-cols-1 md:grid-cols-[2fr_1.4fr_1fr_1fr_1.4fr] gap-y-2 px-5 py-[13px] items-center text-left border-b border-line4 last:border-0 hover:bg-ivory/60 transition">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: brandColor(kol.b) }}>{initials(kol.name)}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-[6px]">
            <span className="text-[13.5px] font-bold text-ink truncate">{kol.name}</span>
            <span className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: pi.bg, color: pi.fg }}>{pi.icon}</span>
          </div>
          <div className="text-[11px] text-faint truncate">{kol.h} · {brandName(kol.b)}</div>
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
    </button>
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

const KOL_BRAND_TO_ID: Record<string, BrandId> = { TEPPEN: "teppen", "Omakase Don": "omakase", Mainichi: "mainichi", Touka: "touka" };

const CONTACT_STATUSES = ["Prospect", "Contacted", "In Discussion", "Confirmed", "Declined"];

function RequestModal({ nextId, onClose, onCreate }: { nextId: number; onClose: () => void; onCreate: (k: Kol) => void }) {
  const field = "w-full text-[14px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
  const [brandSel, setBrandSel] = useState("TEPPEN");
  const [campaign, setCampaign] = useState("");
  const [kolType, setKolType] = useState("Food Blogger");
  const [kolName, setKolName] = useState("");
  const [handle, setHandle] = useState("");
  const [count, setCount] = useState("1");
  const [budget, setBudget] = useState("");
  const [expReach, setExpReach] = useState("");
  const [expEng, setExpEng] = useState("");
  const [postingDate, setPostingDate] = useState("");
  const [contactStatus, setContactStatus] = useState("Prospect");
  const [deliverables, setDeliverables] = useState("");
  const [notes, setNotes] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);

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

  const submit = () => {
    onCreate(buildKol({
      id: nextId, campaign: campaign || "—", b: brandId, kolType,
      count: parseInt(count) || 1, budget: parseFloat(budget) || 0, deliverables, notes,
      name: kolName, handle, expectedReach: parseInt(expReach) || 0,
      expectedEngagement: parseInt(expEng) || 0, postingDate, contactStatus,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-cardLg w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-faint hover:text-ink"><X size={18} /></button>
        <div className="text-[16px] font-extrabold mb-4">Request KOL</div>
        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">KOL Name</label>
            <input value={kolName} onChange={(e) => setKolName(e.target.value)} className={field} placeholder="e.g. Tokyo Tom" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Page / Handle</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} className={field} placeholder="@handle or page URL" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">KOL Type</label>
            <select value={kolType} onChange={(e) => setKolType(e.target.value)} className={field}><option>Food Blogger</option><option>Food Vlogger</option><option>Micro Influencer</option></select>
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]"># Creators</label>
            <input type="number" value={count} onChange={(e) => setCount(e.target.value)} className={field} placeholder="1" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Expected Reach</label>
            <input type="number" value={expReach} onChange={(e) => setExpReach(e.target.value)} className={field} placeholder="e.g. 50000" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Expected Engagement</label>
            <input type="number" value={expEng} onChange={(e) => setExpEng(e.target.value)} className={field} placeholder="e.g. 4000" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Budget / creator</label>
            <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className={field} placeholder="฿" />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Posting Date</label>
            <input type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} className={field} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Contact Status</label>
            <select value={contactStatus} onChange={(e) => setContactStatus(e.target.value)} className={field}>
              {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Deliverables</label>
            <input value={deliverables} onChange={(e) => setDeliverables(e.target.value)} className={field} placeholder="1 Reel + 3 Stories" />
          </div>
          <div className="col-span-2">
            <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={field} rows={3} placeholder="Brief, target audience, posting period…" />
          </div>
        </div>
        <button onClick={submit} className="w-full mt-5 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px]">Create KOL Request</button>
      </div>
    </div>
  );
}
