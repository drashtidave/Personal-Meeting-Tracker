// background.js  (v2)
// The in-progress session is stored in chrome.storage.local under a per-tab key
// ("session_<tabId>") so it SURVIVES the MV3 service worker being shut down
// during a long meeting. On leave (or tab close) we read it back, write the row,
// and DELETE the session key immediately — so storage never accumulates.
//
// "pending" holds finished rows not yet written to the Sheet; they're removed on
// a confirmed write. "recentNames" (the name picker list) is kept permanently.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id; // popup messages have no tab

  if (msg.type === "START" && tabId != null) {
    startSession(tabId, msg);   // persist to storage (survives worker restart)
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
  finalize(tabId, Date.now()); // closed tab while in call; finalize checks storage
});

chrome.runtime.onStartup.addListener(() => { flushPending(); cleanupStaleSessions(); });
chrome.runtime.onInstalled.addListener(() => { flushPending(); cleanupStaleSessions(); });

// Save the join info to storage so a killed/restarted worker can still finalize.
async function startSession(tabId, msg) {
  await set({ ["session_" + tabId]: { platform: msg.platform, name: msg.name, joinTime: msg.joinTime } });
  rememberName(msg.name); // name kept permanently for the picker
}

async function finalize(tabId, leaveTime) {
  const key = "session_" + tabId;
  const s = (await get({ [key]: null }))[key];
  if (!s) return;               // no session for this tab (already finalized, etc.)
  await remove(key);            // clean up the session immediately — no leftover

  const start = new Date(s.joinTime);
  const end = new Date(leaveTime);
  const record = {
    name: s.name,
    date: start.toLocaleDateString(),
    start: start.toLocaleTimeString(),
    end: end.toLocaleTimeString(),
    duration: Math.max(0, Math.round((leaveTime - s.joinTime) / 60000)),
    y: start.getFullYear(),
    m: start.getMonth() + 1,
    d: start.getDate()
  };

  await push("pending", record); // buffer the finished row (survives a crash)
  refreshBadge();
  await flushPending();          // write to Sheet, remove from pending on success
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
    pending: stillPending, // synced rows are now gone from Chrome storage
    lastResult: stillPending.length
      ? `Synced ${synced}, ${stillPending.length} still queued`
      : `Synced ${synced} ✓ (cleared from Chrome)`
  });
  refreshBadge();
}

// Safety net: delete any session keys older than 24h (a crash could orphan one).
// 24h is safe — no real meeting lasts that long, so this never touches an
// ongoing call whose worker merely restarted.
async function cleanupStaleSessions() {
  const all = await get(null);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stale = Object.keys(all).filter(
    (k) => k.startsWith("session_") && all[k] && all[k].joinTime < cutoff);
  if (stale.length) await new Promise((res) => chrome.storage.local.remove(stale, res));
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
function remove(key) { return new Promise((res) => chrome.storage.local.remove(key, res)); }
async function push(key, item) {
  const cur = (await get({ [key]: [] }))[key];
  cur.push(item);
  return set({ [key]: cur });
}