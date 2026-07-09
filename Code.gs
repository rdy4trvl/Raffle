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
const FROM_NAME      = "Marin Century";
const REPLY_TO       = "doug@marincyclists.com";
const EMAIL_SUBJECT  = "You're entered — Marin Century 2026 raffle";
const REGISTRATION_URL = "https://marincentury.com/?utm_source=qr&utm_medium=email_confirm&utm_campaign=7_11_boths&utm_content=drawing&registrants.source=source%3Aqr%7Cmedium%3Aemail_confirm%7Ccampaign%3A7_11_boths%7Ccontent%3Adrawing";
const DEFAULT_DISCOUNT_CODE = "MC2026-RAFFLE";
const DISCOUNT_CODES_BY_LOCATION = {
  "Death Ride": "MRNCENT26DR",
  "Mill Valley": "MRNCENT26MVS",
};

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
  "geo_city",
  "geo_region",
  "geo_country",
  "location_label",
];
const LOCATION_ANCHORS = [
  { label: "Death Ride", latitude: 39.5296, longitude: -119.8138 },
  { label: "Mill Valley", latitude: 37.906, longitude: -122.545 },
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
    const geo = normalizeGeoData(data);

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
      geo.city,
      geo.region,
      geo.country,
      geo.locationLabel,
    ];
    sheet.appendRow(row);
    const rowNum = sheet.getLastRow();

    // Send confirmation email
    let emailOk = false;
    try {
      sendConfirmation(data, geo);
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

function normalizeGeoData(d) {
  const city = cleanText(d.geoCity);
  const region = cleanText(d.geoRegion);
  const country = cleanText(d.geoCountry);
  const latitude = toCoordinate(d.geoLatitude);
  const longitude = toCoordinate(d.geoLongitude);

  return {
    city: city,
    region: region,
    country: country,
    locationLabel: deriveLocationLabel(latitude, longitude),
  };
}

function toCoordinate(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function distanceMiles(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const earthRadiusMiles = 3958.8;
  const degreesToRadians = Math.PI / 180;
  const fromLatRad = fromLatitude * degreesToRadians;
  const toLatRad = toLatitude * degreesToRadians;
  const deltaLatRad = (toLatitude - fromLatitude) * degreesToRadians;
  const deltaLonRad = (toLongitude - fromLongitude) * degreesToRadians;
  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(fromLatRad) * Math.cos(toLatRad) *
    Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deriveLocationLabel(latitude, longitude) {
  if (latitude === null || longitude === null) return "Unknown";

  return LOCATION_ANCHORS
    .map((anchor) => ({
      label: anchor.label,
      distance: distanceMiles(latitude, longitude, anchor.latitude, anchor.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)[0].label;
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 100);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  } else {
    ensureColumns(sheet);
  }
  return sheet;
}

function ensureColumns(sheet) {
  if (sheet.getLastRow() === 0 || (sheet.getLastRow() === 1 && sheet.getLastColumn() === 1 && !sheet.getRange(1, 1).getValue())) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.setFrozenRows(1);
    return;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headerRange = sheet.getRange(1, 1, 1, lastColumn);
  const headers = headerRange.getValues()[0];
  let nextColumn = headers.length + 1;

  COLUMNS.forEach((column) => {
    if (headers.indexOf(column) === -1) {
      sheet.getRange(1, nextColumn).setValue(column);
      headers.push(column);
      nextColumn += 1;
    }
  });

  sheet.setFrozenRows(1);
}

function getDiscountCode(locationLabel) {
  return DISCOUNT_CODES_BY_LOCATION[locationLabel] || DEFAULT_DISCOUNT_CODE;
}

function sendConfirmation(d, geo) {
  const discountCode = getDiscountCode(geo && geo.locationLabel);
  const body =
`Hi ${d.firstName},

You're entered in the Marin Century 2026 drawing to win a free entry to the Marin Century on Saturday, August 1, 2026.

A random drawing will determine the winner. The winner will be notified by email and will have five days to respond.

As a thank-you for entering, here's a discount code you can use to register now:

    ${discountCode}

Register Here:
${REGISTRATION_URL}

Safe Riding,
Marin Cyclists

---
You are receiving this email because you entered the Marin Century free entry drawing. Future marketing emails will include an unsubscribe link.
`;

  const htmlBody =
`<p>Hi ${escapeHtml(d.firstName)},</p>

<p>You're entered in the Marin Century 2026 drawing to win a free entry to the Marin Century on Saturday, August 1, 2026.</p>

<p>A random drawing will determine the winner. The winner will be notified by email and will have five days to respond.</p>

<p>As a thank-you for entering, here's a discount code you can use to register now:</p>

<p style="margin-left: 24px;">${discountCode}</p>

<p><a href="${REGISTRATION_URL}">Register Here</a></p>

<p>Safe Riding,<br>
Marin Cyclists</p>

<hr>
<p>You are receiving this email because you entered the Marin Century free entry drawing. Future marketing emails will include an unsubscribe link.</p>`;

  MailApp.sendEmail({
    to: d.email,
    subject: EMAIL_SUBJECT,
    body: body,
    htmlBody: htmlBody,
    name: FROM_NAME,
    replyTo: REPLY_TO,
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
