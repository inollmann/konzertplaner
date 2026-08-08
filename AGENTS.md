# AGENTS.md

Local concert/tour planning app: Flask backend + vanilla-JS single-page frontend. German UI.

## Run

```bash
uv venv --python 3.13 && uv sync   # dev setup (uv is the package manager)
python main.py                     # server on http://localhost:5000, debug=True
# or: docker compose up --build    # uses requirements.txt, NOT pyproject.toml
```

Python **3.13** required (uses `str | None`, `dict[str, ...]`). No `.env`, no config files.

For running python test code snippets use `uv run` to access the project uv venv.
The available project skills are stored in `.agents/skills`.

## Architecture

- `main.py` — Flask app + all routes (`/api/...` plus `/`, `/design-tool`, `/invite/<eid>/<code>`). ~1100 lines, one file.
- `concert.py` — data models: `Event` base → `Tour` (N concerts) and `Festival` (single date/venue); `Concert`, `Artist`, `Venue` catalogue models. All have `to_dict`/`from_dict`.
- `static/` — SPA, **no build step**: `index.html` + ES modules under `static/js/` + `style.css`. Served as-is by Flask. Leaflet.js (map) loaded via CDN. Entry point is `static/js/main.js` (`<script type="module">`); inline `onclick` handlers resolve via `globals.js` which assigns all module exports to `window`.

### Frontend module structure (`static/js/`)

| Module | Responsibility |
|---|---|
| `main.js` | Boot, initial fetch, cross-module re-render event orchestration (`tabchange`, `filterchange`, `ratingchange`, `showsfilterchange`) |
| `globals.js` | Window shim — imports all module exports and assigns them to `window` for inline `onclick` handlers |
| `state.js` | Central mutable `state` object (avoids ES module read-only binding limitation) + `getEvent(id)` + `today` |
| `utils.js` | Pure helpers: `esc`, `localIso`, `parseDate`, `fmtDate*`, `fmtPrice`, `dlBlob`, `eventLatestDate`, `eventEarliestDate`, `pipColor`, `venueMapHtml` |
| `theme.js` | Runtime theming, color presets, design panel |
| `ui.js` | Generic DOM: modals, drawer, `switchTab`, lightbox, poster, popover |
| `api.js` | Data fetch/persist: `fetchAll`, `deleteEvent`, `patchEvent`, `reloadCatalogue`, tags, follow |
| `filters.js` | Filter state + chip toggling, dispatches `filterchange`/`showsfilterchange` events |
| `list.js` | Event list rendering, tour/festival cards, detail panel |
| `ratings.js` | Rating storage, rating bars, artist rating summaries |
| `calendar.js` | Month-grid calendar view |
| `timeline.js` | Epoch-based virtualized horizontal timeline |
| `map.js` | Leaflet map, geocoding, `resetMap()` (extracted from duplicated code) |
| `shows.js` | Shows tab: rated events grouped/sorted, histograms |
| `event-editor.js` | Create/edit tour/festival modal, pill tags, concert blocks |
| `catalogues.js` | Artist/venue catalogues, image upload |
| `favourites.js` | Favourite artists tab, Eventim artist lookup |
| `notifications.js` | Notification badge/panel, background polling |
| `eventim.js` | Eventim tour search, concert selection, import |
| `tools.js` | Location settings, backup/restore, statistics, export (CSV/iCal/HTML) |
| `types.d.ts` | Ambient type overrides (`getElementById` → `any`, `L` global for Leaflet) |
| `tsconfig.json` | `checkJs: true` type checking config (at repo root) |

**Cross-module communication**: Feature modules dispatch `window` custom events (`filterchange`, `tabchange`, `ratingchange`, `showsfilterchange`) instead of importing each other's render functions — this avoids circular imports. `main.js` listens and orchestrates re-renders.

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

**There is no test suite, linter, formatter, or CI.** No `pytest`, `ruff`, `mypy`, `.github/workflows`. To verify a change:
- **Type check**: `npx tsc --noEmit` (at repo root; TypeScript installed as dev dependency)
- **Runtime**: run `python main.py` and exercise the affected feature in the browser at http://localhost:5000.
- `import concert; ...` smoke-checks are fine for model edits. Do not invent a "run the tests" step — there is none.

## Working notes

- `plans/` holds long-form implementation specs (e.g. `timeline-reimplementation.md`) with `file:line` references — treat as living design docs, not current state.
- `.claude/` and `opencode.json` are gitignored (agent config, not app code). `.agents/skills/` + `skills-lock.json` track installed opencode skills.
- Image upload helper `_save_upload(file, dest_dir, base_name=None, suffix="")` sanitizes names to `lowercase-hyphenated`; pass an artist/festival name for human-readable filenames, omit for UUIDs.
- Comments and UI strings are **German**; match the language when touching user-facing text.
- Keep your answerd short and concise. Only present relevant information to the user.
- When writing code, delegate sub-tasks to sub-agents. Use the main agent only to delegate the tasks and to ensure correct implementation.
