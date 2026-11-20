"use strict";
// Runs on claude.ai/settings/*. Reads the number shown on the page, and (optionally) clicks the page's own refresh button
// every few minutes, because the page does not update itself while it stays open.
(function () {
  let seenUsagePage = false, timer = 0;

  function send(r) {
    try { chrome.runtime.sendMessage({ type: "reading", ...r }); } catch (e) { /* extension was reloaded: this tab needs a refresh */ }
  }
  function scan() {
    const r = window.CUP_parse(document);
    if (r.ok || r.candidates.length) seenUsagePage = true;
    if (seenUsagePage) send(r);   // stay silent on settings pages that have nothing to do with usage
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(scan, 1500); };

  new MutationObserver(later).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  setTimeout(scan, 1200);
  setInterval(scan, 30000);

  // Auto refresh: click the page's own refresh control; fall back to reloading the tab only if there is none.
  function refresh() {
    if (!seenUsagePage) return;
    const btn = [...document.querySelectorAll("button,[role=button]")].find(b =>
      /refresh|刷新|reload/i.test((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "")));
    if (btn) btn.click(); else location.reload();
  }
  let rt = 0;
  function arm(min) {
    clearInterval(rt);
    if (min > 0) rt = setInterval(refresh, Math.max(1, min) * 60000);
  }
  chrome.storage.local.get({ refreshMin: 3 }, v => arm(v.refreshMin));
  chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c.refreshMin) arm(c.refreshMin.newValue); });
})();
