import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

function followers(value: string): number {
  const raw = (value ?? "").trim().toLowerCase().replace(/,/g, "");
  if (!raw) return 0;
  if (raw.endsWith("m")) return Math.round(parseFloat(raw) * 1_000_000);
  if (raw.endsWith("k")) return Math.round(parseFloat(raw) * 1_000);
  return Number(raw.replace(/[^\d.-]/g, "")) || 0;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const target = csvUrl(url);
  if (!target) return NextResponse.json({ error: "ลิงก์ไม่ใช่ Google Sheets — วางลิงก์จากปุ่ม Share ของ sheet" }, { status: 400 });

  let text: string;
  try {
    const res = await fetch(target, { cache: "no-store", redirect: "follow" });
    if (!res.ok) return NextResponse.json({ error: `อ่าน sheet ไม่ได้ (HTTP ${res.status}) — ตรวจว่าแชร์แบบ "Anyone with the link · Viewer" แล้ว` }, { status: 502 });
    text = await res.text();
  } catch {
    return NextResponse.json({ error: "เชื่อมต่อ Google Sheets ไม่ได้ — ลองใหม่อีกครั้ง" }, { status: 502 });
  }
  if (text.trimStart().startsWith("<")) {
    return NextResponse.json({ error: 'sheet ยังไม่เปิดแชร์ — ตั้ง Share เป็น "Anyone with the link · Viewer" ก่อน' }, { status: 403 });
  }

  const grid = parseCsv(text);
  if (!grid.length) return NextResponse.json({ rows: [] });

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n));
  const iName = col("display_name", "display name", "name", "kol", "creator");
  const iHandle = col("primary_handle", "handle", "page", "username");
  const iPlatform = col("platform");
  const iFollowers = col("followers", "total_followers", "follower");
  const iType = col("kol_type", "kol type", "type");
  const iTier = col("tier");
  const iStatus = col("status");
  const iOwner = col("owner_specialist", "owner", "specialist");
  const iAgency = col("contact_agency", "agency");
  const iNotes = col("notes", "note");

  const start = /display|name|handle|platform|followers/i.test(grid[0].join(" ")) ? 1 : 0;
  const rows = grid.slice(start).map((r) => ({
    display_name: (r[iName >= 0 ? iName : 0] ?? "").trim(),
    primary_handle: (r[iHandle] ?? "").trim(),
    platform: (r[iPlatform] ?? "").trim(),
    total_followers: followers(r[iFollowers] ?? ""),
    kol_type: (r[iType] ?? "").trim(),
    tier: (r[iTier] ?? "").trim(),
    status: (r[iStatus] ?? "").trim(),
    owner_specialist: (r[iOwner] ?? "").trim(),
    contact_agency: (r[iAgency] ?? "").trim(),
    notes: (r[iNotes] ?? "").trim(),
  })).filter((r) => r.display_name);

  return NextResponse.json({ rows });
}
