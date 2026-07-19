"use client";

import { toast, toastError } from "@/lib/toast";
import { DEFAULT_APPROVER } from "@/lib/approval";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Copy, Trash2, X, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DatePicker } from "@/components/ui/DatePicker";
import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";
import { ContentItemForm } from "@/components/content/ContentItemForm";
import { KolItemForm } from "@/components/kol/KolItemForm";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { useCanCreateCampaign } from "@/lib/usePermGates";
import { getAppSetting, setAppSetting } from "@/lib/db/appSettings";
import { BRANDS, BrandId, brandName, emptyBrandTotals } from "@/lib/brands";
import { BRANDS_DATA, BrandCfg } from "@/lib/data/settings";
import {
  CampaignBrief, emptyBrief, emptyContentItem, emptyKolItem, nextCampaignCode,
  OBJECTIVES, CAMPAIGN_TYPES, SUCCESS_METRICS,
  CHANNELS, ADS_PLATFORMS, PRIORITIES,
  budgetSummary, guidelineChecklist, taskPreview, validateSubmit,
  kolBudgetTotal, kolMonthlyTotals, withSyncedKolBudget,
  campaignMonthKeys, todayIso,
  BriefContentItem, BriefKolItem, GuidelineItem,
} from "@/lib/data/brief";
import { fetchAllBriefs, fetchCampaignBrief, saveCampaignBrief } from "@/lib/db/brief";
import { fetchBriefFromSheet } from "@/lib/db/briefSheet";
import { briefDiffSummary } from "@/lib/data/briefDiff";
import { applyBriefPatch } from "@/lib/data/briefSheet";
import { fetchBrandConfigs, fetchCampaignTypeConfigs, fetchMembers } from "@/lib/db/settings";
import { BudgetSheetRow, fetchBudgetSheetRows } from "@/lib/db/budgetSheet";
import { notify } from "@/lib/notify";
import { baht } from "@/lib/format";
import { useBrandVisibility } from "@/lib/brandVisibility";

// Guideline sits just before Submit — a final pre-flight, not an early gate.
const STEPS = ["Campaign Overview", "Content Plan", "Budget Allocation", "KOL Plan", "Auto Task Preview", "Guideline Checklist", "Submit"];
// There is a single campaign approver (the CMO) — assigned automatically.
const CMO_NAME = "Linnapat D.";

const field = "w-full text-[13.5px] px-[13px] py-[10px] rounded-[10px] border border-line2 bg-ivory outline-none";
const label = "block text-[11.5px] font-bold text-faint mb-[6px]";

/** Goal inputs show thousand separators, the way the Reach field already does —
 *  but only for a purely numeric value: "3.5%" or free text passes through, and
 *  the STORED value stays comma-free so downstream parsing never changes. */
function fmtGoal(v: string): string {
  return /^\d+$/.test(v) ? Number(v).toLocaleString("en-US") : v;
}

function newCampaignId(): string {
  const n = new Date();
  const rnd = Math.floor(1000 + (n.getTime() % 9000));
  return `CAM-${n.getFullYear()}-${String(rnd).padStart(4, "0")}`;
}

// Step-1 (Overview) required-field check → { fieldKey: message }, in visual order.
function overviewErrors(b: CampaignBrief): Record<string, string> {
  const e: Record<string, string> = {};
  if (!b.name.trim()) e.name = "กรุณากรอกชื่อแคมเปญ";
  if (b.branches.length === 0) e.branches = "กรุณาเลือกอย่างน้อย 1 สาขา";
  if (!b.startDate) e.startDate = "กรุณาเลือก Start Date";
  if (!b.endDate) e.endDate = "กรุณาเลือก End Date";
  else if (b.startDate && b.endDate < b.startDate) e.endDate = "End Date ต้องไม่ก่อน Start Date";
  if (!b.launchDate) e.launchDate = "กรุณาเลือก Launch Date";
  if (!b.audience.trim()) e.audience = "กรุณากรอก Target Audience";
  if (!b.mainMessage.trim()) e.mainMessage = "กรุณากรอก Key Message";
  if (!b.offer.trim()) e.offer = "กรุณากรอก Main Offer";
  return e;
}

const monthKeyFromBrief = (brief: CampaignBrief) => (brief.startDate || brief.launchDate || "").slice(0, 7);
const effectiveBriefBudget = (brief: CampaignBrief) => Math.max(brief.budget.total || 0, budgetSummary(brief).allocated || 0);
const isDigitalBudgetRow = (row: BudgetSheetRow) => (row.group || "").trim().toLowerCase() === "digital marketing";

function digitalBudgetByBrandFromSheet(rows: BudgetSheetRow[], month: string): Record<BrandId, number> {
  // Keyed by the configured brands; `?? 0` guards a sheet row naming a brand that
  // config no longer lists (otherwise `undefined + n` = NaN).
  const totals = emptyBrandTotals();
  for (const row of rows) {
    if (row.month !== month || !isDigitalBudgetRow(row)) continue;
    if (!row.brand || row.brand === "all") continue;
    totals[row.brand] = (totals[row.brand] ?? 0) + (row.budget || 0);
  }
  return totals;
}

function budgetByMonthForBrief(brief: CampaignBrief): Record<string, number> {
  const rows = (brief.budget.monthly ?? []).filter((row) => row.month && row.amount > 0);
  if (rows.length) return Object.fromEntries(rows.map((row) => [row.month, row.amount]));
  const month = monthKeyFromBrief(brief);
  return month ? { [month]: effectiveBriefBudget(brief) } : {};
}

function monthlyBudgetWarning(brief: CampaignBrief, savedBriefs: CampaignBrief[], sheetRows: Awaited<ReturnType<typeof fetchBudgetSheetRows>>): string | null {
  const currentByMonth = budgetByMonthForBrief(brief);
  const warnings = Object.entries(currentByMonth).flatMap(([monthKey, current]) => {
    const plBudget = digitalBudgetByBrandFromSheet(sheetRows, monthKey)[brief.b] || 0;
    if (plBudget <= 0) return [];
    const existing = savedBriefs
      .filter((b) => b.id !== brief.id && b.b === brief.b && b.status !== "Need Revision")
      .reduce((sum, b) => sum + (budgetByMonthForBrief(b)[monthKey] || 0), 0);
    const total = existing + current;
    if (total <= plBudget) return [];
    return [`${brandName(brief.b)} เดือน ${monthKey} วาง Campaign Budget รวม ${baht(total, { compact: true })} เกิน PL Budget ${baht(plBudget, { compact: true })} อยู่ ${baht(total - plBudget, { compact: true })}`];
  });
  return warnings.length ? `${warnings.join(" · ")} — กรุณาลดงบหรือขอ revise budget ก่อน submit` : null;
}

function monthlyBudgetContext(brief: CampaignBrief, savedBriefs: CampaignBrief[], sheetRows: Awaited<ReturnType<typeof fetchBudgetSheetRows>>) {
  const months = campaignMonthKeys(brief.startDate, brief.endDate);
  const currentByMonth = budgetByMonthForBrief(brief);
  const activeMonths = months.length ? months : Object.keys(currentByMonth);
  return activeMonths.map((monthKey) => {
    const plBudget = digitalBudgetByBrandFromSheet(sheetRows, monthKey)[brief.b] || 0;
    const committed = savedBriefs
      .filter((b) => b.id !== brief.id && b.b === brief.b && !["Need Revision", "Cancelled"].includes(b.status))
      .reduce((sum, b) => sum + (budgetByMonthForBrief(b)[monthKey] || 0), 0);
    const thisCampaign = currentByMonth[monthKey] || 0;
    const remaining = plBudget - committed - thisCampaign;
    const usedPct = plBudget ? Math.min(100, Math.round(((committed + thisCampaign) / plBudget) * 100)) : 0;
    return { month: monthKey, plBudget, committed, thisCampaign, remaining, usedPct };
  });
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { member, user } = useAuth();
  const { role } = useRole();
  const allowedToCreate = useCanCreateCampaign();
  const brandVisibility = useBrandVisibility();
  const permittedBrandOptions = brandVisibility.visibleBrands;
  const [id, setId] = useState(newCampaignId);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Snapshot of the brief as loaded for editing — the base briefDiff compares
  // against, so the CMO is told exactly what an edit changed.
  const [originalBrief, setOriginalBrief] = useState<CampaignBrief | null>(null);
  const [brief, setBrief] = useState<CampaignBrief>(() => ({ ...emptyBrief(id), approver: CMO_NAME }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(1);
  const [triedNext, setTriedNext] = useState(false); // show step-1 inline errors after first Next
  const [ackWarn, setAckWarn] = useState(false);      // acknowledge unresolved warnings before Submit
  const [savedBriefs, setSavedBriefs] = useState<CampaignBrief[]>([]);
  const [budgetSheetRows, setBudgetSheetRows] = useState<Awaited<ReturnType<typeof fetchBudgetSheetRows>>>([]);
  const [brandConfigs, setBrandConfigs] = useState<BrandCfg[]>(() => BRANDS_DATA.map((b) => ({ ...b, branchList: [...b.branchList] })));
  const [campaignTypes, setCampaignTypes] = useState<string[]>(() => [...CAMPAIGN_TYPES]);
  const configuredBrandIds = useMemo(() => new Set(brandConfigs.map((brand) => brand.key)), [brandConfigs]);
  const brandOptions = useMemo(
    () => permittedBrandOptions.filter((brand) => configuredBrandIds.has(brand)),
    [configuredBrandIds, permittedBrandOptions],
  );

  const set = <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => setBrief((b) => ({ ...b, [k]: v }));
  const nextSeq = () => { const s = seq; setSeq((x) => x + 1); return s; };

  // Planner = the logged-in user (auto, read-only). Keep it synced to auth.
  const me = member?.name ?? user?.email ?? "";
  useEffect(() => { if (me) setBrief((b) => ({ ...b, plannerOwner: me })); }, [me]);
  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    let alive = true;
    fetchCampaignBrief(editId).then((saved) => {
      if (!alive || !saved) return;
      const defaults = emptyBrief(editId);
      const normalized: CampaignBrief = {
        ...defaults,
        ...saved,
        id: editId,
        approver: saved.approver || CMO_NAME,
        content: (saved.content ?? []).map((item, index) => ({
          ...emptyContentItem(index + 1),
          ...item,
          graphicDueDate: item.graphicDueDate ?? "",
        })),
        kols: saved.kols ?? [],
        budget: { ...defaults.budget, ...saved.budget, monthly: saved.budget?.monthly ?? [] },
        approvalLog: saved.approvalLog ?? [],
      };
      setId(editId);
      setEditingId(editId);
      setOriginalBrief(JSON.parse(JSON.stringify(normalized)));
      setBrief(normalized);
      setSeq(normalized.content.length + normalized.kols.length + 1);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    // NEW campaigns only. When EDITING, the brand is a fact of the saved
    // campaign — "my dropdown doesn't have it" must never silently rebrand
    // someone else's campaign (a scoped MM opening an out-of-scope campaign by
    // URL used to see it flip to their first brand, one Save away from moving
    // an Omakase campaign under Teppen). Out-of-scope edits are blocked below.
    if (!editingId && brandOptions.length && !brandOptions.includes(brief.b)) setBrief((b) => ({ ...b, b: brandOptions[0] as BrandId, branches: [] }));
  }, [brandOptions, brief.b, editingId]);
  useEffect(() => {
    let alive = true;
    Promise.all([fetchAllBriefs(), fetchBudgetSheetRows(), fetchBrandConfigs(), fetchCampaignTypeConfigs(), fetchMembers()])
      .then(([briefMap, sheetRows, configs, types, members]) => {
        if (!alive) return;
        setSavedBriefs(Object.values(briefMap));
        setBudgetSheetRows(sheetRows);
        setBrandConfigs(configs);
        setCampaignTypes(types);
        // Approver = the CMO member's profile name — the SAME source the planner
        // name comes from, so one person never shows up under two names
        // ("Gik" as planner, hardcoded "Linnapat D." as approver).
        const cmo = members.find((m) => m.role === "CMO")?.name?.trim();
        if (cmo) setBrief((b) => (b.approver === CMO_NAME || !b.approver ? { ...b, approver: cmo } : b));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Auto-assign a per-brand running campaign code to NEW campaigns; recompute
  // when the brand changes. Editing keeps whatever code the brief already has.
  useEffect(() => {
    if (editingId) return;
    setBrief((b) => ({ ...b, code: nextCampaignCode(b.b, savedBriefs) }));
  }, [brief.b, savedBriefs, editingId]);

  const branches = useMemo(() => brandConfigs.find((d) => d.key === brief.b)?.branchList ?? [], [brandConfigs, brief.b]);
  useEffect(() => {
    // Drop branches that don't belong to the brand — but ONLY once the brand's
    // branch list has actually loaded. `brandConfigs` starts as seed data and is
    // replaced by the saved config a moment later; running against the empty /
    // stale list wiped every saved branch onan edit, so the planner had to
    // re-tick them on every visit (and a stray Save stored the empty list).
    if (!branches.length) return;
    setBrief((b) => {
      const nextBranches = b.branches.filter((br) => branches.includes(br));
      return nextBranches.length === b.branches.length ? b : { ...b, branches: nextBranches, branch: nextBranches.join(", ") };
    });
  }, [branches]);
  // A new campaign starts covering every branch of its brand — brand-wide is the
  // normal case, so ticking each box by hand was busywork. Only fills an empty
  // selection, so deselecting branches sticks. Editing is exempt: a saved brief's
  // branch list is a decision someone already made, and quietly widening it to
  // every branch would change who the campaign runs for and who it prints for.
  useEffect(() => {
    if (editingId || !branches.length) return;
    setBrief((b) => (b.branches.length ? b : { ...b, branches: [...branches], branch: branches.join(", ") }));
  }, [branches, editingId]);
  const bs = useMemo(() => budgetSummary(brief), [brief]);
  const checklist = useMemo(() => guidelineChecklist(brief), [brief]);
  const preview = useMemo(() => taskPreview(brief), [brief]);
  const errors = useMemo(() => validateSubmit(brief), [brief]);
  const budgetGuardWarning = useMemo(() => monthlyBudgetWarning(brief, savedBriefs, budgetSheetRows), [brief, savedBriefs, budgetSheetRows]);

  const outOfRange = (iso: string) => iso && brief.startDate && brief.endDate && (iso < brief.startDate || iso > brief.endDate);
  const rangeWarnings = useMemo(() => {
    const w: string[] = [];
    brief.content.forEach((c) => { if (outOfRange(c.publishDate)) w.push(`Content “${c.title || "—"}” publish date อยู่นอกช่วง campaign`); });
    brief.kols.forEach((k) => { if (outOfRange(k.postingStart)) w.push(`KOL ${k.name || k.kolType} posting date อยู่นอกช่วง campaign`); });
    return w;
  }, [brief]); // eslint-disable-line react-hooks/exhaustive-deps

  const allWarnings = [...bs.warnings, ...rangeWarnings, ...(budgetGuardWarning ? [budgetGuardWarning] : [])];
  const ovErrors = triedNext ? overviewErrors(brief) : {};
  // Submit is blocked by hard errors, by over-PL-budget guards, and by other
  // unresolved warnings unless acknowledged.
  const canSubmit = errors.length === 0 && !budgetGuardWarning && (allWarnings.length === 0 || ackWarn);

  // Next validates step 1 inline: scroll to the first missing field instead of failing silently.
  const goNext = () => {
    if (step === 0) {
      setTriedNext(true);
      const e = overviewErrors(brief);
      const first = Object.keys(e)[0];
      if (first) { setTimeout(() => document.getElementById(`ov-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); return; }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finalize = (status: CampaignBrief["status"], log: CampaignBrief["approvalLog"], now: string): CampaignBrief =>
    withSyncedKolBudget({ ...brief, branch: brief.branches.join(", "), status, approvalLog: log, createdAt: now });

  // Top-right Save Draft: saves the work-in-progress WITHOUT leaving the
  // page, so stepping away mid-build never loses anything. The final-step
  // Save Draft still saves-and-exits.
  const [draftSaved, setDraftSaved] = useState(false);
  const saveDraftStay = async () => {
    if (!brief.name.trim()) {
      setStep(0);
      toastError("ตั้งชื่อแคมเปญก่อน แล้วกด Save Draft อีกครั้ง");
      return;
    }
    setBusy(true);
    try {
      // Same rule as Submit: a non-CMO edit of an approved campaign cannot stay
      // "Draft-saved" outside the approval flow — it revokes the approval and
      // queues for the CMO, diff attached.
      const APPROVED_STATES = ["Approved", "In Progress", "Completed"];
      const mustReapprove = !!editingId && role !== "CMO" && APPROVED_STATES.includes(originalBrief?.status ?? "");
      const now = new Date().toISOString();
      if (mustReapprove && originalBrief) {
        const changes = briefDiffSummary(originalBrief, brief);
        const entry = { action: "Edited — approval revoked, sent back to CMO", by: brief.plannerOwner || "Planner", at: now, comment: changes || "ไม่มีการเปลี่ยนแปลงที่ตรวจพบ", from: originalBrief.status, to: "Waiting for Approval" };
        await saveCampaignBrief(finalize("Waiting for Approval", [...brief.approvalLog, entry], now));
        notify("approval", `✏️ แคมเปญแก้ไขแล้วรออนุมัติ: ${brief.name}`, `โดย ${brief.plannerOwner || "Planner"}${changes ? ` · สิ่งที่แก้: ${changes}` : ""}`, "/my-tasks");
        toast("แคมเปญนี้เคยอนุมัติแล้ว — การแก้ไขถูกส่งให้ CMO อนุมัติใหม่", "info");
      } else {
        await saveCampaignBrief(finalize("Draft", brief.approvalLog, now));
      }
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
    } catch (error) {
      toastError(`บันทึก Draft ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  // ── Import from a Google-Sheet brief ────────────────────────────────────
  // Prefills the form only. Nothing is written until the planner saves, so the
  // sheet can't bypass validation, the CMO approval flow, or the budget guard.
  const [sheetUrl, setSheetUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ counts: { content: number; kols: number }; warnings: string[] } | null>(null);

  const runSheetImport = async () => {
    if (!sheetUrl.trim() || importing) return;
    setImporting(true);
    setImportReport(null);
    try {
      const { patch, warnings, counts } = await fetchBriefFromSheet(sheetUrl);
      const notes = [...warnings];

      // The sheet may name a brand this planner isn't allowed to plan for —
      // brand visibility decides, not the sheet.
      if (patch.b && !brandOptions.includes(patch.b)) {
        notes.push(`Brand: คุณไม่มีสิทธิ์สร้างแคมเปญของแบรนด์ “${brandName(patch.b)}” — ใช้แบรนด์เดิมในฟอร์ม`);
        delete patch.b;
      }

      const branchesFor = (brand: BrandId) => brandConfigs.find((c) => c.key === brand)?.branchList ?? [];
      const { brief: merged, warnings: mergeWarnings } = applyBriefPatch(brief, patch, branchesFor);
      setBrief(merged);
      setSeq(merged.content.length + merged.kols.length + 1);
      setTriedNext(false);
      setImportReport({ counts, warnings: [...notes, ...mergeWarnings] });
    } catch (error) {
      toastError(error instanceof Error ? error.message : "อ่าน sheet ไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  };

  const submit = async (asDraft: boolean) => {
    // Save Draft is exempt from validation; Submit is blocked when required
    // fields are missing.
    if (!asDraft && errors.length) { setStep(6); return; }
    if (asDraft && !brief.name.trim()) { setStep(0); return; }
    setBusy(true);
    const now = new Date().toISOString();
    // Editing an already-approved campaign REVOKES the approval for everyone
    // but the CMO: even "Save Draft" cannot quietly keep (or drop) the approved
    // state — the edit goes back into the CMO's queue, with a field-level diff
    // of what changed in the approval log and the notification.
    const APPROVED_STATES = ["Approved", "In Progress", "Completed"];
    const mustReapprove = !!editingId && role !== "CMO" && APPROVED_STATES.includes(originalBrief?.status ?? "");
    const status = asDraft ? (mustReapprove ? "Waiting for Approval" : "Draft") : "Waiting for Approval";
    const changes = editingId && originalBrief ? briefDiffSummary(originalBrief, brief) : "";
    const logEntry = {
      action: editingId ? (mustReapprove && asDraft ? "Edited — approval revoked, sent back to CMO" : "Edited and resubmitted for approval") : "Submitted for approval",
      by: brief.plannerOwner || "Planner", at: now,
      ...(editingId ? { comment: changes || "ไม่มีการเปลี่ยนแปลงที่ตรวจพบ", from: originalBrief?.status, to: status } : {}),
    };
    const log = asDraft && !mustReapprove ? brief.approvalLog : [...brief.approvalLog, logEntry];
    try {
      await saveCampaignBrief(finalize(status, log, now));
      if (status === "Waiting for Approval") notify("approval", `${editingId ? "✏️ แคมเปญแก้ไขแล้วรออนุมัติ" : "🎯 แคมเปญใหม่รออนุมัติ"}: ${brief.name}`, `โดย ${brief.plannerOwner || "Planner"} → รอ ${brief.approver || DEFAULT_APPROVER} อนุมัติ${editingId && changes ? ` · สิ่งที่แก้: ${changes}` : ""}`, "/my-tasks");
      // Land on the list so the new campaign is visible in context immediately.
      router.push("/campaigns");
    } catch (error) {
      toastError(`บันทึก Campaign ไม่สำเร็จ: ${error instanceof Error ? error.message : "Unknown error"}`);
      setBusy(false);
    }
  };

  // Brand scope: the campaign list filters what a member may not see, but this
  // form is reachable by URL with a guessable id. Checked at RENDER time so it
  // re-evaluates once the member's real scope finishes loading — the loaded
  // brief keeps its true brand (the auto-rebrand effect skips edits), so an
  // out-of-scope campaign flips to this panel instead of an editable form.
  const editBlocked = !!editingId && !brandVisibility.isVisible(brief.b);
  if (editBlocked) {
    return (
      <div className="py-24 flex flex-col items-center gap-3 text-center">
        <div className="text-[15px] font-bold text-ink">No access to this campaign</div>
        <div className="text-[13px] text-faint max-w-[420px]">แคมเปญนี้อยู่นอกขอบเขตแบรนด์ที่บัญชีของคุณดูแล — ติดต่อ CMO หากต้องการสิทธิ์</div>
        <Link href="/campaigns" className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">← กลับไปหน้า Campaigns</Link>
      </div>
    );
  }

  // Campaign creation follows Settings → Permissions (Campaign ≥ Edit) — the
  // button hides on the list, and this guards the direct URL.
  if (!allowedToCreate) {
    return (
      <div className="py-24 flex flex-col items-center gap-3 text-center">
        <div className="text-[15px] font-bold text-ink">No access to Campaign Builder</div>
        <div className="text-[13px] text-faint max-w-[420px]">การสร้าง/แก้แคมเปญเป็นงานฝั่งวางแผน — role ของคุณทำงานในแคมเปญผ่าน Content Plan และ Creative Kitchen ติดต่อ CMO หากต้องการสิทธิ์</div>
        <Link href="/campaigns" className="text-[12.5px] font-bold text-white bg-panel rounded-[9px] px-4 py-[9px]">← กลับไปหน้า Campaigns</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Campaign Builder"
        title={editingId ? "Edit Campaign" : "Create Campaign"}
        subtitle={editingId ? "แก้ไข Campaign ได้ทุกสถานะ — เมื่อ Submit ระบบจะส่งเวอร์ชันล่าสุดให้ CMO อนุมัติอีกครั้ง" : "สร้าง campaign brief แบบ flexible — ออกแบบเอง มี guideline ช่วยไม่ให้ตกหล่น แล้วแตกงานอัตโนมัติ"}
        right={
          <div className="flex items-center gap-2">
            <button disabled={busy} onClick={saveDraftStay}
              title="บันทึกงานที่ค้างไว้เป็น Draft — อยู่หน้านี้ทำต่อได้"
              className="text-[12.5px] font-bold rounded-[9px] px-3 py-[7px] border disabled:opacity-40"
              style={draftSaved
                ? { background: "#EEF4EE", borderColor: "#CFE4C2", color: "#4E7A4E" }
                : { background: "#211F1C", borderColor: "#211F1C", color: "#fff" }}>
              {draftSaved ? "✓ บันทึก Draft แล้ว" : busy ? "กำลังบันทึก…" : "💾 Save Draft"}
            </button>
            <Link href="/campaigns" className="text-[12.5px] font-semibold text-muted border border-line2 rounded-[9px] px-3 py-[7px] bg-surface">← Campaigns</Link>
          </div>
        }
      />

      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} className="flex items-center gap-2 flex-shrink-0">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={i === step ? { background: "#211F1C", color: "#fff" } : i < step ? { background: "#4E7A4E", color: "#fff" } : { background: "#E8E2D6", color: "#9A9387" }}>{i + 1}</span>
            <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: i === step ? "#211F1C" : "#9A9387" }}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-5 h-[2px] mx-1" style={{ background: i < step ? "#4E7A4E" : "#E5DECF" }} />}
          </button>
        ))}
      </div>

      <div className="mt-5 max-w-[900px]">
        {step === 0 && (
          <>
            {/* Sheet import is CMO-only by request: planners build briefs in the
                form; the bulk-import path stays with the person who approves them. */}
            {role === "CMO" && (
              <SheetImport url={sheetUrl} setUrl={setSheetUrl} busy={importing} onImport={runSheetImport} report={importReport} />
            )}
            <Overview brief={brief} set={set} setBrief={setBrief} branches={branches} planner={me} errors={ovErrors} brandOptions={brandOptions} brandConfigs={brandConfigs} campaignTypes={campaignTypes} />
          </>
        )}
        {step === 1 && <ContentPlan brief={brief} setBrief={setBrief} nextSeq={nextSeq} outOfRange={outOfRange} />}
        {step === 2 && <Budget brief={brief} setBrief={setBrief} bs={bs} budgetGuardWarning={budgetGuardWarning} savedBriefs={savedBriefs} budgetSheetRows={budgetSheetRows} onEditKol={() => setStep(3)} />}
        {step === 3 && <KolPlan brief={brief} setBrief={setBrief} nextSeq={nextSeq} branches={branches} outOfRange={outOfRange} />}
        {step === 4 && <Preview preview={preview} warnings={allWarnings} />}
        {step === 5 && <Guideline checklist={checklist} />}
        {step === 6 && <Submit brief={brief} errors={errors} warnings={allWarnings} ack={ackWarn} onAck={setAckWarn} checklist={checklist} />}
      </div>

      <div className="mt-6 max-w-[900px] flex items-center justify-between">
        <button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4 py-[9px] bg-surface disabled:opacity-40">← Back</button>
        {step < STEPS.length - 1 ? (
          <div className="flex gap-2">
            {/* Save sits on every step, next to where the eye already is. The only
                Save used to be in the page header or on the last step, so filling
                one section and stopping meant scrolling back up or walking to the
                end. Stays on the current step — it's a checkpoint, not an exit. */}
            <button disabled={busy} onClick={saveDraftStay}
              title="บันทึกงานที่ค้างไว้เป็น Draft — อยู่ step นี้ทำต่อได้"
              className="text-[13px] font-semibold border rounded-[10px] px-4 py-[9px] disabled:opacity-40"
              style={draftSaved
                ? { background: "#EEF4EE", borderColor: "#CFE4C2", color: "#4E7A4E" }
                : { background: "#fff", borderColor: "#E5DECF", color: "#6b6258" }}>
              {draftSaved ? "✓ บันทึกแล้ว" : busy ? "กำลังบันทึก…" : "💾 Save Draft"}
            </button>
            <button onClick={goNext}
              className="text-[13px] font-bold text-white bg-panel rounded-[10px] px-5 py-[9px]">Next →</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => submit(true)} className="text-[13px] font-semibold text-muted border border-line2 rounded-[10px] px-4 py-[9px] bg-surface disabled:opacity-40">Save Draft</button>
            <button disabled={busy || !canSubmit} onClick={() => submit(false)} className="text-[13px] font-bold text-white rounded-[10px] px-5 py-[9px] disabled:opacity-40" style={{ background: "#4E7A4E" }}>{busy ? "Saving…" : editingId ? "Submit Changes for CMO Approval" : "Submit Campaign"}</button>
          </div>
        )}
      </div>
    </>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-cardLg p-5 mb-4">
      <div className="text-[14px] font-bold mb-1">{title}</div>
      {hint ? <div className="text-[12px] text-faint mb-4">{hint}</div> : <div className="mb-4" />}
      {children}
    </div>
  );
}

// ── Google-Sheet import (step 1) ────────────────────────────────────────────
// Collapsed by default: most campaigns are still built by hand, and the sheet
// path shouldn't push the actual form below the fold.
function SheetImport({ url, setUrl, busy, onImport, report }: {
  url: string; setUrl: (v: string) => void; busy: boolean; onImport: () => void;
  report: { counts: { content: number; kols: number }; warnings: string[] } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface border border-line rounded-cardLg p-5 mb-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          <FileSpreadsheet size={15} style={{ color: "#4E7A4E" }} />
          <span className="text-[14px] font-bold">Import จาก Google Sheet</span>
          <span className="text-[11px] font-semibold rounded-pill px-2 py-[2px]" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>ทางเลือก</span>
        </span>
        <span className="text-[12px] font-semibold text-faint">{open ? "ซ่อน" : "เปิด"}</span>
      </button>
      {open && (
        <div className="mt-4">
          <div className="text-[12px] text-faint mb-3">
            วางลิงก์ sheet ที่ทำตาม template (แท็บ Overview / Content / KOL / Budget) — แชร์แบบ “Anyone with the link · Viewer” ก่อน
            <br />ระบบจะกรอกฟอร์มให้ <span className="font-semibold">ตรวจและแก้ได้ก่อนบันทึก</span> — ไม่มีการบันทึกอัตโนมัติ
          </div>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="https://docs.google.com/spreadsheets/d/…"
              onKeyDown={(e) => { if (e.key === "Enter") onImport(); }} />
            <button type="button" disabled={busy || !url.trim()} onClick={onImport}
              className="text-[13px] font-bold text-white rounded-[10px] px-5 py-[9px] whitespace-nowrap disabled:opacity-40" style={{ background: "#4E7A4E" }}>
              {busy ? "กำลังอ่าน…" : "Import"}
            </button>
          </div>
          {report && (
            <div className="mt-3 rounded-[10px] border p-3" style={{ background: "#F7FAF7", borderColor: "#CFE4C2" }}>
              <div className="text-[12.5px] font-bold" style={{ color: "#4E7A4E" }}>
                ✓ กรอกฟอร์มจาก sheet แล้ว — content {report.counts.content} รายการ · KOL {report.counts.kols} รายการ
              </div>
              {report.warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {report.warnings.map((w, i) => (
                    <li key={i} className="text-[11.5px] text-muted flex gap-1.5">
                      <span style={{ color: "#C68A1E" }}>⚠</span><span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Target Audience with team-shared presets ────────────────────────────────
// Audiences repeat across campaigns ("สมาชิก OMD ทั้งหมด…", "คนทำงานย่านสุขุมวิท…"),
// so a written-once audience can be saved and picked next time. Stored in
// app_settings (shared with the whole team, localStorage fallback) — the same
// mechanism the budget-sheet URL already uses.
const AUDIENCE_PRESETS_KEY = "audience_presets";

function AudienceField({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const [presets, setPresets] = useState<string[]>([]);
  const [savedTick, setSavedTick] = useState(false);
  useEffect(() => {
    getAppSetting(AUDIENCE_PRESETS_KEY).then((raw) => {
      try {
        const list = JSON.parse(raw || "[]");
        if (Array.isArray(list)) setPresets(list.filter((p) => typeof p === "string" && p.trim()));
      } catch { /* an unreadable setting just means no presets yet */ }
    }).catch(() => {});
  }, []);

  const save = async () => {
    const v = value.trim();
    if (!v || presets.includes(v)) return;
    const next = [v, ...presets].slice(0, 20); // newest first; cap keeps the dropdown scannable
    setPresets(next);
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 2000);
    try { await setAppSetting(AUDIENCE_PRESETS_KEY, JSON.stringify(next)); } catch { /* kept locally by the fallback */ }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} className={field}
          style={invalid ? { borderColor: "#B33A2E", background: "#FFF7F6" } : undefined}
          placeholder="เช่น คนทำงานย่านทองหล่อ 25–40 ชอบอาหารญี่ปุ่น" />
        <button type="button" onClick={save} disabled={!value.trim() || presets.includes(value.trim())}
          title="บันทึก audience นี้ไว้เลือกใช้ในแคมเปญถัดไป (แชร์ทั้งทีม)"
          className="text-[12px] font-bold whitespace-nowrap rounded-[10px] px-3 border border-line2 disabled:opacity-40"
          style={savedTick ? { background: "#EEF4EE", color: "#4E7A4E", borderColor: "#CFE4C2" } : { background: "#fff", color: "#6b6258" }}>
          {savedTick ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
        </button>
      </div>
      {presets.length > 0 && (
        <select value="" onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          className="mt-2 w-full text-[12.5px] px-[13px] py-[8px] rounded-[10px] border border-line2 bg-surface text-muted outline-none">
          <option value="">เลือกจาก audience ที่บันทึกไว้ ({presets.length})…</option>
          {presets.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" onClick={() => toggle(o)} className="text-[12px] font-semibold px-[12px] py-[6px] rounded-pill border transition-colors"
            style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { color: "#6b6258", background: "#fff", borderColor: "#E5DECF" }}>{o}</button>
        );
      })}
    </div>
  );
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
/** A textarea that grows to fit its text instead of scrolling inside a fixed box.
 *  Promotion wording is what a customer reads on a shelf — you have to see all of
 *  it while writing it, and it re-measures on `value` so text loaded into an edit
 *  form is already full height on the first paint, not only after a keystroke. */
function AutoGrowTextarea({ value, onChange, className, placeholder }: {
  value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";           // shrink first, or it can only ever grow
    // scrollHeight excludes the border, but this field is border-box, so height
    // sizes the *border* box — assigning scrollHeight straight across clips the
    // last line by exactly the border width. Add it back.
    const cs = getComputedStyle(el);
    const border = cs.boxSizing === "border-box"
      ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
      : 0;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [value]);
  return (
    <textarea
      ref={ref} rows={1} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${className ?? ""} resize-none overflow-hidden`}
    />
  );
}

function Overview({ brief, set, setBrief, branches, planner, errors, brandOptions, brandConfigs, campaignTypes }: {
  brief: CampaignBrief; set: <K extends keyof CampaignBrief>(k: K, v: CampaignBrief[K]) => void;
  setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; branches: string[]; planner: string;
  errors: Record<string, string>; brandOptions: BrandId[]; brandConfigs: BrandCfg[]; campaignTypes: string[];
}) {
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;
  const errBorder = { borderColor: "#B33A2E", background: "#FFF7F6" };
  const errText = "text-[11px] text-status-red font-semibold mt-1";
  const toggleMetric = (m: string) => setBrief((b) => ({ ...b, successMetrics: b.successMetrics.includes(m) ? b.successMetrics.filter((x) => x !== m) : [...b.successMetrics, m] }));
  const setGoal = (m: string, v: string) => setBrief((b) => ({ ...b, successGoals: { ...b.successGoals, [m]: v } }));
  const endInvalid = !!brief.startDate && !!brief.endDate && brief.endDate < brief.startDate;

  // Fixed success metrics: Reach + CV% are inputs, Visit auto-derives
  // (Reach × CV%). Everything else stays an optional chip.
  const FIXED_METRICS = ["Reach", "CV%", "Visit"] as const;
  const reachGoal = num(brief.successGoals["Reach"] ?? "");
  const cvPct = parseFloat(brief.successGoals["CV%"] ?? "") || 0;
  const visitGoal = Math.round(reachGoal * (cvPct / 100));
  const setFixedGoal = (metric: "Reach" | "CV%", value: string) => setBrief((b) => {
    const goals = { ...b.successGoals, [metric]: value };
    const r = parseInt((goals["Reach"] ?? "").replace(/\D/g, "")) || 0;
    const cv = parseFloat(goals["CV%"] ?? "") || 0;
    goals["Visit"] = r && cv ? String(Math.round(r * (cv / 100))) : "";
    // Fixed metrics are always part of the campaign's KPI set.
    const metrics = Array.from(new Set([...FIXED_METRICS, ...b.successMetrics]));
    return { ...b, successGoals: goals, successMetrics: metrics };
  });
  return (
    <Panel title="Campaign Overview" hint="ข้อมูลหลักของแคมเปญ — ไม่มีเทมเพลตบังคับ กรอกตามที่แคมเปญนี้ต้องการ">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2" id="ov-name">
          <div className="flex items-center justify-between gap-2 mb-[6px]">
            <label className={label + " mb-0"}>Campaign Name <span className="text-status-red">*</span></label>
            {brief.code && (
              <span className="text-[11px] font-extrabold rounded-pill px-2.5 py-[3px]" style={{ background: "#F2EEFF", color: "#6C5CE7" }}
                title="เลขแคมเปญอัตโนมัติ แยกตามแบรนด์">
                #{brief.code}
              </span>
            )}
          </div>
          <input value={brief.name} onChange={(e) => set("name", e.target.value)} className={field} style={errors.name ? errBorder : undefined} placeholder="เช่น Wagyu Festival — July" autoFocus />
          {errors.name && <p className={errText}>{errors.name}</p>}
        </div>
        <div>
          <label className={label}>Brand</label>
          <select value={brief.b} onChange={(e) => setBrief((b) => ({ ...b, b: e.target.value as BrandId, branches: [] }))} className={field}>
            {brandOptions.map((id) => <option key={id} value={id}>{brandConfigs.find((brand) => brand.key === id)?.name ?? BRANDS[id].name}</option>)}
          </select>
        </div>
        {/* Branch — directly under Brand */}
        <div id="ov-branches">
          <label className={label}>Branch <span className="text-status-red">*</span> <span className="text-faint font-normal">· หลายสาขา ({brief.branches.length})</span></label>
          {errors.branches && <p className={errText + " mb-1"}>{errors.branches}</p>}
          <MultiSelectDropdown
            options={branches}
            selected={brief.branches}
            onChange={(next) => setBrief((b) => ({ ...b, branches: next, branch: next.join(", ") }))}
          />
        </div>
        <div>
          <label className={label}>Campaign Type</label>
          <select value={brief.campaignType} onChange={(e) => set("campaignType", e.target.value)} className={field}>
            {campaignTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Objective</label>
          <select value={brief.objective} onChange={(e) => set("objective", e.target.value)} className={field}>
            {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Campaign Priority</label>
          <select value={brief.priority} onChange={(e) => set("priority", e.target.value)} className={field}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>

        {/* Success Metrics — Reach / CV% / Visit are fixed (Visit auto = Reach × CV%);
            the rest are optional chips with their own goal inputs. */}
        <div className="md:col-span-2">
          <label className={label}>Success Metrics <span className="text-faint font-normal">· Reach, CV%, Visit เป็นค่าหลัก — ที่เหลือเลือกเพิ่มได้</span></label>
          <div className="grid gap-2 sm:grid-cols-3 rounded-[12px] border border-line2 bg-[#FFFDF7] p-3">
            <label>
              <span className="mb-1 block text-[11px] font-bold text-muted">Reach goal <span className="text-status-red">*</span></span>
              <input value={reachGoal ? reachGoal.toLocaleString("en-US") : ""} onChange={(e) => setFixedGoal("Reach", String(num(e.target.value)))}
                className="w-full text-[13px] font-bold px-[10px] py-[7px] rounded-[9px] border border-line2 bg-ivory outline-none" placeholder="100,000" />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold text-muted">CV% <span className="text-status-red">*</span></span>
              <input value={brief.successGoals["CV%"] ?? ""} onChange={(e) => setFixedGoal("CV%", e.target.value.replace(/[^\d.]/g, ""))}
                className="w-full text-[13px] font-bold px-[10px] py-[7px] rounded-[9px] border border-line2 bg-ivory outline-none" placeholder="3" />
            </label>
            <div>
              <span className="mb-1 block text-[11px] font-bold text-muted">Visit goal <span className="text-faint font-normal">· auto = Reach × CV%</span></span>
              <div className="w-full text-[13px] font-bold px-[10px] py-[7px] rounded-[9px] border border-line2 bg-surface" style={{ color: visitGoal ? "#211F1C" : "#9A9387" }}>
                {visitGoal ? visitGoal.toLocaleString("en-US") : "—"}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUCCESS_METRICS.filter((m) => !(FIXED_METRICS as readonly string[]).includes(m)).map((m) => {
              const on = brief.successMetrics.includes(m);
              return (
                <button key={m} type="button" onClick={() => toggleMetric(m)} className="text-[12px] font-semibold px-[12px] py-[6px] rounded-pill border transition-colors"
                  style={on ? { background: "#211F1C", color: "#fff", borderColor: "#211F1C" } : { color: "#6b6258", background: "#fff", borderColor: "#E5DECF" }}>{m}</button>
              );
            })}
          </div>
          {brief.successMetrics.filter((m) => !(FIXED_METRICS as readonly string[]).includes(m)).length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              {brief.successMetrics.filter((m) => !(FIXED_METRICS as readonly string[]).includes(m)).map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted w-28 flex-shrink-0">{m} goal</span>
                  <input value={fmtGoal(brief.successGoals[m] ?? "")} onChange={(e) => setGoal(m, e.target.value.replace(/,/g, ""))} className="flex-1 text-[13px] px-[11px] py-[8px] rounded-[9px] border border-line2 bg-ivory outline-none" placeholder="เช่น 50,000 / 3.5%" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dates */}
        <div id="ov-startDate">
          <label className={label}>Start Date <span className="text-status-red">*</span></label>
          <DatePicker value={brief.startDate || null} onChange={(v) => set("startDate", v)} max={brief.endDate || undefined} invalid={!!errors.startDate} />
          {errors.startDate && <p className={errText}>{errors.startDate}</p>}
        </div>
        <div id="ov-endDate">
          <label className={label}>End Date <span className="text-status-red">*</span></label>
          <DatePicker value={brief.endDate || null} onChange={(v) => set("endDate", v)} min={brief.startDate || undefined} invalid={endInvalid || !!errors.endDate} />
          {(errors.endDate || endInvalid) && <div className="text-[11px] text-status-red font-semibold mt-1">{errors.endDate || "End Date ต้องไม่ก่อน Start Date"}</div>}
        </div>
        <div id="ov-launchDate">
          <label className={label}>Launch Date <span className="text-status-red">*</span></label>
          <DatePicker value={brief.launchDate || null} onChange={(v) => set("launchDate", v)} min={brief.startDate || undefined} max={brief.endDate || undefined} invalid={!!errors.launchDate} />
          {errors.launchDate && <p className={errText}>{errors.launchDate}</p>}
        </div>

        <div className="md:col-span-2" id="ov-audience">
          <label className={label}>Target Audience <span className="text-status-red">*</span></label>
          <AudienceField value={brief.audience} onChange={(v) => set("audience", v)} invalid={!!errors.audience} />
          {errors.audience && <p className={errText}>{errors.audience}</p>}
        </div>
        <div id="ov-mainMessage">
          <label className={label}>Key Message <span className="text-status-red">*</span></label>
          <input value={brief.mainMessage} onChange={(e) => set("mainMessage", e.target.value)} className={field} style={errors.mainMessage ? errBorder : undefined} placeholder="ข้อความหลักที่อยากสื่อ" />
          {errors.mainMessage && <p className={errText}>{errors.mainMessage}</p>}
        </div>
        <div id="ov-offer">
          <label className={label}>Main Offer <span className="text-status-red">*</span></label>
          <input value={brief.offer} onChange={(e) => set("offer", e.target.value)} className={field} style={errors.offer ? errBorder : undefined} placeholder="เช่น ลด 20% / เซ็ตพิเศษ" />
          {errors.offer && <p className={errText}>{errors.offer}</p>}
        </div>
        <div id="ov-storePromotion">
          <label className={label}>Promotion หน้าร้าน</label>
          <AutoGrowTextarea value={brief.storePromotion ?? ""} onChange={(v) => set("storePromotion", v)} className={field} placeholder="เช่น ลด 20% ทุกเมนู 1–31 ส.ค." />
          <p className="text-[11px] text-faint mt-[5px]">
            กรอกเมื่อแคมเปญนี้มีโปรฯ ที่ต้องติดหน้าร้าน — ข้อความนี้จะไปขึ้นใน Promotion Summary Print ให้ทีมหน้าร้านอ่าน
            <br />เว้นว่าง = ไม่ส่งเข้าใบพิมพ์
          </p>
        </div>
        <div className="md:col-span-2">
          <label className={label}>Channels</label>
          <Chips options={CHANNELS} value={brief.channels} onChange={(v) => set("channels", v)} />
        </div>
        <div>
          <label className={label}>Campaign Concept</label>
          <textarea value={brief.concept} onChange={(e) => set("concept", e.target.value)} rows={3} className={field} placeholder="ไอเดีย/ธีมของแคมเปญ" />
        </div>
        <div>
          <label className={label}>Key Visual Direction</label>
          <textarea value={brief.kvDirection} onChange={(e) => set("kvDirection", e.target.value)} rows={3} className={field} placeholder="โทน สี มู้ด อ้างอิงภาพ" />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Campaign Proposal Link <span className="text-faint font-normal">· วางลิงก์ proposal (Drive / Canva / Slides)</span></label>
          <div className="flex items-center gap-2">
            <input value={brief.proposalLink || ""} onChange={(e) => set("proposalLink", e.target.value)}
              className={field} placeholder="https://…" inputMode="url" />
            {(brief.proposalLink || "").trim().startsWith("http") && (
              <a href={brief.proposalLink!.trim()} target="_blank" rel="noopener noreferrer"
                className="text-[12px] font-bold text-accent whitespace-nowrap">เปิดลิงก์ ↗</a>
            )}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className={label}>Planner <span className="text-faint font-normal">· คุณ (ผู้ที่ล็อกอิน)</span></label>
          <input value={planner || "—"} readOnly disabled className={`${field} bg-line4 cursor-not-allowed opacity-80`} />
        </div>
      </div>
    </Panel>
  );
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
function GuidelineRow(c: GuidelineItem) {
  return (
    <div key={c.key} className="flex items-center gap-[10px] px-[13px] py-[10px] rounded-[10px]" style={{ background: c.done ? "#EEF4EE" : "#FAF8F4", border: `1px solid ${c.done ? "#C8E0C8" : "#EEE8DE"}` }}>
      <span className="text-[15px]">{c.done ? "✅" : "⬜"}</span>
      <span className="text-[12.5px] font-medium" style={{ color: c.done ? "#4E7A4E" : "#6b6258" }}>{c.label}</span>
    </div>
  );
}

function Guideline({ checklist }: { checklist: GuidelineItem[] }) {
  const must = checklist.filter((c) => c.must);
  const nice = checklist.filter((c) => !c.must);
  const mustDone = must.filter((c) => c.done).length;
  const niceDone = nice.filter((c) => c.done).length;
  const mustOk = mustDone === must.length;
  return (
    <Panel title="Campaign Guideline Checklist" hint="Must-have ต้องครบถึงจะ Submit ได้ · Nice-to-have แนะนำแต่ไม่บังคับ (แจ้งเตือนอย่างเดียว)">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-bold" style={{ color: mustOk ? "#4E7A4E" : "#B33A2E" }}>Must-have {mustDone}/{must.length}</span>
        <span className="text-[11.5px] font-semibold" style={{ color: mustOk ? "#4E7A4E" : "#B33A2E" }}>{mustOk ? "— ครบแล้ว พร้อม Submit" : "— ยังไม่ครบ · Submit ไม่ได้"}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-2 mb-5">{must.map(GuidelineRow)}</div>
      <div className="text-[13px] font-bold text-muted mb-2">Nice-to-have {niceDone}/{nice.length} <span className="text-[11.5px] text-faint font-normal">— แนะนำ ไม่บล็อก Submit</span></div>
      <div className="grid md:grid-cols-2 gap-2">{nice.map(GuidelineRow)}</div>
    </Panel>
  );
}

// ── Step 3 ──────────────────────────────────────────────────────────────────
function ContentPlan({ brief, setBrief, nextSeq, outOfRange }: {
  brief: CampaignBrief; setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; nextSeq: () => number; outOfRange: (iso: string) => boolean | "" | undefined;
}) {
  const requestDate = todayIso();
  const upd = (id: string, patch: Partial<BriefContentItem>) => setBrief((b) => ({ ...b, content: b.content.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  // Collapsible items: everything starts folded; a newly added/duplicated item
  // opens so you can fill it right away.
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const toggleItem = (id: string) => setOpenItems((o) => ({ ...o, [id]: !o[id] }));
  const add = () => setBrief((b) => {
    const item = { ...emptyContentItem(nextSeq()) };
    setOpenItems((o) => ({ ...o, [item.id]: true }));
    return { ...b, content: [...b.content, item] };
  });
  const dup = (id: string) => setBrief((b) => {
    const src = b.content.find((c) => c.id === id);
    if (!src) return b;
    const copy = { ...src, id: `ci-${nextSeq()}` };
    setOpenItems((o) => ({ ...o, [copy.id]: true }));
    return { ...b, content: [...b.content, copy] };
  });
  const rm = (id: string) => setBrief((b) => ({ ...b, content: b.content.filter((c) => c.id !== id) }));

  return (
    <Panel title="Content Plan" hint="เลือก Platform ได้หลายที่ (ช่องติ๊ก) แล้วเลือก Asset Size ของแต่ละ platform — คลิกหัวข้อเพื่อยุบ/ขยายแต่ละ item">
      <div className="flex flex-col gap-3">
        {brief.content.map((c, i) => {
          const isOpen = openItems[c.id] ?? false;
          return (
            <div key={c.id} className="border border-line2 rounded-[14px] bg-ivory overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-surface/60" onClick={() => toggleItem(c.id)}>
                <span className="text-faint text-[13px]">{isOpen ? "▾" : "▸"}</span>
                <span className="text-[12px] font-bold text-muted flex-shrink-0">Content #{i + 1}</span>
                <span className="text-[13px] font-bold text-ink truncate">{c.title || "ยังไม่มีชื่อ"}</span>
                <span className="text-[11px] text-faint truncate hidden sm:inline">
                  {[c.platforms.join(" · "), c.publishDate].filter(Boolean).join(" · ")}
                </span>
                <div className="ml-auto flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => dup(c.id)} title="Duplicate" className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-muted"><Copy size={13} /></button>
                  <button onClick={() => rm(c.id)} title="Remove" className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-status-red"><Trash2 size={13} /></button>
                </div>
              </div>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-line3 pt-3">
                  <ContentItemForm item={c} onChange={(patch) => upd(c.id, patch)} outOfRange={(iso) => !!outOfRange(iso)} requesterFallback={brief.plannerOwner || "You"} requestDate={requestDate} />
                </div>
              )}
            </div>
          );
        })}
        {brief.content.length === 0 && <div className="text-[12.5px] text-faint text-center py-6 border border-dashed border-line2 rounded-[12px]">ยังไม่มี content — กด “Add Content Item”</div>}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={add} className="flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]"><Plus size={14} /> Add Content Item</button>
      </div>
    </Panel>
  );
}

// ── Step 4 ──────────────────────────────────────────────────────────────────
function KolPlan({ brief, setBrief, nextSeq, branches, outOfRange }: {
  brief: CampaignBrief; setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>; nextSeq: () => number; branches: string[]; outOfRange: (iso: string) => boolean | "" | undefined;
}) {
  const upd = (id: string, patch: Partial<BriefKolItem>) => setBrief((b) => ({ ...b, kols: b.kols.map((k) => k.id === id ? { ...k, ...patch } : k) }));
  const add = () => setBrief((b) => ({ ...b, kols: [...b.kols, { ...emptyKolItem(nextSeq()) }] }));
  const dup = (id: string) => setBrief((b) => { const src = b.kols.find((k) => k.id === id); return src ? { ...b, kols: [...b.kols, { ...src, id: `kr-${nextSeq()}` }] } : b; });
  const rm = (id: string) => setBrief((b) => ({ ...b, kols: b.kols.filter((k) => k.id !== id) }));

  // Envelope from Budget Allocation (previous step) — the KOL plan draws it down.
  const envelope = brief.budget.kol || 0;
  const planned = kolBudgetTotal(brief);
  const remaining = envelope - planned;
  return (
    <Panel title="KOL Plan" hint="ระบุ requirement (ยังไม่ต้องรู้ชื่อเพจ) — specialist เสนอเพจจริงทีหลัง · ฟอร์มเดียวกับ Request KOL · รับงบจาก Budget Allocation">
      {(envelope > 0 || planned > 0) && (
        <div className="mb-4 rounded-[12px] px-4 py-3 flex items-center gap-4 flex-wrap"
          style={remaining < 0
            ? { background: "#FFF5F4", border: "1px solid #F5C8C4" }
            : { background: "#EEF4EE", border: "1px solid #CFE4C2" }}>
          <span className="text-[12.5px] font-bold text-ink">
            งบ KOL จาก Budget Allocation: {envelope > 0 ? baht(envelope, { compact: true }) : "ยังไม่ได้ตั้ง"}
          </span>
          <span className="text-[12px] font-semibold text-muted">วางแผนแล้ว {baht(planned, { compact: true })}</span>
          {envelope > 0 && (
            <span className="text-[12px] font-bold" style={{ color: remaining < 0 ? "#B33A2E" : "#4E7A4E" }}>
              {remaining < 0 ? `⚠ เกินงบ ${baht(Math.abs(remaining), { compact: true })}` : `เหลือ ${baht(remaining, { compact: true })}`}
            </span>
          )}
          {planned > 0 && planned !== envelope && (
            <button type="button"
              onClick={() => setBrief((b) => ({ ...b, budget: { ...b.budget, kol: planned } }))}
              title="ตั้งงบ KOL ใน Budget Allocation ให้เท่ายอดที่วางแผนไว้"
              className="rounded-[8px] border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
              style={{ borderColor: "#CFE4C2", background: "#fff", color: "#4E7A4E" }}>
              อัพเดต Budget Allocation = {baht(planned, { compact: true })}
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {brief.kols.map((k, i) => (
          <div key={k.id} className="border border-line2 rounded-[14px] p-4 bg-ivory">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-bold text-muted">KOL Requirement #{i + 1}</span>
              <div className="flex gap-1">
                <button onClick={() => dup(k.id)} className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-muted"><Copy size={13} /></button>
                <button onClick={() => rm(k.id)} className="w-7 h-7 rounded-[7px] border border-line2 bg-surface flex items-center justify-center text-status-red"><Trash2 size={13} /></button>
              </div>
            </div>
            <KolItemForm item={k} onChange={(patch) => upd(k.id, patch)} branches={branches} outOfRange={(iso) => !!outOfRange(iso)} hidePage monthKeys={campaignMonthKeys(brief.startDate, brief.endDate)} />
          </div>
        ))}
        {brief.kols.length === 0 && <div className="text-[12.5px] text-faint text-center py-6 border border-dashed border-line2 rounded-[12px]">ยังไม่มี KOL — กด “Add KOL Requirement”</div>}
      </div>
      <div className="flex items-center justify-between mt-3">
        <button onClick={add} className="flex items-center gap-2 text-[12.5px] font-bold text-white bg-panel rounded-[10px] px-4 py-[9px]"><Plus size={14} /> Add KOL Requirement</button>
        <div className="text-[12.5px] font-bold text-muted">KOL Budget รวม: <span className="text-ink">{baht(kolBudgetTotal(brief), { compact: true })}</span></div>
      </div>
    </Panel>
  );
}

// ── Step 5 ──────────────────────────────────────────────────────────────────
function Budget({ brief, setBrief, bs, budgetGuardWarning, savedBriefs, budgetSheetRows, onEditKol }: {
  brief: CampaignBrief;
  setBrief: React.Dispatch<React.SetStateAction<CampaignBrief>>;
  bs: ReturnType<typeof budgetSummary>;
  budgetGuardWarning: string | null;
  savedBriefs: CampaignBrief[];
  budgetSheetRows: Awaited<ReturnType<typeof fetchBudgetSheetRows>>;
  onEditKol: () => void;
}) {
  const [budgetContextOpen, setBudgetContextOpen] = useState(true);
  const num = (v: string) => parseInt(v.replace(/\D/g, "")) || 0;
  // Display money inputs with thousands separators (e.g. 35,000); num() strips
  // the commas back out on change, so the stored value stays a plain number.
  const fmtNum = (n: number) => (n ? n.toLocaleString("en-US") : "");
  const setB = (patch: Partial<CampaignBrief["budget"]>) => setBrief((b) => ({ ...b, budget: { ...b.budget, ...patch } }));
  // With platform lines present, the Ads total is ALWAYS their sum — no more
  // manual total drifting from the per-platform breakdown.
  const withAdsTotal = (bud: CampaignBrief["budget"]): CampaignBrief["budget"] =>
    bud.adsByPlatform.length ? { ...bud, ads: bud.adsByPlatform.reduce((s, a) => s + (a.amount || 0), 0) } : bud;
  const setAds = (i: number, patch: Partial<{ platform: string; amount: number }>) => setBrief((b) => ({ ...b, budget: withAdsTotal({ ...b.budget, adsByPlatform: b.budget.adsByPlatform.map((a, j) => j === i ? { ...a, ...patch } : a) }) }));
  const addAds = () => setBrief((b) => ({ ...b, budget: withAdsTotal({ ...b.budget, adsByPlatform: [...b.budget.adsByPlatform, { platform: ADS_PLATFORMS[0], amount: 0 }] }) }));
  const rmAds = (i: number) => setBrief((b) => ({ ...b, budget: withAdsTotal({ ...b.budget, adsByPlatform: b.budget.adsByPlatform.filter((_, j) => j !== i) }) }));
  const kolBudget = kolBudgetTotal(brief);
  const campaignMonths = campaignMonthKeys(brief.startDate, brief.endDate);
  // KOL Plan's per-month split — the floor each campaign month must cover.
  const kolMonthly = kolMonthlyTotals(brief);
  const monthlyRows = campaignMonths.map((month) => ({
    month,
    amount: brief.budget.monthly?.find((row) => row.month === month)?.amount || 0,
    kol: kolMonthly[month] || 0,
  }));
  const monthlyTotal = monthlyRows.reduce((sum, row) => sum + row.amount, 0);
  const monthsUnderKol = monthlyRows.filter((row) => row.kol > 0 && row.amount < row.kol);
  // Seed the monthly plan from the KOL split: each month gets its KOL floor,
  // and whatever budget remains beyond KOL is spread equally across months.
  const syncFromKolPlan = () => setBrief((b) => {
    const months = campaignMonthKeys(b.startDate, b.endDate);
    if (!months.length) return b;
    const kolByMonth = kolMonthlyTotals(b);
    const kolSum = months.reduce((s, m) => s + (kolByMonth[m] || 0), 0);
    const remaining = Math.max(0, (b.budget.total || 0) - kolSum);
    const base = Math.floor(remaining / months.length);
    const remainder = remaining - base * months.length;
    return {
      ...b,
      budget: {
        ...b.budget,
        monthly: months.map((month, i) => ({ month, amount: (kolByMonth[month] || 0) + base + (i < remainder ? 1 : 0) })),
      },
    };
  });
  const setMonthly = (month: string, amount: number) => setBrief((b) => ({
    ...b,
    budget: {
      ...b.budget,
      monthly: campaignMonthKeys(b.startDate, b.endDate).map((key) => ({
        month: key,
        amount: key === month ? amount : (b.budget.monthly?.find((row) => row.month === key)?.amount || 0),
      })),
    },
  }));
  const splitMonthlyEqually = () => setBrief((b) => {
    const months = campaignMonthKeys(b.startDate, b.endDate);
    if (!months.length) return b;
    const total = b.budget.total || 0;
    const base = Math.floor(total / months.length);
    const remainder = total - (base * months.length);
    return { ...b, budget: { ...b.budget, monthly: months.map((month, i) => ({ month, amount: base + (i < remainder ? 1 : 0) })) } };
  });
  const otherBuckets: [string, keyof CampaignBrief["budget"]][] = [
    ["Graphic / Production", "graphic"], ["Printing / POSM", "printing"], ["CRM / LINE OA", "crm"], ["Other", "other"],
  ];
  const contextRows = useMemo(() => monthlyBudgetContext(brief, savedBriefs, budgetSheetRows), [brief, savedBriefs, budgetSheetRows]);
  const branchScope = brief.branches.length ? brief.branches.join(", ") : "ยังไม่ได้เลือกสาขา";
  const overTotal = (brief.budget.total || 0) > 0 && bs.allocated > (brief.budget.total || 0);

  return (
    <>
      <Panel title="Budget Allocation" hint="ใส่งบรวมแล้วเกลี่ยไปแต่ละส่วน — งบ KOL ที่ตั้งตรงนี้จะ sync ไปเป็นเพดานใน KOL Plan (ขั้นถัดไป)">
        {budgetGuardWarning && (
          <div className="mb-4 rounded-[16px] border px-4 py-3 text-[12.5px] font-semibold leading-relaxed" style={{ background: "#FFF7E3", borderColor: "#F3C96B", color: "#8A5B00" }}>
            ⚠️ {budgetGuardWarning}
          </div>
        )}
        <div className="mb-4">
          <div className="rounded-[16px] border border-line2 p-4" style={{ background: "#F8FCF1" }}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <button type="button" onClick={() => setBudgetContextOpen((open) => !open)} className="flex items-start gap-2 text-left">
                <span className="mt-[1px] text-[14px] text-muted">{budgetContextOpen ? "⌄" : "›"}</span>
                <span>
                  <span className="block text-[12.5px] font-extrabold text-ink">Budget context · Digital Marketing</span>
                  <span className="block text-[11px] text-faint">{brandName(brief.b)} · {branchScope}</span>
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill px-2.5 py-1 text-[10.5px] font-extrabold" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>
                  Budget Sheet
                </span>
                <span className="rounded-pill px-2.5 py-1 text-[10.5px] font-extrabold" style={{ background: "#F2EEFF", color: "#6C5CE7" }}>
                  Digital Marketing only
                </span>
              </div>
            </div>
            {budgetContextOpen && (
              <>
                {!budgetSheetRows.length && (
                  <div className="mb-3 rounded-[12px] border border-line2 bg-surface px-3 py-2 text-[11.5px] font-semibold text-faint">
                    ยังไม่ได้โหลด Budget Sheet source — ระบบจะแสดงงบ Digital Marketing ทันทีเมื่อ sheet พร้อม
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {contextRows.length ? contextRows.map((row) => {
                    const over = row.remaining < 0;
                    return (
                      <div key={row.month} className="rounded-[12px] border border-line2 bg-surface p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-extrabold text-muted">{row.month}</span>
                          <span className="text-[11px] font-extrabold" style={{ color: over ? "#B33A2E" : "#4E7A4E" }}>
                            {over ? `Over ${baht(Math.abs(row.remaining), { compact: true })}` : `Left ${baht(row.remaining, { compact: true })}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10.5px] sm:grid-cols-4">
                          {[
                            ["Digital Budget", row.plBudget],
                            ["Committed", row.committed],
                            ["This campaign", row.thisCampaign],
                            ["After this", row.remaining],
                          ].map(([labelText, amount]) => (
                            <div key={labelText as string} className="rounded-[10px] border border-line3 px-2.5 py-2">
                              <div className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-faint">{labelText}</div>
                              <div className="mt-0.5 font-extrabold text-ink">{baht(amount as number, { compact: true })}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                          <div className="h-full rounded-full" style={{ width: `${row.usedPct}%`, background: over ? "#B33A2E" : "#4E7A4E" }} />
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-[12px] border border-dashed border-line2 bg-surface px-3 py-4 text-center text-[11.5px] font-semibold text-faint">
                      เลือกช่วงวันที่แคมเปญก่อน เพื่อดู context งบรายเดือน
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mb-4">
          <label className={label}>Total Campaign Budget <span className="text-faint font-normal">· ต้องครอบคลุมยอด allocate ทุกรายการ (รวม KOL)</span></label>
          <div className="flex items-center gap-3 flex-wrap">
            <input value={fmtNum(brief.budget.total)} onChange={(e) => setB({ total: num(e.target.value) })} className={`${field} max-w-[260px]`} placeholder="฿" />
            {bs.allocated > 0 && (
              <span className="text-[11.5px] font-semibold" style={{ color: overTotal ? "#B33A2E" : "#4E7A4E" }}>
                Allocate รวม {baht(bs.allocated, { compact: true })}{overTotal ? " ⚠ เกิน Total" : " ✓"}
              </span>
            )}
          </div>
        </div>
        {/* Compact Excel-style rows — dense grid, no bulky cards */}
        {campaignMonths.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-[12px] font-bold text-ink">Monthly Budget Plan <span className="text-[10.5px] text-faint font-normal">· เทียบกับ Budget Google Sheet รายเดือน</span></div>
              <div className="flex items-center gap-2">
                {kolBudget > 0 && (
                  <button type="button" onClick={syncFromKolPlan} className="rounded-[8px] border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: "#CFE4C2", background: "#EEF4EE", color: "#4E7A4E" }}>
                    Sync จาก KOL Plan
                  </button>
                )}
                <button type="button" onClick={splitMonthlyEqually} className="rounded-[8px] border border-line2 bg-surface px-2.5 py-1 text-[11px] font-bold text-accent">Split equally</button>
              </div>
            </div>
            <div className="rounded-[10px] border border-line2 overflow-hidden">
              <div className="grid bg-ivory px-3 py-[5px] text-[10px] font-extrabold uppercase tracking-[0.05em] text-faint" style={{ gridTemplateColumns: "0.8fr 1.3fr 0.9fr" }}>
                <span>Month</span><span>Budget (฿)</span><span>KOL · จาก KOL Plan</span>
              </div>
              {monthlyRows.map((row) => {
                const underKol = row.kol > 0 && row.amount < row.kol;
                return (
                  <div key={row.month} className="grid items-center gap-2 border-t border-line4 px-3 py-[4px]" style={{ gridTemplateColumns: "0.8fr 1.3fr 0.9fr", background: underKol ? "#FFF8F7" : "#fff" }}>
                    <span className="text-[11.5px] font-extrabold text-muted">{row.month}</span>
                    <input value={fmtNum(row.amount)} onChange={(e) => setMonthly(row.month, num(e.target.value))}
                      className="w-full rounded-[7px] border px-2 py-1 text-[12px] font-bold text-ink outline-none"
                      style={{ borderColor: underKol ? "#F5C8C4" : "#E5DECF", background: "#FBF9F4" }} placeholder="฿" />
                    <span className="text-[11.5px] font-semibold" style={{ color: underKol ? "#B33A2E" : row.kol ? "#6b6258" : "#C0B8AD" }}>
                      {row.kol ? baht(row.kol, { compact: true }) : "—"}{underKol ? " ⚠" : ""}
                    </span>
                  </div>
                );
              })}
              <div className="grid items-center gap-2 border-t border-line2 bg-ivory px-3 py-[5px] text-[11.5px] font-bold" style={{ gridTemplateColumns: "0.8fr 1.3fr 0.9fr" }}>
                <span>รวมรายเดือน</span>
                <span style={{ color: monthlyTotal === brief.budget.total ? "#4E7A4E" : "#B33A2E" }}>
                  {baht(monthlyTotal, { compact: true })} / {baht(brief.budget.total, { compact: true })}{monthlyTotal === brief.budget.total ? " ✓" : " ⚠ ต้องตรงกัน"}
                </span>
                <span className="text-muted">{baht(monthlyRows.reduce((s, r) => s + r.kol, 0), { compact: true })}</span>
              </div>
            </div>
            {monthsUnderKol.length > 0 && (
              <div className="mt-2 rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
                ⚠ งบรายเดือนน้อยกว่างบ KOL ที่วางไว้: {monthsUnderKol.map((r) => `${r.month} (แผน ${baht(r.amount, { compact: true })} < KOL ${baht(r.kol, { compact: true })})`).join(" · ")} — กด "Sync จาก KOL Plan" เพื่อเกลี่ยให้สอดคล้อง
              </div>
            )}
          </div>
        )}

        {/* Allocation buckets + Ads platforms — one dense table */}
        <div className="rounded-[10px] border border-line2 overflow-hidden">
          <div className="grid bg-ivory px-3 py-[5px] text-[10px] font-extrabold uppercase tracking-[0.05em] text-faint" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr" }}>
            <span>Item</span><span>Amount (฿)</span><span></span>
          </div>
          <div className="grid items-center gap-2 border-t border-line4 bg-white px-3 py-[4px]" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr" }}>
            <span className="text-[12px] font-semibold text-ink">KOL Budget <span className="text-[10px] text-faint">· sync ไป KOL Plan</span></span>
            <input value={fmtNum(brief.budget.kol)} onChange={(e) => setB({ kol: num(e.target.value) })}
              className="w-full rounded-[7px] border border-line2 bg-ivory px-2 py-1 text-[12px] outline-none" placeholder="฿" />
            <span className="flex items-center gap-2 flex-wrap">
              {kolBudget > 0 && (
                <span className="text-[10.5px] font-semibold" style={{ color: kolBudget > (brief.budget.kol || 0) ? "#B33A2E" : "#6b6258" }}>
                  วางแผนแล้ว {baht(kolBudget, { compact: true })}{kolBudget > (brief.budget.kol || 0) ? " ⚠ เกิน" : ""}
                </span>
              )}
              {kolBudget > 0 && kolBudget !== (brief.budget.kol || 0) && (
                <button type="button" onClick={() => setB({ kol: kolBudget })}
                  title="ตั้งงบ KOL ให้เท่ายอดที่วางใน KOL Plan"
                  className="rounded-[7px] border px-2 py-[3px] text-[10.5px] font-bold whitespace-nowrap"
                  style={{ borderColor: "#CFE4C2", background: "#EEF4EE", color: "#4E7A4E" }}>
                  Sync = {baht(kolBudget, { compact: true })}
                </button>
              )}
              <button onClick={onEditKol} className="text-[11px] font-bold text-accent text-left whitespace-nowrap">KOL Plan →</button>
            </span>
          </div>
          {otherBuckets.map(([lbl, key]) => {
            const isProduction = key === "graphic";
            const isOther = key === "other";
            const amount = (brief.budget[key] as number) || 0;
            return (
              <div key={key}>
                <div className="grid items-center gap-2 border-t border-line4 bg-white px-3 py-[4px]" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr" }}>
                  <span className="text-[12px] font-semibold text-ink">
                    {lbl}
                    {isProduction && <span className="ml-1 text-[10px] text-faint font-normal">· ไม่นับในงบจัดสรร</span>}
                  </span>
                  <input value={fmtNum(brief.budget[key] as number)} onChange={(e) => setB({ [key]: num(e.target.value) } as Partial<CampaignBrief["budget"]>)}
                    className="w-full rounded-[7px] border border-line2 bg-ivory px-2 py-1 text-[12px] outline-none" placeholder="฿" />
                  <span className="text-[10px] text-faint">{isProduction ? "cost ภายใน — แยกจาก media" : ""}</span>
                </div>
                {isOther && amount > 0 && (
                  <div className="grid items-center gap-2 border-t border-line4 bg-white px-3 py-[4px]" style={{ gridTemplateColumns: "1.6fr 2.2fr" }}>
                    <span className="text-[11px] text-faint pl-3">↳ Other คืออะไร <span className="text-status-red">*</span></span>
                    <input value={brief.budget.otherNote ?? ""} onChange={(e) => setB({ otherNote: e.target.value })}
                      placeholder="อธิบายงบ Other เช่น ค่าขนส่ง POSM / ค่าอุปกรณ์ event"
                      className="w-full rounded-[7px] border border-line2 bg-ivory px-2 py-1 text-[12px] outline-none" />
                  </div>
                )}
              </div>
            );
          })}
          <div className="grid items-center gap-2 border-t border-line2 bg-[#FBF9F4] px-3 py-[4px]" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr" }}>
            <span className="text-[12px] font-bold text-ink">Ads Budget (total)</span>
            {brief.budget.adsByPlatform.length > 0 ? (
              <span className="w-full rounded-[7px] border border-line3 bg-[#F2F0EB] px-2 py-1 text-[12px] font-extrabold text-ink">
                {baht(brief.budget.ads || 0)}
              </span>
            ) : (
              <input value={fmtNum(brief.budget.ads)} onChange={(e) => setB({ ads: num(e.target.value) })}
                className="w-full rounded-[7px] border border-line2 bg-ivory px-2 py-1 text-[12px] font-bold outline-none" placeholder="฿" />
            )}
            <span className="text-[10.5px] font-semibold" style={{ color: "#4E7A4E" }}>
              {brief.budget.adsByPlatform.length > 0 ? "รวมจาก platform อัตโนมัติ ✓" : "ยังไม่มี platform — ใส่ยอดรวมเองได้"}
            </span>
          </div>
          {brief.budget.adsByPlatform.map((a, i) => (
            <div key={i} className="grid items-center gap-2 border-t border-line4 bg-[#FBF9F4] px-3 py-[4px]" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr" }}>
              <select value={a.platform} onChange={(e) => setAds(i, { platform: e.target.value })}
                className="ml-4 w-full rounded-[7px] border border-line2 bg-white px-2 py-1 text-[12px] outline-none">{ADS_PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
              <input value={fmtNum(a.amount)} onChange={(e) => setAds(i, { amount: num(e.target.value) })}
                className="w-full rounded-[7px] border border-line2 bg-white px-2 py-1 text-[12px] outline-none" placeholder="฿" />
              <button onClick={() => rmAds(i)} className="w-6 h-6 rounded-[7px] border border-line2 bg-white flex items-center justify-center text-status-red flex-shrink-0"><X size={12} /></button>
            </div>
          ))}
          <div className="border-t border-line4 bg-[#FBF9F4] px-3 py-[5px]">
            <button onClick={addAds} className="flex items-center gap-1 text-[11.5px] font-bold text-accent ml-4"><Plus size={12} /> Add platform</button>
          </div>
          {/* Footer: live reconciliation of Σ allocation vs Total Campaign Budget */}
          <div className="grid items-center gap-2 border-t border-line2 bg-ivory px-3 py-[6px] text-[12px] font-bold" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr" }}>
            <span className="text-ink">รวม Allocate ทุกรายการ</span>
            <span style={{ color: overTotal ? "#B33A2E" : "#4E7A4E" }}>
              {baht(bs.allocated, { compact: true })} / {baht(brief.budget.total || 0, { compact: true })}
              {overTotal ? ` ⚠ เกิน ${baht(bs.allocated - (brief.budget.total || 0), { compact: true })}` : brief.budget.total ? " ✓" : ""}
            </span>
            <span>
              {(overTotal || (brief.budget.total || 0) !== bs.allocated) && bs.allocated > 0 && (
                <button type="button" onClick={() => setB({ total: bs.allocated })}
                  className="rounded-[8px] border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
                  style={{ borderColor: "#CFE4C2", background: "#EEF4EE", color: "#4E7A4E" }}>
                  ตั้ง Total = {baht(bs.allocated, { compact: true })}
                </button>
              )}
            </span>
          </div>
        </div>
        {overTotal && (
          <div className="mt-2 rounded-[10px] px-3 py-2 text-[11.5px] font-semibold" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
            ⚠ งบที่ allocate ({baht(bs.allocated, { compact: true })}) เกิน Total Campaign Budget ({baht(brief.budget.total || 0, { compact: true })}) —
            ลดรายการที่จัดสรร หรือกด &quot;ตั้ง Total = {baht(bs.allocated, { compact: true })}&quot; แล้วเกลี่ย Monthly Budget Plan ใหม่ให้ตรง
          </div>
        )}
      </Panel>

      <Panel title="Allocation Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            ["Total", baht(Math.max(brief.budget.total, bs.allocated), { compact: true }), "#211F1C"],
            ["Allocated", baht(bs.allocated, { compact: true }), "#3E5C9A"],
            ["Remaining", baht(bs.remaining, { compact: true }), bs.remaining < 0 ? "#B33A2E" : "#4E7A4E"],
            ["Ads by platform", baht(bs.adsAllocated, { compact: true }), bs.adsMismatch ? "#B33A2E" : "#211F1C"],
          ].map(([l, v, c]) => (
            <div key={l} className="bg-ivory border border-line2 rounded-card p-3">
              <div className="text-[10px] uppercase tracking-[0.05em] text-faint font-bold mb-1">{l}</div>
              <div className="text-[17px] font-extrabold" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {bs.byBucket.filter((b) => b.amount > 0).map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-[12px] text-muted w-40 flex-shrink-0">{b.label}</span>
              <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, b.pct)}%`, background: "#B8945A" }} /></div>
              <span className="text-[12px] font-bold text-ink w-12 text-right">{b.pct}%</span>
            </div>
          ))}
        </div>
        {bs.warnings.length > 0 && (
          <div className="rounded-card px-4 py-3 text-[12.5px]" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4", color: "#B33A2E" }}>
            {bs.warnings.map((w, i) => <div key={i} className="font-semibold">⚠ {w}</div>)}
          </div>
        )}
      </Panel>
    </>
  );
}

// ── Step 6 ──────────────────────────────────────────────────────────────────
function Preview({ preview, warnings }: { preview: ReturnType<typeof taskPreview>; warnings: string[] }) {
  const total = preview.reduce((s, p) => s + p.count, 0);
  return (
    <Panel title="Auto Task Preview" hint={`ระบบจะสร้างงานเหล่านี้ให้อัตโนมัติเมื่อกด Submit — รวม ${total} รายการ (ตรงกับที่สร้างจริง)`}>
      <div className="grid md:grid-cols-2 gap-3">
        {preview.map((p) => (
          <div key={p.kind} className="flex items-center gap-3 border border-line2 rounded-card p-4 bg-ivory">
            <span className="text-[22px]">{p.icon}</span>
            <div className="flex-1"><div className="text-[13.5px] font-bold text-ink">{p.count} {p.kind}</div><div className="text-[11.5px] text-faint">{p.detail}</div></div>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 rounded-card px-4 py-3 text-[12.5px]" style={{ background: "#FBF6ED", border: "1px solid #EDCC7A", color: "#8A6D1E" }}>
          {warnings.map((w, i) => <div key={i} className="font-semibold">⚠ {w}</div>)}
        </div>
      )}
    </Panel>
  );
}

// ── Step 7 ──────────────────────────────────────────────────────────────────
function Submit({ brief, errors, warnings, ack, onAck, checklist }: {
  brief: CampaignBrief; errors: string[]; warnings: string[]; ack: boolean; onAck: (v: boolean) => void; checklist: GuidelineItem[];
}) {
  const must = checklist.filter((c) => c.must);
  const mustDone = must.filter((c) => c.done).length;
  return (
    <Panel title="Review & Submit" hint="Submit ต้องกรอก required field ครบ และไม่มี warning ค้าง — Save Draft เก็บไว้แก้ต่อได้แม้ยังไม่ครบ">
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {[
          ["Campaign", brief.name || "—"], ["Brand", brandName(brief.b)], ["Type / Objective", `${brief.campaignType} · ${brief.objective}`],
          ["Branches", brief.branches.join(", ") || "—"], ["Period", `${brief.startDate || "—"} → ${brief.endDate || "—"}`],
          ["Launch", brief.launchDate || "—"], ["Priority", brief.priority], ["Content items", String(brief.content.length)],
          ["KOL requirements", String(brief.kols.length)], ["Total budget", baht(brief.budget.total, { compact: true })],
          ["Approver", brief.approver || "—"], ["Guideline (must-have)", `${mustDone}/${must.length}`],
        ].map(([l, v]) => (
          <div key={l} className="flex items-center justify-between border-b border-line4 py-2">
            <span className="text-[12px] text-faint font-semibold">{l}</span><span className="text-[13px] font-bold text-ink text-right">{v}</span>
          </div>
        ))}
      </div>

      {errors.length > 0 ? (
        <div className="rounded-card px-4 py-3" style={{ background: "#FFF5F4", border: "1px solid #F5C8C4" }}>
          <div className="text-[12.5px] font-bold text-status-red mb-2">ต้องแก้ {errors.length} จุดก่อน Submit Campaign:</div>
          <ul className="flex flex-col gap-[5px]">
            {errors.map((e, i) => <li key={i} className="text-[12.5px] text-status-red flex items-start gap-2"><span>•</span><span>{e}</span></li>)}
          </ul>
        </div>
      ) : warnings.length > 0 ? (
        <div className="rounded-card px-4 py-3" style={{ background: "#FBF6ED", border: "1px solid #EDCC7A" }}>
          <div className="text-[12.5px] font-bold mb-2" style={{ color: "#8A6D1E" }}>⚠ มี {warnings.length} warning ที่ยังไม่ได้แก้ — ตรวจสอบก่อน Submit:</div>
          <ul className="flex flex-col gap-[5px] mb-3">
            {warnings.map((w, i) => <li key={i} className="text-[12.5px] flex items-start gap-2" style={{ color: "#8A6D1E" }}><span>•</span><span>{w}</span></li>)}
          </ul>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold cursor-pointer" style={{ color: "#8A6D1E" }}>
            <input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} /> รับทราบ warning เหล่านี้และยืนยัน Submit ต่อ
          </label>
        </div>
      ) : (
        <div className="rounded-card px-4 py-3 text-[12.5px] font-bold" style={{ background: "#EEF4EE", color: "#4E7A4E" }}>✓ ครบทุก required field และไม่มี warning ค้าง — พร้อม Submit Campaign</div>
      )}
    </Panel>
  );
}
