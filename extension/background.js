"use strict";
importScripts("gist.js");

// State lives in chrome.storage.local because the service worker is stopped and restarted at will.
//   token, gistId        sync target
//   lastSent             last page value we wrote (we only write when the page value CHANGES, so manual +/- in the planner is not overwritten)
//   status               what the popup shows
const get = k => chrome.storage.local.get(k);
const set = o => chrome.storage.local.set(o);

function badge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

let queue = Promise.resolve();  // handle readings one at a time so two tabs cannot interleave writes

async function onReading(m) {
  const { token, gistId, lastSent } = await get(["token", "gistId", "lastSent"]);
  const at = Date.now();
  if (!m.ok) {
    await set({ status: { ok: false, at, msg: m.reason, candidates: m.candidates } });
    badge("?", "#b45309");
    return;
  }
  const info = { used: m.used, label: m.label, reset: m.reset, candidates: m.candidates };
  if (!token) { await set({ status: { ok: false, at, msg: "还没填 GitHub 令牌", ...info } }); badge("!", "#b91c1c"); return; }
  if (lastSent === m.used) {  // unchanged: just refresh the "last seen" time
    await set({ status: { ok: true, at, msg: "已同步（数字没变）", ...info } });
    badge(String(Math.round(m.used)), "#15803d");
    return;
  }
  try {
    const id = await CUP_gist.pushUsed(fetch, token, gistId, m.used, Date.now());
    await set({ gistId: id, lastSent: m.used, status: { ok: true, at, msg: "已写入 Gist", ...info } });
    badge(String(Math.round(m.used)), "#15803d");
  } catch (e) {
    const code = String(e.message);
    const msg = code === "http-401" || code === "http-403" ? "令牌无效或没有 gist 权限" : "写入失败：" + code;
    await set({ status: { ok: false, at, msg, ...info } });
    badge("!", "#b91c1c");
  }
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m && m.type === "reading") { queue = queue.then(() => onReading(m)).catch(() => {}).then(() => reply({})); return true; }
});
// If the token changes, forget the cached gist and force a rewrite on the next reading.
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.token) chrome.storage.local.remove(["gistId", "lastSent"]);
});
