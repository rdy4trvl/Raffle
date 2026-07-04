// ===== CONFIG =====
// Paste the Apps Script web app URL here after you deploy it.
// It looks like: https://script.google.com/macros/s/AKfyc.../exec
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxcPp6Imy_yRCZU-GnfoyvV9w3a2xcxOmRMIl_Qh_SUcNH1fqlxaEbVZqomKcbYNnSEtw/exec";
const GEOLOOKUP_URLS = [
  "https://ipwho.is/",
  "https://get.geojs.io/v1/ip/geo.json",
];
const GEOLOOKUP_TIMEOUT_MS = 2500;
const LOCATION_ANCHORS = [
  { label: "Death Ride", latitude: 39.5296, longitude: -119.8138 },
  { label: "Mill Valley", latitude: 37.906, longitude: -122.545 },
];

// ===== DOM =====
const form = document.getElementById("raffleForm");
const sending = document.getElementById("sending");
const success = document.getElementById("success");
const errorMsg = document.getElementById("errorMsg");
const submitBtn = document.getElementById("submitBtn");

// ===== Validation =====
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function showError(msg) {
  errorMsg.textContent = msg;
}

function clearError() {
  errorMsg.textContent = "";
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
  const geoLatitude = toCoordinate(latitude);
  const geoLongitude = toCoordinate(longitude);

  if (geoLatitude === null || geoLongitude === null) return "Unknown";

  return LOCATION_ANCHORS
    .map((anchor) => ({
      label: anchor.label,
      distance: distanceMiles(geoLatitude, geoLongitude, anchor.latitude, anchor.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)[0].label;
}

async function fetchGeoLookup(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOLOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const geo = await res.json();
    if (geo.success === false) return null;

    const geoCity = String(geo.city || "").trim();
    const geoRegion = String(geo.region || "").trim();
    const geoCountry = String(geo.country_name || geo.country || "").trim();
    const geoLatitude = toCoordinate(geo.latitude);
    const geoLongitude = toCoordinate(geo.longitude);
    if (!geoCity && !geoRegion && !geoCountry) return null;

    return {
      geoCity,
      geoRegion,
      geoCountry,
      geoLatitude,
      geoLongitude,
      locationLabel: deriveLocationLabel(geoLatitude, geoLongitude),
    };
  } catch (err) {
    console.warn("IP geolocation lookup failed:", url, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getGeoData() {
  const fallback = {
    geoCity: "",
    geoRegion: "",
    geoCountry: "",
    geoLatitude: null,
    geoLongitude: null,
    locationLabel: "Unknown",
  };

  for (const url of GEOLOOKUP_URLS) {
    const geoData = await fetchGeoLookup(url);
    if (geoData) return geoData;
  }

  return fallback;
}

// ===== Submit handler =====
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  // Read the selected radio safely - returns null if nothing picked
  const riddenChoice = form.querySelector('input[name="ridden"]:checked');

  const data = {
    firstName: form.firstName.value.trim(),
    lastName:  form.lastName.value.trim(),
    email:     form.email.value.trim().toLowerCase(),
    ridden:    riddenChoice ? riddenChoice.value : "",
  };

  // Client-side validation (the server validates again)
  if (!data.firstName || !data.lastName) {
    showError("Please enter your first and last name.");
    return;
  }
  if (!EMAIL_RE.test(data.email)) {
    showError("Please enter a valid email address.");
    return;
  }
  if (!data.ridden) {
    showError("Please tell us if you've ridden before.");
    return;
  }

  // Swap to "sending" state
  form.classList.add("hidden");
  sending.classList.remove("hidden");
  submitBtn.disabled = true;

  try {
    Object.assign(data, await getGeoData());

    // Apps Script web apps accept simple POSTs. We send as text/plain
    // to avoid a CORS preflight (Apps Script doesn't handle OPTIONS well).
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (result.ok) {
      sending.classList.add("hidden");
      success.classList.remove("hidden");
    } else {
      throw new Error(result.error || "Something went wrong.");
    }
  } catch (err) {
    sending.classList.add("hidden");
    form.classList.remove("hidden");
    submitBtn.disabled = false;
    showError("Couldn't submit. Please try again, or ask a volunteer.");
    console.error(err);
  }
});
