// popup.js (v2)
const $ = (id) => document.getElementById(id);
const urlEl = $("url"), secretEl = $("secret");
const formEl = $("form"), summaryEl = $("summary"), statusEl = $("status");
const saveBtn = $("save"), cancelBtn = $("cancelEdit");

let configured = false;

function showForm(isEditing) {
  formEl.classList.remove("hidden");
  summaryEl.classList.add("hidden");
  cancelBtn.style.display = isEditing ? "" : "none";
}
function showSummary() {
  formEl.classList.add("hidden");
  summaryEl.classList.remove("hidden");
}

// Load saved config and decide which view to show.
chrome.storage.local.get({ webAppUrl: "", secret: "" }, (r) => {
  urlEl.value = r.webAppUrl;
  secretEl.value = r.secret;
  configured = !!(r.webAppUrl && r.secret);
  configured ? showSummary() : showForm(false);
  refreshStatus();
});

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "STATUS" }, (s) => {
    if (!s) { statusEl.textContent = ""; return; }
    const pill = s.pending
      ? `<span class="pill">${s.pending} unsynced</span>`
      : `<span class="pill ok">all synced</span>`;
    statusEl.innerHTML = pill + (s.lastResult ? ` &nbsp; ${s.lastResult}` : "");
  });
}

saveBtn.addEventListener("click", () => {
  const url = urlEl.value.trim(), secret = secretEl.value.trim();
  if (!url || !secret) {
    statusEl.textContent = "Enter both the URL and the secret.";
    return;
  }
  chrome.storage.local.set({ webAppUrl: url, secret }, () => {
    // Visible confirmation: button flips, then collapses to summary.
    const original = saveBtn.textContent;
    saveBtn.textContent = "Saved ✓";
    saveBtn.disabled = true;
    configured = true;
    chrome.runtime.sendMessage({ type: "FLUSH" }, refreshStatus);
    setTimeout(() => {
      saveBtn.textContent = original;
      saveBtn.disabled = false;
      showSummary();
    }, 900);
  });
});

$("edit").addEventListener("click", () => showForm(true));
cancelBtn.addEventListener("click", () => { if (configured) showSummary(); });

$("sync").addEventListener("click", () => {
  statusEl.textContent = "Syncing…";
  chrome.runtime.sendMessage({ type: "FLUSH" }, refreshStatus);
});
