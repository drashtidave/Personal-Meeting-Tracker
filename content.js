// Model:
//  - MTTModal.prompt() asks: Track? -> name. On a name, startWith() runs.
//  - A timer checks the "Leave call" button every CHECK_MS seconds.
//  - Join  (inCall && !joined)  -> joined = true,  send START (new row).
//  - Leave (!inCall && joined)  -> joined = false, send END (saves the row),
//                                  and open a 1-minute rejoin window.
//  - Rejoin within the window   -> a NEW session -> another row.
//  - Window passes, no rejoin   -> stop the timer and go silent.
//  - Same-tab switch to a DIFFERENT meeting -> save the old one, then re-ask.

(() => {
  const platform = location.host.includes("zoom") ? "Zoom" : "Google Meet";

  function looksLikeMeeting() {
    if (platform === "Zoom") return location.pathname.includes("/wc/");
    return /\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(location.pathname);
  }
  if (!looksLikeMeeting()) return;

  // ---- tuning ----
  const CHECK_MS = 30000;          // check every 30 seconds
  const REJOIN_WINDOW_MS = 60000;  // wait up to 1 minute after leaving

  // ---- tracking state ----
  let intervalId = null;
  let joined = false;              // are we currently in the call?
  let meetingName = null;
  let trackedMeetingId = null;     // the meeting we agreed to track
  let leftAt = 0;                  // when we last left (0 = not waiting to rejoin)

  // The meeting's id from the URL — used to tell one meeting from another.
  function meetingId() {
    if (platform === "Zoom") return location.pathname;
    const m = location.pathname.match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/i);
    return m ? m[0] : location.pathname;
  }

  // Join/leave heuristic: presence of the "Leave call" button.
  function detectInCall() {
    const sel = [
      'button[aria-label*="Leave call" i]',
      'button[aria-label*="Leave" i]',
      '[data-tooltip*="Leave call" i]',
      '[aria-label="Leave call"]'
    ];
    return sel.some((s) => document.querySelector(s));
  }

  // Called by the modal once you've chosen a name.
  function startWith(name) {
    meetingName = name;
    trackedMeetingId = meetingId();     // remember which meeting we agreed to
    joined = false;
    leftAt = 0;
    if (!intervalId) intervalId = setInterval(check, CHECK_MS);
    check();                            // check now, don't wait 15s
    MTTModal.toast(`Will log “${name}” when you join ✓`);
  }

  // ---------- the x-second check ----------
  function check() {
    // Same-tab navigation to a DIFFERENT meeting: save the old one (if you were
    // joined), reset, and re-ask for the new meeting — like a fresh page load.
    if (meetingId() !== trackedMeetingId) {
      if (joined) {
        chrome.runtime.sendMessage({ type: "END", leaveTime: Date.now() });
        MTTModal.toast("Meeting time saved ✓");
      }
      joined = false;
      leftAt = 0;
      stopTracker();               // startWith() will arm a fresh timer on Yes
      MTTModal.prompt(startWith);  // ask again for the new meeting
      return;
    }

    const inCall = detectInCall();

    if (inCall && !joined) {
      // Joined for the first time, or rejoined within the window -> new row.
      joined = true;
      leftAt = 0;
      chrome.runtime.sendMessage({ type: "START", platform, name: meetingName, joinTime: Date.now() });
    } else if (!inCall && joined) {
      // Left -> save the row and start the 1-minute rejoin window.
      joined = false;
      leftAt = Date.now();
      chrome.runtime.sendMessage({ type: "END", leaveTime: Date.now() });
      MTTModal.toast("Meeting time saved ✓");
    } else if (!inCall && !joined && leftAt) {
      // Still waiting to see if you rejoin. Give up after 1 minute.
      if (Date.now() - leftAt >= REJOIN_WINDOW_MS) stopTracker();
    }
  }

  function stopTracker() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    leftAt = 0;
  }

  // Kick things off: ask whether to track this meeting.
  MTTModal.prompt(startWith);
})();
