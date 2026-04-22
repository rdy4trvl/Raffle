// ===== CONFIG =====
// Paste the Apps Script web app URL here after you deploy it.
// It looks like: https://script.google.com/macros/s/AKfyc.../exec
const SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

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

// ===== Submit handler =====
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const data = {
    firstName: form.firstName.value.trim(),
    lastName:  form.lastName.value.trim(),
    email:     form.email.value.trim().toLowerCase(),
    confirmEmail: form.confirmEmail.value.trim().toLowerCase(),
    ridden:    form.ridden.value,
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
  if (data.email !== data.confirmEmail) {
    showError("The two email addresses don't match.");
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
