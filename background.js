// background.js  (v2)
// Every finished meeting is FIRST buffered in chrome.storage.local ("pending"),
// then written to your Google Sheet. On a confirmed write it is REMOVED from
// storage. So local storage only ever holds not-yet-synced meetings.
// The meeting NAME list ("recentNames") is kept permanently and never cleared.

const active = {}; // tabId -> { platform, name, joinTime }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id; // popup messages have no tab

  if (msg.type === "START" && tabId != null) {
    active[tabId] = { platform: msg.platform, name: msg.name, joinTime: msg.joinTime };
    rememberName(msg.name);                 // name kept permanently
    return;
  }
  if (msg.type === "END" && tabId != null) {
    finalize(tabId, msg.leaveTime);
    return;
  }
  if (msg.type === "FLUSH") { flushPending().then(() => sendResponse(true)); return true; }
  if (msg.type === "STATUS") {
    chrome.storage.local.get({ pending: [], lastResult: "" }, (r) =>
      sendResponse({ pending: r.pending.length, lastResult: r.lastResult }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (active[tabId]) finalize(tabId, Date.now()); // closed tab while in call
});
chrome.runtime.onStartup.addListener(flushPending);
chrome.runtime.onInstalled.addListener(flushPending);

async function finalize(tabId, leaveTime) {
  const s = active[tabId];
  if (!s) return;
  delete active[tabId];

  const start = new Date(s.joinTime);
  const end = new Date(leaveTime);
  const record = {
    name: s.name,        // readable string (column B)
    start: start.toLocaleTimeString(),
    end: end.toLocaleTimeString(),
    duration: Math.max(0, Math.round((leaveTime - s.joinTime) / 60000)),
    // Date parts for a REAL date value (column F) — sent as parts so the
    // Apps Script can build a timezone-safe Date that Sheets treats as a date.
    y: start.getFullYear(),
    m: start.getMonth() + 1,
    d: start.getDate()
  };

  await push("pending", record); // 1) buffer in Chrome storage (survives a crash)
  refreshBadge();
  await flushPending();          // 2) write to Sheet, remove on success
}

// Try to write every buffered row; keep only the ones that fail.
async function flushPending() {
  const cfg = await get({ webAppUrl: "", secret: "", pending: [] });
  if (!cfg.pending.length) { refreshBadge(); return; }
  if (!cfg.webAppUrl) {
    await set({ lastResult: "Saved locally — Sheet not configured yet" });
    refreshBadge();
    return;
  }
  const stillPending = [];
  let synced = 0;
  for (const rec of cfg.pending) {
    const ok = await postRow(cfg.webAppUrl, cfg.secret, rec);
    if (ok) synced++; else stillPending.push(rec);
  }
  await set({
    pending: stillPending, // 3) synced rows are now gone from Chrome storage
    lastResult: stillPending.length
      ? `Synced ${synced}, ${stillPending.length} still queued`
      : `Synced ${synced} ✓ (cleared from Chrome)`
  });
  refreshBadge();
}

// POST one row. text/plain avoids a CORS preflight; host_permissions let the
// service worker read the Apps Script response.
async function postRow(url, secret, record) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, ...record })
    });
    const json = JSON.parse(await res.text());
    return json && json.ok === true;
  } catch (e) {
    return false;
  }
}

async function rememberName(name) {
  const { recentNames } = await get({ recentNames: [] });
  const next = [name, ...recentNames.filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 8);
  await set({ recentNames: next });
}

function refreshBadge() {
  chrome.storage.local.get({ pending: [] }, (r) => {
    chrome.action.setBadgeText({ text: r.pending.length ? String(r.pending.length) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
  });
}

// tiny promise helpers
function get(defaults) { return new Promise((res) => chrome.storage.local.get(defaults, res)); }
function set(obj) { return new Promise((res) => chrome.storage.local.set(obj, res)); }
async function push(key, item) {
  const cur = (await get({ [key]: [] }))[key];
  cur.push(item);
  return set({ [key]: cur });
}
