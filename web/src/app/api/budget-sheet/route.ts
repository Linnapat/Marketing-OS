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

  const rows: { month: string; category: string; budget: number }[] = [];
  for (const r of parseCsv(text)) {
    const month = normMonth(r[0] ?? "");
    const category = (r[1] ?? "").trim();
    const budget = Number(String(r[2] ?? "").replace(/[^\d.-]/g, ""));
    if (/^\d{4}-\d{2}$/.test(month) && category && Number.isFinite(budget) && budget >= 0) {
      rows.push({ month, category, budget });
    }
  }
  return NextResponse.json({ rows });
}
