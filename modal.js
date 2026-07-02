// modal.js — ALL on-page UI lives here (the "Track this meeting?" dialog and
// the little toast). content.js contains no DOM code; it just calls into this.
//
// Exposes on the shared content-script scope:
//   window.MTTModal.prompt(onChosen)  -> shows Track? -> name; calls onChosen(name)
//   window.MTTModal.toast(message)    -> brief on-screen confirmation

(() => {
  let ov = null; // { bg, card }
  const btn = (bg) =>
    `cursor:pointer;border:0;border-radius:8px;padding:8px 16px;color:#fff;font-weight:600;background:${bg}`;

  function openModal() {
    const bg = document.createElement("div");
    bg.id = "mtt-overlay";
    bg.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647",
      "background:rgba(15,23,42,.55)", "display:flex",
      "align-items:center", "justify-content:center",
      "font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
    ].join(";");
    const card = document.createElement("div");
    card.style.cssText = [
      "background:#1f2933", "color:#fff", "padding:22px", "border-radius:16px",
      "min-width:300px", "max-width:340px", "box-shadow:0 20px 60px rgba(0,0,0,.5)"
    ].join(";");
    bg.appendChild(card);
    document.body.appendChild(bg);
    ov = { bg, card };
  }

  function closeModal() {
    if (ov) { ov.bg.remove(); ov = null; }
  }

  // Step 1: Track this meeting? Yes/No
  function stepTrack(onChosen) {
    openModal();
    ov.card.innerHTML =
      '<div style="font-size:15px;margin-bottom:16px">⏱️ Track the time of this meeting?</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      `<button id="mtt-yes" style="${btn("#3ba55d")}">Yes</button>` +
      `<button id="mtt-no" style="${btn("#4b5563")}">No</button></div>`;
    ov.card.querySelector("#mtt-no").onclick = () => closeModal(); // exit, nothing runs
    ov.card.querySelector("#mtt-yes").onclick = () =>
      chrome.storage.local.get({ recentNames: [] }, (r) => stepName(r.recentNames.slice(0, 3), onChosen));
  }

  // Step 2: pick a recent name (one click) or type a new one
  function stepName(recent, onChosen) {
    const chips = recent
      .map((n, i) =>
        `<button class="mtt-chip" data-i="${i}" style="${btn("#374151")};margin:0 6px 8px 0">${escapeHtml(n)}</button>`)
      .join("");
    ov.card.innerHTML =
      '<div style="font-size:15px;margin-bottom:12px">Which meeting is this?</div>' +
      (recent.length ? `<div style="margin-bottom:6px">${chips}</div>` : "") +
      '<input id="mtt-name" placeholder="Type a meeting name" ' +
      'style="width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:0;margin-bottom:14px;font:14px system-ui">' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      `<button id="mtt-start" style="${btn("#3ba55d")}">Start tracking</button>` +
      `<button id="mtt-cancel" style="${btn("#4b5563")}">Cancel</button></div>`;

    const input = ov.card.querySelector("#mtt-name");
    input.focus();
    ov.card.querySelectorAll(".mtt-chip").forEach((c) => {
      c.onclick = () => choose(recent[+c.dataset.i], onChosen);
    });
    ov.card.querySelector("#mtt-cancel").onclick = () => closeModal();
    ov.card.querySelector("#mtt-start").onclick = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      choose(name, onChosen);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ov.card.querySelector("#mtt-start").click();
    });
  }

  function choose(name, onChosen) {
    closeModal();          // clean screen — only the meeting
    onChosen(name);        // hand the name back to content.js
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:#111;color:#fff;padding:8px 14px;border-radius:10px;font:13px system-ui";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Expose the small API to content.js (same isolated world / shared scope).
  window.MTTModal = { prompt: stepTrack, toast };
})();
