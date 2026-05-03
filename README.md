# 🎸 Konzertplaner

Lokales Planungstool für Konzerte und Touren — Flask-Backend + Single-Page-Frontend.

## Projektstruktur

```
konzertplaner/
├── main.py           ← Flask-Server & API
├── concert.py        ← Datenmodell (Tour, Concert, Festival, Artist, Venue)
├── requirements.txt
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
├── static/
│   ├── index.html    ← Frontend (SPA)
│   ├── design_tool.html ← Externes Design-Tool
│   ├── posters/      ← Hochgeladene Tourposter
│   └── logos/        ← Hochgeladene Artist-Logos
└── data/
    └── tours.json    ← Persistente Daten (wird automatisch erstellt)
```

---

## Option 1: Starten (ohne Docker)
Empfohlen: [uv](https://docs.astral.sh/uv/getting-started/installation/) für Paketmanagement installieren

```bash
# Abhängigkeiten installieren (uv)
sudo apt update
uv venv --python 3.13
uv sync

# Server starten
python main.py
```

Dann im Browser: **http://localhost:5000**

---

## Option 2: Starten mit Docker

```bash
# Bauen und starten
docker compose up --build

# Im Hintergrund
docker compose up --build -d
```

Dann im Browser: **http://localhost:5000**

---

## Features

### Event-Verwaltung
- **Eventim Suche** – Events direkt von Eventim suchen und importieren
- **Touren & Festivals** – Zwei Event-Typen mit unterschiedlichen Feldern
- **Neues Event** – Modal zum Anlegen mit:
  - Poster-Upload (PNG/JPG/WebP)
  - Artist, Tourname, Support Acts
  - Beliebig viele Konzerttermine mit Datum, Uhrzeit, Stadt, Venue, Preis
  - Mehrtägige Events (Start-/Enddatum)
  - Tags: "Tickets gekauft" und "Merkliste"
  - Preis und Ticket-Link
  - Notizen/Kommentare

### Ansichten
- **Konzertliste** – Alle Touren als Cards mit Poster, Artist-Info und Konzertdaten
- **Kalenderansicht** – Monatskalender mit Konzert-Events und Hover-Details
- **Kartenansicht** – Interaktive Karte mit allen Venue-Standorten
  - Gruppierte Marker nach Venue
  - Farbcodierung (Tour/Festival/Gemischt)
  - Drag & Drop zum Verschieben von Markern
  - Koordinaten werden gecached

### Favoriten & Bewertungen
- **Favoriten** – Artists zur Favoritenliste hinzufügen
- **Bewertungen** – Vergangene Konzerte bewerten (1-5 Sterne)
- **Artist-Katalog** – Verwaltung aller bekannten Artists mit Logo und Foto

### Filter & Suche
- **Filter** – Nach Tags filtern (Tickets gekauft, Merkliste)
- **Filter** – Filter funktionieren in Liste, Kalender und Karte
- **Eventim-Suche** – Direktsuche im Header

### Import/Export
- **Export** – Liste als HTML, CSV oder iCal (.ics) exportieren
- **Backup** – Vollständiges Backup aller Daten (JSON)
- **Restore** – Backup wiederherstellen

### Design & Anpassung
- **Dark/Light Mode** – Automatisch oder manuell umschaltbar
- **Design Tool** – Farben und CSS anpassen (externes Tool)
- **Custom CSS** – Eigene CSS-Regeln hinzufügen
- **Statistiken** – Übersicht über Konzerte, Ausgaben, etc.

### Persistenz
- **Lokale Speicherung** – Alle Daten in JSON-Dateien
- **Browser-Cache** – Designs, Farben, Favoriten in localStorage
- **Backup/Restore** – Manuelle Datensicherung

---

## Technologie

- **Backend**: Flask (Python)
- **Frontend**: Vanilla JavaScript, CSS Variables
- **Karte**: Leaflet.js + OpenStreetMap
- **Daten**: JSON-Dateien + localStorage
