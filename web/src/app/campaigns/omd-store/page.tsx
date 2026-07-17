"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Search } from "lucide-react";
import {
  OMD_STORE_CATEGORY_META,
  OMD_STORE_SYNC_CONTRACT,
  type OmdStorePromotion,
  type OmdStorePromotionCategory,
} from "@/lib/data/omdStorePromotions";
import { CAMPAIGNS, type CampaignRow } from "@/lib/data/campaigns";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { fetchPromotionSummaryItems, savePromotionSummaryItem } from "@/lib/db/promotionSummary";
import { fetchBrandConfigs } from "@/lib/db/settings";
import { fetchAllBriefs } from "@/lib/db/brief";
import type { CampaignBrief } from "@/lib/data/brief";
import { toastError } from "@/lib/toast";
import { BRAND_ORDER, brandName, type BrandId } from "@/lib/brands";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, filterWindow, parseRowDate, MONTHS } from "@/components/ui/DateFilterBar";

const categoryOrder = Object.keys(OMD_STORE_CATEGORY_META) as OmdStorePromotionCategory[];

type PrintTemplate = "board" | "compact" | "checklist";

const PRINT_TEMPLATES: Record<PrintTemplate, { label: string; helper: string }> = {
  board: {
    label: "Board",
    helper: "เหมือนหน้า webapp เหมาะสำหรับแปะหน้าร้าน",
  },
  compact: {
    label: "Compact Table",
    helper: "ตารางแน่นขึ้น เหมาะกับข้อมูลจำนวนมาก",
  },
  checklist: {
    label: "Branch Checklist",
    helper: "มีช่องเช็กให้ทีมหน้าร้านตรวจรายการ",
  },
};

function formatDate(value?: string) {
  if (!value) return "ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function statusLabel(item: OmdStorePromotion) {
  if (item.status === "open_end") return "ไม่ระบุวันจบ";
  if (item.status === "ended") return "จบแล้ว";
  if (item.status === "upcoming") return "กำลังจะเริ่ม";
  return "ใช้งานอยู่";
}

function branchMatch(item: OmdStorePromotion, branch: string) {
  return branch === "all" || item.branches.includes(branch) || item.branches.includes("All Branch");
}

/** What to print in the Branch column. Listing every branch of a brand that runs
 *  the promotion everywhere is noise on a printout — collapse it to "All branches".
 *  `brandBranches` is the brand's configured branch list (Settings → Brands); when
 *  it's unknown or the brand has a single branch we just name the branches, since
 *  "All branches" would be less informative than the name itself. */
function branchLabel(item: OmdStorePromotion, brandBranches: string[]): string {
  const list = item.branches.filter(Boolean);
  if (!list.length) return "—";
  if (list.some((b) => /^all\s*branch(es)?$/i.test(b))) return "All branches";
  if (brandBranches.length > 1 && brandBranches.every((b) => list.includes(b))) return "All branches";
  return list.join(", ");
}

function filterLabel(value: string, fallback: string) {
  return value === "all" ? fallback : value;
}

function sourceLabel(source?: OmdStorePromotion["source"]) {
  if (source === "campaign") return "Campaign";
  return "Campaign";
}

/** Local-safe yyyy-mm-dd (toISOString would shift a Bangkok midnight back a day). */
function isoDate(d: Date | null): string | undefined {
  if (!d) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function campaignToStorePromotion(campaign: CampaignRow, storePromotion: string): OmdStorePromotion {
  // Real campaign dates ("Jul 1 – Jul 31") — the period filter and the printed
  // Period column must reflect the actual flight, not a fixed placeholder.
  const [startRaw, endRaw] = (campaign.dates ?? "").split(/[–—-]/).map((s) => s.trim());
  const start = parseRowDate(startRaw);
  const end = parseRowDate(endRaw) ?? start;
  return {
    id: `campaign-${campaign.id}`,
    brand: campaign.b,
    category: "campaign",
    title: campaign.name,
    // The planner's store-facing promotion wording, verbatim. This column used to
    // print the campaign type and budget — internal facts the shop floor can't act
    // on, and a budget has no business being on a printout that leaves the office.
    description: storePromotion,
    // POS name is typed by the team before printing (saved per item) — the
    // approval status was never the right content for this column.
    posName: "",
    branches: campaign.branch.split(",").map((item) => item.trim()).filter(Boolean),
    startDate: isoDate(start) ?? "",
    endDate: isoDate(end),
    status: ["Completed", "Cancelled"].includes(campaign.status) ? "ended" : "active",
    source: "campaign",
  };
}

function toCsv(items: OmdStorePromotion[]) {
  const header = ["Source", "Brand", "Category", "Title", "Detail", "POS", "Branch", "Start", "End", "Status"];
  const rows = items.map((item) => [
    sourceLabel(item.source),
    brandName(item.brand),
    OMD_STORE_CATEGORY_META[item.category].label,
    item.title,
    item.description,
    item.posName,
    item.branches.join(", "),
    item.startDate,
    item.endDate ?? "",
    statusLabel(item),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function OmdStoreCampaignPage() {
  const [brand, setBrand] = useState<BrandId | "all">("all");
  const [category, setCategory] = useState<OmdStorePromotionCategory | "all">("all");
  const [branch, setBranch] = useState("all");
  // Print period — only promotions whose run overlaps the selected window
  // are printed. Same Month/Year/Range control as every other module.
  const [period, setPeriod] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [search, setSearch] = useState("");
  const [syncState, setSyncState] = useState<"ready" | "synced">("ready");
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate>("board");
  const [liveCampaigns, setLiveCampaigns] = useState<CampaignRow[]>(CAMPAIGNS);
  // Each brand's configured branch list, so the Branch column can collapse a
  // promotion that runs everywhere into "All branches".
  const [brandBranches, setBrandBranches] = useState<Record<string, string[]>>({});
  const [briefs, setBriefs] = useState<Record<string, CampaignBrief>>({});

  useEffect(() => {
    refreshFromSupabase();
  }, []);

  useEffect(() => {
    let alive = true;
    fetchBrandConfigs()
      .then((cfgs) => {
        if (alive) setBrandBranches(Object.fromEntries(cfgs.map((c) => [c.key, c.branchList ?? []])));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // POS names typed by the team — persisted per item in promotion_summary_items
  // so the whole team sees the same names on every print.
  const [posOverrides, setPosOverrides] = useState<Record<string, string>>({});

  const refreshFromSupabase = async () => {
    const campaignRows = await fetchCampaigns().catch(() => CAMPAIGNS);
    setLiveCampaigns(campaignRows.length ? campaignRows : CAMPAIGNS);
    // The store-facing promotion wording lives on the brief, not the campaign row.
    setBriefs(await fetchAllBriefs().catch(() => ({})));
    const saved = await fetchPromotionSummaryItems().catch(() => []);
    setPosOverrides(Object.fromEntries(saved.filter((s) => s.posName).map((s) => [s.id, s.posName])));
  };

  const setPosName = (id: string, value: string) => setPosOverrides((m) => ({ ...m, [id]: value }));
  const savePosName = (item: OmdStorePromotion) => {
    savePromotionSummaryItem({ ...item, posName: posOverrides[item.id] ?? "" })
      .catch((error) => toastError(`บันทึก POS name ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`));
  };

  // Only campaigns the planner gave a store-facing promotion reach the printout —
  // a campaign with nothing to announce in-store (brand work, always-on) would
  // otherwise print as a row the shop floor can do nothing with. The wording lives
  // on the brief (campaigns.data), so a campaign with no brief never prints.
  const campaignItems = useMemo(
    () => liveCampaigns
      // fetchAllBriefs keys by campaign NAME, not id — see lib/db/brief.ts.
      .map((c) => ({ campaign: c, promo: (briefs[c.name]?.storePromotion ?? "").trim() }))
      .filter(({ promo }) => promo.length > 0)
      .map(({ campaign, promo }) => campaignToStorePromotion(campaign, promo))
      .map((it) => ({ ...it, posName: posOverrides[it.id] ?? it.posName })),
    [liveCampaigns, briefs, posOverrides],
  );
  const allPromotions = campaignItems;

  const branches = useMemo(() => {
    return Array.from(new Set(allPromotions.flatMap((item) => item.branches))).sort();
  }, [allPromotions]);

  // Overlap test: an item prints when its run intersects the selected window.
  // Undated items stay visible so promotions never silently disappear.
  const inPeriod = (item: OmdStorePromotion) => {
    if (!item.startDate && !item.endDate) return true;
    const s = item.startDate ? new Date(`${item.startDate}T00:00:00`).getTime() : -Infinity;
    const e = item.endDate ? new Date(`${item.endDate}T23:59:59`).getTime() : Infinity;
    const [ws, we] = filterWindow(period);
    return s <= we && e >= ws;
  };
  const periodLabel = period.mode === "year"
    ? `ปี ${period.year}`
    : period.mode === "month"
      ? `${MONTHS[period.month]} ${period.year}`
      : `${period.start || "…"} → ${period.end || "…"}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPromotions.filter((item) =>
      (brand === "all" || item.brand === brand) &&
      (category === "all" || item.category === category) &&
      branchMatch(item, branch) &&
      inPeriod(item) &&
      (!q || `${sourceLabel(item.source)} ${brandName(item.brand)} ${item.title} ${item.description} ${item.posName} ${item.branches.join(" ")}`.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPromotions, branch, brand, category, search, period]);

  const grouped = categoryOrder
    .map((key) => ({ key, items: filtered.filter((item) => item.category === key) }))
    .filter((group) => group.items.length > 0);

  const activeCount = filtered.filter((item) => item.status === "active" || item.status === "open_end").length;
  const storeCount = new Set(filtered.flatMap((item) => item.branches)).size;

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "omd-store-promotions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={`print-root min-h-screen bg-[#F8F7F3] text-[#17172A] template-${printTemplate}`}>
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          html, body {
            background: #ffffff !important;
            font-size: 10px !important;
          }
          .print-root {
            color-adjust: exact;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            background: #ffffff !important;
            min-height: auto !important;
          }
          .omd-page {
            max-width: none !important;
            padding: 0 !important;
          }
          .omd-print-hero {
            border-radius: 14px !important;
            border-color: #d8d4e4 !important;
            background: linear-gradient(135deg, #ffffff 0%, #f8f7f3 100%) !important;
            box-shadow: none !important;
            padding: 12px 14px !important;
          }
          .omd-print-meta {
            display: flex !important;
          }
          .omd-print-title {
            font-size: 23px !important;
            line-height: 1.05 !important;
          }
          .omd-print-summary {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-top: 8px !important;
          }
          .omd-print-summary > div {
            border-radius: 12px !important;
            padding: 10px 12px !important;
            break-inside: avoid;
          }
          .omd-print-sections {
            margin-top: 8px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .omd-print-section {
            border-radius: 14px !important;
            box-shadow: none !important;
            break-inside: avoid;
            overflow: hidden !important;
          }
          .omd-table-head {
            display: grid !important;
            grid-template-columns: 1.05fr 1.9fr 1.15fr .85fr .75fr .65fr !important;
            padding: 7px 10px !important;
            font-size: 8px !important;
            background: #fbfaf7 !important;
          }
          .omd-print-card {
            display: grid !important;
            grid-template-columns: 1.05fr 1.9fr 1.15fr .85fr .75fr .65fr !important;
            gap: 8px !important;
            padding: 8px 10px !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .omd-print-card * {
            line-height: 1.28 !important;
          }
          .omd-print-card-title {
            font-size: 10.5px !important;
          }
          .omd-print-card-body,
          .omd-print-card-meta {
            font-size: 9.5px !important;
          }
          .omd-category-head {
            padding: 8px 10px !important;
          }
          .omd-category-head-title {
            font-size: 11.5px !important;
          }
          .omd-chip {
            border: 1px solid rgba(255,255,255,0.55) !important;
            padding: 3px 7px !important;
            font-size: 8.5px !important;
          }
          .template-compact .omd-print-summary {
            display: none !important;
          }
          .template-compact .omd-print-card {
            padding: 6px 9px !important;
          }
          .template-compact .omd-print-card-body,
          .template-compact .omd-print-card-meta {
            font-size: 8.8px !important;
          }
          .template-checklist .omd-table-head,
          .template-checklist .omd-print-card {
            grid-template-columns: .42fr 1.1fr 1.65fr 1fr .8fr .65fr .65fr !important;
          }
          .template-checklist .omd-check-cell {
            display: block !important;
          }
          .template-board .omd-check-cell,
          .template-compact .omd-check-cell {
            display: none !important;
          }
        }
      `}</style>

      <div className="omd-page mx-auto max-w-[1400px] px-4 py-4 md:px-6 md:py-5">
        <section className="omd-print-hero rounded-[18px] border border-[#ECEAF2] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(23,23,42,0.04)] md:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#6C5CE7]">Campaign Print Module</div>
              <h1 className="omd-print-title mt-1 text-[24px] font-extrabold leading-tight md:text-[30px]">Promotion Summary Print</h1>
              <p className="mt-1 max-w-[780px] text-[13px] font-medium text-[#7D7789]">
                Print-ready promotion summary synced from Campaign, grouped by type, brand, and branch with Marketing-OS colors.
              </p>
              <div className="omd-print-meta mt-3 hidden flex-wrap gap-2 text-[10px] font-bold text-[#706A84]">
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Brand: {brand === "all" ? "All Brands" : brandName(brand)}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Branch: {filterLabel(branch, "All Branches")}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Category: {category === "all" ? "All Categories" : OMD_STORE_CATEGORY_META[category].label}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Period: {periodLabel}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Template: {PRINT_TEMPLATES[printTemplate].label}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Printed: {formatDate(new Date().toISOString())}</span>
              </div>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await refreshFromSupabase();
                  setSyncState("synced");
                  window.setTimeout(() => setSyncState("ready"), 1800);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold text-[#5B4FD8]"
              >
                <RefreshCw size={15} />
                Sync Campaign
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold text-[#3E3E55]"
              >
                <Download size={15} />
                CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#17172A] px-4 text-[12px] font-bold text-white"
              >
                <Printer size={15} />
                Print
              </button>
            </div>
          </div>
        </section>

        <section className="no-print mt-3 grid gap-3 xl:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-[18px] border border-[#ECEAF2] bg-white p-4 shadow-[0_8px_22px_rgba(23,23,42,0.04)]">
            <div className="grid gap-3 md:grid-cols-6">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Print Template</span>
                <select value={printTemplate} onChange={(e) => setPrintTemplate(e.target.value as PrintTemplate)} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none">
                  {Object.entries(PRINT_TEMPLATES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Brand</span>
                <select value={brand} onChange={(e) => setBrand(e.target.value as BrandId | "all")} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none">
                  <option value="all">All Brands</option>
                  {BRAND_ORDER.map((id) => <option key={id} value={id}>{brandName(id)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value as OmdStorePromotionCategory | "all")} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none">
                  <option value="all">All Categories</option>
                  {categoryOrder.map((key) => <option key={key} value={key}>{OMD_STORE_CATEGORY_META[key].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Branch</span>
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none">
                  <option value="all">All Branches</option>
                  {branches.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Search</span>
                <span className="flex h-10 items-center gap-2 rounded-[12px] border border-[#ECEAF2] bg-white px-3">
                  <Search size={15} className="text-[#9D96AC]" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา promotion, POS, branch..." className="w-full bg-transparent text-[12px] font-semibold outline-none" />
                </span>
              </label>
            </div>
            <div className="mt-3">
              <DateFilterBar value={period} onChange={setPeriod} />
            </div>
            <div className="mt-3 rounded-[14px] bg-[#FBFAF7] px-3 py-2 text-[11px] font-semibold text-[#706A84]">
              {PRINT_TEMPLATES[printTemplate].helper}
            </div>
          </div>

          <div className="rounded-[18px] border border-[#D8D4E4] bg-[#17172A] p-4 text-white shadow-[0_12px_30px_rgba(23,23,42,0.13)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/45">Campaign Sync</div>
                <div className="mt-1 text-[14px] font-extrabold">{syncState === "synced" ? "Synced preview ready" : "On-demand now, realtime-ready later"}</div>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-[#C8EA6A]">{OMD_STORE_SYNC_CONTRACT.mode}</span>
            </div>
            <div className="mt-3 text-[12px] font-medium leading-relaxed text-white/58">
              ดึงจาก Campaign {campaignItems.length} รายการเท่านั้น ไม่มี seed list หรือ manual entry ปนในหน้านี้.
            </div>
          </div>
        </section>

        <section className="omd-print-summary mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-[16px] border border-[#ECEAF2] bg-white p-4">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Visible Items</div>
            <div className="mt-2 text-[26px] font-extrabold">{filtered.length}</div>
          </div>
          <div className="rounded-[16px] border border-[#ECEAF2] bg-white p-4">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Active / Open End</div>
            <div className="mt-2 text-[26px] font-extrabold">{activeCount}</div>
          </div>
          <div className="rounded-[16px] border border-[#ECEAF2] bg-white p-4">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Brand / Branch</div>
            <div className="mt-2 text-[26px] font-extrabold">{brand === "all" ? "All" : brandName(brand)}</div>
            <div className="mt-1 text-[11px] font-bold text-[#8A879A]">{storeCount} branch groups</div>
          </div>
        </section>

        <section className="omd-print-sections mt-3 space-y-3">
          {grouped.map((group) => {
            const meta = OMD_STORE_CATEGORY_META[group.key];
            return (
              <div key={group.key} className="omd-print-section overflow-hidden rounded-[18px] border bg-white shadow-[0_8px_22px_rgba(23,23,42,0.04)]" style={{ borderColor: meta.border }}>
                <div className="omd-category-head flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ background: meta.bg, color: meta.fg }}>
                  <div className="omd-category-head-title text-[14px] font-extrabold">{meta.printLabel}</div>
                  <div className="rounded-full bg-white/65 px-3 py-1 text-[11px] font-extrabold">{group.items.length} items</div>
                </div>

                <div className="omd-table-head hidden xl:grid grid-cols-[1.05fr_1.9fr_1.15fr_.85fr_.75fr_.65fr] border-b border-[#ECEAF2] bg-[#FBFAF7] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8A879A]">
                  <div className="omd-check-cell hidden">Done</div>
                  <div>Promotion</div>
                  <div>Details</div>
                  <div>POS Name</div>
                  <div>Branch</div>
                  <div>Period</div>
                  <div>Status</div>
                </div>

                <div className="divide-y divide-[#ECEAF2]">
                  {group.items.map((item) => (
                    <article key={item.id} className="omd-print-card grid gap-3 px-4 py-3 xl:grid-cols-[1.05fr_1.9fr_1.15fr_.85fr_.75fr_.65fr]">
                      <div className="omd-check-cell hidden">
                        <span className="inline-block h-4 w-4 rounded-[4px] border border-[#9D96AC] bg-white" />
                      </div>
                      <div>
                        <div className="omd-print-card-title text-[13px] font-extrabold leading-snug">{item.title}</div>
                        <div className="omd-chip mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold" style={{ background: meta.bg, color: meta.fg }}>
                          {meta.label}
                        </div>
                      </div>
                      <div className="omd-print-card-body text-[12px] font-medium leading-relaxed text-[#3E3E55]">{item.description}</div>
                      <div className="omd-print-card-meta text-[12px] font-bold leading-relaxed text-[#3E3E55]">
                        {/* Editable on screen; the printout shows plain text */}
                        <input
                          value={item.posName}
                          onChange={(e) => setPosName(item.id, e.target.value)}
                          onBlur={() => savePosName(item)}
                          placeholder="พิมพ์ชื่อใน POS…"
                          className="print:hidden w-full rounded-[8px] border border-[#E5E1F0] bg-white px-2 py-1 text-[12px] font-bold text-[#3E3E55] outline-none focus:border-[#6C5CE7]"
                        />
                        <span className="hidden print:inline">{item.posName || "—"}</span>
                      </div>
                      <div className="omd-print-card-meta text-[12px] font-extrabold text-[#17172A]">{branchLabel(item, brandBranches[item.brand] ?? [])}</div>
                      <div className="omd-print-card-meta text-[12px] font-bold leading-relaxed text-[#3E3E55]">
                        {formatDate(item.startDate)}<br />
                        <span className="text-[#8A879A]">to {formatDate(item.endDate)}</span>
                      </div>
                      <div className="omd-print-card-meta text-[12px] font-extrabold" style={{ color: item.status === "ended" ? "#8A879A" : meta.fg }}>{statusLabel(item)}</div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Nothing to print is now a normal state, not a fault: only campaigns
              given a store promotion appear here. Say which of the two it is —
              a filter that's too narrow, or a promotion nobody has written yet —
              so an empty sheet never reads as a broken page. */}
          {grouped.length === 0 && (
            <div className="no-print rounded-[18px] border border-dashed border-[#D9B86A] bg-[#FFF8EA] px-6 py-8 text-center">
              <div className="text-[14px] font-extrabold text-[#8A6930]">ไม่มีโปรโมชั่นให้พิมพ์</div>
              <div className="mt-1 text-[12px] leading-relaxed text-[#9A7A47]">
                {allPromotions.length === 0 ? (
                  <>ยังไม่มีแคมเปญไหนกรอก <b>Promotion หน้าร้าน</b> — เปิดแคมเปญที่มีโปรฯ แล้วกด Edit เพื่อกรอกช่องนี้ แล้วมันจะขึ้นที่นี่</>
                ) : (
                  <>มี {allPromotions.length} โปรฯ อยู่ แต่ไม่ตรงกับตัวกรองที่เลือก — ลองขยาย Period หรือเปลี่ยน Brand / Branch</>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
