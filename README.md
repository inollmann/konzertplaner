# 🎸 Konzertplaner

Lokales Planungstool für Konzerte und Touren — Flask-Backend + Single-Page-Frontend.

## Projektstruktur

```
konzertplaner/
├── main.py           ← Flask-Server & API
├── concert.py        ← Datenmodell (Tour, Concert)
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── static/
│   ├── index.html    ← Frontend (SPA)
│   └── posters/      ← Hochgeladene Tourposter (wird automatisch erstellt)
└── data/
    └── tours.json    ← Persistente Daten (wird automatisch erstellt)
```

---

## Starten (ohne Docker)

```bash
# Abhängigkeiten installieren (uv)
uv pip install flask werkzeug

# Server starten
python main.py
```

Dann im Browser: **http://localhost:5000**

---

## Starten mit Docker

```bash
# Bauen und starten
docker compose up --build

# Im Hintergrund
docker compose up --build -d
```

Dann im Browser: **http://localhost:5000**

---

## Features

- **Konzertliste** – Alle Touren als Cards mit Poster, Artist-Info und einzelnen Konzertdaten
- **Kalenderansicht** – Monatskalender mit Konzert-Events und Hover-Details
- **Neues Konzert** – Modal zum Anlegen einer Tour mit:
  - Poster-Upload (PNG/JPG/WebP)
  - Artist, Tourname, Support Acts
  - Beliebig viele Konzerttermine mit Datum, Uhrzeit, Stadt, Venue, Preis
  - Mehrtägige Events
  - Tags: „Tickets gekauft" und „Merkliste"
- **Filter** – Nach Tags filtern in beiden Ansichten
- **Bearbeiten & Löschen** von gespeicherten Touren
- **Persistenz** – Daten werden in `data/tours.json` gespeichert
