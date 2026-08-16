/**
 * LIMRA landing pages - Google Sheet lead collector
 * ==================================================
 *
 * Appends every landing-page enquiry to the "LIMRA Ad Leads" sheet as a row
 * the counselling team can work from directly. Email delivery via Web3Forms
 * runs independently, so if this ever breaks, no lead is lost.
 *
 *
 * SETUP
 * -----
 * This is a STANDALONE script, created from script.google.com. Do NOT use the
 * sheet's Extensions > Apps Script menu: it builds a URL tied to the signed-in
 * account slot, which dead-ends in an endless account chooser when more than
 * one Google account is signed into the browser.
 *
 *  1. Sign in as the owning account only. An incognito window is simplest.
 *  2. script.google.com > New project. Paste this file in.
 *  3. Put the sheet ID in SHEET_ID below. It is the long middle section of
 *     docs.google.com/spreadsheets/d/<THIS PART>/edit
 *  4. Run setupSheet once. Accept the authorisation prompt. Google warns the
 *     app is not verified: Advanced, then "Go to ... (unsafe)". That is normal
 *     for a private script.
 *  5. Deploy > New deployment > Web app, Execute as Me, Who has access Anyone
 *     (NOT "Anyone with a Google account"; the page posts anonymously).
 *  6. Put the /exec URL into _data/site.js as sheetEndpoint, or set it as the
 *     SHEET_ENDPOINT environment variable in Netlify.
 *
 * AFTER ANY EDIT you must Deploy > Manage deployments > pencil > Version:
 * New version > Deploy. Saving alone does nothing; the live URL keeps running
 * the old code. This is the most common reason a fix appears to do nothing.
 */

var SHEET_ID = '1_nfhwCF3wrFxZZGGbuJMUxM05mQrhTevJvpusRwqjGw';


/**
 * Column layout, left to right.
 *
 *   key      take this field from the submitted enquiry
 *   value    write this constant on every new row
 *   wa       build a click-to-WhatsApp link from the phone number
 *
 * The team-filled columns sit near the front on purpose, so a counsellor can
 * see and update a lead without scrolling. The advertising fields sit at the
 * end and are hidden by default; they matter when judging campaigns, not when
 * calling a student.
 */
var COLUMNS = [
  { header: 'Received',       key: 'submitted_at' },
  { header: 'Status',         value: 'New' },
  { header: 'Owner',          value: '' },
  { header: 'Next action on', value: '' },
  { header: 'Notes',          value: '' },
  { header: 'Name',           key: 'name' },
  { header: 'Phone',          key: 'phone' },
  { header: 'WhatsApp',       wa: true },
  { header: 'University',     key: 'college' },
  { header: 'City',           key: 'city' },
  { header: 'Intake',         key: 'intake' },
  { header: 'Email',          key: 'email' },
  { header: 'Consent',        key: 'consent' },
  { header: 'gclid',          key: 'gclid' },
  { header: 'utm_source',     key: 'utm_source' },
  { header: 'utm_medium',     key: 'utm_medium' },
  { header: 'utm_campaign',   key: 'utm_campaign' },
  { header: 'utm_term',       key: 'utm_term' },
  { header: 'utm_content',    key: 'utm_content' },
  { header: 'Referrer',       key: 'referrer' },
  { header: 'Landed at',      key: 'landed_at' },
  { header: 'Page',           key: 'page_url' }
];

// Index (1-based) of the first advertising column, and how many there are.
var ADS_FIRST_COL = 14;
var ADS_COL_COUNT = COLUMNS.length - ADS_FIRST_COL + 1;

var STATUSES = [
  'New',
  'Contacted',
  'Follow up',
  'Documents pending',
  'Application started',
  'Converted',
  'Not interested',
  'Wrong number'
];


/* ==========================================================================
   Writing a lead
   ========================================================================== */

/**
 * Sheets evaluates a cell beginning with = + - or @ as a formula.
 *
 * That corrupts real data: a student typing "+91 98765 43210", which many do,
 * would land as #ERROR! and the lead would be uncallable. It is also a
 * security hole, because anyone can type anything into a public form, so a
 * name of "=IMPORTXML(...)" would execute inside this spreadsheet.
 *
 * A leading apostrophe forces text. It is neither stored nor displayed.
 */
function safeCell(value) {
  if (value === null || value === undefined) return '';

  // Dates and numbers are already safe and must keep their type, or a real
  // date would be flattened into a long unsortable string.
  if (typeof value !== 'string') return value;

  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}


/**
 * Turns whatever the student typed into a clickable wa.me link. Handles
 * "9876543210", "+91 98765 43210", "09876543210" and "919876543210".
 * Returns '' rather than a broken link when the number is not usable.
 */
function waLink(phone) {
  var d = String(phone === null || phone === undefined ? '' : phone).replace(/\D/g, '');

  if (d.length === 10) {
    d = '91' + d;
  } else if (d.length === 11 && d.charAt(0) === '0') {
    d = '91' + d.substring(1);
  }

  // Anything that is not a plain Indian mobile is left alone rather than
  // guessed at. A wrong wa.me link looks fine and silently goes nowhere.
  if (d.length !== 12 || d.substring(0, 2) !== '91') return '';

  return 'https://wa.me/' + d;
}


function doPost(e) {
  // Two enquiries in the same instant could otherwise both decide the sheet is
  // empty and both write a header row.
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);

    var payload = (e.postData && e.postData.contents)
      ? JSON.parse(e.postData.contents)
      : (e.parameter || {});

    var sheet = getSheet();

    sheet.appendRow(COLUMNS.map(function (col) {
      if (col.wa) return waLink(payload.phone);
      if (col.key) return safeCell(payload[col.key]);
      return col.value;
    }));

    return json({ ok: true });

  } catch (err) {
    // Never surface an error to the visitor: the email path already delivered
    // the lead. Log it instead. Executions in the left sidebar shows these.
    console.error('LIMRA lead collector failed: ' + err);
    return json({ ok: false, error: String(err) });

  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}


function doGet() {
  return ContentService.createTextOutput('LIMRA lead collector is running.');
}


function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function getSheet() {
  if (!SHEET_ID || SHEET_ID.indexOf('PASTE') === 0) {
    throw new Error('SHEET_ID is not set. See the notes at the top.');
  }

  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  if (sheet.getLastRow() === 0) setupSheet();
  return sheet;
}


/* ==========================================================================
   One-time formatting
   ========================================================================== */

/**
 * Lays out the sheet so it reads as a work queue rather than a data dump.
 * Safe to re-run: every step overwrites rather than appends.
 *
 * WARNING: this writes the header row from COLUMNS. If the sheet already
 * holds leads written under a DIFFERENT column order, re-running this will
 * mislabel those existing columns. Reorder COLUMNS only against an empty
 * sheet, or move the old rows out first.
 */
function setupSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheets()[0];
  var n = COLUMNS.length;

  sheet.setName('Leads');

  // --- header -------------------------------------------------------------
  sheet.getRange(1, 1, 1, n).setValues([COLUMNS.map(function (c) { return c.header; })]);
  sheet.getRange(1, 1, 1, n)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1f2a44')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  // Keep the date and the status on screen while reading across.
  sheet.setFrozenColumns(2);

  // --- widths -------------------------------------------------------------
  var widths = {
    1: 130,  // Received
    2: 130,  // Status
    3: 110,  // Owner
    4: 120,  // Next action on
    5: 280,  // Notes
    6: 180,  // Name
    7: 140,  // Phone
    8: 110,  // WhatsApp
    9: 220,  // University
    10: 110, // City
    11: 110, // Intake
    12: 210, // Email
    13: 80   // Consent
  };
  for (var c in widths) sheet.setColumnWidth(Number(c), widths[c]);

  // --- formats ------------------------------------------------------------
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('dd-mmm-yyyy hh:mm');
  sheet.getRange(2, 4, sheet.getMaxRows() - 1, 1).setNumberFormat('dd-mmm-yyyy');
  sheet.getRange(2, 5, sheet.getMaxRows() - 1, 1).setWrap(true);
  sheet.getRange(2, 7, sheet.getMaxRows() - 1, 1).setNumberFormat('@'); // phone as text

  // --- status dropdown ----------------------------------------------------
  sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true)
      .setAllowInvalid(false)
      .setHelpText('Pick a status from the list.')
      .build()
  );

  // --- colour rules -------------------------------------------------------
  // Order matters: the first rule that matches a cell wins.
  var body = sheet.getRange(2, 1, sheet.getMaxRows() - 1, 13);
  var due  = sheet.getRange(2, 4, sheet.getMaxRows() - 1, 1);

  sheet.setConditionalFormatRules([
    // Won.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$B2="Converted"')
      .setBackground('#e6f4ea').setRanges([body]).build(),

    // Closed out, so it should fade rather than shout.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR($B2="Not interested",$B2="Wrong number")')
      .setBackground('#f1f3f4').setFontColor('#80868b').setRanges([body]).build(),

    // Not yet called. This is the queue.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$B2="New"')
      .setBackground('#fff4e5').setRanges([body]).build(),

    // Follow-up date has passed and the lead is still open.
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($D2<>"",$D2<TODAY(),$B2<>"Converted",$B2<>"Not interested",$B2<>"Wrong number")')
      .setBackground('#fce8e6').setFontColor('#c5221f').setBold(true).setRanges([due]).build()
  ]);

  // --- filter -------------------------------------------------------------
  // So the team can narrow to one university, one status, or one owner.
  var existing = sheet.getFilter();
  if (existing) existing.remove();
  sheet.getRange(1, 1, sheet.getMaxRows(), n).createFilter();

  // --- hide the advertising columns ---------------------------------------
  // Still there, still filled in, just not in the way of a phone call.
  sheet.hideColumns(ADS_FIRST_COL, ADS_COL_COUNT);

  SpreadsheetApp.flush();
  Logger.log('Sheet formatted: %s columns, %s statuses, ad columns %s to %s hidden.',
             n, STATUSES.length, ADS_FIRST_COL, ADS_FIRST_COL + ADS_COL_COUNT - 1);
}


/**
 * The column order used before the sheet was reorganised into a work queue.
 * Kept only so migrateFromOldLayout can read those rows.
 */
var OLD_HEADERS = [
  'submitted_at', 'college', 'name', 'phone', 'email', 'city', 'intake',
  'consent', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
  'utm_content', 'referrer', 'landed_at', 'page_url'
];


/**
 * Rewrites leads captured under OLD_HEADERS into the current COLUMNS order,
 * then applies the new formatting. Run this ONCE, and only on a sheet that
 * still carries the old header row.
 *
 * It reads everything into memory first and only then clears the sheet, so a
 * failure partway through leaves the original rows untouched.
 */
function migrateFromOldLayout() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
  var last = sheet.getLastRow();

  if (last === 0) { setupSheet(); return; }

  var head = sheet.getRange(1, 1, 1, 2).getValues()[0];
  if (String(head[0]).trim() !== 'submitted_at') {
    throw new Error(
      'Header does not look like the old layout (found "' + head[0] +
      '"). Nothing changed. If the sheet is already migrated, run setupSheet.'
    );
  }

  var rows = [];
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, OLD_HEADERS.length).getValues()
      .forEach(function (r) {
        var lead = {};
        OLD_HEADERS.forEach(function (h, i) { lead[h] = r[i]; });

        rows.push(COLUMNS.map(function (col) {
          if (col.wa) return waLink(lead.phone);
          if (col.key) return safeCell(lead[col.key]);
          // Existing leads have already been worked on or not; start them in
          // the queue rather than inventing a status.
          return col.value;
        }));
      });
  }

  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.clear();

  setupSheet();

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, COLUMNS.length).setValues(rows);
  }

  SpreadsheetApp.flush();
  Logger.log('Migrated %s existing lead(s) into the new layout.', rows.length);
}


/**
 * Writes one clearly marked row so you can see the layout before any real
 * lead arrives. Delete the row afterwards.
 */
function testConnection() {
  doPost({ postData: { contents: JSON.stringify({
    submitted_at: new Date().toISOString(),
    college: 'TEST ROW - delete me',
    name: 'Test from the Apps Script editor',
    phone: '+91 98765 43210',
    email: 'test@example.com',
    city: 'Chennai',
    intake: '2026 intake',
    consent: 'yes'
  }) } });
  Logger.log('Wrote a test row. Delete it before going live.');
}
