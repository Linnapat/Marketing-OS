"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  OMD_STORE_CATEGORY_META,
  OMD_STORE_PROMOTIONS,
  OMD_STORE_SYNC_CONTRACT,
  type OmdStorePromotion,
  type OmdStorePromotionCategory,
} from "@/lib/data/omdStorePromotions";
import { CAMPAIGNS } from "@/lib/data/campaigns";

const categoryOrder = Object.keys(OMD_STORE_CATEGORY_META) as OmdStorePromotionCategory[];
const manualStorageKey = "mkt-os:omd-store:manual-promotions";

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

const emptyManualPromotion: Omit<OmdStorePromotion, "id" | "source"> = {
  category: "promotion",
  title: "",
  description: "",
  posName: "",
  branches: ["All Branch"],
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  status: "active",
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

function filterLabel(value: string, fallback: string) {
  return value === "all" ? fallback : value;
}

function sourceLabel(source?: OmdStorePromotion["source"]) {
  if (source === "campaign") return "Campaign";
  if (source === "manual") return "Manual";
  return "Seed";
}

function campaignToStorePromotion(index: number): OmdStorePromotion {
  const campaign = CAMPAIGNS[index];
  return {
    id: `campaign-${campaign.id}`,
    category: "campaign",
    title: campaign.name,
    description: `${campaign.campType} · Owner: ${campaign.owner} · Budget ${campaign.budget.toLocaleString("th-TH")} THB`,
    posName: campaign.nextApproval && campaign.nextApproval !== "None" ? `Next approval: ${campaign.nextApproval}` : "",
    branches: campaign.branch.split(",").map((item) => item.trim()).filter(Boolean),
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    status: ["Completed", "Cancelled"].includes(campaign.status) ? "ended" : "active",
    source: "campaign",
  };
}

function toCsv(items: OmdStorePromotion[]) {
  const header = ["Source", "Category", "Title", "Detail", "POS", "Branch", "Start", "End", "Status"];
  const rows = items.map((item) => [
    sourceLabel(item.source),
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
  const [category, setCategory] = useState<OmdStorePromotionCategory | "all">("all");
  const [branch, setBranch] = useState("all");
  const [search, setSearch] = useState("");
  const [syncState, setSyncState] = useState<"ready" | "synced">("ready");
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate>("board");
  const [manualItems, setManualItems] = useState<OmdStorePromotion[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState(emptyManualPromotion);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(manualStorageKey);
      if (saved) setManualItems(JSON.parse(saved));
    } catch {
      setManualItems([]);
    }
  }, []);

  const campaignItems = useMemo(() => CAMPAIGNS.slice(0, 4).map((_, index) => campaignToStorePromotion(index)), []);
  const allPromotions = useMemo(() => [
    ...campaignItems,
    ...OMD_STORE_PROMOTIONS.map((item) => ({ ...item, source: item.source ?? "seed" as const })),
    ...manualItems,
  ], [campaignItems, manualItems]);

  const branches = useMemo(() => {
    return Array.from(new Set(allPromotions.flatMap((item) => item.branches))).sort();
  }, [allPromotions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPromotions.filter((item) =>
      (category === "all" || item.category === category) &&
      branchMatch(item, branch) &&
      (!q || `${sourceLabel(item.source)} ${item.title} ${item.description} ${item.posName} ${item.branches.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [allPromotions, branch, category, search]);

  const grouped = categoryOrder
    .map((key) => ({ key, items: filtered.filter((item) => item.category === key) }))
    .filter((group) => group.items.length > 0);

  const activeCount = filtered.filter((item) => item.status === "active" || item.status === "open_end").length;
  const storeCount = new Set(filtered.flatMap((item) => item.branches)).size;
  const manualCount = manualItems.length;

  const saveManualItems = (items: OmdStorePromotion[]) => {
    setManualItems(items);
    try {
      window.localStorage.setItem(manualStorageKey, JSON.stringify(items));
    } catch {
      /* localStorage can be disabled in private contexts. */
    }
  };

  const addManualItem = () => {
    if (!manualDraft.title.trim()) return;
    const item: OmdStorePromotion = {
      ...manualDraft,
      id: `manual-${Date.now()}`,
      title: manualDraft.title.trim(),
      description: manualDraft.description.trim() || "-",
      posName: manualDraft.posName.trim(),
      branches: manualDraft.branches.map((item) => item.trim()).filter(Boolean),
      endDate: manualDraft.endDate || undefined,
      source: "manual",
    };
    saveManualItems([item, ...manualItems]);
    setManualDraft(emptyManualPromotion);
    setManualOpen(false);
  };

  const removeManualItem = (id: string) => {
    saveManualItems(manualItems.filter((item) => item.id !== id));
  };

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
            grid-template-columns: .54fr 1.05fr 1.9fr 1.15fr .85fr .75fr .65fr !important;
            padding: 7px 10px !important;
            font-size: 8px !important;
            background: #fbfaf7 !important;
          }
          .omd-print-card {
            display: grid !important;
            grid-template-columns: .54fr 1.05fr 1.9fr 1.15fr .85fr .75fr .65fr !important;
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
            grid-template-columns: .42fr .55fr 1.1fr 1.65fr 1fr .8fr .65fr .65fr !important;
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
              <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#6C5CE7]">Campaign Sub Module</div>
              <h1 className="omd-print-title mt-1 text-[24px] font-extrabold leading-tight md:text-[30px]">OMD Store Promotion Board</h1>
              <p className="mt-1 max-w-[780px] text-[13px] font-medium text-[#7D7789]">
                Print-ready promotion list for Omakase Don branches, grouped by promotion type with Marketing-OS colors.
              </p>
              <div className="omd-print-meta mt-3 hidden flex-wrap gap-2 text-[10px] font-bold text-[#706A84]">
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Branch: {filterLabel(branch, "All Branches")}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Category: {category === "all" ? "All Categories" : OMD_STORE_CATEGORY_META[category].label}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Template: {PRINT_TEMPLATES[printTemplate].label}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Printed: {formatDate(new Date().toISOString())}</span>
              </div>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSyncState("synced");
                  window.setTimeout(() => setSyncState("ready"), 1800);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold text-[#5B4FD8]"
              >
                <RefreshCw size={15} />
                Sync Marketing-OS
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
                onClick={() => setManualOpen((open) => !open)}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold text-[#3E3E55]"
              >
                <Plus size={15} />
                Add Manual
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
            <div className="grid gap-3 md:grid-cols-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Print Template</span>
                <select value={printTemplate} onChange={(e) => setPrintTemplate(e.target.value as PrintTemplate)} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none">
                  {Object.entries(PRINT_TEMPLATES).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
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
            <div className="mt-3 rounded-[14px] bg-[#FBFAF7] px-3 py-2 text-[11px] font-semibold text-[#706A84]">
              {PRINT_TEMPLATES[printTemplate].helper}
            </div>
          </div>

          <div className="rounded-[18px] border border-[#D8D4E4] bg-[#17172A] p-4 text-white shadow-[0_12px_30px_rgba(23,23,42,0.13)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-white/45">Marketing-OS Sync</div>
                <div className="mt-1 text-[14px] font-extrabold">{syncState === "synced" ? "Synced preview ready" : "On-demand now, realtime-ready later"}</div>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-[#C8EA6A]">{OMD_STORE_SYNC_CONTRACT.mode}</span>
            </div>
            <div className="mt-3 text-[12px] font-medium leading-relaxed text-white/58">
              ตอนนี้รวมข้อมูลจาก Campaign {campaignItems.length} รายการ + seed list + manual {manualCount} รายการ โดยยังไม่กระทบ Campaign workflow หลัก.
            </div>
          </div>
        </section>

        {manualOpen && (
          <section className="no-print mt-3 rounded-[18px] border border-[#ECEAF2] bg-white p-4 shadow-[0_8px_22px_rgba(23,23,42,0.04)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#6C5CE7]">Manual Promotion</div>
                <div className="text-[15px] font-extrabold">เพิ่มรายการเองสำหรับหน้าร้าน</div>
              </div>
              <div className="text-[11px] font-bold text-[#8A879A]">เก็บใน browser นี้ก่อน</div>
            </div>
            <div className="grid gap-3 lg:grid-cols-6">
              <label className="flex flex-col gap-1.5 lg:col-span-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Title</span>
                <input value={manualDraft.title} onChange={(e) => setManualDraft((draft) => ({ ...draft, title: e.target.value }))} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none" placeholder="ชื่อโปรโมชั่น" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Category</span>
                <select value={manualDraft.category} onChange={(e) => setManualDraft((draft) => ({ ...draft, category: e.target.value as OmdStorePromotionCategory }))} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none">
                  {categoryOrder.map((key) => <option key={key} value={key}>{OMD_STORE_CATEGORY_META[key].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Branches</span>
                <input value={manualDraft.branches.join(", ")} onChange={(e) => setManualDraft((draft) => ({ ...draft, branches: e.target.value.split(",") }))} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none" placeholder="PS, CTW" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Start</span>
                <input type="date" value={manualDraft.startDate} onChange={(e) => setManualDraft((draft) => ({ ...draft, startDate: e.target.value }))} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">End</span>
                <input type="date" value={manualDraft.endDate} onChange={(e) => setManualDraft((draft) => ({ ...draft, endDate: e.target.value }))} className="h-10 rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12px] font-bold outline-none" />
              </label>
              <label className="flex flex-col gap-1.5 lg:col-span-3">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Details</span>
                <textarea value={manualDraft.description} onChange={(e) => setManualDraft((draft) => ({ ...draft, description: e.target.value }))} className="min-h-[76px] rounded-[12px] border border-[#ECEAF2] bg-white px-3 py-2 text-[12px] font-semibold outline-none" placeholder="รายละเอียดที่ต้องให้หน้าร้านอ่าน" />
              </label>
              <label className="flex flex-col gap-1.5 lg:col-span-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">POS Name</span>
                <textarea value={manualDraft.posName} onChange={(e) => setManualDraft((draft) => ({ ...draft, posName: e.target.value }))} className="min-h-[76px] rounded-[12px] border border-[#ECEAF2] bg-white px-3 py-2 text-[12px] font-semibold outline-none" placeholder="ชื่อใน POS ถ้ามี" />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={addManualItem} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] bg-[#6C5CE7] px-4 text-[12px] font-extrabold text-white">
                  <Plus size={15} />
                  Add
                </button>
              </div>
            </div>
          </section>
        )}

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
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Branch Coverage</div>
            <div className="mt-2 text-[26px] font-extrabold">{storeCount}</div>
          </div>
        </section>

        {manualItems.length > 0 && (
          <section className="no-print mt-3 rounded-[18px] border border-[#ECEAF2] bg-white p-4">
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Manual Items</div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {manualItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-[14px] border border-[#ECEAF2] bg-[#FBFAF7] p-3">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-extrabold">{item.title}</div>
                    <div className="mt-1 text-[11px] font-semibold text-[#8A879A]">{item.branches.join(", ")} · {OMD_STORE_CATEGORY_META[item.category].label}</div>
                  </div>
                  <button type="button" onClick={() => removeManualItem(item.id)} className="rounded-[10px] border border-[#ECEAF2] bg-white p-2 text-[#D95454]" aria-label="Remove manual promotion">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="omd-print-sections mt-3 space-y-3">
          {grouped.map((group) => {
            const meta = OMD_STORE_CATEGORY_META[group.key];
            return (
              <div key={group.key} className="omd-print-section overflow-hidden rounded-[18px] border bg-white shadow-[0_8px_22px_rgba(23,23,42,0.04)]" style={{ borderColor: meta.border }}>
                <div className="omd-category-head flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ background: meta.bg, color: meta.fg }}>
                  <div className="omd-category-head-title text-[14px] font-extrabold">{meta.printLabel}</div>
                  <div className="rounded-full bg-white/65 px-3 py-1 text-[11px] font-extrabold">{group.items.length} items</div>
                </div>

                <div className="omd-table-head hidden xl:grid grid-cols-[.65fr_1.05fr_1.9fr_1.15fr_.85fr_.75fr_.65fr] border-b border-[#ECEAF2] bg-[#FBFAF7] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8A879A]">
                  <div className="omd-check-cell hidden">Done</div>
                  <div>Source</div>
                  <div>Promotion</div>
                  <div>Details</div>
                  <div>POS Name</div>
                  <div>Branch</div>
                  <div>Period</div>
                  <div>Status</div>
                </div>

                <div className="divide-y divide-[#ECEAF2]">
                  {group.items.map((item) => (
                    <article key={item.id} className="omd-print-card grid gap-3 px-4 py-3 xl:grid-cols-[.65fr_1.05fr_1.9fr_1.15fr_.85fr_.75fr_.65fr]">
                      <div className="omd-check-cell hidden">
                        <span className="inline-block h-4 w-4 rounded-[4px] border border-[#9D96AC] bg-white" />
                      </div>
                      <div className="omd-print-card-meta text-[11px] font-extrabold text-[#706A84]">{sourceLabel(item.source)}</div>
                      <div>
                        <div className="omd-print-card-title text-[13px] font-extrabold leading-snug">{item.title}</div>
                        <div className="omd-chip mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold" style={{ background: meta.bg, color: meta.fg }}>
                          {meta.label}
                        </div>
                      </div>
                      <div className="omd-print-card-body text-[12px] font-medium leading-relaxed text-[#3E3E55]">{item.description}</div>
                      <div className="omd-print-card-meta text-[12px] font-bold leading-relaxed text-[#3E3E55]">{item.posName || "—"}</div>
                      <div className="omd-print-card-meta text-[12px] font-extrabold text-[#17172A]">{item.branches.join(", ")}</div>
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
        </section>
      </div>
    </main>
  );
}
