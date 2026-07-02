# Meeting Time Tracker — Setup

Appends **Meeting Name, Date, Start Time, End Time, Duration** to one
Google Sheet every time you finish a tracked call.

---

## Part A — Google Sheet + Apps Script (about 5 minutes, free)

1. Create a new Google Sheet (sheets.new). Name it anything.
2. In the Sheet: **Extensions → Apps Script**. Delete any starter code.
3. Paste the entire contents of **Code.gs** (in this folder) into the editor.
4. Change the `SECRET` line to any private phrase, e.g.
   `const SECRET = "purple-otter-4417";`  ← remember it, you'll need it in Part C.
5. Click **Deploy → New deployment**. Click the gear → choose **Web app**.
   - **Description:** anything
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Click **Deploy**. Approve the permission prompt (choose your account →
   Advanced → "Go to … (unsafe)" → Allow — this is your own script writing to
   your own Sheet).
7. Copy the **Web app URL**. It ends in `/exec`. Keep it for Part C.

> The row headers are created automatically on the first write. You never make
> new tabs — every meeting is appended under the same "Meetings" sheet.

## Part B — Load the extension

1. Go to `chrome://extensions`, turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this folder.
3. Pin it (puzzle icon → pin).

## Part C — Connect them

1. Click the extension icon.
2. Paste the **Web app URL** (from A7) and the **secret** (from A4). Both fields
   are masked (shown as dots).
3. Click **Save** — the button flips to **"Saved ✓"** and the fields collapse to
   a **Connected ✓** summary with an **Edit** link. Status shows "all synced".
   Use **Edit** any time to change them later.

---

## Using it

- Open a Meet/Zoom link. A dialog asks **Track this meeting?**
  - **No** → dialog closes, nothing else runs.
  - **Yes** → pick one of your 3 recent names or type a new one → **Start tracking**.
    The dialog disappears; your screen is clean.
- Join the call normally. Leaving the call (or closing the tab) saves the row
  and it appears in your Sheet within a second or two.
- The toolbar badge shows a number only if something is waiting to sync
  (e.g. you were offline). Click the icon → **Sync now** to retry.

---

## Addition test-  Verifying the Chrome memory (before / after a write)

Requirement: a meeting sits in Chrome storage only until it reaches the Sheet,
then it's removed — but the **name list stays**. Here's how to see it yourself.

1. Open `chrome://extensions`, find this extension, click **"service worker"**.
   A DevTools window opens. Go to the **Console** tab.
2. Run this to dump everything the extension has stored:
   ```js
   chrome.storage.local.get(null, d => console.log(JSON.parse(JSON.stringify(d))));
   ```

**Before the write** (temporarily disconnect Wi-Fi, do a short tracked meeting,
then leave it) you'll see the meeting sitting in `pending`:
```
{ pending: [ { name:"Standup", date:"…", start:"…", end:"…", duration:3 } ],
  recentNames: ["Standup", …], webAppUrl:"…", secret:"…" }
```

**After the write** (reconnect Wi-Fi, click the icon → **Sync now**, re-run the
dump) `pending` is empty but the name remains:
```
{ pending: [],
  recentNames: ["Standup", …], webAppUrl:"…", secret:"…" }
```

So: `pending` = not-yet-synced meetings (cleared once in the Sheet).
`recentNames` = your meeting names, kept permanently for the picker.

To wipe just the queue: `chrome.storage.local.set({ pending: [] })`.
To wipe everything the extension stores: `chrome.storage.local.clear()`.

---

## Notes / limits

- Works for Google Meet and Zoom **in the browser** (`app.zoom.us`). The Zoom
  **desktop app** can't be seen by a browser extension.
- Join/leave detection keys off the "Leave call" button in `content.js`
  (`detectInCall`). If Google restyles Meet and detection stops, that's the one
  function to update.
- Apps Script is free; a personal meeting load is far below Google's daily
  quotas.
- If the data does not show up on the first run try running from service-worker console
```javascript
chrome.storage.local.get({webAppUrl:"",secret:""}, async c => {
  try {
    const r = await fetch(c.webAppUrl, {method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify({secret:c.secret, name:"COLUMN_TEST",
        start:"09:00", end:"09:30", duration:30,
        y:2026, m:1, d:15})});
    console.log("HTTP:", r.status);
    console.log("BODY:", await r.text());
  } catch(e){ console.log("THREW:", e.message); }
});
```
