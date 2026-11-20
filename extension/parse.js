"use strict";
// Reads the weekly usage percentage from the usage page the user already has open.
// It only looks at text/aria values that are displayed on that page; no network calls, no internal endpoints.
// Strategy (no class names, so it survives restyling): find every percentage, take the nearest surrounding text as its
// label, keep the ones labelled as weekly / 7-day, drop per-model lines (Sonnet, Opus...) unless "All models".
(function (root) {
  const WEEK = /week|7[\s-]?day|每周|本周|周限|7\s*天|一周/i;
  const SESSION = /session|5[\s-]?hour|5\s*小时|会话/i;
  const ALLM = /all models|所有模型|全部模型/i;
  const OTHER = /sonnet|opus|haiku|claude code|design|designs|设计/i;
  const REMAIN = /remaining|left|剩余|还剩/i;
  const USED = /used|已用|已使用/i;
  const NOISE = /storage|memory|context|存储|内存|上下文/i;
  const PCT = /(\d{1,3}(?:\.\d+)?)\s*%/;

  const clean = s => (s || "").replace(/\s+/g, " ").trim();

  const periodOf = t => { const w = WEEK.test(t), s = SESSION.test(t); return w && s ? "mixed" : w ? "week" : s ? "session" : null; };

  // Own label: nearest ancestor text that names a period. Stops when the text gets too long (we would be reading the whole page).
  function labelFor(el) {
    let n = el, best = "";
    for (let i = 0; i < 7 && n && n.nodeType === 1; i++, n = n.parentElement) {
      const t = clean(n.textContent);
      if (t.length > 320) break;
      const p = periodOf(t);
      if (p === "mixed") break;            // this ancestor holds both session and weekly blocks: too broad, keep the row text below it
      best = t;
      if (p) return { text: t, period: p };
    }
    return { text: best, period: null };
  }

  // Walk the page in reading order. A row like "All models 37% used" often has its "Weekly limits" heading as a separate
  // element above it, so a recent short heading that names a period is used as the row's period when the row itself has none.
  function candidates(doc) {
    const out = [], root = doc.body || doc;
    let ctx = null, age = 0;
    const w = doc.createTreeWalker(root, 1 | 4 /* elements + text */);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 1) {
        if (n.getAttribute("role") !== "progressbar") continue;
        const now = parseFloat(n.getAttribute("aria-valuenow"));
        if (!isFinite(now)) continue;
        out.push(mk(now * 100 / (parseFloat(n.getAttribute("aria-valuemax")) || 100), n, ctx, "aria"));
        continue;
      }
      const el = n.parentElement, txt = clean(n.nodeValue);
      if (!el || !txt || /^(script|style|noscript)$/i.test(el.tagName)) continue;
      age++;
      const p = periodOf(txt);
      if (txt.length <= 80 && (p === "week" || p === "session")) { ctx = { period: p, text: txt }; age = 0; }
      if (age > 25) ctx = null;
      const m = PCT.exec(txt);
      if (m) out.push(mk(parseFloat(m[1]), el, ctx, "text"));
    }
    return out;
  }
  function mk(value, el, ctx, src) {
    const own = labelFor(el);
    let period = own.period, text = own.text;
    if (!period && ctx) { period = ctx.period; text = ctx.text + " | " + text; }
    return { value, label: text, period, src };
  }

  function parse(doc) {
    const all = candidates(doc || document).filter(c => c.value >= 0 && c.value <= 100 && c.label);
    // keep only the ones that are clearly weekly: has a week keyword and is not a mixed "session + week" block
    let weekly = all.filter(c => c.period === "week" && !NOISE.test(c.label));
    weekly = weekly.map(c => {
      const invert = REMAIN.test(c.label) && !USED.test(c.label);
      return { ...c, value: invert ? 100 - c.value : c.value, inverted: invert };
    });
    const withAll = weekly.filter(c => ALLM.test(c.label));
    let pool = withAll.length ? withAll : weekly.filter(c => !OTHER.test(c.label));
    const vals = [...new Set(pool.map(c => Math.round(c.value * 100) / 100))];
    const base = { candidates: all.slice(0, 12).map(c => ({ value: c.value, label: c.label.slice(0, 120) })) };
    if (!vals.length) return { ok: false, reason: "没找到“每周”用量百分比", ...base };
    if (vals.length > 1) return { ok: false, reason: "找到多个不同的每周数字，无法确定用哪个：" + vals.join(" / "), ...base };
    const reset = (/(resets?[^%]{0,40}|重置[^%]{0,24})/i.exec(pool[0].label) || [""])[0];
    return { ok: true, used: vals[0], label: pool[0].label.slice(0, 120), reset: clean(reset), ...base };
  }

  root.CUP_parse = parse;
  if (typeof module !== "undefined") module.exports = parse;
})(typeof window !== "undefined" ? window : globalThis);
