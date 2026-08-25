"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Minimize2, Pencil, Plus, Printer, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import {
  OMD_STORE_CATEGORY_META,
  OMD_STORE_SYNC_CONTRACT,
  type OmdStorePromotion,
  type OmdStorePromotionCategory,
  type OmdStorePromotionStatus,
  printedStatus,
} from "@/lib/data/omdStorePromotions";
import { CAMPAIGNS, campaignPeriod, type CampaignRow } from "@/lib/data/campaigns";
import { fetchCampaigns } from "@/lib/db/campaigns";
import { deletePromotionSummaryItem, fetchPromotionSummaryItems, savePromotionSummaryItem } from "@/lib/db/promotionSummary";
import { fetchBrandConfigs } from "@/lib/db/settings";
import { fetchAllBriefs } from "@/lib/db/brief";
import type { CampaignBrief } from "@/lib/data/brief";
import { toastError, toastSuccess } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";
import { BRAND_ORDER, brandName, brandColor, type BrandId } from "@/lib/brands";
import { DateFilter, DateFilterBar, DEFAULT_DATE_FILTER, filterWindow, parseRowRange, MONTHS } from "@/components/ui/DateFilterBar";
import { PAGE_W_PX, MIN_FIT_ZOOM, fitZoom, pagesAtFullSize as pagesAtFullSizeOf, pagesWhenPrinted as pagesWhenPrintedOf } from "@/lib/data/printFit";

const categoryOrder = Object.keys(OMD_STORE_CATEGORY_META) as OmdStorePromotionCategory[];

/** The two columns the sheet cannot lose — what the promotion is, and what the
 *  shop floor has to do about it. Everything else is context somebody may or
 *  may not need on the wall. */
const FIXED_COL_WIDTHS = "1.05fr 1.9fr";

/** Columns the person printing can drop. A sheet for one branch does not need
 *  a Branch column repeating that branch on every row; a sheet of current
 *  promotions does not need a Status column that says "ใช้งานอยู่" twelve
 *  times. Dropping them is worth more than shrinking the type, because the
 *  space goes back to the text that is left. */
const OPTIONAL_COLS = [
  { key: "pos", label: "POS Name", width: "1.15fr" },
  { key: "branch", label: "Branch", width: ".85fr" },
  { key: "period", label: "Period", width: ".75fr" },
  { key: "status", label: "Status", width: ".65fr" },
] as const;

type OptionalCol = (typeof OPTIONAL_COLS)[number]["key"];


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

/** printedStatus against today. A thin wrapper so every call site reads the
 *  same clock and nobody has to remember to pass it. */
function liveStatus(item: OmdStorePromotion): OmdStorePromotionStatus {
  return printedStatus(item, isoDate(new Date())!);
}

function statusLabel(item: OmdStorePromotion) {
  const status = liveStatus(item);
  if (status === "cancelled") return "ยกเลิกแล้ว";
  if (status === "open_end") return "ไม่ระบุวันจบ";
  if (status === "ended") return "จบแล้ว";
  if (status === "upcoming") return "กำลังจะเริ่ม";
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
  // parseRowRange, not two parseRowDate calls: a flight that crosses New Year
  // ("Oct 1 – Jan 31") would otherwise end before it starts and print an empty
  // period.
  const { start, end } = parseRowRange(campaignPeriod(campaign));
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
    // The workflow verdict, not the printed one. "Completed" here means
    // Marketing closed the campaign, which liveStatus applies only once the
    // flight has actually started — a campaign marked Completed while it is
    // still a week away used to print "จบแล้ว", finished before it ever began.
    status: campaign.status === "Cancelled" ? "cancelled" : campaign.status === "Completed" ? "ended" : "active",
    source: "campaign",
  };
}

/** The status stored with a new manual promotion. Only a snapshot — the column
 *  on screen is derived live by printedStatus — but it keeps the saved row
 *  truthful at the moment it is written, and one rule decides both. */
function deriveStatus(startDate: string, endDate: string): OmdStorePromotionStatus {
  return printedStatus({ status: "active", startDate, endDate }, isoDate(new Date())!);
}

const emptyDraft = {
  brand: BRAND_ORDER[0] as BrandId,
  category: "promotion" as OmdStorePromotionCategory,
  title: "",
  description: "",
  posName: "",
  branches: [] as string[],
  startDate: "",
  endDate: "",
};

/** Add or fix a promotion that isn't a campaign — a Must Eat push, a bank
 *  promotion, a Big Cleaning notice. The sheet used to print campaigns only, so
 *  anything the shop floor needed that never became a campaign had to be written
 *  by hand on the printout.
 *
 *  `editing` makes it the same form for both jobs. Without it the only way to
 *  fix a typo in a date or a price was to delete the row and type all seven
 *  fields again — and a delete-and-retype loses the POS name the branch team
 *  had already filled in. */
function PromotionEditor({
  open, editing, onClose, onSave, brandBranches,
}: {
  open: boolean;
  editing: OmdStorePromotion | null;
  onClose: () => void;
  onSave: (item: OmdStorePromotion) => Promise<void>;
  brandBranches: Record<string, string[]>;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Loaded fresh every time it opens — from the row being edited, or empty for a
  // new one. A half-typed promotion left over from a cancelled edit is how the
  // wrong thing gets printed.
  useEffect(() => {
    if (!open) return;
    setError("");
    setDraft(editing
      ? {
        brand: editing.brand,
        category: editing.category,
        title: editing.title,
        description: editing.description,
        posName: editing.posName,
        // "All Branch" is the stored stand-in for "no branch picked" — showing
        // it as a selected branch would turn a brand-wide row into a one-branch
        // row on the next save.
        branches: editing.branches.filter((b) => !/^all\s*branch(es)?$/i.test(b)),
        startDate: editing.startDate,
        endDate: editing.endDate ?? "",
      }
      : emptyDraft);
  }, [open, editing]);

  const branchOptions = brandBranches[draft.brand] ?? [];
  const set = <K extends keyof typeof emptyDraft>(key: K, value: (typeof emptyDraft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    if (!draft.title.trim()) return setError("ใส่ชื่อโปรโมชั่นก่อน");
    if (!draft.startDate) return setError("เลือกวันเริ่มก่อน");
    if (draft.endDate && draft.endDate < draft.startDate) return setError("วันจบต้องไม่มาก่อนวันเริ่ม");
    setSaving(true);
    try {
      await onSave({
        // Same id when editing: this is the row being corrected, not a second
        // copy of it.
        id: editing?.id ?? `manual-${crypto.randomUUID()}`,
        brand: draft.brand,
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description.trim(),
        posName: draft.posName.trim(),
        // No branch picked = the promotion runs everywhere, which is what the
        // Branch column already prints as "All branches".
        branches: draft.branches.length ? draft.branches : ["All Branch"],
        startDate: draft.startDate,
        endDate: draft.endDate || undefined,
        // Cancelled survives a date edit — moving the dates of a promotion that
        // was pulled must not quietly put it back on the wall.
        status: editing?.status === "cancelled" ? "cancelled" : deriveStatus(draft.startDate, draft.endDate),
        source: editing?.source ?? "manual",
        hidden: editing?.hidden ?? false,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const label = "text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]";
  const field = "h-10 w-full rounded-[12px] border border-[#ECEAF2] bg-white px-3 text-[12.5px] font-semibold text-[#17172A] outline-none focus:border-[#6C5CE7]";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "แก้ไขโปรโมชั่น" : "เพิ่มโปรโมชั่นลงใบพิมพ์"}
      maxWidth="2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-10 rounded-[12px] border border-[#ECEAF2] px-4 text-[12px] font-bold text-[#3E3E55]">ยกเลิก</button>
          <button type="button" onClick={submit} disabled={saving} className="h-10 rounded-[12px] bg-[#17172A] px-4 text-[12px] font-bold text-white disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มลงใบพิมพ์"}
          </button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Brand</span>
          <select value={draft.brand} onChange={(e) => set("brand", e.target.value as BrandId)} className={field}>
            {BRAND_ORDER.map((id) => <option key={id} value={id}>{brandName(id)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Category</span>
          <select value={draft.category} onChange={(e) => set("category", e.target.value as OmdStorePromotionCategory)} className={field}>
            {categoryOrder.map((key) => <option key={key} value={key}>{OMD_STORE_CATEGORY_META[key].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>วันเริ่ม</span>
          <DatePicker value={draft.startDate} onChange={(v) => set("startDate", v)} placeholder="เลือกวันเริ่ม" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>วันจบ (เว้นว่าง = ไม่ระบุวันจบ)</span>
          <DatePicker value={draft.endDate} onChange={(v) => set("endDate", v)} min={draft.startDate || undefined} placeholder="เลือกวันจบ" />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={label}>ชื่อโปรโมชั่น</span>
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น Must Eat — Salmon Don" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className={label}>รายละเอียดที่หน้าร้านต้องรู้</span>
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="เงื่อนไข ราคา เมนูที่ร่วมรายการ…"
            className="w-full rounded-[12px] border border-[#ECEAF2] bg-white px-3 py-2 text-[12.5px] font-medium leading-relaxed text-[#17172A] outline-none focus:border-[#6C5CE7]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>POS Name</span>
          <input value={draft.posName} onChange={(e) => set("posName", e.target.value)} placeholder="ชื่อที่กดในระบบ POS" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Branch</span>
          <MultiSelectDropdown
            options={branchOptions}
            selected={draft.branches}
            onChange={(next) => set("branches", next)}
            allLabel="ทุกสาขา"
            placeholder="ไม่เลือก = ทุกสาขา"
            emptyLabel="แบรนด์นี้ยังไม่ได้ตั้งสาขา — จะพิมพ์ว่าทุกสาขา"
          />
        </label>
      </div>
      {error && <div className="mt-3 rounded-[12px] bg-[#FFF0F0] px-3 py-2 text-[12px] font-bold text-[#D95454]">{error}</div>}
    </Modal>
  );
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

/** Measure the sheet as it will print, by cloning it, laying the clone out at
 *  paper width with the print rules switched on, and reading its height.
 *
 *  A clone rather than the live node because the alternative is putting the
 *  page into print layout on screen for a frame, which the person using it
 *  sees as a flicker. The print rules live under .omd-printing precisely so
 *  this measures the same layout the printer gets rather than a second copy of
 *  it that drifts.
 *
 *  Returns the height in CSS pixels, or null when there is nothing to measure
 *  (server render, or an empty sheet). */
function measurePrintHeight(sheet: HTMLElement | null): number | null {
  if (!sheet || typeof document === "undefined") return null;
  const host = document.createElement("div");
  host.className = "omd-measure-host omd-printing";
  host.style.width = `${PAGE_W_PX}px`;
  const clone = sheet.cloneNode(true) as HTMLElement;
  host.appendChild(clone);
  document.body.appendChild(host);
  const height = clone.getBoundingClientRect().height;
  host.remove();
  return height || null;
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
  // Promotions the team typed in here, not derived from a campaign.
  const [manualItems, setManualItems] = useState<OmdStorePromotion[]>([]);
  // Campaign rows the team took off the sheet. Hidden, not deleted: the campaign
  // belongs to another module, and "I didn't mean that one" has to be undoable.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  // The manual row the editor is currently correcting; null = adding a new one.
  const [editingItem, setEditingItem] = useState<OmdStorePromotion | null>(null);

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
    setManualItems(saved.filter((s) => s.source === "manual" && !s.hidden));
    setHiddenIds(new Set(saved.filter((s) => s.hidden).map((s) => s.id)));
  };

  const setPosName = (id: string, value: string) => setPosOverrides((m) => ({ ...m, [id]: value }));
  const savePosName = (item: OmdStorePromotion) => {
    savePromotionSummaryItem({ ...item, posName: posOverrides[item.id] ?? "" })
      .catch((error) => toastError(`บันทึก POS name ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`));
  };

  const openAdd = () => { setEditingItem(null); setEditorOpen(true); };
  const openEdit = (item: OmdStorePromotion) => { setEditingItem(item); setEditorOpen(true); };

  /** One save for both jobs — an id already on the sheet replaces its row
   *  instead of adding a second one. The POS name goes back into the overrides
   *  map as well, or the inline POS box would keep showing the old text until
   *  the next reload. */
  const saveManualItem = async (item: OmdStorePromotion) => {
    const isUpdate = manualItems.some((x) => x.id === item.id);
    await savePromotionSummaryItem(item);
    setManualItems((list) => (isUpdate ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]));
    setPosOverrides((m) => ({ ...m, [item.id]: item.posName }));
    toastSuccess(isUpdate ? `แก้ “${item.title}” แล้ว` : `เพิ่ม “${item.title}” ลงใบพิมพ์แล้ว`);
  };

  /** Manual rows are ours, so they go for good. Campaign rows can only be hidden
   *  — deleting one here would have to mean deleting a campaign, which this sheet
   *  has no business doing. */
  const removeItem = async (item: OmdStorePromotion) => {
    if (item.source === "manual") {
      if (!window.confirm(`ลบ “${item.title}” ออกจากใบพิมพ์ถาวร?`)) return;
      const before = manualItems;
      setManualItems((list) => list.filter((x) => x.id !== item.id));
      try {
        await deletePromotionSummaryItem(item.id);
        toastSuccess("ลบโปรโมชั่นแล้ว");
      } catch (error) {
        setManualItems(before);
        toastError(`ลบไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
      return;
    }
    if (!window.confirm(`เอา “${item.title}” ออกจากใบพิมพ์?\nแคมเปญยังอยู่ตามเดิม และกดเอากลับมาได้ทีหลัง`)) return;
    setHiddenIds((prev) => new Set(prev).add(item.id));
    try {
      await savePromotionSummaryItem({ ...item, hidden: true });
      toastSuccess("เอาออกจากใบพิมพ์แล้ว");
    } catch (error) {
      setHiddenIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
      toastError(`เอาออกไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const restoreItem = async (item: OmdStorePromotion) => {
    setHiddenIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    try {
      await savePromotionSummaryItem({ ...item, hidden: false });
    } catch (error) {
      setHiddenIds((prev) => new Set(prev).add(item.id));
      toastError(`เอากลับไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
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
  const printedCampaignItems = campaignItems.filter((item) => !hiddenIds.has(item.id));
  // Only campaigns still on the roster can be brought back — a campaign that was
  // hidden and later deleted leaves a row nobody can act on.
  const hiddenCampaignItems = campaignItems.filter((item) => hiddenIds.has(item.id));
  const allPromotions = useMemo(
    () => [...printedCampaignItems, ...manualItems.map((it) => ({ ...it, posName: posOverrides[it.id] ?? it.posName }))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignItems, hiddenIds, manualItems, posOverrides],
  );

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

  // Rows are ordered by brand inside each category so every brand reads as one
  // contiguous colour band. Tinting rows that stayed interleaved would just look
  // noisy — the point of the tint is to replace the Brand column we removed.
  // Sort is stable, so same-brand rows keep their existing order.
  const brandRank = (b: BrandId) => {
    const i = BRAND_ORDER.indexOf(b);
    return i === -1 ? BRAND_ORDER.length : i; // a brand dropped from config sinks last
  };
  const grouped = categoryOrder
    .map((key) => ({
      key,
      items: filtered.filter((item) => item.category === key)
        .sort((a, b) => brandRank(a.brand) - brandRank(b.brand)),
    }))
    .filter((group) => group.items.length > 0);

  const activeCount = filtered.filter((item) => ["active", "open_end"].includes(liveStatus(item))).length;
  const storeCount = new Set(filtered.flatMap((item) => item.branches)).size;

  /** Fit the whole sheet onto one page, or print it at full size. On by
   *  default: the sheet exists to be taped to a wall, and a wall sheet that
   *  runs to page 2 is a wall sheet whose second half nobody reads. */
  const [fitOnePage, setFitOnePage] = useState(true);
  /** Columns left off this sheet. Empty = print everything, which is what the
   *  sheet did before there was a choice. */
  const [hiddenCols, setHiddenCols] = useState<Set<OptionalCol>>(() => new Set());
  const shown = (key: OptionalCol) => !hiddenCols.has(key);
  const toggleCol = (key: OptionalCol) => setHiddenCols((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const visibleCols = OPTIONAL_COLS.filter((c) => shown(c.key));
  // Two templates, not one: the screen carries a trailing track for the row's
  // edit and delete buttons, and paper has no buttons. They were living in the
  // Status cell, which meant hiding Status also hid the only way to edit a row.
  const checkTrack = printTemplate === "checklist" ? ".42fr " : "";
  const bodyTracks = `${FIXED_COL_WIDTHS} ${visibleCols.map((c) => c.width).join(" ")}`.trim();
  const colTemplate = `${checkTrack}${bodyTracks} auto`;
  const colTemplatePrint = `${checkTrack}${bodyTracks}`;
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

  // Re-measure whenever what would be printed changes. A timer rather than
  // requestAnimationFrame, which does not run at all while the tab is in the
  // background: open the sheet, switch tabs while it loads, come back, and the
  // fit would silently never have been calculated. The short delay is for
  // React to commit the rows and for wrapping to settle.
  const measureKey = `${filtered.length}|${printTemplate}|${brand}|${branch}|${category}|${periodLabel}|${[...hiddenCols].sort().join()}`;
  useEffect(() => {
    const id = window.setTimeout(() => setSheetHeight(measurePrintHeight(sheetRef.current)), 60);
    return () => window.clearTimeout(id);
  }, [measureKey]);

  const pagesAtFull = sheetHeight ? pagesAtFullSizeOf(sheetHeight) : null;
  // Never scales UP — a one-row sheet blown up to fill A4 is a poster, not a
  // fix — and never below the floor: past it the answer is fewer rows.
  const printZoom = sheetHeight ? fitZoom(sheetHeight, fitOnePage) : 1;
  // What the reader will actually get, so the number on screen is the truth
  // rather than a promise: at the floor a long sheet still runs over.
  const pagesPrinted = sheetHeight ? pagesWhenPrintedOf(sheetHeight, printZoom) : null;
  const fitFellShort = fitOnePage && pagesPrinted !== null && pagesPrinted > 1;

  // The print rules are a class, not a media query, so something has to put it
  // on. beforeprint rather than the button alone: half this team prints with
  // Cmd+P, and a fit that only works from our own button is a fit that quietly
  // does nothing most of the time.
  useEffect(() => {
    const on = () => {
      document.body.classList.add("omd-printing");
      // Measure again here, not just on screen. The number in the header is
      // whatever the last settled render produced; this is the one the paper
      // gets, and it has to be right even when the on-screen figure is stale —
      // a row added in another tab, a filter changed a millisecond ago, or a
      // tab that spent the whole load in the background.
      const sheet = sheetRef.current;
      const height = measurePrintHeight(sheet);
      if (sheet && height) sheet.style.setProperty("--omd-print-zoom", String(fitZoom(height, fitOnePage)));
    };
    const off = () => document.body.classList.remove("omd-printing");
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
      off();
    };
  }, [fitOnePage]);

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
        /* @page cannot be scoped to a class, so paper size stays here. Every
           other rule lives under .omd-printing instead of inside @media print,
           because the same rules have to run twice: once on paper, and once
           off-screen while measuring how tall the sheet will be. Two copies of
           a layout drift, and a fit-to-one-page that measures a layout slightly
           different from the printed one is worse than no fit at all. */
        @media print { @page { size: A4 landscape; margin: 8mm; } }

        .omd-printing {
          background: #ffffff !important;
          font-size: 10px !important;
        }
        .omd-printing .print-root {
          color-adjust: exact;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
          background: #ffffff !important;
          min-height: auto !important;
        }
        .omd-printing .omd-page {
          max-width: none !important;
          padding: 0 !important;
          /* Set by the fit control; 1 = print at full size. */
          zoom: var(--omd-print-zoom, 1);
        }
        /* No masthead on paper. "CAMPAIGN PRINT MODULE / Promotion Summary
           Print" names the tool to whoever opened the app; the person reading
           the sheet on a wall already knows what they are looking at, and the
           block was costing a fifth of the page. What survives is the one thing
           a loose sheet cannot be read without — whose brand and which branch —
           on a single line above the tables. */
        .omd-printing .omd-print-hero { display: none !important; }
        .omd-printing .omd-print-slug {
          display: flex !important;
          align-items: baseline;
          gap: 10px;
          padding: 0 2px 4px !important;
          border-bottom: 1px solid #ECEAF2 !important;
        }
        .omd-printing .omd-print-summary { display: none !important; }
        .omd-printing .omd-print-sections {
          margin-top: 6px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 5px !important;
        }
        .omd-printing .omd-print-section {
          border-radius: 12px !important;
          box-shadow: none !important;
          break-inside: avoid;
          overflow: hidden !important;
        }
        .omd-printing .omd-table-head {
          display: grid !important;
          grid-template-columns: var(--omd-cols-print) !important;
          padding: 4px 10px !important;
          font-size: 8px !important;
          background: #fbfaf7 !important;
        }
        .omd-printing .omd-print-card {
          display: grid !important;
          grid-template-columns: var(--omd-cols-print) !important;
          gap: 8px !important;
          padding: 4px 10px !important;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .omd-printing .omd-print-card * {
          line-height: 1.2 !important;
        }
        .omd-printing .omd-print-card-title {
          font-size: 9.5px !important;
        }
        .omd-printing .omd-print-card-body,
        .omd-printing .omd-print-card-meta {
          font-size: 8.6px !important;
        }
        /* Start and end on one line: two lines per row, times every row, is a
           whole band of paper spent on a dash. */
        .omd-printing .omd-print-period-break { display: none !important; }
        /* A text box is chrome; on paper the POS name is just a word. These
           were Tailwind's print: variants, which live in @media print and so
           were invisible to the measuring pass — the sheet was measured with a
           26px input in every row and printed with a 12px word, and a fit
           calculated against a taller sheet than the one that comes out shrinks
           further than it needs to. */
        .omd-printing .omd-pos-input { display: none !important; }
        .omd-printing .omd-pos-text { display: inline !important; }
        .omd-printing .omd-category-head {
          padding: 4px 10px !important;
        }
        .omd-printing .omd-category-head-title {
          font-size: 10.5px !important;
        }
        .omd-printing .omd-chip {
          border: 1px solid rgba(255,255,255,0.55) !important;
          padding: 2px 6px !important;
          font-size: 8.5px !important;
        }
        .omd-printing .template-compact .omd-print-card {
          padding: 3px 9px !important;
        }
        .omd-printing .template-compact .omd-print-card-body,
        .omd-printing .template-compact .omd-print-card-meta {
          font-size: 8px !important;
        }
        .omd-printing .template-checklist .omd-check-cell {
          display: block !important;
        }
        .omd-printing .template-board .omd-check-cell,
        .omd-printing .template-compact .omd-check-cell {
          display: none !important;
        }
        /* The measuring pass: a clone of the sheet, laid out at paper width,
           parked where nobody sees it. */
        .omd-measure-host {
          position: fixed !important;
          left: -20000px !important;
          top: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          z-index: -1 !important;
        }
        .omd-measure-host .no-print { display: none !important; }
        .omd-measure-host .omd-page { zoom: 1 !important; }
      `}</style>

      {/* The variables live on the sheet, not on <main>: the fit measures a
          CLONE of this element, and a clone lifted away from an ancestor that
          held its grid template lays out as one column per row — a sheet three
          times too tall, and a fit computed against it. */}
      <div ref={sheetRef} className="omd-page mx-auto max-w-[1400px] px-4 py-4 md:px-6 md:py-5"
        style={{
          "--omd-print-zoom": printZoom,
          "--omd-cols": colTemplate,
          "--omd-cols-print": colTemplatePrint,
        } as React.CSSProperties}>
        {/* Paper only. A sheet with no masthead still has to say whose it is:
            these go up in several branches at once, and a page of promotions
            with no brand on it is a page somebody tapes to the wrong wall. */}
        <div className="omd-print-slug hidden text-[11px] font-extrabold text-[#17172A]">
          <span>{brand === "all" ? "ทุกแบรนด์" : brandName(brand)}</span>
          <span className="font-bold text-[#706A84]">{filterLabel(branch, "ทุกสาขา")}</span>
        </div>
        <section className="omd-print-hero rounded-[18px] border border-[#ECEAF2] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(23,23,42,0.04)] md:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#6C5CE7]">Campaign Print Module</div>
              <h1 className="omd-print-title mt-1 text-[24px] font-extrabold leading-tight md:text-[30px]">Promotion Summary Print</h1>
              <p className="omd-print-blurb mt-1 max-w-[780px] text-[13px] font-medium text-[#7D7789]">
                Print-ready promotion summary synced from Campaign, grouped by type, brand, and branch with Marketing-OS colors.
              </p>
              <div className="omd-print-meta mt-3 hidden flex-wrap gap-2 text-[10px] font-bold text-[#706A84]">
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Brand: {brand === "all" ? "All Brands" : brandName(brand)}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Branch: {filterLabel(branch, "All Branches")}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Category: {category === "all" ? "All Categories" : OMD_STORE_CATEGORY_META[category].label}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Period: {periodLabel}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Template: {PRINT_TEMPLATES[printTemplate].label}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">รายการ: {filtered.length} · ใช้งานอยู่ {activeCount}</span>
                <span className="rounded-full border border-[#ECEAF2] bg-white px-2.5 py-1">Printed: {formatDate(new Date().toISOString())}</span>
              </div>
              {/* Screen only, and deliberately a number rather than a promise:
                  the fit has a floor, so a long sheet still runs over and the
                  person choosing what to print is the only one who can fix
                  that — by filtering, not by shrinking further. */}
              {pagesPrinted !== null && (
                <div className="no-print mt-2 text-[11px] font-bold" style={{ color: fitFellShort ? "#B3641E" : "#7D7789" }}>
                  {fitFellShort
                    ? `ย่อสุดที่ ${Math.round(MIN_FIT_ZOOM * 100)}% แล้วยังได้ ${pagesPrinted} หน้า — เล็กกว่านี้จะอ่านไม่ออก ลองกรองแบรนด์ / หมวด / ช่วงเวลาให้แคบลง`
                    : fitOnePage && printZoom < 1
                      ? `พิมพ์ได้ 1 หน้า · ย่อเหลือ ${Math.round(printZoom * 100)}% (เต็มขนาดจะเป็น ${pagesAtFull ?? 1} หน้า)`
                      : `พิมพ์ได้ ${pagesPrinted} หน้า${printZoom === 1 && (pagesAtFull ?? 0) <= 1 ? " · พอดีอยู่แล้ว ไม่ต้องย่อ" : ""}`}
                </div>
              )}
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#CFC7FF] bg-[#EEE9FF] px-3 text-[12px] font-bold text-[#5B4FD8]"
              >
                <Plus size={15} />
                เพิ่มโปรโมชั่น
              </button>
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
                onClick={() => setFitOnePage((v) => !v)}
                title={fitOnePage
                  ? "กำลังย่อให้พอดีหน้าเดียว — กดเพื่อพิมพ์ขนาดเต็ม"
                  : "พิมพ์ขนาดเต็ม — กดเพื่อย่อให้พอดีหน้าเดียว"}
                aria-pressed={fitOnePage}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border px-3 text-[12px] font-bold"
                style={fitOnePage
                  ? { borderColor: "#CFC7FF", background: "#EEE9FF", color: "#5B4FD8" }
                  : { borderColor: "#ECEAF2", background: "#fff", color: "#3E3E55" }}
              >
                <Minimize2 size={15} />
                พอดี 1 หน้า
                {fitOnePage && printZoom < 1 && <span className="font-extrabold">{Math.round(printZoom * 100)}%</span>}
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
            {/* Column chooser. The preview obeys it too rather than hiding
                columns only on paper — this page IS the preview, and one that
                shows a column the print will not is a preview that lies. */}
            <div className="mt-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">คอลัมน์ที่พิมพ์</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-[#ECEAF2] bg-[#F6F5FA] px-2.5 py-1 text-[11px] font-bold text-[#9D96AC]"
                  title="สองคอลัมน์นี้คือเนื้อของใบ ปิดไม่ได้">
                  Promotion · Details
                </span>
                {OPTIONAL_COLS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCol(c.key)}
                    aria-pressed={shown(c.key)}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-bold"
                    style={shown(c.key)
                      ? { borderColor: "#CFC7FF", background: "#EEE9FF", color: "#5B4FD8" }
                      : { borderColor: "#ECEAF2", background: "#fff", color: "#B5B0C0", textDecoration: "line-through" }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
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
              จาก Campaign {printedCampaignItems.length} รายการ · เพิ่มเอง {manualItems.length} รายการ
              {hiddenCampaignItems.length > 0 && <> · เอาออกจากใบพิมพ์ {hiddenCampaignItems.length} รายการ</>}
            </div>
          </div>
        </section>

        {hiddenCampaignItems.length > 0 && (
          <section className="no-print mt-3 rounded-[18px] border border-[#ECEAF2] bg-white px-4 py-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">
              เอาออกจากใบพิมพ์ ({hiddenCampaignItems.length})
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {hiddenCampaignItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => restoreItem(item)}
                  title="เอากลับขึ้นใบพิมพ์"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#ECEAF2] bg-[#FBFAF7] px-3 py-1.5 text-[11.5px] font-bold text-[#706A84] hover:border-[#CFC7FF] hover:text-[#5B4FD8]"
                >
                  <RotateCcw size={13} />
                  {item.title}
                </button>
              ))}
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
            <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#9D96AC]">Brand / Branch</div>
            <div className="mt-2 text-[26px] font-extrabold">{brand === "all" ? "All" : brandName(brand)}</div>
            <div className="mt-1 text-[11px] font-bold text-[#8A879A]">{storeCount} branch groups</div>
          </div>
        </section>

        <section className="omd-print-sections mt-3 space-y-3">
          {grouped.map((group) => {
            const meta = OMD_STORE_CATEGORY_META[group.key];
            // Brands actually present in this group, in the order the rows run.
            const groupBrands = Array.from(new Set(group.items.map((item) => item.brand)));
            return (
              <div key={group.key} className="omd-print-section overflow-hidden rounded-[18px] border bg-white shadow-[0_8px_22px_rgba(23,23,42,0.04)]" style={{ borderColor: meta.border }}>
                <div className="omd-category-head flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ background: meta.bg, color: meta.fg }}>
                  <div className="omd-category-head-title text-[14px] font-extrabold">{meta.printLabel}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Key for the row tints. Without the Brand column the colour is
                        the only thing saying which brand a row belongs to, and a
                        colour nobody can name is decoration. Only shown when the
                        sheet actually mixes brands — one brand needs no key. */}
                    {groupBrands.length > 1 && groupBrands.map((id) => (
                      <span key={id} className="flex items-center gap-[5px] rounded-full bg-white/65 px-2.5 py-1 text-[10.5px] font-extrabold">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: brandColor(id) }} />
                        {brandName(id)}
                      </span>
                    ))}
                    <div className="rounded-full bg-white/65 px-3 py-1 text-[11px] font-extrabold">{group.items.length} items</div>
                  </div>
                </div>

                <div className="omd-table-head hidden xl:grid border-b border-[#ECEAF2] bg-[#FBFAF7] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8A879A]"
                  style={{ gridTemplateColumns: "var(--omd-cols)" }}>
                  <div className="omd-check-cell hidden">Done</div>
                  <div>Promotion</div>
                  <div>Details</div>
                  {visibleCols.map((c) => <div key={c.key}>{c.label}</div>)}
                  <div className="no-print" />
                </div>

                <div className="divide-y divide-[#ECEAF2]">
                  {group.items.map((item) => (
                    <article
                      key={item.id}
                      // The brand's own colour, barely there (8%), as the row's
                      // background — it carries the brand identity the removed
                      // Brand column used to, without spending a column on it.
                      // The page sets print-color-adjust: exact, so it survives
                      // the printer. A left rule in the full colour keeps the
                      // band legible if a printer washes the tint out anyway.
                      style={{
                        background: `${brandColor(item.brand)}14`,
                        borderLeft: `3px solid ${brandColor(item.brand)}`,
                      }}
                      className="omd-print-card grid gap-3 px-4 py-3 xl:[grid-template-columns:var(--omd-cols)]">
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
                      {shown("pos") && (
                      <div className="omd-print-card-meta text-[12px] font-bold leading-relaxed text-[#3E3E55]">
                        {/* Editable on screen; the printout shows plain text */}
                        <input
                          value={item.posName}
                          onChange={(e) => setPosName(item.id, e.target.value)}
                          onBlur={() => savePosName(item)}
                          placeholder="พิมพ์ชื่อใน POS…"
                          className="omd-pos-input w-full rounded-[8px] border border-[#E5E1F0] bg-white px-2 py-1 text-[12px] font-bold text-[#3E3E55] outline-none focus:border-[#6C5CE7]"
                        />
                        <span className="omd-pos-text hidden">{item.posName || "—"}</span>
                      </div>
                      )}
                      {shown("branch") && (
                        <div className="omd-print-card-meta text-[12px] font-extrabold text-[#17172A]">{branchLabel(item, brandBranches[item.brand] ?? [])}</div>
                      )}
                      {shown("period") && (
                        <div className="omd-print-card-meta text-[12px] font-bold leading-relaxed text-[#3E3E55]">
                          {formatDate(item.startDate)}<br className="omd-print-period-break" />
                          <span className="text-[#8A879A]"> to {formatDate(item.endDate)}</span>
                        </div>
                      )}
                      {shown("status") && (
                        <div className="omd-print-card-meta text-[12px] font-extrabold" style={{ color: ["ended", "cancelled"].includes(liveStatus(item)) ? "#8A879A" : meta.fg }}>
                          {statusLabel(item)}
                        </div>
                      )}
                      {/* Row actions in a track of their own. They used to sit
                          inside the Status cell, so turning Status off took the
                          only edit and delete buttons with it. */}
                      <div className="no-print flex items-start justify-end gap-1">
                        {/* Screen only — a printout has no buttons. Manual rows are
                            edited and deleted here; a campaign row's wording is a
                            field on its brief, so its pencil goes there rather
                            than opening a copy that would drift from the campaign. */}
                        {item.source === "manual" ? (
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            title="แก้ไขโปรโมชั่นนี้"
                            aria-label={`แก้ไข ${item.title}`}
                            className="no-print shrink-0 rounded-[8px] border border-[#ECEAF2] bg-white p-1.5 text-[#9D96AC] hover:border-[#C7BEF5] hover:text-[#6C5CE7]"
                          >
                            <Pencil size={13} />
                          </button>
                        ) : (
                          <Link
                            href={`/campaigns/new?edit=${encodeURIComponent(item.id.replace(/^campaign-/, ""))}`}
                            title="แก้ที่แคมเปญ — ข้อความหน้าร้านเป็นช่องหนึ่งในบรีฟ"
                            aria-label={`แก้ ${item.title} ที่แคมเปญ`}
                            className="no-print shrink-0 rounded-[8px] border border-[#ECEAF2] bg-white p-1.5 text-[#9D96AC] hover:border-[#C7BEF5] hover:text-[#6C5CE7]"
                          >
                            <Pencil size={13} />
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => removeItem(item)}
                          title={item.source === "manual" ? "ลบโปรโมชั่นนี้" : "เอาออกจากใบพิมพ์ (แคมเปญยังอยู่)"}
                          aria-label={item.source === "manual" ? `ลบ ${item.title}` : `เอา ${item.title} ออกจากใบพิมพ์`}
                          className="no-print shrink-0 rounded-[8px] border border-[#ECEAF2] bg-white p-1.5 text-[#9D96AC] hover:border-[#F4B6B6] hover:text-[#D95454]"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
                  <>ยังไม่มีแคมเปญไหนกรอก <b>Promotion หน้าร้าน</b> — เปิดแคมเปญที่มีโปรฯ แล้วกด Edit เพื่อกรอกช่องนี้ แล้วมันจะขึ้นที่นี่ · หรือกด <b>เพิ่มโปรโมชั่น</b> ถ้าเป็นโปรฯ ที่ไม่ได้มาจากแคมเปญ</>
                ) : (
                  <>มี {allPromotions.length} โปรฯ อยู่ แต่ไม่ตรงกับตัวกรองที่เลือก — ลองขยาย Period หรือเปลี่ยน Brand / Branch</>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <PromotionEditor
        open={editorOpen}
        editing={editingItem}
        onClose={() => { setEditorOpen(false); setEditingItem(null); }}
        onSave={saveManualItem}
        brandBranches={brandBranches}
      />
    </main>
  );
}
