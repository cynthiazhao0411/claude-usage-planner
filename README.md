# Claude Usage Planner

A small PWA that spreads a weekly Claude quota across days,
and suggests where to route work when you run low. No build step, no dependencies, no tracking.

## Run locally
    python3 -m http.server 8000     # then open http://localhost:8000

## Deploy
Push to GitHub, then Settings -> Pages -> Deploy from branch -> `main` / root.

## Notes
- Data lives in `localStorage` only.
- Regenerate icons: `python3 tools/gen_icons.py`
- Change per-day weighting via `WEIGHTS` in `app.js`.

## Auto-sync from claude.ai (optional)
`extension/` is a small Chrome/Edge extension that reads the weekly % from your open claude.ai usage page and writes it to the sync Gist. See `extension/README.md`.
