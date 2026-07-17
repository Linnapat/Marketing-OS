// Map a Google-Sheet campaign-brief template onto a CampaignBrief.
//
// The sheet is written by a human (often with an AI assistant's help) and is
// therefore loose: enum values come in the wrong case, numbers carry ฿ and
// commas, dates arrive in whatever the cell was formatted as. Everything here
// forgives that where the intent is unambiguous, and reports a WARNING rather
// than guessing where it isn't — an import that silently drops a KOL row or
// lands a date a month early is worse than one that says what it couldn't read.
//
// The result is a DRAFT for the form to prefill, never a direct write: the
// planner reviews it, and the app's own validation (overviewErrors /
// validateSubmit) and the over-PL-budget guard still decide what may be saved.
//
// Pure by design (no fetch, no Supabase) so scripts/test-brief-sheet.ts can
// exercise the mapping against fixture grids.

import { BrandId } from "@/lib/brands";
import {
  CampaignBrief, BriefContentItem, BriefKolItem, BriefBudget,
  emptyBrief, emptyContentItem, emptyKolItem, emptyBudget,
  OBJECTIVES, CAMPAIGN_TYPES, PRIORITIES, CHANNELS, SUCCESS_METRICS,
  CONTENT_TYPES, CONTENT_PLATFORMS, KOL_TYPES, KOL_PLATFORMS, KOL_CONTENT,
  ADS_PLATFORMS, assetSizesFor, AssetTarget,
} from "@/lib/data/brief";

/** The tab names the template ships with. Addressed by name, not gid, so a
 *  copied template keeps working. Only Overview is required. */
export const BRIEF_SHEET_TABS = { overview: "Overview", content: "Content", kol: "KOL", budget: "Budget" } as const;

/** Sheet brand label → configured brand id. Matches lib/brandResolve's resolver
 *  (which returns undefined for "no match"), so the route can pass it straight in. */
export type BrandResolver = (label: string) => BrandId | null | undefined;

export interface BriefSheetGrids {
  overview: string[][];
  content: string[][] | null;
  kol: string[][] | null;
  budget: string[][] | null;
}

export interface BriefSheetImport {
  /** Fields the sheet actually spoke about — merged onto the form's current brief. */
  patch: Partial<CampaignBrief>;
  warnings: string[];
  /** Row counts, for the "imported X content, Y KOL" confirmation. */
  counts: { content: number; kols: number };
}

// ── Cell readers ──────────────────────────────────────────────────────────
const norm = (s: string) => (s ?? "").trim();
/** Comparison key for enum matching: case/space/punctuation-insensitive. */
const key = (s: string) => norm(s).toLowerCase().replace(/[\s._/-]+/g, "");

/** "฿150,000" / "150k" / "1.2M" / "150000" → 150000. Blank → 0. */
export function num(value: string): number {
  const raw = norm(value).toLowerCase().replace(/[,฿$\s]/g, "");
  if (!raw) return 0;
  const mult = raw.endsWith("m") ? 1_000_000 : raw.endsWith("k") ? 1_000 : 1;
  const n = parseFloat(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * mult) : 0;
}

/** Yes / TRUE / ✓ / 1 → true. Anything else (incl. blank) → false. */
const bool = (value: string) => ["yes", "y", "true", "1", "✓", "x", "ใช่"].includes(key(value));

/** Split a multi-value cell: "Facebook, Instagram" or "Facebook; Instagram". */
const list = (value: string) => norm(value).split(/[,;\n]/).map(norm).filter(Boolean);

/** Match a loose label against a fixed option set. Exact-ish first, then a
 *  prefix match so "Online" finds "Online Only" only when nothing else fits. */
function matchOption(value: string, options: readonly string[]): string | null {
  const k = key(value);
  if (!k) return null;
  const exact = options.find((o) => key(o) === k);
  if (exact) return exact;
  const starts = options.filter((o) => key(o).startsWith(k) || k.startsWith(key(o)));
  return starts.length === 1 ? starts[0] : null;
}

/** Match every value in a multi-value cell; unmatched ones become warnings. */
function matchList(value: string, options: readonly string[], label: string, warn: string[]): string[] {
  const out: string[] = [];
  for (const raw of list(value)) {
    const hit = matchOption(raw, options);
    if (hit) { if (!out.includes(hit)) out.push(hit); }
    else warn.push(`${label}: ไม่รู้จักค่า “${raw}” — ข้ามไป เลือกในฟอร์มเองได้`);
  }
  return out;
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Sheet date → ISO. YYYY-MM-DD passes through silently (what the template asks
 *  for). A slashed date is ambiguous — Google exports US M/D/YYYY, but people
 *  type D/M/YYYY — so it is converted AND warned about, unless one part is >12
 *  and settles it. Anything else is refused rather than guessed. */
export function sheetDate(value: string, label: string, warn: string[]): string {
  const raw = norm(value);
  if (!raw) return "";
  const m = ISO_RE.exec(raw);
  if (m) return iso(+m[1], +m[2], +m[3]);
  const s = SLASH_RE.exec(raw);
  if (s) {
    const [a, b, y] = [+s[1], +s[2], +s[3]];
    if (a > 12 && b <= 12) return iso(y, b, a);             // unambiguously D/M/YYYY
    if (b > 12 && a <= 12) return iso(y, a, b);             // unambiguously M/D/YYYY
    warn.push(`${label}: “${raw}” อ่านเป็น ${iso(y, a, b)} (เดา M/D/YYYY) — กรุณาตรวจ หรือใช้รูปแบบ YYYY-MM-DD ใน sheet`);
    return iso(y, a, b);
  }
  warn.push(`${label}: อ่านวันที่ “${raw}” ไม่ออก — เลือกวันในฟอร์มเอง (sheet ควรใช้ YYYY-MM-DD)`);
  return "";
}

/** "2026-07" / "2026/7" / "Jul 2026" → "2026-07". */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function sheetMonth(value: string): string {
  const raw = norm(value);
  let m = /^(\d{4})[-/](\d{1,2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(raw);
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return "";
}

// ── Tab shapes ────────────────────────────────────────────────────────────
/** A two-column "Field | Value" tab → lookup by field name. Later rows win only
 *  when earlier ones were blank, so a stray empty row can't wipe a value. */
function fieldMap(grid: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of grid) {
    const k = key(row[0] ?? "");
    const v = norm(row[1] ?? "");
    if (!k || !v) continue;
    if (!map.has(k)) map.set(k, v);
  }
  return map;
}

/** Rows of a "Field | Value" tab whose field is "<prefix>: <rest>" ("Goal: Reach",
 *  "Ads: TikTok", "Month: 2026-07"), returned as [rest, value]. The colon is
 *  required: the Budget tab has both a bucket row "Ads" and platform rows
 *  "Ads: TikTok", and a prefix-only test would read the bucket as a platform. */
function prefixed(grid: string[][], prefix: string): [string, string][] {
  const p = key(prefix);
  const out: [string, string][] = [];
  for (const row of grid) {
    const raw = norm(row[0] ?? "");
    const value = norm(row[1] ?? "");
    const colon = raw.indexOf(":");
    if (!value || colon < 0) continue;
    if (key(raw.slice(0, colon)) !== p) continue;
    out.push([norm(raw.slice(colon + 1)), value]);
  }
  return out;
}

/** Does this grid actually look like the tab we asked for?
 *
 *  Required, not defensive polish: Google answers a request for a tab that
 *  doesn't exist with the spreadsheet's FIRST tab and a 200 (see
 *  lib/googleSheet's fetchSheetTab). Without this check, a sheet with only an
 *  Overview tab would import its Overview rows a second time as "content" —
 *  inventing content items nobody wrote. Absent-but-optional tabs must read as
 *  absent, so identification is by shape: the field names / header a real tab
 *  of that kind carries. */
export function looksLikeTab(kind: keyof typeof BRIEF_SHEET_TABS, grid: string[][]): boolean {
  if (!grid.length) return false;
  const header = (grid[0] ?? []).map((h) => key(h));
  const has = (...names: string[]) => names.some((n) => header.includes(key(n)));
  switch (kind) {
    case "content":
      return has("Title", "Content", "ชื่อคอนเทนต์");
    case "kol":
      return has("Name", "KOL", "Display Name", "KOL Type");
    case "overview": {
      // A "Field | Value" tab — identified by naming at least one field that
      // only the Overview tab carries.
      const f = fieldMap(grid);
      return ["Campaign Name", "Name", "ชื่อแคมเปญ", "Brand", "แบรนด์", "Objective", "Target Audience", "Key Message"]
        .some((n) => f.has(key(n)));
    }
    case "budget": {
      const f = fieldMap(grid);
      const buckets = ["Total", "งบรวม", "Ads", "Media", "KOL", "Graphic", "Printing", "CRM"].some((n) => f.has(key(n)));
      const lines = grid.some((row) => /^(ads|month)\s*:/i.test(norm(row[0] ?? "")));
      return buckets || lines;
    }
  }
}

/** A header-row tab → column resolver by any of several accepted names. */
function columns(grid: string[][]) {
  const header = (grid[0] ?? []).map((h) => key(h));
  return (...names: string[]) => {
    const i = header.findIndex((h) => names.some((n) => h === key(n)));
    return (row: string[]) => (i >= 0 ? norm(row[i] ?? "") : "");
  };
}

// ── Overview ──────────────────────────────────────────────────────────────
function readOverview(grid: string[][], resolveBrand: BrandResolver, warn: string[]): Partial<CampaignBrief> {
  const f = fieldMap(grid);
  const get = (...names: string[]) => { for (const n of names) { const v = f.get(key(n)); if (v) return v; } return ""; };
  const patch: Partial<CampaignBrief> = {};

  const name = get("Campaign Name", "Name", "ชื่อแคมเปญ");
  if (name) patch.name = name;

  const brandLabel = get("Brand", "แบรนด์");
  if (brandLabel) {
    const id = resolveBrand(brandLabel);
    if (id) patch.b = id;
    else warn.push(`Brand: ไม่รู้จักแบรนด์ “${brandLabel}” — เลือกแบรนด์ในฟอร์มเอง`);
  }

  // Branches are validated against the brand's configured branch list by the
  // caller (the form knows the config); here we only carry the names across.
  const branches = list(get("Branches", "Branch", "สาขา"));
  if (branches.length) patch.branches = branches;

  const enums: [keyof CampaignBrief, string[], readonly string[]][] = [
    ["objective", ["Objective", "วัตถุประสงค์"], OBJECTIVES],
    ["campaignType", ["Campaign Type", "Type"], CAMPAIGN_TYPES],
    ["priority", ["Priority"], PRIORITIES],
  ];
  for (const [field, names, options] of enums) {
    const raw = get(...names);
    if (!raw) continue;
    const hit = matchOption(raw, options);
    if (hit) (patch[field] as string) = hit;
    else warn.push(`${names[0]}: ไม่รู้จักค่า “${raw}” — ใช้ค่าเดิมในฟอร์ม`);
  }

  const dates: [keyof CampaignBrief, string[], string][] = [
    ["startDate", ["Start Date", "วันเริ่ม"], "Start Date"],
    ["endDate", ["End Date", "วันจบ"], "End Date"],
    ["launchDate", ["Launch Date", "วันLaunch"], "Launch Date"],
  ];
  for (const [field, names, label] of dates) {
    const raw = get(...names);
    if (!raw) continue;
    const d = sheetDate(raw, label, warn);
    if (d) (patch[field] as string) = d;
  }

  const texts: [keyof CampaignBrief, string[]][] = [
    ["audience", ["Target Audience", "Audience", "กลุ่มเป้าหมาย"]],
    ["mainMessage", ["Key Message", "Main Message", "Message"]],
    ["offer", ["Main Offer", "Offer", "โปรโมชั่น"]],
    ["storePromotion", ["Store Promotion", "โปรหน้าร้าน"]],
    ["concept", ["Concept"]],
    ["kvDirection", ["KV Direction", "KV"]],
    ["proposalLink", ["Proposal Link", "Deck Link"]],
  ];
  for (const [field, names] of texts) {
    const v = get(...names);
    if (v) (patch[field] as string) = v;
  }

  const metrics = matchList(get("Success Metrics", "KPI"), SUCCESS_METRICS, "Success Metrics", warn);
  // "Goal: Reach | 500000" rows — a goal implies its metric is part of the KPI set.
  const goals: Record<string, string> = {};
  for (const [metricLabel, value] of prefixed(grid, "Goal")) {
    const hit = matchOption(metricLabel, SUCCESS_METRICS);
    if (!hit) { warn.push(`Goal: ไม่รู้จัก metric “${metricLabel}” — ข้ามไป`); continue; }
    goals[hit] = value;
    if (!metrics.includes(hit)) metrics.push(hit);
  }
  if (metrics.length) patch.successMetrics = metrics;
  if (Object.keys(goals).length) patch.successGoals = goals;

  const channels = matchList(get("Channels", "ช่องทาง"), CHANNELS, "Channels", warn);
  if (channels.length) patch.channels = channels;

  return patch;
}

// ── Content ───────────────────────────────────────────────────────────────
/** "Facebook: 1:1; Instagram: 4:5" → asset targets. A bare size ("1:1") pairs
 *  with the item's platforms. Sizes are matched loosely: the template's ratio
 *  prefix is enough, so "1:1" finds "1:1 (1080×1080)" for that platform. */
function readAssets(cell: string, platforms: string[], title: string, warn: string[]): AssetTarget[] {
  const out: AssetTarget[] = [];
  const add = (platform: string, sizeRaw: string) => {
    const sizes = assetSizesFor(platform);
    const k = key(sizeRaw);
    const hit = sizes.find((s) => key(s) === k) ?? sizes.find((s) => key(s).startsWith(k));
    if (!hit) { warn.push(`Content “${title}”: ${platform} ไม่มี asset size “${sizeRaw}” — เลือกในฟอร์มเอง`); return; }
    if (!out.some((a) => a.platform === platform && a.size === hit)) out.push({ platform, size: hit });
  };
  for (const part of list(cell)) {
    const [left, right] = part.includes(":") && !/^\d+:\d+$/.test(part) ? [part.slice(0, part.indexOf(":")), part.slice(part.indexOf(":") + 1)] : ["", part];
    if (left) {
      const platform = matchOption(left, CONTENT_PLATFORMS);
      if (!platform) { warn.push(`Content “${title}”: ไม่รู้จัก platform “${left}” ในช่อง Asset Sizes — ข้ามไป`); continue; }
      add(platform, right);
    } else {
      // Bare size: apply to every platform the row targets.
      for (const p of platforms) add(p, right);
    }
  }
  return out;
}

function readContent(grid: string[][], warn: string[]): BriefContentItem[] {
  if (grid.length < 2) return [];
  const col = columns(grid);
  const cTitle = col("Title", "Content", "ชื่อคอนเทนต์");
  const cSub = col("Sub Head", "Subhead");
  const cType = col("Type", "Content Type");
  const cPlatforms = col("Platforms", "Platform");
  const cAssets = col("Asset Sizes", "Assets", "Asset Size");
  const cPublish = col("Publish Date", "Publish");
  const cDue = col("Graphic Due Date", "Due Date", "Graphic Due");
  const cPriority = col("Priority");
  const cGraphic = col("Needs Graphic", "Required Graphic");
  const cVideo = col("Needs Video", "Required Video");
  const cCaption = col("Caption Direction", "Caption");
  const cMessage = col("Key Message", "Main Message");
  const cCta = col("CTA");
  const cHighlight = col("Product Highlight", "Highlight");
  const cMandatory = col("Mandatory Text");
  const cDoDont = col("Do / Don't", "Do Dont", "Do/Don't");
  const cNote = col("Note", "Notes");

  const items: BriefContentItem[] = [];
  grid.slice(1).forEach((row) => {
    const title = cTitle(row);
    if (!title) return; // blank/spacer row
    const seq = items.length + 1;
    const base = emptyContentItem(seq);
    const platforms = matchList(cPlatforms(row), CONTENT_PLATFORMS, `Content “${title}” platforms`, warn);
    const typeRaw = cType(row);
    const type = typeRaw ? matchOption(typeRaw, CONTENT_TYPES) : null;
    if (typeRaw && !type) warn.push(`Content “${title}”: ไม่รู้จัก type “${typeRaw}” — ใช้ ${base.type}`);
    const priorityRaw = cPriority(row);
    const priority = priorityRaw ? matchOption(priorityRaw, PRIORITIES) : null;
    items.push({
      ...base,
      title,
      subHead: cSub(row),
      type: type ?? base.type,
      platforms,
      assets: readAssets(cAssets(row), platforms, title, warn),
      publishDate: sheetDate(cPublish(row), `Content “${title}” publish date`, warn),
      graphicDueDate: sheetDate(cDue(row), `Content “${title}” graphic due date`, warn),
      priority: priority ?? base.priority,
      requiredGraphic: cGraphic(row) ? bool(cGraphic(row)) : base.requiredGraphic,
      requiredVideo: cVideo(row) ? bool(cVideo(row)) : base.requiredVideo,
      captionDirection: cCaption(row),
      mainMessage: cMessage(row),
      cta: cCta(row),
      productHighlight: cHighlight(row),
      mandatoryText: cMandatory(row),
      doDont: cDoDont(row),
      note: cNote(row),
    });
  });
  return items;
}

// ── KOL ───────────────────────────────────────────────────────────────────
function readKols(grid: string[][], warn: string[]): BriefKolItem[] {
  if (grid.length < 2) return [];
  const col = columns(grid);
  const cName = col("Name", "KOL", "Display Name");
  const cHandle = col("Handle", "Page");
  const cPlatforms = col("Platforms", "Platform");
  const cType = col("KOL Type", "Type");
  const cFollowers = col("Followers");
  const cCount = col("Count", "Pages", "จำนวน");
  const cReach = col("Expected Reach", "Reach");
  const cBudget = col("Budget");
  const cArea = col("Area");
  const cContent = col("Content Required", "Content");
  const cStart = col("Posting Start", "Start");
  const cEnd = col("Posting End", "End");
  const cOwner = col("Owner");
  const cNote = col("Note", "Notes");

  const items: BriefKolItem[] = [];
  grid.slice(1).forEach((row) => {
    const name = cName(row);
    const typeRaw = cType(row);
    // A KOL row is real if it names either a page or a type — the plan often
    // starts as "3 foodie micro pages, not chosen yet".
    if (!name && !typeRaw) return;
    const seq = items.length + 1;
    const base = emptyKolItem(seq);
    const kolType = typeRaw ? matchOption(typeRaw, KOL_TYPES) : null;
    if (typeRaw && !kolType) warn.push(`KOL “${name || typeRaw}”: ไม่รู้จัก type “${typeRaw}” — ใช้ ${base.kolType}`);
    const countRaw = cCount(row);
    items.push({
      ...base,
      name,
      handle: cHandle(row),
      platforms: matchList(cPlatforms(row), KOL_PLATFORMS, `KOL “${name || typeRaw}” platforms`, warn),
      kolType: kolType ?? base.kolType,
      followers: num(cFollowers(row)),
      count: countRaw ? Math.max(1, num(countRaw)) : base.count,
      expectedReach: num(cReach(row)),
      budget: num(cBudget(row)),
      area: cArea(row),
      contentRequired: matchList(cContent(row), KOL_CONTENT, `KOL “${name || typeRaw}” content`, warn) || base.contentRequired,
      postingStart: sheetDate(cStart(row), `KOL “${name || typeRaw}” posting start`, warn),
      postingEnd: sheetDate(cEnd(row), `KOL “${name || typeRaw}” posting end`, warn),
      owner: cOwner(row),
      note: cNote(row),
    });
  });
  return items;
}

// ── Budget ────────────────────────────────────────────────────────────────
function readBudget(grid: string[][], warn: string[]): BriefBudget | null {
  const f = fieldMap(grid);
  const get = (...names: string[]) => { for (const n of names) { const v = f.get(key(n)); if (v) return v; } return ""; };
  const base = emptyBudget();
  const budget: BriefBudget = { ...base, adsByPlatform: [], monthly: [] };
  let touched = false;

  const buckets: [keyof BriefBudget, string[]][] = [
    ["total", ["Total", "งบรวม"]], ["ads", ["Ads", "Media"]], ["kol", ["KOL"]],
    ["graphic", ["Graphic", "Design"]], ["printing", ["Printing", "Print"]],
    ["crm", ["CRM"]], ["other", ["Other", "อื่นๆ"]],
  ];
  for (const [field, names] of buckets) {
    const raw = get(...names);
    if (!raw) continue;
    (budget[field] as number) = num(raw);
    touched = true;
  }
  const otherNote = get("Other Note", "หมายเหตุ");
  if (otherNote) { budget.otherNote = otherNote; touched = true; }

  for (const [platformLabel, value] of prefixed(grid, "Ads")) {
    const platform = matchOption(platformLabel, ADS_PLATFORMS);
    if (!platform) { warn.push(`Budget → Ads: ไม่รู้จัก platform “${platformLabel}” — ข้ามไป`); continue; }
    budget.adsByPlatform.push({ platform, amount: num(value) });
    touched = true;
  }
  for (const [monthLabel, value] of prefixed(grid, "Month")) {
    const month = sheetMonth(monthLabel);
    if (!month) { warn.push(`Budget → Month: อ่านเดือน “${monthLabel}” ไม่ออก — ใช้รูปแบบ YYYY-MM`); continue; }
    budget.monthly!.push({ month, amount: num(value) });
    touched = true;
  }
  if (!touched) return null;
  // The Budget step expects at least one ads-platform row to render.
  if (!budget.adsByPlatform.length) budget.adsByPlatform = base.adsByPlatform;
  return budget;
}

// ── Entry point ───────────────────────────────────────────────────────────
export function briefFromSheet(grids: BriefSheetGrids, resolveBrand: BrandResolver): BriefSheetImport {
  const warnings: string[] = [];
  const patch = readOverview(grids.overview, resolveBrand, warnings);

  const content = grids.content ? readContent(grids.content, warnings) : [];
  if (content.length) patch.content = content;
  const kols = grids.kol ? readKols(grids.kol, warnings) : [];
  if (kols.length) patch.kols = kols;

  if (grids.budget) {
    const budget = readBudget(grids.budget, warnings);
    if (budget) patch.budget = budget;
  }

  // A KOL budget in the KOL tab but no envelope in the Budget tab would show as
  // "KOL plan exceeds its ceiling" in the form — surface it here instead.
  const kolTotal = kols.reduce((sum, k) => sum + k.budget * (k.count || 1), 0);
  if (kolTotal && !(patch.budget?.kol ?? 0)) {
    warnings.push(`KOL tab วางงบรวม ${kolTotal.toLocaleString()} แต่ Budget tab ไม่ได้ตั้งช่อง KOL — ตรวจใน Budget Allocation`);
  }

  if (!patch.name) warnings.push("Overview: ไม่พบ Campaign Name — กรอกชื่อแคมเปญในฟอร์มก่อนบันทึก");

  return { patch, warnings, counts: { content: content.length, kols: kols.length } };
}

/** Shape returned by /api/campaign-brief-sheet — the patch travels as JSON. */
export interface BriefSheetResponse extends BriefSheetImport {}

/** Merge an imported patch onto the brief the form currently holds. Keeps the
 *  identity fields the sheet has no business setting (id, code, status, planner,
 *  approver, approval log) and drops branches the brand doesn't actually have. */
export function applyBriefPatch(
  current: CampaignBrief,
  patch: Partial<CampaignBrief>,
  branchesFor: (brand: BrandId) => string[],
): { brief: CampaignBrief; warnings: string[] } {
  const warnings: string[] = [];
  const merged: CampaignBrief = {
    ...current,
    ...patch,
    id: current.id,
    code: current.code,
    status: current.status,
    plannerOwner: current.plannerOwner,
    approver: current.approver,
    approvalLog: current.approvalLog,
    createdAt: current.createdAt,
    budget: patch.budget ? { ...emptyBudget(), ...patch.budget } : current.budget,
  };

  const valid = branchesFor(merged.b);
  if (patch.branches) {
    const kept = patch.branches.filter((b) => valid.some((v) => key(v) === key(b)))
      .map((b) => valid.find((v) => key(v) === key(b))!);
    const dropped = patch.branches.filter((b) => !valid.some((v) => key(v) === key(b)));
    if (dropped.length) warnings.push(`Branches: ${dropped.join(", ")} ไม่ใช่สาขาของแบรนด์นี้ — เลือกสาขาในฟอร์มเอง`);
    merged.branches = kept;
  } else {
    merged.branches = merged.branches.filter((b) => valid.includes(b));
  }
  merged.branch = merged.branches.join(", ");
  return { brief: merged, warnings };
}

/** A blank brief carrying only what a sheet import provides — used by tests. */
export const briefFixture = (id = "CAM-TEST-0001"): CampaignBrief => emptyBrief(id);
