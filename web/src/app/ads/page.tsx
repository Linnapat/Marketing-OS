"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandFilter } from "@/components/ui/BrandFilter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, brandName, BRANDS, BRAND_ORDER } from "@/lib/brands";
import { baht } from "@/lib/format";
import { Task, TASKS } from "@/lib/data/tasks";
import { CampaignRow } from "@/lib/data/campaigns";
import { Graphic } from "@/lib/data/graphic";
import { fetchTasks } from "@/lib/db/tasks";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchGraphics } from "@/lib/db/graphic";
import { Tone } from "@/lib/status";

const CREATIVE_APPROVED = /Approved|Delivered/i;

const STATUS_TONE: Record<string, Tone> = {
  Done: "green", "In Progress": "blue", Todo: "neutral", Waiting: "gold", Stuck: "red",
};

// Task.brand is a display name ("Teppen"); resolve it back to a brand id.
function toBrandId(v: string): BrandId | null {
  const low = (v || "").toLowerCase();
  if (BRANDS[low as BrandId]) return low as BrandId;
  return BRAND_ORDER.find((id) => BRANDS[id].name.toLowerCase() === low) ?? null;
}

export default function AdsPage() {
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [campaign, setCampaign] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [graphics, setGraphics] = useState<Graphic[]>([]);

  useEffect(() => {
    let alive = true;
    fetchTasks().then((t) => { if (alive) setTasks(t.tasks); }).catch(() => {});
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    fetchGraphics().then((g) => { if (alive) setGraphics(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const campByName = useMemo(() => Object.fromEntries(campaigns.map((c) => [c.name, c])), [campaigns]);
  // Campaigns that have at least one approved creative — ads on others are gated.
  const creativeReadyCampaigns = useMemo(() => {
    const set = new Set<string>();
    graphics.forEach((g) => { if (CREATIVE_APPROVED.test(g.stage) && g.campaign) set.add(g.campaign); });
    return set;
  }, [graphics]);

  // Every Ads-type task across all campaigns, tagged with its resolved brand + channel.
  const ads = useMemo(() => tasks
    .filter((t) => t.type === "Ads" || t.module === "Ads")
    .map((t) => {
      const camp = campByName[t.campaign];
      const b = camp?.b ?? toBrandId(t.brand);
      return { t, camp, b, channel: t.channel || "General" };
    }), [tasks, campByName]);

  const channels = useMemo(() => Array.from(new Set(ads.map((a) => a.channel))).sort(), [ads]);
  const campaignNames = useMemo(() => Array.from(new Set(ads.map((a) => a.t.campaign).filter(Boolean))).sort(), [ads]);
  const statuses = useMemo(() => Array.from(new Set(ads.map((a) => a.t.status))).sort(), [ads]);

  const rows = ads.filter((a) =>
    (brand === "all" || a.b === brand) &&
    (campaign === "all" || a.t.campaign === campaign) &&
    (channel === "all" || a.channel === channel) &&
    (status === "all" || a.t.status === status));

  // Budget / Spent / ROAS summary from the UNIQUE campaigns behind the filtered ads.
  const summary = useMemo(() => {
    const seen = new Map<string, CampaignRow>();
    rows.forEach((a) => { if (a.camp && !seen.has(a.camp.id)) seen.set(a.camp.id, a.camp); });
    const camps = [...seen.values()];
    const budget = camps.reduce((s, c) => s + c.budget, 0);
    const spent = camps.reduce((s, c) => s + c.spend, 0);
    const roasCamps = camps.filter((c) => c.roi > 0);
    const roas = roasCamps.length ? roasCamps.reduce((s, c) => s + c.roi, 0) / roasCamps.length : 0;
    return { budget, spent, roas, campCount: camps.length };
  }, [rows]);

  const sel = "text-[12.5px] font-semibold px-[11px] py-[7px] rounded-[9px] border border-line2 bg-surface outline-none";

  return (
    <>
      <PageHeader
        eyebrow="Media"
        title="Ads Manager"
        subtitle={`${rows.length} ads across ${summary.campCount} campaign(s) · Meta · Google · TikTok · LINE`}
      />

      {/* Summary strip */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Ads", value: String(rows.length), tone: "#211F1C" },
          { label: "Campaign Budget", value: baht(summary.budget, { compact: true }), tone: "#211F1C" },
          { label: "Spent", value: baht(summary.spent, { compact: true }), tone: summary.spent > summary.budget ? "#B33A2E" : "#4E7A4E" },
          { label: "Avg ROAS", value: summary.roas ? `${summary.roas.toFixed(1)}×` : "—", tone: "#B8945A" },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-line rounded-cardLg p-4">
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint font-bold mb-[6px]">{k.label}</div>
            <div className="text-[20px] font-extrabold" style={{ color: k.tone }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <BrandFilter value={brand} onChange={setBrand} />
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={sel}>
          <option value="all">All campaigns</option>
          {campaignNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={sel}>
          <option value="all">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="all">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Ads list */}
      <div className="mt-5">
        {rows.length === 0 ? (
          <div className="bg-surface border border-line rounded-cardLg py-16 text-center text-[13px] text-faint">
            No ads match these filters. Ads tasks are generated from a campaign&apos;s Planner.
          </div>
        ) : (
          <div className="bg-surface border border-line rounded-cardLg overflow-hidden">
            <div className="hidden md:grid grid-cols-[2.4fr_1.4fr_0.9fr_1fr_0.9fr] gap-3 px-5 py-3 border-b border-line4 text-[10.5px] font-bold uppercase tracking-[0.05em] text-faint">
              <span>Ad / Task</span><span>Campaign</span><span>Channel</span><span>Owner</span><span>Status</span>
            </div>
            {rows.map((a, i) => (
              <div key={`${a.t.id}-${i}`} className="grid grid-cols-1 md:grid-cols-[2.4fr_1.4fr_0.9fr_1fr_0.9fr] gap-2 md:gap-3 px-5 py-[13px] border-b border-line4 last:border-0 items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[15px]">{a.t.moduleIcon || "📣"}</span>
                  <span className="text-[13.5px] font-semibold text-ink truncate">{a.t.title}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {a.b && <BrandDot brand={a.b} size={8} />}
                  <span className="text-[12.5px] text-muted truncate">{a.t.campaign || "—"}</span>
                </div>
                <span className="text-[12px] font-semibold text-ink">{a.channel}</span>
                <span className="text-[12px] text-muted truncate">{a.t.assignee}</span>
                <span className="flex items-center gap-[6px] flex-wrap">
                  {a.t.campaign && !creativeReadyCampaigns.has(a.t.campaign) && (
                    <span title="No approved creative for this campaign" className="text-[10px] font-bold px-[7px] py-[2px] rounded-pill" style={{ background: "#FBE9E7", color: "#B33A2E" }}>⚠ Creative</span>
                  )}
                  <StatusBadge tone={STATUS_TONE[a.t.status] ?? "neutral"}>{a.t.status}</StatusBadge>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
