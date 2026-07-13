"use client";

import { useMemo, useState } from "react";
import { Download, Printer, RefreshCw, Search } from "lucide-react";
import {
  OMD_STORE_CATEGORY_META,
  OMD_STORE_PROMOTIONS,
  OMD_STORE_SYNC_CONTRACT,
  type OmdStorePromotion,
  type OmdStorePromotionCategory,
} from "@/lib/data/omdStorePromotions";

const categoryOrder = Object.keys(OMD_STORE_CATEGORY_META) as OmdStorePromotionCategory[];

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

function toCsv(items: OmdStorePromotion[]) {
  const header = ["Category", "Title", "Detail", "POS", "Branch", "Start", "End", "Status"];
  const rows = items.map((item) => [
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

  const branches = useMemo(() => {
    return Array.from(new Set(OMD_STORE_PROMOTIONS.flatMap((item) => item.branches))).sort();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return OMD_STORE_PROMOTIONS.filter((item) =>
      (category === "all" || item.category === category) &&
      branchMatch(item, branch) &&
      (!q || `${item.title} ${item.description} ${item.posName} ${item.branches.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [branch, category, search]);

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
    <main className="print-root min-h-screen bg-[#F8F7F3] text-[#17172A]">
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
            <div className="grid gap-3 md:grid-cols-4">
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
              Schema กลางรับข้อมูลจาก Campaign ที่ approved แล้ว โดยใช้ fields: {OMD_STORE_SYNC_CONTRACT.requiredFields.join(", ")}.
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
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Branch Coverage</div>
            <div className="mt-2 text-[26px] font-extrabold">{storeCount}</div>
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

                <div className="omd-table-head hidden xl:grid grid-cols-[1.1fr_2fr_1.2fr_.9fr_.8fr_.75fr] border-b border-[#ECEAF2] bg-[#FBFAF7] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8A879A]">
                  <div>Promotion</div>
                  <div>Details</div>
                  <div>POS Name</div>
                  <div>Branch</div>
                  <div>Period</div>
                  <div>Status</div>
                </div>

                <div className="divide-y divide-[#ECEAF2]">
                  {group.items.map((item) => (
                    <article key={item.id} className="omd-print-card grid gap-3 px-4 py-3 xl:grid-cols-[1.1fr_2fr_1.2fr_.9fr_.8fr_.75fr]">
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
