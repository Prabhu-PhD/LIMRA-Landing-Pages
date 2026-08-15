/**
 * LIMRA landing pages - Google Sheet lead collector
 * ==================================================
 *
 * Appends every landing-page enquiry as a row in a Google Sheet, so the
 * counselling team can assign and track follow-up. Email delivery via
 * Web3Forms continues independently - this is an addition, not a replacement.
 *
 * ONE-TIME SETUP (about 5 minutes, done from the LIMRA Google account):
 *
 *  1. Create a new Google Sheet. Name it e.g. "LIMRA Ad Leads".
 *  2. In that sheet: Extensions > Apps Script.
 *  3. Delete whatever is in the editor and paste this entire file in.
 *  4. Click Deploy > New deployment.
 *       - Type            : Web app
 *       - Description     : LIMRA lead collector
 *       - Execute as      : Me
 *       - Who has access  : Anyone            <-- this matters; the landing
 *                                                 page posts anonymously
 *  5. Click Deploy, then Authorize access and accept the permission prompt.
 *  6. Copy the Web app URL. It looks like:
 *       https://script.google.com/macros/s/AKfyc.../exec
 *  7. Paste it into _data/site.js as "sheetEndpoint", then rebuild and
 *     redeploy the landing pages.
 *
 * To verify: submit a test enquiry on any landing page. A new row should
 * appear in the sheet within a second or two.
 *
 * NOTE: after editing this script you must Deploy > Manage deployments and
 * publish a NEW VERSION, otherwise the live URL keeps running the old code.
 */

var HEADERS = [
  'submitted_at',
  'college',
  'name',
  'phone',
  'email',
  'city',
  'intake',
  'consent',
  'gclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'referrer',
  'landed_at',
  'page_url'
];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // First run: lay down a header row and freeze it.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    var row = HEADERS.map(function (key) {
      return payload[key] !== undefined ? payload[key] : '';
    });

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Never surface an error to the visitor - the email path already
    // delivered the lead. Log it for debugging instead.
    console.error('LIMRA lead collector failed: ' + err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('LIMRA lead collector is running.');
}
