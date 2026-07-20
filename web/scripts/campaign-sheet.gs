/**
 * Marketing OS — Campaign Sheet mirror (Apps Script Web App).
 *
 * Receives a POST from /api/campaign-sheet-sync whenever a campaign is created
 * and appends one row to the "Campaigns" tab, matching the reporting template's
 * columns (campaign_id, campaign_name, brand, branch, KPI, start, end,
 * budget_plan, notes). Header is written only if the tab is empty on first
 * run). Supabase stays the source of truth; this sheet is a human-readable
 * mirror the team can view/filter.
 *
 * Deploy: Extensions > Apps Script, paste this, then Deploy > New deployment >
 * type "Web app", execute as "Me", access "Anyone". Copy the /exec URL into the
 * app env var CAMPAIGN_SHEET_WEBHOOK_URL.
 */

var TAB = "Campaigns";
var HEADERS = [
  "campaign_id", "campaign_name", "brand", "branch",
  "KPI", "start", "end", "budget_plan", "notes",
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000); // serialise appends so concurrent creates don't collide
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    var row = HEADERS.map(function (key) {
      return body[key] != null ? body[key] : "";
    });
    sheet.appendRow(row);
    return json({ ok: true, appended: body.campaign_id || null });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Browser health check — open the /exec URL to confirm the deployment is live. */
function doGet() {
  return json({ ok: true, service: "campaign-sheet-mirror" });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
