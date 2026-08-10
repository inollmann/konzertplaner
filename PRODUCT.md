# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Intended for **multiple independent users**, each planning their own concert
calendar. As of this writing the app runs as a single shared workspace with no
authentication and no per-user data isolation; user accounts and per-user
scoping are an open decision and a future direction (see Capabilities and
Constraints). The primary user is a German-speaking concert-goer who tracks
both concerts already attended (rated, remembered) and concerts planned or
considered for the future.

## Product Purpose

Konzertplaner lets a concert-goer capture and navigate their entire concert
life in one place: tours and festivals they've seen, ones they're planning,
and ones they're watching. It exists because concert attendance is naturally
both retrospective and prospective, and spreadsheets or a ticketing site
alone don't let you see the whole arc — past ratings next to upcoming dates
next to a map of where you've been. Success means one person can open the
app and immediately understand what they've experienced, what's coming,
and how it all connects across time and geography.

## Positioning

No neighbouring concert tracker can truthfully copy the *combination* that
defines Konzertplaner: the **tour-vs-festival dichotomy** as the organising
principle (expressed structurally and by colour everywhere), the
**ZEITSTRAHL epoch timeline** as the signature navigation view, **Eventim
import** to pull real tour data without manual entry, **invite links** to
share a planned event in one URL, **show ratings** on a 1–10 hue-interpolated
scale, and the **map** of attended and planned venues. Each piece exists
elsewhere in isolation; the integrated whole — dichotomy + timeline + import
+ sharing + ratings + map — is the position.

## Operating Context

- **German concert market**: Eventim.de is the primary external data source;
  dates, cities, and prices follow German formatting (`de-DE`).
- **Self-hosted**: run locally via `python main.py` (debug server on
  `localhost:5000`) or via Docker Compose (which also starts PostgreSQL).
  Requires a PostgreSQL database; `DATABASE_URL` defaults to a local dev
  instance and is overridable by env.
- **Desktop-first, mobile-responsive**: the app is used most on a laptop to
  plan and review, and on a phone to glance at upcoming shows and the map.
- **Personal curation workflow**: add an event (manually or via Eventim
  import) → track tickets-bought vs watchlist status → attend → rate → see
  it appear in ratings, histograms, timeline, and map.
- **Sharing ritual**: a planned event is shared with a friend via an invite
  link, which imports the event into their planner on open.

## Capabilities and Constraints

- **Events**: Tours (a tour with N concerts) and Festivals (single date and
  venue). Concerts are nested as JSONB inside a tour event. Event CRUD via
  the SPA, persisted to PostgreSQL.
- **Catalogues**: Artists (with logo/photo, follow status, Eventim name/id
  mapping) and Venues (with city, geocoded for the map).
- **Ratings**: 1–10 scale; hue interpolates from dark red (1) to dark green
  (10). Stored as per-user client state synced via the `kv` table.
- **Views**: event list (cards + poster wall), month-grid calendar, the
  ZEITSTRAHL timeline (epoch-based, virtualised, zoomable), Leaflet map,
  shows (rated events grouped/sorted with rating/year/city histograms),
  and favourites.
- **Eventim integration**: a proxy (`/api/eventim/*`) searches Eventim
  tours and imports selected concerts. Uses a primed `requests.Session`
  with full Chrome-like headers; degrades to `urllib` if `requests` is
  absent.
- **Invite links**: `/invite/<eid>/<code>` — URL-safe base64 JSON, version
  `v:2` required. Lossy: poster/logo image UUIDs are not carried.
- **Notifications**: background polling, surfaced via a badge/panel.
- **Backup / restore / export**: backup-restore, and export to CSV, iCal,
  and HTML; statistics view.
- **Theming**: runtime theming with dark/light/midnight presets and custom
  colour tokens; a standalone `/design-tool` page adds two extra presets and
  a custom-CSS editor.
- **PWA**: manifest + service worker (cache-first).
- **Open decision — multi-user isolation**: the product is intended for
  multiple independent users, but the current schema has no user model, no
  authentication, and no per-user scoping on events/artists/venues; the
  `kv` table stores "per-user client state" but is keyed by `key` alone
  with no user id. Adding accounts and per-user isolation is a future
  direction that current features should not block.
- **Multi-worker safe**: no in-memory server state; every request reads
  and writes the database, so the app can run behind multiple workers.

## Brand Commitments

- **German UI** is a binding commitment: user-facing strings stay in
  German. German date/number formatting (`de-DE`) is part of this.
- **Name**: "Konzertplaner".

No other binding visual or technical commitments were confirmed: the
no-build-step vanilla-JS architecture, the dark neon-on-black aesthetic,
and the Flask + SQLModel/PostgreSQL stack are the current implementation
(recorded in `DESIGN.md` and the codebase) but are not product-level
constraints and may evolve.

## Evidence on Hand

- **Working application**: the codebase in this repository is the primary
  evidence — a runnable Flask + vanilla-JS SPA with PostgreSQL.
- **`DESIGN.md`**: living record of the current visual identity and theming
  architecture.
- **Legacy migration sources** (read-only, used only on first boot if the
  DB is empty): `data/events.json` and `data/catalogue.json`, plus images
  in `static/posters/`, `static/logos/`, `static/festival-logos/`.
- **No external evidence**: there are no testimonials, customer lists,
  press mentions, benchmarks, or case studies in the repository. Future
  work must not fabricate any of these.

## Product Principles

1. **The integrated whole is the product.** No single feature — not the
   timeline, not Eventim, not ratings — carries Konzertplaner on its own.
   The connection of tour/festival dichotomy, timeline, import, sharing,
   ratings, and map is the position; changes should strengthen the
   connections, not lift one piece at the expense of the whole.
2. **Built for the German concert-goer.** German UI and German-market data
   sources (Eventim.de) are first-class, not localised afterthoughts.
3. **Heading toward independent users.** Multi-user is the intent, so new
   features and data must not bake in single-shared-workspace assumptions
   that would later block per-user isolation or authentication.
4. **Personal curation, not social broadcasting.** Ratings, favourites, and
   notifications serve an individual's concert life; they are not designed
   for public display or comparison.
5. **One continuous arc.** Attended (past, rated) and planned (upcoming,
   watched) concerts are one timeline, not two separate modes — the app
   should always let the user see both together.
