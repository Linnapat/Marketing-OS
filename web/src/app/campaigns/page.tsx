"use client";

import { toastError } from "@/lib/toast";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandDot } from "@/components/ui/BrandDot";
import { BrandFilterValue, BrandId, brandColor, brandName } from "@/lib/brands";
import { useRole } from "@/lib/role";
import { memberTeam } from "@/components/ui/OwnerSelect";
import { baht, num } from "@/lib/format";
import { campaignTone } from "@/lib/status";
import {
  STATUS_ORDER, READINESS_META, CampaignRow,
} from "@/lib/data/campaigns";
import { CampaignBrief, visitGoalOf } from "@/lib/data/brief";
import { fetchAllBriefs } from "@/lib/db/brief";
import { fetchCampaigns, deleteCampaign, updateCampaignStatus } from "@/lib/db/campaigns";
import { fetchBrandConfigs, fetchMembers } from "@/lib/db/settings";
import { BRANDS_DATA, BrandCfg } from "@/lib/data/settings";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, rangeInFilter } from "@/components/ui/DateFilterBar";
import { SavedViewsBar } from "@/components/ui/SavedViews";
import { useBrandVisibility } from "@/lib/brandVisibility";
import {
  CampaignCommandBar,
  CampaignPageHeaderSection,
} from "@/components/campaign/CampaignHeadController";

const ACTION_STATUSES = ["Draft", "Waiting Approval", "Approved", "Active", "Paused", "Inactive", "Completed", "Cancelled"];

// Campaign · Brand·Branch · Owner · Budget · Visit · Ready · Actions.
// Actions has a hard floor rather than a bare fr: it holds the status select,
// Edit and Delete side by side, and the longest status ("Waiting for Approval")
// makes that select wide. Given only a share of the row, the cell would run out
// of room and drop Delete onto a second line, leaving the column two rows tall.
// The floor keeps all three on one line; the fr only decides how it grows.
const COLS = "1.9fr 1.05fr 0.9fr 0.8fr 0.7fr 0.55fr minmax(292px, 2fr)";

type GroupBy = "status" | "brand";

export default function CampaignsPage() {
  const brandVisibility = useBrandVisibility();
  const { role } = useRole();
  // Status drives the approval flow, so only the CMO may move it.
  const canChangeStatus = role === "CMO";
  // Creating campaigns is planning work — Creative-team roles (Graphic, VDO,
  // Creative Leader) work INSIDE campaigns, they don't open them.
  const canCreateCampaign = memberTeam(role) !== "Creative";
  // BUG-03 (RBAC test): access level "Editor" alone let every job function edit
  // and even DELETE approved campaigns with real budgets. First increment of
  // the agreed split: deleting a campaign is the CMO's call (like status), and
  // editing the brief is campaign-management work — CMO or the Marketing
  // Manager/BGL who runs it. Creative/VDO roles keep full read access.
  const canDeleteCampaign = role === "CMO";
  const canEditCampaign = role === "CMO" || role === "Marketing Manager / BGL";
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const permittedBrandOptions = brandVisibility.visibleBrands;
  const [brand, setBrand] = useState<BrandFilterValue>("all");
  const [search, setSearch] = useState<string>("");
  const [date, setDate] = useState(DEFAULT_DATE_FILTER);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  // Keyed by campaign NAME — that's the shape fetchAllBriefs returns, not by id.
  const [briefs, setBriefs] = useState<Record<string, CampaignBrief>>({});
  // Older campaigns have no brief at all, so this reads 0 and the cell shows "—".
  const visitGoal = (c: CampaignRow): number => visitGoalOf(briefs[c.name]);
  // Email → nickname map so the Owner column shows a person's name, not the
  // raw login email that some campaigns were saved with.
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const ownerLabel = (owner: string) => {
    const key = (owner || "").toLowerCase();
    if (ownerNames[key]) return ownerNames[key];
    // Fallback: strip the domain so a bare email still reads as a handle.
    return owner.includes("@") ? owner.split("@")[0] : owner;
  };
  const [brandConfigs, setBrandConfigs] = useState<BrandCfg[]>(() => BRANDS_DATA.map((b) => ({ ...b, branchList: [...b.branchList] })));
  const configuredBrandIds = useMemo(() => new Set(brandConfigs.map((item) => item.key)), [brandConfigs]);
  const brandOptions = useMemo(
    () => permittedBrandOptions.filter((item) => configuredBrandIds.has(item)),
    [configuredBrandIds, permittedBrandOptions],
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Completed: true, Draft: true, Cancelled: true,
  });
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

  // Opening a campaign and coming back unmounts this page, so the month, grouping
  // and filters reset — you'd land on "this month / by status" every time and have
  // to dial your view back in after every edit. Remember it for the session.
  // sessionStorage, not localStorage: picking up where you left off is about the
  // sitting you're in; a month you chose last week shouldn't greet you tomorrow.
  const VIEW_KEY = "mos-campaigns-view";
  const [viewRestored, setViewRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_KEY);
      if (raw) {
        const v = JSON.parse(raw) as Partial<{ groupBy: GroupBy; brand: BrandFilterValue; search: string; date: DateFilter }>;
        if (v.groupBy) setGroupBy(v.groupBy);
        if (v.brand) setBrand(v.brand);          // the normalize effect below still vets it
        if (typeof v.search === "string") setSearch(v.search);
        if (v.date) setDate(v.date);
      }
    } catch { /* a corrupt entry must never keep the page from rendering */ }
    setViewRestored(true);
  }, []);
  useEffect(() => {
    // Only after the restore has run — otherwise the first render's defaults
    // overwrite the very thing we're trying to bring back.
    if (!viewRestored) return;
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ groupBy, brand, search, date })); } catch { /* private mode */ }
  }, [viewRestored, groupBy, brand, search, date]);

  useEffect(() => {
    const next = brandVisibility.normalize(brand);
    if (next !== brand) setBrand(next);
  }, [brand, brandVisibility]);

  useEffect(() => {
    let alive = true;
    fetchCampaigns().then((c) => { if (alive) setCampaigns(c); }).catch(() => {});
    // Visit lives in the brief (campaigns.data), not in the campaigns columns,
    // so the list has to read the briefs to show it.
    fetchAllBriefs().then((m) => { if (alive) setBriefs(m); }).catch(() => {});
    fetchMembers().then((ms) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      for (const m of ms) { if (m.email) map[m.email.toLowerCase()] = m.name; }
      setOwnerNames(map);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    fetchBrandConfigs().then((configs) => { if (alive) setBrandConfigs(configs); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const configuredBrandName = (id: BrandId) => brandConfigs.find((item) => item.key === id)?.name ?? brandName(id);

  const filtered = campaigns.filter((c) =>
    // Brand-scope first: a member only ever sees campaigns of brands they manage.
    brandVisibility.visibleBrands.includes(c.b) &&
    (brand === "all" || c.b === brand) &&
    (!search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase())) &&
    rangeInFilter(date, c.dates),
  );
  const statusRank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  // Groups carry a key of their own so the collapsed map can hold both modes at
  // once; status keys stay bare to keep the defaults set above working.
  const groups = groupBy === "status"
    ? STATUS_ORDER
      .map((s) => ({ key: s, status: s as string | null, brand: null as BrandId | null, rows: filtered.filter((c) => c.status === s) }))
      .filter((g) => g.rows.length > 0)
    : brandVisibility.visibleBrands
      .map((b) => ({
        key: `brand:${b}`,
        status: null,
        brand: b as BrandId | null,
        rows: filtered.filter((c) => c.b === b).sort((a, z) => statusRank(a.status) - statusRank(z.status)),
      }))
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
      row.id === id ? { ...row, status: nextStatus, nextApproval: nextStatus.includes("Waiting") ? DEFAULT_APPROVER : "None" } : row
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
              {canCreateCampaign && (
                <Link href="/campaigns/new" className="text-[13px] font-bold text-white rounded-[14px] px-5 py-[11px] shadow-sm" style={{ background: "#6C5CE7" }}>+ Create Campaign</Link>
              )}
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
                <option value="all">{brandVisibility.allowAll ? "All Brands" : "ทุกแบรนด์ที่ดูแล"}</option>
                {brandOptions.map((b) => <option key={b} value={b}>{configuredBrandName(b)}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Search</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นชื่อแคมเปญ…"
                className="text-[12px] font-semibold text-ink bg-white border rounded-[14px] px-3.5 py-[10px] outline-none w-full" style={{ borderColor: "#ECEAF2" }} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "#9D96AC" }}>Group by</span>
            <div className="flex gap-1 p-[3px] rounded-[12px] bg-white border" style={{ borderColor: "#ECEAF2" }}>
              {([["status", "สถานะ"], ["brand", "แบรนด์"]] as [GroupBy, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroupBy(key)}
                  className="text-[12px] font-bold rounded-[9px] px-3 py-[6px] transition"
                  style={groupBy === key
                    ? { background: "#6C5CE7", color: "#fff" }
                    : { background: "transparent", color: "#6B6577" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CampaignCommandBar>
      </div>

      {/* Status-grouped collapsible list */}
      <div className="mt-4 flex flex-col gap-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.key];
          const totalBudget = g.rows.reduce((sum, c) => sum + (c.budget || 0), 0);
          const totalVisit = g.rows.reduce((sum, c) => sum + visitGoal(c), 0);
          return (
            <div key={g.key} className="bg-surface border border-line rounded-cardLg overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                className="w-full flex items-center gap-2 px-5 py-[13px] hover:bg-ivory/60 transition"
              >
                {isCollapsed ? <ChevronRight size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
                {g.brand ? (
                  <span className="flex items-center gap-[6px] text-[13px] font-extrabold text-ink">
                    <BrandDot brand={g.brand} size={8} />{configuredBrandName(g.brand)}
                  </span>
                ) : (
                  <StatusBadge tone={campaignTone(g.status!)}>{g.status}</StatusBadge>
                )}
                <span className="text-[12px] text-faint font-semibold">{g.rows.length}</span>
                {g.brand && (
                  <span className="ml-auto flex items-baseline gap-3 text-[12px] font-semibold text-faint">
                    <span>{baht(totalBudget, { compact: true })}</span>
                    {totalVisit > 0 && <span title="รวม Visit goal ของกลุ่มนี้">{num(totalVisit)} visits</span>}
                  </span>
                )}
              </button>
              {!isCollapsed && (
                <div className="border-t border-line4">
                  {/* header row (desktop) */}
                  <div className="hidden md:grid px-5 py-2 text-[10px] uppercase tracking-[0.05em] text-faint font-bold border-b border-line4"
                    style={{ gridTemplateColumns: COLS }}>
                    <div>Campaign</div><div>Brand · Branch</div><div>Owner</div><div>Budget</div><div>Visit</div><div className="text-center">Ready</div><div>Actions</div>
                  </div>
                  {g.rows.map((c) => (
                    <div
                      key={c.id}
                      // The row wears its brand's own colour: a 5% wash plus a rule
                      // down the left edge. Grouped by brand it makes each group read
                      // as one band; grouped by status — where brands are mixed
                      // together — it's what lets you tell them apart while scanning.
                      // Hover is an inset overlay rather than a background, because a
                      // background would have to fight this tint and one of them would
                      // have to lose.
                      style={{
                        background: `${brandColor(c.b)}0D`,
                        borderLeft: `3px solid ${brandColor(c.b)}`,
                        // Fed to the md: grid rule below, so the row and its header
                        // read their columns from the one COLS definition.
                        ["--cols" as string]: COLS,
                      }}
                      className="grid grid-cols-1 gap-y-2 px-5 py-[13px] items-center border-b border-line4 last:border-0 transition hover:shadow-[inset_0_0_0_9999px_rgba(23,23,42,0.035)] md:[grid-template-columns:var(--cols)]"
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
                      <div className="text-[12.5px] text-muted truncate" title={c.owner}>{ownerLabel(c.owner)}</div>
                      <div className="text-[13px] font-semibold text-ink">{baht(c.budget, { compact: true })}</div>
                      <div className="text-[13px] font-semibold" style={{ color: visitGoal(c) ? "#211F1C" : "#9A9387" }}>
                        {visitGoal(c) ? num(visitGoal(c)) : "—"}
                      </div>
                      {/* Readiness as a single symbol (label on hover) */}
                      <div className="md:text-center" title={READINESS_META[c.readiness].label}>
                        <span className="text-[17px] leading-none">
                          {c.readiness === "ready" ? "✅" : c.readiness === "blocked" ? "⛔" : "⚠️"}
                        </span>
                      </div>
                      {/* Actions — status + edit + delete, always on one row */}
                      <div className="flex items-center gap-2 flex-nowrap">
                        {canChangeStatus ? (() => {
                          const statusOptions = ACTION_STATUSES.includes(c.status) ? ACTION_STATUSES : [c.status, ...ACTION_STATUSES];
                          return (
                        <select
                          value={c.status}
                          onChange={(e) => onStatusChange(c.id, e.target.value)}
                          disabled={busyCampaignId === c.id}
                          className="text-[11.5px] font-bold text-ink bg-white border rounded-[10px] px-2.5 py-[7px] cursor-pointer outline-none disabled:opacity-50 min-w-0 flex-1"
                          style={{ borderColor: "#ECEAF2" }}
                        >
                          {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                          );
                        })() : (
                          <span title="เฉพาะ CMO เท่านั้นที่เปลี่ยนสถานะแคมเปญได้">
                            <StatusBadge tone={campaignTone(c.status)}>{c.status}</StatusBadge>
                          </span>
                        )}
                        {canEditCampaign && (
                          <Link
                            href={`/campaigns/new?edit=${c.id}`}
                            className="text-[11.5px] font-bold rounded-[10px] px-3 py-[7px] border bg-white text-[#5B4FD8] shrink-0 whitespace-nowrap"
                            style={{ borderColor: "#DCD6F7" }}
                          >
                            Edit
                          </Link>
                        )}
                        {canDeleteCampaign && (
                          <button
                            type="button"
                            onClick={() => onDelete(c)}
                            disabled={busyCampaignId === c.id}
                            className="text-[11.5px] font-bold rounded-[10px] px-3 py-[7px] border bg-white text-[#C74B4B] disabled:opacity-50 shrink-0 whitespace-nowrap"
                            style={{ borderColor: "#F2CACA" }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty state — the filtered period has no campaigns. Without this the
            list area renders blank and reads as a broken page (see audit P2-4). */}
        {groups.length === 0 && (
          <div className="bg-surface border border-line rounded-cardLg px-6 py-14 text-center">
            <div className="text-[15px] font-extrabold text-ink mb-1">ไม่มี Campaign ในช่วงเวลานี้</div>
            <div className="text-[13px] text-muted leading-[1.6] mb-5">
              {campaigns.length === 0
                ? "ยังไม่มี Campaign ในระบบ — เริ่มสร้าง Campaign แรกได้เลย"
                : "ไม่พบ Campaign ที่ตรงกับช่วงเวลา/แบรนด์/คำค้นที่เลือก ลองดูทั้งปีหรือปรับตัวกรอง"}
            </div>
            <div className="flex items-center justify-center gap-2">
              {date.mode !== "year" && campaigns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDate((d) => ({ ...d, mode: "year", start: new Date(d.year, 0, 1).toISOString().slice(0, 10), end: new Date(d.year, 11, 31).toISOString().slice(0, 10) }))}
                  className="text-[12.5px] font-bold rounded-[10px] px-4 py-[9px] border border-line2 bg-white text-ink hover:bg-ivory transition"
                >
                  ดูทั้งปี {date.year}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </>
  );
}
