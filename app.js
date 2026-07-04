// ===== CONFIG =====
// Paste the Apps Script web app URL here after you deploy it.
// It looks like: https://script.google.com/macros/s/AKfyc.../exec
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxcPp6Imy_yRCZU-GnfoyvV9w3a2xcxOmRMIl_Qh_SUcNH1fqlxaEbVZqomKcbYNnSEtw/exec";
const GEOLOOKUP_URLS = [
  "https://ipwho.is/",
  "https://get.geojs.io/v1/ip/geo.json",
];
const GEOLOOKUP_TIMEOUT_MS = 2500;

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

function deriveLocationLabel(city) {
  const normalizedCity = String(city || "").trim().toLowerCase();

  if (normalizedCity === "reno") return "Reno";
  if (normalizedCity === "mill valley") return "Mill Valley";
  return "Unknown";
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
    if (!geoCity && !geoRegion && !geoCountry) return null;

    return {
      geoCity,
      geoRegion,
      geoCountry,
      locationLabel: deriveLocationLabel(geoCity),
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
