// Reads monthly category budgets from a Google Sheet the Finance team edits.
// The sheet must be shared "Anyone with the link — Viewer"; we fetch its CSV
// export server-side (no Google API key needed). Expected columns:
//   A = เดือน (YYYY-MM)  B = Category  C = Budget (THB)
// Header rows and rows that don't parse are skipped.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Turn a normal share link into a CSV URL for the same tab. Uses the gviz
 *  endpoint — the plain /export endpoint rejects some link-shared sheets. */
function csvUrl(shareUrl: string): string | null {
  try {
    const u = new URL(shareUrl);
    if (u.hostname !== "docs.google.com") return null;
    const m = u.pathname.match(/\/spreadsheets\/d\/([\w-]+)/);
    if (!m) return null;
    const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid") ?? "0";
    return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
  } catch {
    return null;
  }
}

/** Minimal CSV parser that handles quoted fields and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Accept 2026-07, 2026/7, 07/2026, 7-2026 → "2026-07". */
function normMonth(s: string): string {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  return t;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const target = csvUrl(url);
  if (!target) return NextResponse.json({ error: "ลิงก์ไม่ใช่ Google Sheets — วางลิงก์จากปุ่ม Share ของ sheet" }, { status: 400 });

  let text: string;
  try {
    const res = await fetch(target, { cache: "no-store", redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json({ error: `อ่าน sheet ไม่ได้ (HTTP ${res.status}) — ตรวจว่าแชร์แบบ "Anyone with the link · Viewer" แล้ว` }, { status: 502 });
    }
    text = await res.text();
  } catch {
    return NextResponse.json({ error: "เชื่อมต่อ Google Sheets ไม่ได้ — ลองใหม่อีกครั้ง" }, { status: 502 });
  }
  // A private sheet redirects to an HTML login page instead of CSV.
  if (text.trimStart().startsWith("<")) {
    return NextResponse.json({ error: 'sheet ยังไม่เปิดแชร์ — ตั้ง Share เป็น "Anyone with the link · Viewer" ก่อน' }, { status: 403 });
  }

  const grid = parseCsv(text);
  if (!grid.length) return NextResponse.json({ rows: [] });

  // Auto-detect the schema from the header row. Supports both the simple 3-column
  // sheet (month | category | budget) and the finance ledger export
  // (fiscal_year, month, department, entity_type, section, line_item, row_type,
  // amount, …). For the ledger we take line_item as the category, amount as the
  // budget, and to avoid double-counting the Brand vs Department cuts we keep the
  // Brand-level detail rows only.
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n));
  const iMonth = col("month", "เดือน", "period");
  const iLineItem = col("line_item", "line item");
  const iAmount = col("amount");
  const iCategoryCol = col("category");
  const iBudgetCol = col("budget");
  const iEntity = col("entity_type", "entity type");
  const iRowType = col("row_type", "row type");
  const iSection = col("section");

  const isLedger = iLineItem >= 0 && iAmount >= 0;
  const rows: { month: string; category: string; budget: number; group?: string }[] = [];

  if (isLedger) {
    // Sections that aren't real category budgets (KPIs, notes, transfers).
    const EXCLUDE_SECTIONS = new Set(["performance", "budget allocation", "inter-brand allocation"]);
    // Rollup / total line-items that would double-count against their children.
    const EXCLUDE_ITEMS = new Set([
      "ต้นทุนในการขาย/ค่าโฆษณา", "total", "grand total", "digital marketing", "operation",
      "adminstration", "administration", "outsouce", "outsource", "system",
    ]);
    // Normalise sheet line-items to the app's canonical category names so budget
    // lines up exactly with actual spend per category.
    const ALIAS: Record<string, string> = {
      "facebook/instagram ads": "Facebook / Instagram Ads",
      "google ads/ppc": "Google Ads / PPC",
      "line ads": "LINE Ads",
      "kol": "KOL / Influencer",
      "tiktok": "TikTok Ads",
      "youtube ads": "YouTube Ads",
      "food cost (kol/photo shooting)": "Food cost / Photo shoot",
      "event": "Event / Activation",
      "website (clound)": "Website (Cloud)",
      "ค่าเช่าออฟฟิศ marketing (rental office)": "Office Rent",
      "outsouce ": "Agency Fee",
    };

    // Google Sheets sometimes embeds control chars (e.g.  around a slash);
    // strip them so exclusion/alias matching is reliable and labels are clean.
    const clean = (s: string) => (s ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
    type Raw = { section: string; entity: string; month: string; category: string; budget: number };
    const raws: Raw[] = [];
    for (const r of grid.slice(1)) {
      const rowType = iRowType >= 0 ? (r[iRowType] ?? "").trim().toLowerCase() : "detail";
      if (iRowType >= 0 && rowType !== "detail") continue;              // only real line items
      const section = clean(r[iSection] ?? "");
      if (EXCLUDE_SECTIONS.has(section.toLowerCase())) continue;        // drop KPI/allocation sections
      const rawItem = clean(r[iLineItem] ?? "");
      if (EXCLUDE_ITEMS.has(rawItem.toLowerCase())) continue;          // drop rollups/totals
      const month = normMonth(r[iMonth >= 0 ? iMonth : 2] ?? "");
      const budget = Number(String(r[iAmount] ?? "").replace(/[^\d.-]/g, ""));
      if (!/^\d{4}-\d{2}$/.test(month) || !rawItem || !Number.isFinite(budget) || budget < 0) continue;
      const category = ALIAS[rawItem.toLowerCase()] ?? rawItem;
      raws.push({ section, entity: (r[iEntity] ?? "").trim().toLowerCase(), month, category, budget });
    }
    // Per-section dedup: Digital Marketing carries both a Brand and a Department
    // cut of the same money — keep Brand there; sections with only a Department
    // cut (Adminstration, Outsouce) keep Department. Prevents both double-count
    // and dropped rows.
    const brandSections = new Set(raws.filter((x) => x.entity === "brand").map((x) => x.section));
    for (const x of raws) {
      if (brandSections.has(x.section) && x.entity && x.entity !== "brand") continue;
      rows.push({ month: x.month, category: x.category, budget: x.budget, group: x.section });
    }
  } else {
    // Simple schema: month | category | budget (positional, or by header).
    const mi = iMonth >= 0 ? iMonth : 0;
    const ci = iCategoryCol >= 0 ? iCategoryCol : 1;
    const bi = iBudgetCol >= 0 ? iBudgetCol : 2;
    const start = /month|เดือน|category|budget/i.test((grid[0].join(" "))) ? 1 : 0; // skip a header row if present
    for (const r of grid.slice(start)) {
      const month = normMonth(r[mi] ?? "");
      const category = (r[ci] ?? "").trim();
      const budget = Number(String(r[bi] ?? "").replace(/[^\d.-]/g, ""));
      if (/^\d{4}-\d{2}$/.test(month) && category && Number.isFinite(budget) && budget >= 0) {
        rows.push({ month, category, budget });
      }
    }
  }
  return NextResponse.json({ rows, schema: isLedger ? "ledger" : "simple" });
}
