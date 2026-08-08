# Konzertplaner

Lokales Planungstool für Konzerte und Touren — Flask-Backend + Vanilla-JS-Single-Page-Frontend. Daten in PostgreSQL (via SQLModel). Deutschsprachige UI.

## Projektstruktur

```
konzertplaner/
├── main.py            Flask-Server & API (~30 Routes)
├── concert.py         Datenmodelle (Tour/Festival/Concert/Artist/Venue)
├── db.py              DB-Layer (SQLModel-Engine, CRUD, JSON-Migration)
├── models.py          SQLModel-Tabellen (Image, EventRow, ArtistRow, VenueRow)
├── static/            SPA ohne Build-Step (index.html, js/, style.css, PWA-Assets)
├── data/              Legacy-Migrationsquelle (events.json, catalogue.json)
├── tests/             pytest (Unit) + Playwright E2E
├── .github/workflows/ CI (ruff, pytest, tsc, vitest, e2e, docker build)
├── pyproject.toml     uv/Dev-Abhängigkeiten
├── requirements.txt   Docker-Abhängigkeiten
├── Dockerfile / docker-compose.yml
├── AGENTS.md          Architektur-Doku (autoritativ)
└── DESIGN.md
```

Das Frontend liegt als ES-Module unter `static/js/` (Eintrittspunkt `main.js`). Eine kompakte Übersicht aller Module findet sich in `AGENTS.md`.

---

## Option 1: Starten (ohne Docker)

Empfohlen: [uv](https://docs.astral.sh/uv/getting-started/installation/) für Paketmanagement.

```bash
uv venv --python 3.13
uv sync
python main.py
```

Dann im Browser: **http://localhost:5000** (debug=True)

> **PostgreSQL erforderlich.** `DATABASE_URL` defaultet auf
> `postgresql+psycopg://kp:kp@localhost:5432/kp` und ist per Environment-Variable
> überschreibbar. Tabellen werden beim ersten Start automatisch angelegt;
> falls die DB leer ist, wird einmalig aus `data/*.json` migriert.

---

## Option 2: Starten mit Docker

```bash
docker compose up --build        # im Vordergrund
docker compose up --build -d     # im Hintergrund
```

Dann im Browser: **http://localhost:5000**

Docker Compose startet automatisch einen PostgreSQL-Container und verbindet die App per `DATABASE_URL`.

---

## Features

### Event-Verwaltung
- **Touren & Festivals** – Zwei Event-Typen mit unterschiedlichen Feldern (Tour = N Konzerte, Festival = einzelnes Datum/Venue)
- **Eventim-Suche** – Events direkt von Eventim suchen und importieren (proxy über `/api/eventim/*`)
- **Neues Event** – Modal mit Poster-/Logo-Upload (PNG/JPG/WebP), Artist (Co-Headlining), Tourname, Support Acts, beliebig viele Konzerttermine, mehrtägige Events, Tags ("Tickets gekauft", "Merkliste"), Preis, Ticket-Link, Notizen
- **Invite-Links** – Events per URL teilen (`/invite/<eid>/<code>`)

### Ansichten
- **Konzertliste** – Alle Touren/Festivals als Cards, mit Unteransicht **Zeitstrahl** (virtuelle horizontale Timeline)
- **Kalender** – Monatskalender mit Konzert-Events und Hover-Details
- **Karte** – Interaktive Leaflet-Karte mit allen Venue-Standorten, gruppierten Markern, Farbcodierung (Tour/Festival/Gemischt), Drag & Drop, gecachte Koordinaten
- **Shows** – Bewertete Events gruppiert/sortiert, Histogramme
- **Favoriten** – Artists verfolgen, Eventim-Lookup

### Bewertungen & Kataloge
- **Bewertungen** – Vergangene Konzerte bewerten (1–5 Sterne), Artist-Zusammenfassungen
- **Artist-Katalog** – Verwaltung aller Artists mit Logo und Foto
- **Venue-Katalog** – Verwaltung aller Venues

### Filter & Suche
- Nach Tags filtern (Tickets gekauft, Merkliste) – funktioniert in Liste, Kalender und Karte
- Eventim-Direktsuche im Header

### Import/Export
- Export als HTML, CSV oder iCal (.ics)
- Backup (vollständiges JSON) / Restore
- Statistiken (Konzerte, Ausgaben, etc.)

### Design & Anpassung
- Dark/Light Mode (automatisch oder manuell)
- Design-Tool (Farben/CSS, externes Tool unter `/design-tool`)
- Custom CSS

### PWA
- Installierbar (manifest + Service Worker)

---

## Persistenz

- **PostgreSQL** via SQLModel — Events, Artists, Venues und Bilder
- **Bilder** in `images`-Tabelle (BYTEA), ausgeliefert über `/api/img/<uuid>`. Keine Bildspeicherung auf Festplatte
- **`data/*.json`** sind Legacy-Migrationsquelle: werden nur beim ersten Start gelesen, wenn die DB leer ist, danach nicht mehr
- **Multi-worker-safe** — kein In-Memory-State, jede Anfrage liest/schreibt die DB
- **Browser-Cache** — Designs, Farben, Favoriten in localStorage

---

## Technologie

- **Backend**: Flask, SQLModel, PostgreSQL (psycopg)
- **Frontend**: Vanilla JavaScript (ES Modules), CSS Variables, Leaflet.js + OpenStreetMap
- **Typen**: TypeScript-Check via `tsc --noEmit` (ambient types in `static/js/types.d.ts`)
- **PWA**: manifest.json + service-worker.js

---

## Entwicklung & Tests

```bash
# Lint / Format
uv run ruff check
uv run ruff format --check

# Python-Tests (Unit, in-memory sqlite)
uv run pytest --cov

# Python E2E (Playwright, separat markiert)
uv run playwright install --with-deps chromium
uv run pytest -m e2e

# Frontend-Tests (vitest, jsdom)
npm test

# Typecheck (Frontend)
npx tsc --noEmit
```

CI läuft automatisch auf Push und Pull Requests (`.github/workflows/ci.yml`) mit sechs Jobs: ruff lint+format, pytest, tsc, vitest, Playwright E2E und Docker Build.
