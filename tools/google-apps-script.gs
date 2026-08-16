/**
 * LIMRA landing pages - Google Sheet lead collector
 * ==================================================
 *
 * Appends every landing-page enquiry as a row in a Google Sheet, so the
 * counselling team can assign and track follow-up. Email delivery via
 * Web3Forms continues independently - this is an addition, not a replacement.
 * If this script breaks, no lead is lost.
 *
 *
 * SETUP (about 5 minutes, done from the Google account that owns the sheet)
 * ------------------------------------------------------------------------
 *
 * This is a STANDALONE script. Do not use the sheet's Extensions > Apps Script
 * menu. That menu builds a URL tied to the account slot you are signed into,
 * which fails with an endless account chooser when more than one Google
 * account is signed into the same browser. Creating the project directly
 * avoids the problem entirely.
 *
 *  1. Sign in as the LIMRA account ONLY. The simplest way is a new incognito
 *     window, because a second signed-in account is what causes the loop.
 *
 *  2. Create the Google Sheet if it does not exist yet. Name it e.g.
 *     "LIMRA Ad Leads".
 *
 *  3. Copy the sheet's ID out of its address bar. In
 *       docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I/edit
 *     the ID is the long middle section: 1A2B3C4D5E6F7G8H9I
 *
 *  4. Go to script.google.com and click New project.
 *
 *  5. Delete whatever is in the editor, paste this entire file in, and put the
 *     sheet ID into SHEET_ID below. Save.
 *
 *  6. Choose testConnection in the function dropdown and click Run. Accept the
 *     authorisation prompt when it appears. Google will warn that the app is
 *     not verified: click Advanced, then "Go to ... (unsafe)". That warning is
 *     normal for a private script you wrote yourself.
 *
 *     Do this BEFORE deploying. It proves the script can reach the sheet, and
 *     it gets the permission prompt out of the way while you can still see the
 *     error message. A deployed web app fails silently.
 *
 *  7. Deploy > New deployment.
 *       - Type            : Web app   (click the gear beside "Select type")
 *       - Description     : LIMRA lead collector
 *       - Execute as      : Me
 *       - Who has access  : Anyone            <-- this matters; the landing
 *                                                 page posts anonymously.
 *                                                 NOT "Anyone with a Google
 *                                                 account".
 *
 *  8. Click Deploy and copy the Web app URL. It looks like:
 *       https://script.google.com/macros/s/AKfyc.../exec
 *     It must contain /macros/s/ and end in /exec. A URL containing /u/0/ or
 *     ending in /dev is the private test URL and will not work.
 *
 *  9. Paste that URL into _data/site.js as "sheetEndpoint" (or set it as the
 *     SHEET_ENDPOINT environment variable in Netlify), then redeploy.
 *
 * To verify: open the /exec URL in a browser. It should print
 * "LIMRA lead collector is running." Then submit a test enquiry on a landing
 * page and watch a row appear.
 *
 * NOTE: after editing this script you must Deploy > Manage deployments and
 * publish a NEW VERSION, otherwise the live URL keeps running the old code.
 * This is the single most common reason a fix appears to do nothing.
 */

// ---------------------------------------------------------------------------
// The only line you need to change. See step 3 above.
// ---------------------------------------------------------------------------
var SHEET_ID = 'PASTE_THE_SHEET_ID_HERE';


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


/**
 * Google Sheets evaluates a cell that begins with = + - or @ as a formula.
 * That is a problem twice over.
 *
 * First, it corrupts real data: a student who types their number as
 * "+91 98765 43210", which many do, lands in the sheet as #ERROR! and the
 * lead becomes uncallable.
 *
 * Second, it is a security hole. Anyone can type anything into a public
 * enquiry form, so a name of "=IMPORTXML(...)" would execute inside the
 * client's spreadsheet. This is the well known CSV injection problem.
 *
 * A leading apostrophe tells Sheets to treat the value as text. It is not
 * displayed and it is not part of the stored string.
 */
function safeCell(value) {
  var s = (value === null || value === undefined) ? '' : String(value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}


/**
 * Run this from the editor before deploying. It writes a clearly marked test
 * row, so a failure shows up as a readable error rather than as silence.
 */
function testConnection() {
  var sheet = getSheet();
  sheet.appendRow(HEADERS.map(function (key) {
    if (key === 'submitted_at') return new Date();
    if (key === 'college') return 'TEST ROW - delete me';
    if (key === 'name') return 'Test from Apps Script editor';
    return '';
  }));
  Logger.log('Wrote a test row to "%s". Delete that row before going live.',
             sheet.getParent().getName());
}


function getSheet() {
  if (!SHEET_ID || SHEET_ID === 'PASTE_THE_SHEET_ID_HERE') {
    throw new Error('SHEET_ID is not set. See step 3 in the notes at the top.');
  }

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

  // First run: lay down a header row and freeze it.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}


function doPost(e) {
  // Two enquiries arriving at the same moment could otherwise both decide the
  // sheet is empty and both write a header row. Ad traffic makes that likelier
  // than it sounds.
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);

    var payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      // Fallback for a normal form-encoded POST.
      payload = e.parameter || {};
    }

    var sheet = getSheet();

    sheet.appendRow(HEADERS.map(function (key) {
      return safeCell(payload[key]);
    }));

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Never surface an error to the visitor - the email path already delivered
    // the lead. Log it for debugging instead. Executions in the left sidebar
    // of the editor is where these appear.
    console.error('LIMRA lead collector failed: ' + err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);

  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}


function doGet() {
  return ContentService.createTextOutput('LIMRA lead collector is running.');
}
