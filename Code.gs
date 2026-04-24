/**
 * Marin Century 2026 Raffle – Apps Script backend
 *
 * WHAT THIS DOES
 *   - Receives form submissions from the GitHub Pages site
 *   - Writes each entry to the bound Google Sheet
 *   - Sends a confirmation email (from the account running the script)
 *
 * DEPLOY
 *   1. Open your Google Sheet -> Extensions -> Apps Script.
 *   2. Paste this file in as Code.gs and save.
 *   3. Deploy -> New deployment -> type: Web app.
 *        Execute as: Me (doug@marincyclists.com)
 *        Who has access: Anyone
 *      Copy the /exec URL into app.js (SCRIPT_URL).
 *   4. If you later edit this script, use Deploy -> Manage deployments
 *      -> edit the existing one and bump the version (so the URL doesn't change).
 */

// ===== CONFIG =====
const SHEET_NAME     = "Entries";
const DISCOUNT_CODE  = "MC2026-RAFFLE";   // same code for everyone
const FROM_NAME      = "Marin Century";
const REPLY_TO       = "doug@marincyclists.com";
const EMAIL_SUBJECT  = "You're entered — Marin Century 2026 raffle";

// Column order. Change here and the script follows.
const COLUMNS = [
  "timestamp",
  "first_name",
  "last_name",
  "email",
  "ridden_before",
  "marketing_consent",
  "email_sent",
  "user_agent",
];

// ===== Entry point =====
function doPost(e) {
  // Serialise concurrent submissions so two rows can't collide.
  // 10-second wait is plenty for a booth-scale load.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = JSON.parse(e.postData.contents);

    // Server-side validation (never trust the client)
    const err = validate(data);
    if (err) return jsonOut({ ok: false, error: err });

    const sheet = getSheet();

    // Write the row first, email second. If email fails we still have the entry.
    const timestamp = new Date();
    const row = [
      timestamp,
      data.firstName,
      data.lastName,
      data.email,
      data.ridden,
      data.marketingConsent || "no",
      false,                 // email_sent, updated below
      (e.parameter && e.parameter.ua) || "",
    ];
    sheet.appendRow(row);
    const rowNum = sheet.getLastRow();

    // Send confirmation email
    let emailOk = false;
    try {
      sendConfirmation(data);
      emailOk = true;
    } catch (mailErr) {
      console.error("Email send failed:", mailErr);
    }

    // Mark email_sent column (index is 1-based in Sheets API)
    const emailSentCol = COLUMNS.indexOf("email_sent") + 1;
    sheet.getRange(rowNum, emailSentCol).setValue(emailOk);

    return jsonOut({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonOut({ ok: false, error: "Server error." });
  } finally {
    lock.releaseLock();
  }
}

// GET just for sanity-checking the deployment in a browser
function doGet() {
  return jsonOut({ ok: true, message: "Marin Century raffle endpoint is live." });
}

// ===== Helpers =====
function validate(d) {
  if (!d) return "No data received.";
  if (!d.firstName || !d.lastName) return "Name is required.";
  if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "Invalid email.";
  if (d.ridden !== "yes" && d.ridden !== "no") return "Please answer the riding question.";
  return null;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sendConfirmation(d) {
  const body =
`Hi ${d.firstName},

You're entered in the Marin Century 2026 drawing to win a free entry to the Marin Century on Saturday, August 1, 2026.

A random drawing will determine the winner. The winner will be notified by email and will have five days to respond.

As a thank-you for entering, here's a discount code you can use to register now:

    ${DISCOUNT_CODE}

Safe Riding,
Marin Cyclists
https://marincentury.com?utm_source=dh_wcc&utm_medium=email&utm_campaign=2026mc&utm_content=2026_05_02_wcc_confirm

---
You are receiving this email because you entered the Marin Century free entry drawing. Future marketing emails will include an unsubscribe link.
`;

  MailApp.sendEmail({
    to: d.email,
    subject: EMAIL_SUBJECT,
    body: body,
    name: FROM_NAME,
    replyTo: REPLY_TO,
  });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
