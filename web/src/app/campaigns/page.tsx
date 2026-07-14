"use client";

import { toastError } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";
import { BrandFilterValue, BrandId, brandName } from "@/lib/brands";
import { SELECT_STYLE_DARK } from "@/components/ui/selectStyle";
import { baht } from "@/lib/format";
import { campaignTone } from "@/lib/status";
import {
  STATUS_ORDER, READINESS_META, CampaignRow, Readiness,
} from "@/lib/data/campaigns";
import { CAMPAIGN_TYPES } from "@/lib/data/brief";
import { fetchCampaigns, createCampaign, deleteCampaign, updateCampaignStatus } from "@/lib/db/campaigns";
import { fetchBrandConfigs, fetchCampaignTypeConfigs } from "@/lib/db/settings";
import { BRANDS_DATA, BrandCfg } from "@/lib/data/settings";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, rangeInFilter } from "@/components/ui/DateFilterBar";
import { SavedViewsBar } from "@/components/ui/SavedViews";
import { useBrandVisibility } from "@/lib/brandVisibility";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";

const NEW_STATUSES = ["Draft", "Planning", "Active", "In Progress", "Waiting Approval"];
const ACTION_STATUSES = ["Draft", "Waiting Approval", "Approved", "Active", "Paused", "Inactive", "Completed", "Cancelled"];

export default function CampaignsPage() {
  const brandVisibility = useBrandVisibility();
  const permittedBrandOptions = brandVisibility.visibleBrands;
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [search, setSearch] = useState<string>("");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [brandConfigs, setBrandConfigs] = useState<BrandCfg[]>(() => BRANDS_DATA.map((b) => ({ ...b, branchList: [...b.branchList] })));
  const configuredBrandIds = useMemo(() => new Set(brandConfigs.map((item) => item.key)), [brandConfigs]);
  const brandOptions = useMemo(
    () => permittedBrandOptions.filter((item) => configuredBrandIds.has(item)),
    [configuredBrandIds, permittedBrandOptions],
  );
  const [newOpen, setNewOpen] = useState(false);
  const defaultBrand = brandOptions[0] ?? permittedBrandOptions[0] ?? "teppen";
  const emptyNew = { name: "", b: defaultBrand as BrandId, branch: "", owner: "", budget: "", dates: "", status: "Draft", campType: CAMPAIGN_TYPES[0] as string };
  const [nc, setNc] = useState(emptyNew);
  const [typeOptions, setTypeOptions] = useState<string[]>(() => [...CAMPAIGN_TYPES]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Completed: true, Draft: true, Cancelled: true,
  });
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

  useEffect(() => {
    const next = brandVisibility.normalize(brand);
    if (next !== brand) setBrand(next);
  }, [brand, brandVisibility]);

  useEffect(() => {
    if (brandOptions.length && !brandOptions.includes(nc.b)) setNc((n) => ({ ...n, b: defaultBrand as BrandId, branch: "" }));
  }, [brandOptions, defaultBrand, nc.b]);

  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchBrandConfigs(), fetchCampaignTypeConfigs()]).then(([configs, types]) => {
      if (!alive) return;
      setBrandConfigs(configs);
      setTypeOptions(types);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const newCampaignBranches = useMemo(() => brandConfigs.find((b) => b.key === nc.b)?.branchList ?? [], [brandConfigs, nc.b]);
  const selectedNewCampaignBranches = useMemo(() => nc.branch.split(",").map((item) => item.trim()).filter(Boolean), [nc.branch]);
  useEffect(() => {
    const valid = selectedNewCampaignBranches.filter((item) => newCampaignBranches.includes(item));
    if (valid.length !== selectedNewCampaignBranches.length) setNc((n) => ({ ...n, branch: valid.join(", ") }));
  }, [nc.branch, newCampaignBranches]);

  const configuredBrandName = (id: BrandId) => brandConfigs.find((item) => item.key === id)?.name ?? brandName(id);

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
    try {
      await createCampaign(row);
      setNewOpen(false); setNc(emptyNew);
      setCampaigns((cs) => [row, ...cs]);
      setCollapsed((c) => ({ ...c, [row.status]: false }));
    } catch (error) {
      toastError(`สร้าง Campaign ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const field = "w-full text-[14px] px-[12px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";

  const filtered = campaigns.filter((c) =>
    (brand === "all" || c.b === brand) &&
    (!search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase())) &&
    rangeInFilter(date, c.dates),
  );
  const groups = STATUS_ORDER
    .map((s) => ({ status: s, rows: filtered.filter((c) => c.status === s) }))
    .filter((g) => g.rows.length > 0);

  // A campaign that covers every branch of its brand reads "All branches"
  // instead of the full comma-joined list.
  const branchLabel = (c: CampaignRow) => {
    const list = (c.branch || "").split(",").map((s) => s.trim()).filter(Boolean);
    const all = brandConfigs.find((b) => b.key === c.b)?.branchList ?? [];
    return all.length > 0 && list.length >= all.length && all.every((br) => list.includes(br)) ? "All branches" : c.branch;
  };

  const onStatusChange = async (id: string, nextStatus: string) => {
    setBusyCampaignId(id);
    const previous = campaigns.find((row) => row.id === id);
    setCampaigns((rows) => rows.map((row) => (
      row.id === id ? { ...row, status: nextStatus, nextApproval: nextStatus.includes("Waiting") ? "CMO" : "None" } : row
    )));
    setCollapsed((state) => ({ ...state, [nextStatus]: false }));
    try {
      await updateCampaignStatus(id, nextStatus);
    } catch (error) {
      if (previous) setCampaigns((rows) => rows.map((row) => row.id === id ? previous : row));
      toastError(`เปลี่ยนสถานะ Campaign ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusyCampaignId(null);
    }
  };

  const onDelete = async (campaign: CampaignRow) => {
    if (!window.confirm(`Delete campaign "${campaign.name}"? This will remove linked planner rows and tasks too.`)) return;
    setBusyCampaignId(campaign.id);
    setCampaigns((rows) => rows.filter((row) => row.id !== campaign.id));
    try {
      await deleteCampaign(campaign.id);
    } catch (error) {
      setCampaigns((rows) => [campaign, ...rows]);
      toastError(`ลบ Campaign ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusyCampaignId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3" style={{ background: "#F8F7F3" }}>
        <CampaignPageHeaderSection
          eyebrow="CAMPAIGN COMMAND CENTER"
          title="Campaign Café"
          description="Plan, track, and profit from every activation"
        />

        <CampaignCommandBar
          action={(
            <>
              <Link href="/campaigns/omd-store" className="text-[13px] font-bold rounded-[14px] px-4 py-[11px] border border-[#ECEAF2] bg-white text-[#5B4FD8]">
                Promotion Summary Print
              </Link>
              <Link href="/campaigns/new" className="text-[13px] font-bold text-white rounded-[14px] px-5 py-[11px] shadow-sm" style={{ background: "#6C5CE7" }}>+ Create Campaign</Link>
            </>
          )}
        >
          <div className="mb-2 flex justify-end">
            <SavedViewsBar<{ brand: BrandFilterValue; search: string; date: DateFilter }>
              pageKey="campaigns"
              current={{ brand, search, date }}
              onApply={(v) => { setBrand(v.brand); setSearch(v.search); setDate(v.date); }}
            />
          </div>
          <DateFilterBar value={date} onChange={setDate} />
          <div className="mt-2 grid gap-3 md:grid-cols-[240px_1fr]">
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Brand</span>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value as BrandFilterValue)}
                className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] cursor-pointer outline-none"
                style={{ borderColor: "#ECEAF2" }}
              >
                {brandVisibility.allowAll && <option value="all">All Brands</option>}
                {brandOptions.map((b) => <option key={b} value={b}>{configuredBrandName(b)}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Search</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นชื่อแคมเปญ…"
                className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] outline-none w-full" style={{ borderColor: "#ECEAF2" }} />
            </div>
          </div>
        </CampaignCommandBar>
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
                    style={{ gridTemplateColumns: "2.2fr 1.25fr 0.9fr 0.85fr 0.75fr 1.05fr 1.6fr" }}>
                    <div>Campaign</div><div>Brand · Branch</div><div>Owner</div><div>Budget</div><div>ROAS</div><div>Readiness</div><div>Actions</div>
                  </div>
                  {g.rows.map((c) => (
                    <div
                      key={c.id}
                      className="grid grid-cols-1 md:grid-cols-[2.2fr_1.25fr_0.9fr_0.85fr_0.75fr_1.05fr_1.6fr] gap-y-2 px-5 py-[13px] items-center border-b border-line4 last:border-0 hover:bg-ivory/60 transition"
                    >
                      <div>
                        <Link href={`/campaigns/${c.id}`} className="text-[13.5px] font-bold text-ink hover:text-accent transition">
                          {c.name}
                        </Link>
                        <div className="text-[11px] text-faint mt-[1px]">{c.campType} · {c.dates}</div>
                        {c.taskTotal > 0 && (
                          <div className="flex items-center gap-2 mt-[5px] max-w-[200px]">
                            <div className="flex-1 h-[5px] rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round((c.taskDone / c.taskTotal) * 100)}%`, background: "#4E7A4E" }} /></div>
                            <span className="text-[10.5px] font-bold text-faint whitespace-nowrap">{c.taskDone}/{c.taskTotal} tasks</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-[6px] text-[12px] text-muted">
                        <BrandDot brand={c.b} size={7} />{branchLabel(c)}
                      </div>
                      <div className="text-[12.5px] text-muted">{c.owner}</div>
                      <div className="text-[13px] font-semibold text-ink">{baht(c.budget, { compact: true })}</div>
                      <div className="text-[13px] font-bold" style={{ color: !c.roi ? "#9A9387" : c.roi < 2 ? "#C68A1E" : "#4E7A4E" }}>
                        {c.roi ? `${c.roi}×` : "—"}
                      </div>
                      <div>
                        <StatusBadge tone={READINESS_META[c.readiness].tone}>{READINESS_META[c.readiness].label}</StatusBadge>
                      </div>
                      <div className="flex flex-col md:items-start gap-2">
                        {(() => {
                          const statusOptions = ACTION_STATUSES.includes(c.status) ? ACTION_STATUSES : [c.status, ...ACTION_STATUSES];
                          return (
                        <select
                          value={c.status}
                          onChange={(e) => onStatusChange(c.id, e.target.value)}
                          disabled={busyCampaignId === c.id}
                          className="min-w-[132px] text-[11.5px] font-bold text-ink bg-white border rounded-[12px] px-3 py-[8px] cursor-pointer outline-none disabled:opacity-50"
                          style={{ borderColor: "#ECEAF2" }}
                        >
                          {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                          );
                        })()}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/campaigns/new?edit=${c.id}`}
                            className="text-[11.5px] font-bold rounded-[12px] px-3 py-[7px] border bg-white text-[#5B4FD8]"
                            style={{ borderColor: "#DCD6F7" }}
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => onDelete(c)}
                            disabled={busyCampaignId === c.id}
                            className="text-[11.5px] font-bold rounded-[12px] px-3 py-[7px] border bg-white text-[#C74B4B] disabled:opacity-50"
                            style={{ borderColor: "#F2CACA" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
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
                <div><label className="block text-[11.5px] font-bold text-faint mb-[6px]">Brand</label><select value={nc.b} onChange={(e) => setNc({ ...nc, b: e.target.value as BrandId, branch: "" })} className={field}>{brandOptions.map((b) => <option key={b} value={b}>{configuredBrandName(b)}</option>)}</select></div>
                <div>
                  <label className="block text-[11.5px] font-bold text-faint mb-[6px]">Branch</label>
                  <MultiSelectDropdown options={newCampaignBranches} selected={selectedNewCampaignBranches} onChange={(next) => setNc({ ...nc, branch: next.join(", ") })} />
                </div>
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
                  <div className="text-[10.5px] text-faint mt-[6px]">Manage options in Settings → Campaign Types</div>
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
