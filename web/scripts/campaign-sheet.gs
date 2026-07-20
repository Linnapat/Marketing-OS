/**
 * Marketing OS — Sheet mirror (Apps Script Web App).
 *
 * Generic appender: the app POSTs { tab, headers, row } and this writes `row`
 * (an array of cell values, already in column order) to the named tab, creating
 * the tab + a bold header row on first use. Used for the Campaigns and
 * KOL_Activities mirrors today — new mirrors just send a different tab/headers,
 * no re-deploy needed. Supabase stays the source of truth; the sheet is a
 * human-readable mirror.
 *
 * Deploy: Extensions > Apps Script, paste this, then Deploy > New deployment >
 * type "Web app", execute as "Me", access "Anyone". Copy the /exec URL into the
 * app env var CAMPAIGN_SHEET_WEBHOOK_URL. (When re-deploying, use Manage
 * deployments > edit > New version so the /exec URL stays the same.)
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000); // serialise appends so concurrent writes don't collide
  try {
    var body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    var tab = body.tab || "Campaigns";
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);
    if (sheet.getLastRow() === 0 && body.headers && body.headers.length) {
      sheet.appendRow(body.headers);
      sheet.getRange(1, 1, 1, body.headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    if (body.row && body.row.length) sheet.appendRow(body.row);
    return json({ ok: true, tab: tab });
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
