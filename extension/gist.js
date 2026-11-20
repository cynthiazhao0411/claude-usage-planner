"use strict";
// Writes the weekly % into the same private Gist the planner syncs through (description + file name must match app.js).
// It keeps dow/hh/mm as the planner has them and only changes used + ts. Never writes a value it cannot validate.
(function (root) {
  const GDESC = "claude-usage-planner-sync", GFILE = "usage.json";

  async function pushUsed(fetchFn, token, gistId, used, now) {
    if (!token) throw new Error("no-token");
    if (typeof used !== "number" || !isFinite(used) || used < 0 || used > 100) throw new Error("bad-value");
    used = Math.round(used * 100) / 100;
    const gh = (path, opt = {}) => fetchFn("https://api.github.com" + path, { ...opt, headers: {
      Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "Content-Type": "application/json" } });
    const fail = r => { throw new Error("http-" + r.status); };

    let id = gistId, cur = null;
    if (id) {
      const r = await gh("/gists/" + id);
      if (r.status === 404) id = "";               // gist was deleted: look again / recreate
      else if (!r.ok) fail(r);
      else { const f = (await r.json()).files[GFILE]; try { cur = f && JSON.parse(f.content); } catch (e) { cur = null; } }
    }
    if (!id) {
      const r = await gh("/gists?per_page=100"); if (!r.ok) fail(r);
      const found = (await r.json()).find(g => g.description === GDESC && g.files && g.files[GFILE]);
      if (found) {
        id = found.id;
        const g = await gh("/gists/" + id); if (!g.ok) fail(g);
        try { cur = JSON.parse((await g.json()).files[GFILE].content); } catch (e) { cur = null; }
      }
    }
    const next = { dow: 1, hh: 0, mm: 0, ...(cur || {}), used, ts: now };
    const body = JSON.stringify({ files: { [GFILE]: { content: JSON.stringify(next) } } });
    if (id) { const r = await gh("/gists/" + id, { method: "PATCH", body }); if (!r.ok) fail(r); }
    else {
      const r = await gh("/gists", { method: "POST", body: JSON.stringify({ description: GDESC, public: false, files: { [GFILE]: { content: JSON.stringify(next) } } }) });
      if (!r.ok) fail(r);
      id = (await r.json()).id;
    }
    return id;
  }

  root.CUP_gist = { pushUsed };
  if (typeof module !== "undefined") module.exports = root.CUP_gist;
})(typeof self !== "undefined" ? self : globalThis);
