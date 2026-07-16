// Shared helpers for reading link-shared Google Sheets as CSV, server-side (no
// Google API key needed). The sheet must be shared "Anyone with the link —
// Viewer". Used by the budget-sheet, kol-library-sheet and performance-sheet
// API routes, which previously each carried their own copy of this logic.

/** Minimal CSV parser that handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
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

/** Extract the spreadsheet id from any Google Sheets share/edit link. */
export function spreadsheetId(shareUrl: string): string | null {
  try {
    const u = new URL(shareUrl);
    if (u.hostname !== "docs.google.com") return null;
    return u.pathname.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** gviz CSV export URL for a given spreadsheet id + tab gid. The gviz endpoint
 *  is used instead of /export because /export rejects some link-shared sheets. */
export function csvUrl(id: string, gid = "0"): string {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

/** Turn a normal share link into a CSV URL for the same tab, or null if the
 *  link isn't a recognisable Google Sheets URL. */
export function csvUrlFromShareLink(shareUrl: string): string | null {
  const id = spreadsheetId(shareUrl);
  if (!id) return null;
  try {
    const u = new URL(shareUrl);
    const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid") ?? "0";
    return csvUrl(id, gid);
  } catch {
    return csvUrl(id);
  }
}

/** Fetch a sheet tab and parse it into a grid of rows. Throws on HTTP error. */
export async function fetchSheetGrid(id: string, gid = "0"): Promise<string[][]> {
  const res = await fetch(csvUrl(id, gid), { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`Google Sheet fetch failed (${res.status})`);
  return parseCsv(await res.text());
}
