"use strict";
// Claude Usage Planner: spreads the weekly quota across days.
// UI text is Chinese only (see I18N); code and comments are English.
// All data stays in this browser's localStorage. No network requests are made.

const DAY = 864e5;
const WEIGHTS = [1, 1, 1, 1, 1, 1, 1]; // relative weight per day since reset; raise a day to budget more for it
const KEY = "cup.v2";
const S = {
  used: 33,                                 // weekly % used
  dow: 1, hh: 0, mm: 0,                     // weekly reset: Monday 00:00 by default
  snap: null, last: null, seen: {},         // start-of-day snapshot, last reading, advice already shown
  lang: "zh", compact: false,
};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* storage unavailable */ }
S.lang = "zh"; // UI is Chinese only; ignore any stale value saved by an older version
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

const app = document.getElementById("app");
const $ = id => app.querySelector("#" + id);  // scoped to #app so it still works inside a pop-out window
const fmt = x => { x = Math.round(x * 10) / 10; return Number.isInteger(x) ? String(x) : x.toFixed(1); };
const COLORS = ["var(--ok)", "var(--warn)", "var(--bad)"];

const I18N = {
  zh: {
    title: "Claude 用量规划器", usedWeek: "本周已用 (%)", update: "更新", leftToday: "今天还能用",
    pills: ["宽松，放心用", "快到今日线了", "已超今日预算"], advBtn: "转移建议",
    weekT: "这一周",
    settings: "设置", resetOn: "每周重置", dayStart: "今天开始时已用 (%)",
    dayStartNote: "每天自动记录。第一次是估算值，不准可以改。",
    apply: "应用", close: "知道了",
    note: "额度每周重置，用不完不会累积，所以留一点余量就好，不必过度省。",
    head: (d, b) => `本周第 ${d} 天。平均每天 14.3%，今天的预算是 ${fmt(b)}%。`,
    msg: (b, u, r, ah) => `预算 ${fmt(b)}%，今天已用 ${fmt(u)}%，本周还剩 ${fmt(r)}%。` +
      (ah > 1 ? `比平均进度超前 ${fmt(ah)}%。` : ah < -1 ? `比平均进度落后 ${fmt(-ah)}%。` : "刚好在平均进度上。"),
    proj: d => d ? ` 按现在的速度，大约 ${d} 用完。` : " 按现在的速度，可以撑到重置。",
    advTitle: ["很宽松", "快用完了", "已达上限"],
    advDay: l => l >= 0 ? `今天预算还剩 ${fmt(l)}%。` : `超出今日预算 ${fmt(-l)}%，会占用明天的额度。`,
    advTail: "主号留给需要长期记忆的任务，其余这样分流：",
    routes: [["策划 / 头脑风暴", "ChatGPT", "适合开放式讨论。"],
             ["文档整理 / 长文总结", "Gemini", "处理大段资料很合适。"],
             ["其他轻量问题", "备用 Claude 账号", "免费号，轻量问题够用。"]],
    web: "打开网页", open: "打开 App",
    needApp: "请在已安装的 App 窗口里使用（浏览器标签页不允许调整窗口大小）。",
  },
};
const t = () => I18N[S.lang];
const LINKS = [["https://chatgpt.com", "chatgpt://"], ["https://gemini.google.com", "googlegemini://"], ["https://claude.ai", "claude://"]];

// Start of the current weekly window: the most recent reset moment that is not in the future.
function weekStart(now) {
  const d = new Date(now);
  d.setHours(S.hh, S.mm, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - S.dow + 7) % 7));
  if (d.getTime() > now) d.setDate(d.getDate() - 7);
  return d.getTime();
}

// Core budget maths: today's budget = remaining quota (at start of today) * today's weight / remaining weights.
function calc() {
  const now = Date.now(), ws = weekStart(now), W = WEIGHTS, tot = W.reduce((a, b) => a + b, 0);
  const idx = Math.min(6, Math.max(0, Math.floor((now - ws) / DAY)));
  const frac = Math.min(1, Math.max(0, ((now - ws) - idx * DAY) / DAY));
  const rem = W.slice(idx).reduce((a, b) => a + b, 0);
  const before = W.slice(0, idx).reduce((a, b) => a + b, 0);
  if (!S.snap || S.snap.week !== ws || S.snap.day !== idx) {
    // New day: snapshot the last known reading; on first run, estimate by assuming a steady usage rate.
    const est = S.used * before / Math.max(before + W[idx] * frac, 1e-4);
    const prev = S.last && S.last.week === ws ? S.last.used : (idx === 0 ? 0 : est);
    S.snap = { week: ws, day: idx, used: Math.min(prev, S.used) };
  }
  S.last = { week: ws, used: S.used };
  const start = S.snap.used, budget = (100 - start) * W[idx] / rem;
  return { ws, idx, W, tot, rem, start, budget, todayUsed: Math.max(0, S.used - start),
           pace: 100 * (before + W[idx] * frac) / tot, now };
}
const dayLevel = c => { const r = c.budget > 0 ? c.todayUsed / c.budget : 2; return r >= 1 ? 2 : r >= 0.8 ? 1 : 0; };

function render() {
  const T = t(), c = calc(), lv = dayLevel(c), left = c.budget - c.todayUsed;
  document.documentElement.lang = S.lang;
  app.classList.toggle("compact", S.compact);
  app.querySelectorAll("[data-i]").forEach(el => { el.textContent = T[el.dataset.i]; });

  $("head").textContent = T.head(c.idx + 1, c.budget);
  $("used").value = S.used;
  const arc = $("arc");
  arc.setAttribute("stroke-dasharray", `${c.budget > 0 ? Math.min(1, c.todayUsed / c.budget) * 100 : 100} 100`);
  arc.setAttribute("stroke", COLORS[lv]);
  $("left").textContent = left >= 0 ? `${fmt(left)}%` : `+${fmt(-left)}%`;
  $("left").style.color = COLORS[lv];
  $("pill").textContent = T.pills[lv];
  $("pill").style.background = COLORS[lv];

  // Projection: when would the quota run out if the average rate so far continued?
  const elapsed = c.now - c.ws;
  let runOut = "";
  if (S.used > 0 && elapsed > 0.02 * 7 * DAY && elapsed * 100 / S.used < 7 * DAY) {
    runOut = new Date(c.ws + elapsed * 100 / S.used)
      .toLocaleString(S.lang === "zh" ? "zh-CN" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  }
  $("msg").textContent = T.msg(c.budget, c.todayUsed, 100 - S.used, S.used - c.pace) + T.proj(runOut);

  // Week card: progress bar with day dividers, then one column per day (the bar height is that day's budget).
  const ahead = S.used - c.pace, wk = $("wk"); wk.innerHTML = "";
  wk.append(bar(S.used, COLORS[ahead > 5 ? 2 : ahead > 0 ? 1 : 0]));
  let cum = 0; for (let i = 0; i < 6; i++) { cum += c.W[i]; wk.append(mark("tick", 100 * cum / c.tot)); }
  wk.append(mark("now", Math.min(100, c.pace)));
  $("wkl").textContent = `${fmt(S.used)}% / ${fmt(c.pace)}%`;
  const budgets = c.W.map((w, i) => i < c.idx ? 100 * w / c.tot : (100 - c.start) * w / c.rem), max = Math.max(...budgets);
  $("cols").innerHTML = budgets.map((b, i) => {
    const day = new Date(c.ws + i * DAY).toLocaleDateString(S.lang === "zh" ? "zh-CN" : "en-US", { weekday: "short" });
    const fill = i === c.idx ? `<i style="height:${Math.min(100, 100 * c.todayUsed / (b || 1))}%;background:${COLORS[lv]}"></i>` : "";
    return `<div class="col ${i < c.idx ? "past" : i === c.idx ? "today" : ""}"><span>${fmt(b)}</span>` +
           `<div class="b" style="height:${Math.max(8, 100 * b / max)}px">${fill}</div><span>${day}</span></div>`;
  }).join("");

  $("sd").value = fmt(c.start);
  save();
  return { c, lv };
}
function bar(pct, color) { const u = document.createElement("div"); u.className = "u"; u.style.cssText = `width:${Math.min(100, pct)}%;background:${color}`; return u; }
function mark(cls, pct) { const m = document.createElement("div"); m.className = cls; m.style.left = pct + "%"; return m; }

// Advice sheet: reasons first, then where to send the next tasks.
function advise(r) {
  const T = t(), left = r.c.budget - r.c.todayUsed, mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  $("mt").textContent = T.advTitle[r.lv];
  const parts = [T.advDay(left)];
  $("mb").textContent = parts.join(" ") + " " + T.advTail;
  $("routes").innerHTML = T.routes.map((x, i) =>
    `<div class="route"><b>${x[0]} → ${x[1]}</b><p>${x[2]}</p>` +
    `<a href="${LINKS[i][0]}" target="_blank" rel="noopener">${T.web}</a>` +
    (mobile ? `<a href="#" class="app" data-i="${i}">${T.open}</a>` : "") + `</div>`).join("");
  $("modal").classList.add("on");
}
$("routes").addEventListener("click", e => {
  const a = e.target.closest("a.app"); if (!a) return;
  e.preventDefault();
  const [web, scheme] = LINKS[+a.dataset.i];
  setTimeout(() => { if (!document.hidden) window.open(web, "_blank"); }, 1200); // fall back to web if the app is missing
  window.location.href = scheme;
});
$("close").onclick = () => $("modal").classList.remove("on");
$("modal").onclick = e => { if (e.target === $("modal")) $("modal").classList.remove("on"); };
$("adv").onclick = () => advise(render());

// Show the advice sheet once per level per day, only when the level rises.
function maybeAdvise(r, key) {
  if (r.lv > 0 && (S.seen[key] || 0) < r.lv) { S.seen[key] = r.lv; save(); advise(r); }
}
const clamp = v => Math.max(0, Math.min(100, parseFloat(v) || 0));
function setUsed(v) { S.used = clamp(v); const r = render(); maybeAdvise(r, r.c.ws + "-" + r.c.idx); }
$("save").onclick = () => setUsed($("used").value);
$("used").onkeydown = e => { if (e.key === "Enter") setUsed($("used").value); };
app.querySelectorAll("button[data-d]").forEach(b => { b.onclick = () => setUsed(S.used + Number(b.dataset.d)); });

// Settings
function fillDays() {
  const sel = $("dow"); sel.innerHTML = "";
  for (let i = 1; i <= 7; i++) {  // 2024-01-07 is a Sunday, so day i gives weekday i % 7
    const o = document.createElement("option"); o.value = i % 7;
    o.textContent = new Date(2024, 0, 7 + i).toLocaleDateString(S.lang === "zh" ? "zh-CN" : "en-US", { weekday: "long" });
    sel.append(o);
  }
  sel.value = S.dow;
}
$("apply").onclick = () => {
  S.dow = +$("dow").value; S.hh = Math.min(23, +$("hh").value || 0); S.mm = Math.min(59, +$("mm").value || 0);
  const sd = parseFloat($("sd").value);
  S.snap = null; S.last = null; calc();
  if (!isNaN(sd)) S.snap.used = Math.min(S.used, clamp(sd));
  render();
};

// Mini mode: one click shrinks this installed-app window to the bottom-right corner; click again to restore.
// window.resizeTo / moveTo only work in an installed PWA window, not in a normal browser tab.
const MINI = { w: 360, h: 480 };
$("mini").onclick = () => {
  if (!window.matchMedia("(display-mode: standalone)").matches) { alert(t().needApp); return; }
  if (window.outerHeight < 600) {                       // already small: restore the previous size and position
    const p = S.prev || { w: 1000, h: 800, x: 100, y: 50 };
    window.resizeTo(p.w, p.h); window.moveTo(p.x, p.y);
  } else {
    S.prev = { w: window.outerWidth, h: window.outerHeight, x: window.screenX, y: window.screenY };
    window.resizeTo(MINI.w, MINI.h);
    window.moveTo((screen.availLeft || 0) + screen.availWidth - MINI.w, (screen.availTop || 0) + screen.availHeight - MINI.h);
  }
  save();
};
window.addEventListener("resize", () => { $("mini").textContent = window.outerHeight < 600 ? "还原" : "小窗"; });

$("hh").value = S.hh; $("mm").value = S.mm; fillDays(); render();
setInterval(render, 60000); // keep countdowns fresh
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
