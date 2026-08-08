# AGENTS.md

Local concert/tour planning app: Flask backend + vanilla-JS single-page frontend. German UI.

## Run

```bash
uv venv --python 3.13 && uv sync   # dev setup (uv is the package manager)
python main.py                     # server on http://localhost:5000, debug=True
# or: docker compose up --build    # uses requirements.txt, NOT pyproject.toml
```

Python **3.13** required (uses `str | None`, `dict[str, ...]`). No `.env`, no config files.

## Architecture

- `main.py` — Flask app + all routes (`/api/...` plus `/`, `/design-tool`, `/invite/<eid>/<code>`). ~1100 lines, one file.
- `concert.py` — data models: `Event` base → `Tour` (N concerts) and `Festival` (single date/venue); `Concert`, `Artist`, `Venue` catalogue models. All have `to_dict`/`from_dict`.
- `static/` — SPA, **no build step**: `index.html` + `app.js` (~4400 lines, all the logic) + `style.css`. Served as-is by Flask. Leaflet.js (map) loaded via CDN.

### In-memory state (critical gotcha)
`events` and `catalogue` are **module-level dicts loaded once at import**; every mutation rewrites the JSON file. There is **no database**. This only works single-process:
- Flask `debug=True` reloader is fine (restart re-reads disk), but **never run with multiple workers** (e.g. `gunicorn -w 4`) — workers desync silently.
- `save_events()` writes atomically (tempfile + `os.replace`); `save_catalogue()` does not — keep it that way or follow the atomic pattern when editing persistence.

## Data & uploads (all gitignored, local-only)

- `data/events.json` (events) and `data/catalogue.json` (artists + venues).
- `load_events()` falls back to legacy `data/tours.json` if `events.json` is absent — don't assume the README's `tours.json` is current; it's stale.
- `static/posters/`, `static/logos/`, `static/festival-logos/` hold uploaded images. These dirs are auto-created at import (`mkdir parents=True, exist_ok=True`).
- Docker volume-mounts only `./data:/app/data`; posters/logos uploaded inside the container are lost on rebuild unless you mount those dirs too.

## Dependencies — pyproject.toml vs requirements.txt disagree

| Package | pyproject.toml (uv/dev) | requirements.txt (Docker) | Actually used? |
|---|---|---|---|
| flask, werkzeug | yes | yes | yes (runtime) |
| requests | yes | **no** | optional — lazy-imported in `main.py` with `try/except`; falls back to `urllib` |
| pillow | yes | **no** | only by `static/generate_favicons.py` (one-off script), not the app |
| beautifulsoup4 | no | yes | **never imported** (dead) |

`requests` is optional on purpose. The Eventim proxy (`/api/eventim/*`) needs it for proper cookie/session handling but degrades to `urllib`.

## Eventim proxy (`/api/eventim/*`)

Proxies `https://public-api.eventim.com` to dodge browser CORS. `_eventim_get()` uses a **persistent `requests.Session` primed by first hitting `https://www.eventim.de/`** to collect cookies, and sends full Chrome-like headers (incl. `Sec-Fetch-*`, `sec-ch-ua`) — Eventim checks these. If you change headers or the session priming, expect 403s.

## Invite links

`/invite/<eid>/<code>`: `code` is URL-safe base64 of a JSON blob, version-gated (`"v": 1` required, else 400). Server-side imports the event, saves, and redirects to `/`. When adding fields to an event, update both the encoder (`get_event_invite`) and decoder (`handle_invite`) and bump nothing unless you change the format (then bump `v`).

## Backward-compat conventions

- `Tour.artist` is a **list** (co-headlining); `from_dict` accepts a legacy single string. When serializing, keep handling both shapes.
- `Event.from_dict` dispatches on `event_type` (`"tour"` default, `"festival"` otherwise) — new event types must be registered there.
- `Tour`/`Festival` have `from_poster_data()` stubs (documented, unused) reserved for a future vision-model poster extractor.

## Verification

**There is no test suite, linter, formatter, typecheck, or CI.** No `pytest`, `ruff`, `mypy`, `.github/workflows`. To verify a change: run `python main.py` and exercise the affected feature in the browser at http://localhost:5000. `import concert; ...` smoke-checks are fine for model edits. Do not invent a "run the tests" step — there is none.

## Working notes

- `plans/` holds long-form implementation specs (e.g. `timeline-reimplementation.md`) with `file:line` references — treat as living design docs, not current state.
- `.claude/` and `opencode.json` are gitignored (agent config, not app code). `.agents/skills/` + `skills-lock.json` track installed opencode skills.
- Image upload helper `_save_upload(file, dest_dir, base_name=None, suffix="")` sanitizes names to `lowercase-hyphenated`; pass an artist/festival name for human-readable filenames, omit for UUIDs.
- Comments and UI strings are **German**; match the language when touching user-facing text.
- Keep your answerd short and concise. Only present relevant information to the user.
- When writing code, delegate sub-tasks to sub-agents. Use the main agent only to delegate the tasks and to ensure correct implementation.
