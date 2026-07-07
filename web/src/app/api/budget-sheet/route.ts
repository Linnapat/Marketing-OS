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
    const hasBrandRows = grid.slice(1).some((r) => (r[iEntity] ?? "").trim().toLowerCase() === "brand");
    for (const r of grid.slice(1)) {
      const rowType = iRowType >= 0 ? (r[iRowType] ?? "").trim().toLowerCase() : "detail";
      if (iRowType >= 0 && rowType !== "detail") continue;               // skip subtotal/summary
      const entity = iEntity >= 0 ? (r[iEntity] ?? "").trim().toLowerCase() : "";
      if (hasBrandRows && iEntity >= 0 && entity !== "brand") continue;   // one cut only → no double count
      const month = normMonth(r[iMonth >= 0 ? iMonth : 2] ?? "");
      const category = (r[iLineItem] ?? "").trim();
      const budget = Number(String(r[iAmount] ?? "").replace(/[^\d.-]/g, ""));
      if (/^\d{4}-\d{2}$/.test(month) && category && Number.isFinite(budget) && budget >= 0) {
        rows.push({ month, category, budget, group: iSection >= 0 ? (r[iSection] ?? "").trim() : undefined });
      }
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
