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
const IS_MINI = new URLSearchParams(location.search).has("mini"); // the small popup (dark theme)
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

const app = document.getElementById("app");
const $ = id => app.querySelector("#" + id);  // scoped to #app so it still works inside a pop-out window
const fmt = x => { x = Math.round(x * 10) / 10; return Number.isInteger(x) ? String(x) : x.toFixed(1); };
const COLORS = ["var(--ok)", "var(--warn)", "var(--bad)"];

const I18N = {
  zh: {
    title: "Claude 用量规划器", usedWeek: "本周已用 (%)", update: "更新", leftToday: "今天还能用", overToday: "今天已超",
    pills: ["宽松，放心用", "快到今日线了", "已超计划"], advBtn: "转移建议",
    weekT: "这一周",
    settings: "设置", resetOn: "每周重置", dayStart: "今天开始时已用 (%)",
    dayStartNote: "每天自动记录。第一次是估算值，不准可以改。",
    apply: "应用", close: "知道了",
    note: "额度每周重置，用不完不会累积，所以留一点余量就好，不必过度省。",
    head: (d, b) => `本周第 ${d} 天，每天固定 ${fmt(b)}%。`,
    msg: (cum, u, over) => `到今天累计额度 ${fmt(cum)}%，已用 ${fmt(u)}%，` +
      (over > 0 ? `已超出 ${fmt(over)}%，超出的部分会占用之后几天的额度。` : `还剩 ${fmt(-over)}%。`),
    proj: d => d ? ` 按现在的速度，大约 ${d} 用完。` : " 按现在的速度，可以撑到重置。",
    advTitle: ["很宽松", "快用完了", "已达上限"],
    advDay: l => l >= 0 ? `到今天累计额度还剩 ${fmt(l)}%。` : `已经超出计划 ${fmt(-l)}%，超出的部分会占用之后几天的额度。`,
    advTail: "主号留给需要长期记忆的任务，其余这样分流：",
    routes: [["策划 / 头脑风暴", "ChatGPT", "适合开放式讨论。"],
             ["文档整理 / 长文总结", "Gemini", "处理大段资料很合适。"],
             ["其他轻量问题", "备用 Claude 账号", "免费号，轻量问题够用。"]],
    web: "打开网页", open: "打开 App",
    popupBlocked: "浏览器拦截了小窗，请允许这个网站弹出窗口。",
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

// Budget maths: every day gets a fixed share (100 / 7 % with equal weights).
// Allowance up to the end of today is cumulative: unspent budget carries forward, overspending eats into later days.
function calc() {
  const now = Date.now(), ws = weekStart(now), W = WEIGHTS, tot = W.reduce((x, y) => x + y, 0);
  const idx = Math.min(6, Math.max(0, Math.floor((now - ws) / DAY)));
  const frac = Math.min(1, Math.max(0, ((now - ws) - idx * DAY) / DAY));
  const before = W.slice(0, idx).reduce((x, y) => x + y, 0);
  const cum = 100 * (before + W[idx]) / tot;
  return { ws, idx, W, tot, daily: 100 * W[idx] / tot, cum, left: cum - S.used,
           pace: 100 * (before + W[idx] * frac) / tot, now };
}
const dayLevel = c => { const r = S.used / c.cum; return r >= 1 ? 2 : r >= 0.8 ? 1 : 0; };

function render() {
  const T = t(), c = calc(), lv = dayLevel(c), left = c.left;
  document.documentElement.lang = S.lang;
  app.querySelectorAll("[data-i]").forEach(el => { el.textContent = T[el.dataset.i]; });

  $("head").textContent = T.head(c.idx + 1, c.daily);
  $("used").value = S.used;
  const arc = $("arc");
  arc.setAttribute("stroke-dasharray", `${Math.min(1, S.used / c.cum) * 100} 100`);
  arc.setAttribute("stroke", COLORS[lv]);
  app.querySelector(".gc .t").textContent = left >= 0 ? T.leftToday : T.overToday;  // "今天还能用 x%" or "今天已超 x%"
  $("left").textContent = `${fmt(Math.abs(left))}%`;
  $("left").style.color = COLORS[lv];
  $("pill").textContent = T.pills[lv];
  $("pill").style.background = COLORS[lv];
  $("pill").title = `每天计划 ${fmt(c.daily)}%，到今天累计 ${fmt(c.cum)}%`;  // hover tooltip

  // Projection: when would the quota run out if the average rate so far continued?
  const elapsed = c.now - c.ws;
  let runOut = "";
  if (S.used > 0 && elapsed > 0.02 * 7 * DAY && elapsed * 100 / S.used < 7 * DAY) {
    runOut = new Date(c.ws + elapsed * 100 / S.used)
      .toLocaleString(S.lang === "zh" ? "zh-CN" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  }
  $("msg").textContent = T.msg(c.cum, S.used, S.used - c.cum) + T.proj(runOut);

  // Week card: progress bar with day dividers, then one column per day (the bar height is that day's budget).
  const ahead = S.used - c.pace, wk = $("wk"); wk.innerHTML = "";
  wk.append(bar(S.used, COLORS[ahead > 5 ? 2 : ahead > 0 ? 1 : 0]));
  let cum = 0; for (let i = 0; i < 6; i++) { cum += c.W[i]; wk.append(mark("tick", 100 * cum / c.tot)); }
  wk.append(mark("now", Math.min(100, c.pace)));
  $("wkl").textContent = `${fmt(S.used)}% / ${fmt(c.pace)}%`;
  let acc = 0;  // every column is that day's fixed share; it fills as usage runs through the week, red where it runs past today
  $("cols").innerHTML = c.W.map((w, i) => {
    const b = 100 * w / c.tot, start = acc; acc += b;
    const day = new Date(c.ws + i * DAY).toLocaleDateString(S.lang === "zh" ? "zh-CN" : "en-US", { weekday: "short" });
    const f = Math.min(1, Math.max(0, (S.used - start) / b));
    const fill = f > 0 ? `<i style="height:${100 * f}%;background:${i > c.idx ? COLORS[2] : COLORS[lv]}"></i>` : "";
    return `<div class="col ${i < c.idx ? "past" : i === c.idx ? "today" : ""}"><span>${fmt(b)}</span>` +
           `<div class="b" style="height:100px">${fill}</div><span>${day}</span></div>`;
  }).join("");

  save();
  return { c, lv };
}
function bar(pct, color) { const u = document.createElement("div"); u.className = "u"; u.style.cssText = `width:${Math.min(100, pct)}%;background:${color}`; return u; }
function mark(cls, pct) { const m = document.createElement("div"); m.className = cls; m.style.left = pct + "%"; return m; }

// Advice sheet: reasons first, then where to send the next tasks.
function advise(r) {
  const T = t(), left = r.c.left, mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
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
const closeModal = () => $("modal").classList.remove("on");
$("close").onclick = closeModal;
$("x").onclick = closeModal;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
$("modal").onclick = e => { if (e.target === $("modal")) $("modal").classList.remove("on"); };
$("adv").onclick = () => advise(render());

// Show the advice sheet once per level per day, only when the level rises.
function maybeAdvise(r, key) {
  if (r.lv > 0 && (S.seen[key] || 0) < r.lv) { S.seen[key] = r.lv; save(); advise(r); }
}
const clamp = v => Math.round(Math.max(0, Math.min(100, parseFloat(v) || 0)) * 100) / 100;
function setUsed(v) { S.used = clamp(v); const r = render(); maybeAdvise(r, r.c.ws + "-" + r.c.idx); }
$("save").onclick = () => setUsed($("used").value);
$("used").onkeydown = e => { if (e.key === "Enter") setUsed($("used").value); };
app.querySelectorAll("button[data-d]").forEach(b => { b.onclick = () => setUsed(S.used + Number(b.dataset.d)); });
// Custom amount: type a number, then press - to subtract it or + (or Enter) to add it.
function custom(sign) {
  const v = Math.abs(parseFloat($("cv").value));
  if (!(v > 0)) { $("cv").focus(); return; }
  setUsed(S.used + sign * v); $("cv").value = "";
}
$("cm").onclick = () => custom(-1);
$("cp").onclick = () => custom(1);
$("cv").onkeydown = e => { if (e.key === "Enter") custom(1); };

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
  render();
};

// Mini window: opens a small independent popup that (input + gauge, dark).
// It reads the same saved data, so update the numbers in the main window and the popup follows.
// The popup does not depend on the main window staying open.
// Open a popup of w x h at (x, y), clamped so it always stays fully on screen.
function popupAt(url, name, w, h, x, y) {
  const L = screen.availLeft || 0, T = screen.availTop || 0;
  x = Math.max(L, Math.min(x, L + screen.availWidth - w - 10));
  y = Math.max(T, Math.min(y, T + screen.availHeight - h - 10));
  return window.open(url, name, `popup=yes,width=${w},height=${h},left=${Math.round(x)},top=${Math.round(y)}`);
}
// Fallback for browsers without Document Picture-in-Picture: a separate popup window.
function popupMini() {
  const w = 300, h = 380;
  const p = popupAt(location.pathname + "?mini=1", "usage-mini",
    w, h, (screen.availLeft || 0) + screen.availWidth - w - 20, (screen.availTop || 0) + screen.availHeight - h - 60);
  if (!p) { alert(t().popupBlocked); return; }
  window.close(); // replace the big window with the mini one (works in an installed app window)
}
// Preferred: Chrome's Picture-in-Picture window. It is always on top by itself, and the main window stays open,
// so resizing never loses "on top" and no second window has to be created.
let pipWin = null;
function attachPip(pw) {
  pipWin = pw;
  const pd = pw.document, root = pd.documentElement;
  root.lang = "zh-CN"; root.dataset.mode = "mini"; root.dataset.phone = "0";
  document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
    const n = pd.createElement("link"); n.rel = "stylesheet"; n.href = l.href; pd.head.append(n);
  });
  const note = document.createElement("p");
  note.className = "sub"; note.style.padding = "16px";
  note.textContent = "小窗已打开（始终在最前面）。关闭小窗或点“展开”回到这里。";
  document.body.append(note);
  pd.body.append(app);
  pd.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  const btn = $("mini");
  btn.textContent = "展开"; btn.title = "回到完整窗口"; btn.onclick = () => pw.close();
  pw.addEventListener("pagehide", () => {
    document.body.prepend(app); note.remove(); pipWin = null;
    btn.textContent = "小窗"; btn.title = "一键变小窗 / 还原"; btn.onclick = openMini;
    render();
  });
  render();
}
async function openMini() {
  if (pipWin) { pipWin.focus(); return; }
  if ("documentPictureInPicture" in window) {
    let pw = null;
    try { pw = await documentPictureInPicture.requestWindow({ width: 300, height: 400 }); } catch (e) { /* fall back to a popup */ }
    if (pw) { attachPip(pw); return; }
  }
  popupMini();
}
$("mini").onclick = openMini;

$("hh").value = S.hh; $("mm").value = S.mm; fillDays(); render();
// Keep the mini popup in sync: reload state whenever another window saves.
window.addEventListener("storage", e => {
  if (e.key !== KEY || !e.newValue) return;
  try { Object.assign(S, JSON.parse(e.newValue)); S.lang = "zh"; render(); } catch (err) { /* ignore bad data */ }
});
if (IS_MINI) {  // in the popup, the same button goes back to the full window
  $("mini").textContent = "展开";
  $("mini").title = "回到完整窗口";
  $("mini").onclick = () => {  // reopen the medium window right where the mini one is
    const w = 500, h = 340;
    const p = popupAt(location.pathname, "usage-main", w, h, window.screenX + 300 - w, window.screenY);
    if (!p) { alert(t().popupBlocked); return; }
    window.close();
  };
}
// Layout mode follows the window size (large / medium); the CSS does the rest.
window.addEventListener("resize", () => window.cupMode());
setInterval(render, 60000); // keep countdowns fresh
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const had = !!navigator.serviceWorker.controller;  // reload once when a new version takes over, so updates apply by themselves
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) location.reload(); });
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
