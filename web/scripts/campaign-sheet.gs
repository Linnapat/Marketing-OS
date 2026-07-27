/**
 * Marketing OS — Sheet mirror (Apps Script Web App).
 *
 * The app POSTs one of:
 *   { tab, headers, row }                       append one row (the live mirror)
 *   { tab, headers, rows }                      append many rows in one call
 *   { tab, headers, rows, mode: "replace" }     clear the tab's data, then write
 *
 * `row` / `rows` are arrays of cell values already in column order. The tab and
 * a bold header row are created on first use. Supabase stays the source of
 * truth; the sheet is a human-readable mirror.
 *
 * "replace" exists for the full re-sync. Appending a backfill onto rows that are
 * already there doubles every campaign, and clearing by hand before each attempt
 * is how a sync quietly stops being run. It clears VALUES ONLY, from row 2 down:
 * the header row, its formatting and any formula columns written beside the data
 * belong to whoever set the sheet up, not to this script.
 *
 * Deploy: Extensions > Apps Script, paste this, then Deploy > New deployment >
 * type "Web app", execute as "Me", access "Anyone". Copy the /exec URL into the
 * app env var CAMPAIGN_SHEET_WEBHOOK_URL. (When re-deploying, use Manage
 * deployments > edit > New version so the /exec URL stays the same.)
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  // A replace rewrites a whole tab, so wait longer rather than racing a
  // concurrent append and leaving the tab half-written.
  lock.tryLock(30000);
  try {
    var body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    var tab = body.tab || "Campaigns";
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);

    var headers = (body.headers && body.headers.length) ? body.headers : null;
    if (sheet.getLastRow() === 0 && headers) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    // Accept either shape so the live one-row mirror keeps working unchanged.
    var rows = [];
    if (body.rows && body.rows.length) rows = body.rows;
    else if (body.row && body.row.length) rows = [body.row];

    var cleared = 0;
    if (body.mode === "replace") {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow > 1 && lastCol > 0) {
        cleared = lastRow - 1;
        sheet.getRange(2, 1, cleared, lastCol).clearContent();
      }
    }

    if (rows.length) {
      // One setValues beats N appendRow calls — a few hundred appendRow calls
      // hit the Web App's execution limit long before they finish.
      var width = rows[0].length;
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
    }

    return json({ ok: true, tab: tab, written: rows.length, cleared: cleared });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Browser health check — open the /exec URL to confirm the deployment is live. */
function doGet() {
  return json({ ok: true, service: "sheet-mirror" });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
