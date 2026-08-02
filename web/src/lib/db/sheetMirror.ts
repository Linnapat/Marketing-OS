// Fire-and-forget mirror of one row into a Google Sheet tab, via our server
// route → Apps Script Web App. Best-effort by design: it never blocks or throws
// (a Sheet hiccup must never break the save that triggered it), and only runs in
// the browser (the server has no relative-URL base for the fetch). `row` is an
// array of cell values already in the tab's column order; `headers` is written
// only when the tab is empty. `brand` lets the server route to a different
// spreadsheet per brand (see CAMPAIGN_SHEET_WEBHOOKS in the route) — omit it to
// always use the single default sheet.

export function mirrorRowToSheet(
  tab: string,
  headers: string[],
  row: (string | number)[],
  brand?: string,
): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/campaign-sheet-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ tab, headers, row, brand }),
    }).catch(() => {});
  } catch {
    /* never throw from the mirror */
  }
}

/** Replace a tab's contents with `rows` in one call: the Apps Script clears the
 *  data rows (headers and formatting untouched) and writes the batch.
 *
 *  Unlike the per-row mirror this one is awaited and reports failure, because it
 *  is a deliberate action with a button behind it — a full re-sync that silently
 *  did nothing would leave the team reading a sheet they believe is current. */
export async function replaceSheetTab(
  tab: string,
  headers: string[],
  rows: (string | number)[][],
  brand?: string,
): Promise<{ ok: boolean; written?: number; cleared?: number; error?: string }> {
  try {
    const res = await fetch("/api/campaign-sheet-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, headers, rows, mode: "replace", brand }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; skipped?: string; body?: string; error?: string }
      | null;
    if (!res.ok || json?.ok === false) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    if (json?.skipped) return { ok: false, error: "ยังไม่ได้ตั้งค่า Apps Script webhook" };
    // The route returns the Apps Script's own reply as text; pull the counts out
    // when they are there so the caller can say what actually happened.
    let written: number | undefined, cleared: number | undefined;
    try {
      const inner = JSON.parse(json?.body ?? "{}") as { written?: number; cleared?: number };
      written = inner.written; cleared = inner.cleared;
    } catch { /* older script versions reply with plain text */ }
    return { ok: true, written, cleared };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
