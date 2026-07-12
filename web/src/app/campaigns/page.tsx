"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, BRAND_ORDER, brandName, BRANDS } from "@/lib/brands";
import { SELECT_STYLE_DARK } from "@/components/ui/selectStyle";
import { baht } from "@/lib/format";
import { campaignTone } from "@/lib/status";
import {
  CAMPAIGNS, STATUS_ORDER, READINESS_META, CampaignRow, Readiness,
} from "@/lib/data/campaigns";
import { fetchCampaigns, createCampaign, fetchCampaignTypes, addCampaignType } from "@/lib/db/campaigns";
import { useRole } from "@/lib/role";
import { DateFilterBar, DEFAULT_DATE_FILTER, rangeInFilter } from "@/components/ui/DateFilterBar";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
  FilterBar,
  ModuleSummaryCard,
} from "@/components/campaign/CampaignHeadController";

const CAMP_TYPES = ["Online + Offline", "Online Only", "Offline Only", "CRM / LINE", "Event / Store Activation", "Seasonal Promotion", "Urgent promotion"];
const NEW_STATUSES = ["Draft", "Planning", "Active", "In Progress", "Waiting Approval"];

export default function CampaignsPage() {
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [owner, setOwner] = useState<string>("all");
  const [budgetBand, setBudgetBand] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);
  const [newOpen, setNewOpen] = useState(false);
  const emptyNew = { name: "", b: "teppen" as BrandId, branch: "", owner: "", budget: "", dates: "", status: "Draft", campType: CAMP_TYPES[0] };
  const [nc, setNc] = useState(emptyNew);
  // Team-shared custom campaign types (from the database). Only admins can add.
  const { role } = useRole();
  const isAdmin = role === "CMO";
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState("");
  useEffect(() => { fetchCampaignTypes().then(setCustomTypes).catch(() => {}); }, []);
  const typeOptions = Array.from(new Set([...CAMP_TYPES, ...customTypes]));
  const addType = () => {
    const t = newType.trim();
    setAddingType(false); setNewType("");
    if (!t || !isAdmin) return;
    if (!typeOptions.includes(t)) {
      setCustomTypes((cs) => [...cs, t]);
      addCampaignType(t);
    }
    setNc((n) => ({ ...n, campType: t }));
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Completed: true, Draft: true, Cancelled: true,
  });

  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const addCampaign = async () => {
    if (!nc.name.trim()) return;
    const nextSeq = Math.max(0, ...campaigns.map((c) => Number(c.id.match(/(\d+)$/)?.[1] ?? 0))) + 1;
    const row: CampaignRow = {
      id: `CAM-2026-${String(nextSeq).padStart(4, "0")}`, name: nc.name.trim(), b: nc.b,
      branch: nc.branch.trim() || "—", owner: nc.owner.trim() || "Unassigned",
      budget: parseFloat(nc.budget) || 0, spend: 0, roi: 0, dates: nc.dates.trim() || "TBD",
      status: nc.status, campType: nc.campType, readiness: "needs_attention" as Readiness,
      taskBlocked: 0, taskWaiting: 0, taskOverdue: 0, taskTotal: 0, taskDone: 0, taskInProgress: 0,
      bottleneckTeam: "None", nextApproval: "CMO",
    };
    setNewOpen(false); setNc(emptyNew);
    setCampaigns((cs) => [row, ...cs]);
    setCollapsed((c) => ({ ...c, [row.status]: false }));
    await createCampaign(row);
  };

  const field = "w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";

  const owners = Array.from(new Set(campaigns.map((c) => c.owner).filter(Boolean)));
  // Branches may be comma-joined (multi-branch campaigns); split for the filter.
  const allBranches = Array.from(new Set(campaigns.flatMap((c) => (c.branch || "").split(",").map((s) => s.trim())).filter((s) => s && s !== "—")));
  const inBand = (b: number) => budgetBand === "all"
    || (budgetBand === "lt100" && b < 100000)
    || (budgetBand === "100-300" && b >= 100000 && b <= 300000)
    || (budgetBand === "gt300" && b > 300000);

  const filtered = campaigns.filter((c) =>
    (brand === "all" || c.b === brand) &&
    (status === "all" || c.status === status) &&
    (!search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase())) &&
    (owner === "all" || c.owner === owner) &&
    (branchFilter === "all" || (c.branch || "").split(",").map((s) => s.trim()).includes(branchFilter)) &&
    inBand(c.budget) &&
    rangeInFilter(date, c.dates),
  );
  const groups = STATUS_ORDER
    .map((s) => ({ status: s, rows: filtered.filter((c) => c.status === s) }))
    .filter((g) => g.rows.length > 0);
  const activeStatuses = new Set(["Planning", "Active", "In Progress", "Waiting Approval"]);
  const liveCampaigns = filtered.filter((c) => activeStatuses.has(c.status));
  const waitingApprovalCampaigns = filtered.filter((c) => c.status === "Waiting Approval" || c.nextApproval !== "—");
  const atRiskCampaigns = filtered.filter((c) => c.readiness === "needs_attention" || c.taskOverdue > 0 || c.taskBlocked > 0);
  const budgetWatchCampaigns = filtered.filter((c) => c.budget > 0 && (c.spend / c.budget) >= 0.8);
  const liveBudget = liveCampaigns.reduce((sum, c) => sum + c.budget, 0);
  const liveSpend = liveCampaigns.reduce((sum, c) => sum + c.spend, 0);
  const liveOwners = Array.from(new Set(liveCampaigns.map((c) => c.owner).filter(Boolean))).length;
  const statusChips = ["all", ...STATUS_ORDER];

  return (
    <>
      <div className="flex flex-col gap-3" style={{ background: "#F8F7F3" }}>
        <CampaignPageHeaderSection
          eyebrow="CAMPAIGN COMMAND CENTER"
          title="Campaign Café"
          description="Plan, track, and profit from every activation"
        />

        <CampaignCommandBar
          action={<Link href="/campaigns/new" className="text-[13px] font-bold text-white rounded-[14px] px-5 py-[11px] shadow-sm" style={{ background: "#6C5CE7" }}>+ Create Campaign</Link>}
        >
          <DateFilterBar value={date} onChange={setDate} />
        </CampaignCommandBar>

        <ModuleSummaryCard
          title="Campaign Café Summary"
          titleClassName="text-[#31531F]"
          style={{
            background: "linear-gradient(180deg, #D8FFA9 0%, #C9F28C 100%)",
            border: "1px solid #B8E37A",
            boxShadow: "0 18px 44px rgba(139, 184, 73, 0.20)",
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <div className="text-[15px] font-bold text-[#203515]">Needs action first</div>
              <div className="text-[12px] text-[#4E6A38] mt-1">Campaigns that need approval, follow-up, or close monitoring right now</div>
            </div>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value as BrandFilterValue)}
              className="text-[12px] font-semibold rounded-[14px] px-3.5 py-[9px] outline-none cursor-pointer border"
              style={{ background: "rgba(255,255,255,0.55)", borderColor: "#AFD76F", color: "#203515" }}
            >
              <option value="all">All Brands</option>
              {BRAND_ORDER.map((id) => <option key={id} value={id}>{BRANDS[id].name}</option>)}
            </select>
          </div>
          <div className="rounded-[18px] px-4 py-3 border bg-white/35" style={{ borderColor: "#AFD76F" }}>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-pill px-3 py-[7px] text-[11px] font-extrabold tracking-[0.01em] text-[#1E3213] border" style={{ background: "rgba(255,255,255,0.62)", borderColor: "#A9D66A" }}>
                {waitingApprovalCampaigns.length} waiting approval
              </span>
              <span className="rounded-pill px-3 py-[7px] text-[11px] font-extrabold tracking-[0.01em] text-[#1E3213] border" style={{ background: "rgba(255,255,255,0.62)", borderColor: "#A9D66A" }}>
                {budgetWatchCampaigns.length} near budget limit
              </span>
              <span className="rounded-pill px-3 py-[7px] text-[11px] font-extrabold tracking-[0.01em] text-[#1E3213] border" style={{ background: "rgba(255,255,255,0.62)", borderColor: "#A9D66A" }}>
                {atRiskCampaigns.length} need follow-up
              </span>
            </div>
          </div>
        </ModuleSummaryCard>

        <FilterBar>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Brand</span>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value as BrandFilterValue)}
                className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] cursor-pointer outline-none"
                style={{ borderColor: "#ECEAF2" }}
              >
                <option value="all">All Brands</option>
                {BRAND_ORDER.map((b) => <option key={b} value={b}>{brandName(b)}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Branch</span>
              <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] cursor-pointer outline-none" style={{ borderColor: "#ECEAF2" }}>
                <option value="all">All Branches</option>
                {allBranches.map((br) => <option key={br} value={br}>{br}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] cursor-pointer outline-none"
                style={{ borderColor: "#ECEAF2" }}
              >
                {statusChips.map((s) => (
                  <option key={s} value={s}>{s === "all" ? "All Statuses" : s}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Owner</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] cursor-pointer outline-none" style={{ borderColor: "#ECEAF2" }}>
                <option value="all">All Owners</option>
                {owners.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Budget</span>
              <select value={budgetBand} onChange={(e) => setBudgetBand(e.target.value)} className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] cursor-pointer outline-none" style={{ borderColor: "#ECEAF2" }}>
                <option value="all">Any Budget</option>
                <option value="lt100">&lt; ฿100K</option>
                <option value="100-300">฿100K – ฿300K</option>
                <option value="gt300">&gt; ฿300K</option>
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Search</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นชื่อแคมเปญ…"
                className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] outline-none w-full" style={{ borderColor: "#ECEAF2" }} />
            </div>
          </div>
        </FilterBar>
      </div>

      {/* Status-grouped collapsible list */}
      <div className="mt-4 flex flex-col gap-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.status];
          return (
            <div key={g.status} className="bg-surface border border-line rounded-cardLg overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g.status]: !c[g.status] }))}
                className="w-full flex items-center gap-2 px-5 py-[13px] hover:bg-ivory/60 transition"
              >
                {isCollapsed ? <ChevronRight size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
                <StatusBadge tone={campaignTone(g.status)}>{g.status}</StatusBadge>
                <span className="text-[12px] text-faint font-semibold">{g.rows.length}</span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-line4">
                  {/* header row (desktop) */}
                  <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
                    style={{ gridTemplateColumns: "2.4fr 1.3fr 1fr 1fr 0.9fr 1.2fr" }}>
                    <div>Campaign</div><div>Brand · Branch</div><div>Owner</div><div>Budget</div><div>ROI</div><div>Readiness</div>
                  </div>
                  {g.rows.map((c) => (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="grid grid-cols-1 md:grid-cols-[2.4fr_1.3fr_1fr_1fr_0.9fr_1.2fr] gap-y-1 px-5 py-[13px] items-center border-b border-line4 last:border-0 hover:bg-ivory/60 transition"
                    >
                      <div>
                        <div className="text-[13.5px] font-bold text-ink">{c.name}</div>
                        <div className="text-[11px] text-faint mt-[1px]">{c.campType} · {c.dates}</div>
                        {c.taskTotal > 0 && (
                          <div className="flex items-center gap-2 mt-[5px] max-w-[200px]">
                            <div className="flex-1 h-[5px] rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round((c.taskDone / c.taskTotal) * 100)}%`, background: "#4E7A4E" }} /></div>
                            <span className="text-[10.5px] font-bold text-faint whitespace-nowrap">{c.taskDone}/{c.taskTotal} tasks</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-[6px] text-[12px] text-muted">
                        <BrandDot brand={c.b} size={7} />{c.branch}
                      </div>
                      <div className="text-[12.5px] text-muted">{c.owner}</div>
                      <div className="text-[13px] font-semibold text-ink">{baht(c.budget, { compact: true })}</div>
                      <div className="text-[13px] font-bold" style={{ color: !c.roi ? "#9A9387" : c.roi < 2 ? "#C68A1E" : "#4E7A4E" }}>
                        {c.roi ? `${c.roi}×` : "—"}
                      </div>
                      <div>
                        <StatusBadge tone={READINESS_META[c.readiness].tone}>{READINESS_META[c.readiness].label}</StatusBadge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New Campaign modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNewOpen(false)} />
          <div className="relative bg-surface rounded-cardLg border border-line shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div className="text-[16px] font-extrabold">New campaign</div>
              <button onClick={() => setNewOpen(false)} className="text-[18px] text-faint leading-none -mt-1">✕</button>
            </div>
            <div className="flex flex-col gap-4">
              <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Campaign name <span className="text-status-red">*</span></label><input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="e.g. Wagyu Festival" className={field} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={nc.b} onChange={(e) => setNc({ ...nc, b: e.target.value as BrandId })} className={field}>{BRAND_ORDER.map((b) => <option key={b} value={b}>{brandName(b)}</option>)}</select></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Branch</label><input value={nc.branch} onChange={(e) => setNc({ ...nc, branch: e.target.value })} placeholder="e.g. Thonglor" className={field} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Owner</label><input value={nc.owner} onChange={(e) => setNc({ ...nc, owner: e.target.value })} placeholder="Name" className={field} /></div>
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Budget (฿)</label><input type="number" value={nc.budget} onChange={(e) => setNc({ ...nc, budget: e.target.value })} placeholder="0" className={field} /></div>
              </div>
              <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Dates</label><input value={nc.dates} onChange={(e) => setNc({ ...nc, dates: e.target.value })} placeholder="e.g. Jul 1 – Jul 31" className={field} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Status</label><select value={nc.status} onChange={(e) => setNc({ ...nc, status: e.target.value })} className={field}>{NEW_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Type</label>
                  <select value={nc.campType} onChange={(e) => setNc({ ...nc, campType: e.target.value })} className={field}>{typeOptions.map((t) => <option key={t}>{t}</option>)}</select>
                  {isAdmin && (addingType ? (
                    <div className="flex gap-2 mt-2">
                      <input autoFocus value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addType(); }} placeholder="New type name" className="flex-1 text-[13px] px-[10px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" />
                      <button onClick={addType} className="text-[12px] font-bold text-white bg-panel rounded-[9px] px-3">Add</button>
                      <button onClick={() => { setAddingType(false); setNewType(""); }} className="text-[12px] font-semibold text-muted border border-line2 rounded-[9px] px-3 bg-white">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingType(true)} className="text-[11.5px] font-semibold text-accent mt-[6px]">+ Add a custom type <span className="text-faint font-normal">(admin)</span></button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={addCampaign} disabled={!nc.name.trim()} className="flex-1 text-[13px] font-bold text-white bg-panel rounded-[10px] py-[11px] disabled:opacity-40">Create campaign</button>
              <button onClick={() => setNewOpen(false)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-5 py-[11px] bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
