// Fire-and-forget mirror of one row into a Google Sheet tab, via our server
// route → Apps Script Web App. Best-effort by design: it never blocks or throws
// (a Sheet hiccup must never break the save that triggered it), and only runs in
// the browser (the server has no relative-URL base for the fetch). `row` is an
// array of cell values already in the tab's column order; `headers` is written
// only when the tab is empty.

export function mirrorRowToSheet(
  tab: string,
  headers: string[],
  row: (string | number)[],
): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/campaign-sheet-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ tab, headers, row }),
    }).catch(() => {});
  } catch {
    /* never throw from the mirror */
  }
}
