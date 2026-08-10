# AGENTS.md

Local concert/tour planning app: Flask backend + vanilla-JS single-page frontend. German UI.

## Run

```bash
uv venv --python 3.13 && uv sync   # dev setup (uv is the package manager)
uv run pre-commit install          # once after clone — activates .git/hooks/pre-commit
python main.py                     # server on http://localhost:5000, debug=True
# or: docker compose up --build    # uses requirements.txt, NOT pyproject.toml
```

Python **3.13** required (uses `str | None`, `dict[str, ...]`). No `.env`, no config files.
Requires PostgreSQL — `DATABASE_URL` defaults to `postgresql+psycopg://kp:kp@localhost:5432/kp` (overridable by env). Docker Compose starts a Postgres container automatically.

For running python test code snippets use `uv run` to access the project uv venv.
The available project skills are stored in `.agents/skills`.

## Architecture

- `main.py` — Flask app + all routes (`/api/...` plus `/`, `/design-tool`, `/invite/<eid>/<code>`). ~1000 lines, one file.
- `concert.py` — data models: `Event` base → `Tour` (N concerts) and `Festival` (single date/venue); `Concert`, `Artist`, `Venue` catalogue models. All have `to_dict`/`from_dict`. Used as API DTOs.
- `db.py` — Database layer: SQLModel engine, session, CRUD functions (`list_events`, `get_event`, `upsert_event`, `list_artists`, `upsert_artist`, `list_venues`, `create_image`, `get_image`, etc.), row↔domain mappers, and auto-migration from JSON on first boot.
- `models.py` — SQLModel table definitions: `Image` (BYTEA), `EventRow` (polymorphic, JSONB `attrs`), `ArtistRow`, `VenueRow`.
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

### Database (PostgreSQL via SQLModel)
All data lives in PostgreSQL — events, artists, venues, and images (BYTEA). The app is **multi-worker safe** (no in-memory state; every request reads/writes the DB). `db.py` creates the engine at import, auto-creates tables via `SQLModel.metadata.create_all`, and auto-migrates from legacy JSON files on first boot if the DB is empty.
- `DATABASE_URL` defaults to `postgresql://kp:kp@localhost:5432/kp` (local dev); Docker sets it via env to `postgresql://kp:kp@db:5432/kp`.
- Concerts stay nested as JSONB in `events.attrs` (app filters client-side; scalability win is multi-worker safety, not SQL queries).
- Images served via `/api/img/<uuid>` route from the `images` table (BYTEA). No on-disk image storage.

## Data & uploads (all in PostgreSQL)

- **Legacy migration source** (read-only): `data/events.json` and `data/catalogue.json` are read once on first boot if the DB is empty, then images from `static/posters/`, `static/logos/`, `static/festival-logos/` are loaded into the `images` table. After migration, the JSON files are no longer read.
- `data/events.json` was the former events store; `load_events()` no longer exists — use `list_events()` from `db.py`.
- Image uploads (`/api/upload-poster`, `/api/upload-logo`, `/api/upload-festival-logo`) now store bytes in the `images` table and return `{"id": "<uuid>"}`. The frontend uses the UUID as the `poster`/`logo`/`photo` field value, and constructs URLs as `/api/img/<uuid>`.

## Dependencies — pyproject.toml vs requirements.txt disagree

| Package | pyproject.toml (uv/dev) | requirements.txt (Docker) | Actually used? |
|---|---|---|---|
| flask, werkzeug | yes | yes | yes (runtime) |
| sqlmodel, psycopg[binary] | yes | yes | yes (database layer) |
| requests | yes | **no** | optional — lazy-imported in `main.py` with `try/except`; falls back to `urllib` |
| pillow | yes | **no** | only by `static/generate_favicons.py` (one-off script), not the app |
| beautifulsoup4 | no | yes | **never imported** (dead) |

`requests` is optional on purpose. The Eventim proxy (`/api/eventim/*`) needs it for proper cookie/session handling but degrades to `urllib`.

## Eventim proxy (`/api/eventim/*`)

Proxies `https://public-api.eventim.com` to dodge browser CORS. `_eventim_get()` uses a **persistent `requests.Session` primed by first hitting `https://www.eventim.de/`** to collect cookies, and sends full Chrome-like headers (incl. `Sec-Fetch-*`, `sec-ch-ua`) — Eventim checks these. If you change headers or the session priming, expect 403s.

## Invite links

`/invite/<eid>/<code>`: `code` is URL-safe base64 of a JSON blob, version-gated (`"v": 2` required, else 400). Server-side imports the event, saves, and redirects to `/`. When adding fields to an event, update both the encoder (`get_event_invite`) and decoder (`handle_invite`) and bump nothing unless you change the format (then bump `v`).
- **v:2 is lossy**: poster/logo image UUIDs are NOT carried in the invite payload (images live in the DB and can't be shared via URL). Recipients get the event data without images.

## Backward-compat conventions

- `Tour.artist` is a **list** (co-headlining); `from_dict` accepts a legacy single string. When serializing, keep handling both shapes.
- `Event.from_dict` dispatches on `event_type` (`"tour"` default, `"festival"` otherwise) — new event types must be registered there.
- `Tour`/`Festival` have `from_poster_data()` stubs (documented, unused) reserved for a future vision-model poster extractor.

## Verification

CI (`.github/workflows/ci.yml`) runs on every push to `main` and on PRs across six jobs:
- **Lint (ruff)**: `uv run ruff check` + `uv run ruff format --check`
- **Tests (pytest)**: `uv run pytest --cov --cov-report=xml` — 214 tests; 7 e2e tests deselected by default via `-m "not e2e"`
- **Typecheck (tsc)**: `npx tsc --noEmit` (uses `tsconfig.json`, `checkJs: true`)
- **Tests (vitest)**: `npm test` — 78 tests across `static/js/*.test.js`
- **E2E (Playwright)**: `uv run pytest -m e2e` (chromium)
- **Docker build**: `docker build .`

Local pre-commit hooks (`.pre-commit-config.yaml`, run via `uv run pre-commit run --all-files`):
- `ruff check --fix` + `ruff format` on staged Python files
- `tsc --noEmit` when `static/js/**` is touched

Run checks manually:
- **Lint**: `uv run ruff check && uv run ruff format --check`
- **Type check**: `npx tsc --noEmit`
- **Python tests**: `uv run pytest` (add `-m e2e` for Playwright)
- **JS tests**: `npm test`
- **All pre-commit hooks**: `uv run pre-commit run --all-files`
- **Runtime**: run `python main.py` and exercise the affected feature at http://localhost:5000.

`import concert; ...` smoke-checks are also fine for quick model edits.

## Working notes

- `plans/` holds long-form implementation specs (e.g. `timeline-reimplementation.md`) with `file:line` references — treat as living design docs, not current state.
- `.claude/` and `opencode.json` are gitignored (agent config, not app code). `.agents/skills/` + `skills-lock.json` track installed opencode skills.
- Comments and UI strings are **German**; match the language when touching user-facing text.
- Keep your answerd short and concise. Only present relevant information to the user.
- When writing code, delegate sub-tasks to sub-agents. Use the main agent only to delegate the tasks and to ensure correct implementation.
