"use strict";
const $ = id => document.getElementById(id);
function show(v) {
  const st = v.status, box = $("st");
  if (!st) { box.className = "st warn"; box.textContent = "还没读到数据。请在浏览器里打开 claude.ai 的用量页（设置 → 用量），保持这个标签页开着（可固定标签页）。"; }
  else {
    const t = new Date(st.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    box.className = "st " + (st.ok ? "ok" : (st.used == null ? "warn" : "bad"));
    box.textContent = (st.used != null ? `每周已用 ${st.used}%　` : "") + `${st.msg}（${t}）`;
  }
  $("tok").placeholder = v.token ? "令牌已保存（重新粘贴可更换）" : "粘贴令牌";
  $("diag").textContent = st ? JSON.stringify({ msg: st.msg, used: st.used, label: st.label, reset: st.reset, candidates: st.candidates }, null, 1) : "";
}
chrome.storage.local.get({ status: null, token: "", refreshMin: 3 }, v => { $("rm").value = v.refreshMin; show(v); });
chrome.storage.onChanged.addListener(() => chrome.storage.local.get({ status: null, token: "" }, show));
$("save").onclick = () => {
  const o = { refreshMin: Math.max(0, Math.min(60, parseInt($("rm").value, 10) || 0)) };
  const tk = $("tok").value.trim(); if (tk) o.token = tk;
  chrome.storage.local.set(o, () => { $("tok").value = ""; $("saved").textContent = "已保存"; });
};
