# Bildschirmnutzung, Wochentage, Eventim-Fix & weitere Konzertquellen

Implementierungsplan, Stand 2026-10-31. Vier unabhängige Pakete, empfohlene Reihenfolge:
**A → B → C → D → E**. Nach jedem Paket: `uv run ruff check && uv run ruff format --check`,
`uv run pytest`, `npm run typecheck`, `npm test`, danach im Browser prüfen (`python main.py`).
UI-Texte und Kommentare auf Deutsch.

---

## A. Wochentag bei Event-Daten

- `static/js/utils.js` `parseDate()` (~Z. 69): zusätzliches Feld
  `weekday: d.toLocaleDateString('de-DE', { weekday: 'short' })` (→ `"Fr."`). Fallback bei
  fehlendem Datum: `'??'`.
- `fmtDateShort(iso, { weekday = false } = {})`: optionaler Wochentag → `"Fr., 14. Nov."`.
  Default bleibt ohne Wochentag, damit bestehende Aufrufer unverändert bleiben.
- `static/js/list.js`:
  - `renderConcertRow` + `renderFestCard`: im `.date-block` über `.date-day` ein
    `<div class="date-weekday">${d.weekday}</div>` einfügen.
  - `date-end`-Label und `renderWallCard` nutzen `fmtDateShort(..., { weekday: true })`.
- `static/style.css`: `.date-weekday` analog zu `.date-month` (xs, muted, uppercase, letter-spacing).
- `static/js/utils.test.js`: Tests für `weekday` und `fmtDateShort` mit/ohne Wochentag.

## B. Kachelansicht: dynamische Kachelgröße

Heute: feste `minmax(240px, 1fr)` (`style.css` ~Z. 380) + Media-Queries ~Z. 1591/1611.

- Neue pure Funktion in `utils.js`:
  ```js
  /** @returns {{cols:number, tile:number}} */
  export function wallLayout(width, height, n, gap, { min = 160, max = 420, ratio = 1.5 } = {})
  ```
  Algorithmus: für `cols = 1..floor((width+gap)/(min+gap))` Kachelbreite
  `w = (width - (cols-1)*gap) / cols` berechnen, Höhe `rows*w*ratio + (rows-1)*gap` mit
  `rows = ceil(n/cols)`. Wähle das **kleinste** `cols`, bei dem alles in `height` passt und
  `w <= max`. Passt nichts → `cols` so, dass `w ≈ min` (maximale Spaltenzahl). `w` immer auf
  `[min, max]` clampen; `n = 0` → beliebige gültige Werte.
- `list.js` `renderList()` im Wall-Zweig: Breite = `el.clientWidth`, Höhe =
  `window.innerHeight - el.getBoundingClientRect().top - Padding`; setze
  `el.style.setProperty('--wall-cols', cols)` und `--wall-tile-max` (= `max`px).
- Einmalig einen `ResizeObserver` auf `#event-list` registrieren (Flag wie `_listClickWired`),
  der bei aktiver Wall-Ansicht nur die CSS-Variablen neu berechnet (kein Re-Render).
- CSS: `.poster-wall { grid-template-columns: repeat(var(--wall-cols, auto-fill), minmax(0, var(--wall-tile-max, 1fr))); }`
  – einfacher: `repeat(var(--wall-cols), 1fr)` mit Fallback-Regel für fehlende Variable.
  Die festen `.poster-wall`-Media-Queries entfernen (Gap auf Mobile darf bleiben).
- `utils.test.js`: Tests (1 Event → nicht breiter als `max`; viele Events → `w ≈ min`;
  Ergebnis passt in die Höhe, wenn möglich).

## C. Konzertliste: Leerraum in Event-Karten

Ursache: Karten sind volle `main`-Breite, `.concert-item` ist `grid 80px 1fr auto`
(`style.css` ~Z. 505) → Mitte leer, Preis/Tags kleben am rechten Rand.

- `#event-list` (nur Listenansicht, also wenn `className === ''` → besser eigene Klasse
  `event-grid` in `renderList` setzen):
  `display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: var(--space-9); align-items:start;`
  `.event-card` verliert dann `margin-bottom`.
- Konzertzeile kompakter (`renderConcertRow`, `renderFestCard`):
  - Zeile 1: Venue (fett)
  - Zeile 2: `Stadt · Uhrzeit` in einer Zeile (Icons behalten)
  - Zeile 3 (falls vorhanden): Preis, Ticketlink, Tags inline (`flex-wrap`), statt rechter Spalte.
  - Grid wird `56px 1fr`; `.concert-right` entfällt in der Listenkarte (Detailpanel unverändert).
- Lange Touren: nach 4 Konzerten abschneiden, Zeile `+ N weitere` (Klick öffnet wie bisher
  das Detailpanel über den Karten-Klick). Bei aktiven Tag-Filtern weiterhin nur gefilterte.
- Header: Poster 96px statt 68px (`.event-poster`, `.event-poster-placeholder`).
- Mobile (<640px) ergibt sich automatisch eine Spalte; vorhandene Mobile-Regeln für
  `.concert-item` (~Z. 1013, 1572) prüfen und anpassen.
- E2E-Tests in `tests/e2e/` auf geänderte Selektoren prüfen.

## D. Eventim-Suche: Treffer gehen verloren (Bugfix)

**Befund (live getestet):** Eventims `search_term` ist unscharf. `"Allt"` liefert 561 Treffer
(9 Seiten), u. a. „Alle für Halle", „All Over"… Mit `sort=DateAsc` werden diese nach Datum
sortiert, und die echten Allt-Konzerte landen **nicht auf Seite 1** (0 Treffer). Ohne `sort`
(oder `sort=Recommendation`) stehen sie auf Platz 0/1 (14 Treffer auf Seite 1).
Polaris und Spiritbox sind auf eventim.de tatsächlich nicht gelistet (alle Seiten geprüft) →
dafür Paket E.

Änderungen in `main.py`:
- `eventim_artist_search` (~Z. 317), `eventim_artist_events` (~Z. 385) und `eventim_search`
  (~Z. 989): `"sort": "DateAsc"` entfernen (Relevanz-Sortierung = Default).
- `eventim_artist_events`: nach dem Filtern `concerts.sort(key=lambda c: (c["date"], c["time"]))`.
  Zusätzlich bis zu 3 Seiten abrufen, solange die Seite noch passende Treffer enthielt
  (Relevanz → echte Treffer stehen vorne; Abbruch bei der ersten Seite ohne Treffer).
- Matching verschärfen: aktuell `name_lower in a.lower()` → auch Teilstrings („Polaris" in
  „Polaris Tribute"). Neu: exakter Vergleich (casefold) der Attraction-Namen; Teilstring nur
  als Fallback, wenn es keinen exakten Treffer gibt.
- `eventim_search` (Tour-Suche): falls die UI chronologisch sortiert erwartet, nach dem
  Gruppieren serverseitig nach Datum sortieren.
- Tests in `tests/test_api_eventim.py`: gemocktes `_eventim_get` prüft, dass kein
  `sort=DateAsc` gesendet wird, Ergebnisse nach Datum sortiert sind und exakter Match
  Teilstring-Matches verdrängt.

## E. Weitere Quellen: Ticketmaster + Bandsintown

Beide als optionale Provider; ohne Key wird der Provider übersprungen, Eventim allein
funktioniert weiter. **Vor der Umsetzung aktuelle API-Doku/Nutzungsbedingungen prüfen**
(Bandsintown erlaubt die API offiziell nur Künstlern/Partnern mit `app_id`).

### Backend (`main.py`)
- Konfiguration über Umgebungsvariablen `TICKETMASTER_API_KEY`, `BANDSINTOWN_APP_ID`
  (keine Config-Dateien im Projekt). HA-Add-on: Optionen `ticketmaster_api_key`,
  `bandsintown_app_id` in `homeassistant/config.yaml` (Schema `str?`) und in
  `homeassistant/run.sh` per `jq` exportieren.
- Provider-Funktionen mit einheitlichem Rückgabeformat (= bisheriges Concert-Dict aus
  `eventim_artist_events` + `"source": "eventim"|"ticketmaster"|"bandsintown"`):
  - `_events_eventim(name)` – bestehende Logik aus `eventim_artist_events` extrahieren.
  - `_events_ticketmaster(name)` – erst
    `GET https://app.ticketmaster.com/discovery/v2/attractions.json?keyword=<name>&classificationName=music&apikey=…`,
    Attraction mit exaktem Namen wählen, dann
    `GET /discovery/v2/events.json?attractionId=<id>&countryCode=DE&sort=date,asc&size=100&apikey=…`.
    Mapping: `dates.start.localDate/localTime`, `_embedded.venues[0].name/city.name`, `url`.
    Ländereinschränkung: zunächst DE (später ggf. konfigurierbar, z. B. `DE,AT,CH,NL`).
  - `_events_bandsintown(name)` –
    `GET https://rest.bandsintown.com/artists/<url-encoded name>/events?app_id=…&date=upcoming`.
    Mapping: `datetime`, `venue.name/city/country`, `offers[0].url` bzw. `url`. Optional auf
    die gleichen Länder wie Ticketmaster filtern.
  - HTTP über `requests` mit `urllib`-Fallback wie beim Eventim-Proxy (nicht die
    Eventim-Session/Headers wiederverwenden); Timeout ~8 s; Fehler eines Providers loggen
    und ignorieren.
- Neuer Endpoint `GET /api/artist-events?name=<name>`: alle verfügbaren Provider aufrufen
  (sequenziell oder `ThreadPoolExecutor`), zusammenführen, deduplizieren nach
  `(date, city.casefold())` – bei Duplikat Eventim > Ticketmaster > Bandsintown bevorzugen,
  aber `sources: [...]` aller Treffer sammeln. Sortiert nach Datum zurückgeben:
  `{"artist", "concerts", "total", "providers": {"eventim": "ok", "ticketmaster": "no_key", …}}`.
- `/api/eventim/artist-events` bleibt als Alias/Kompatibilität bestehen.

### Frontend
- `static/js/favourites.js` `loadFavArtistEvents` (~Z. 362) auf `/api/artist-events`
  umstellen. Die Eventim-Namensbestätigung (`artist-search`) bleibt, ist aber nicht mehr
  Voraussetzung: findet Eventim nichts, trotzdem mit dem lokalen Namen die anderen Provider
  abfragen.
- Quellen-Badge je Konzert (kleines Label „Eventim"/„Ticketmaster"/„Bandsintown"); Ticketlink
  nutzt `link` der jeweiligen Quelle.
- `static/js/notifications.js`: Hintergrund-Polling auf den neuen Endpoint umstellen.
- Hinweis in den Werkzeugen/Einstellungen, welche Provider aktiv sind (aus `providers`).

### Tests
- `tests/test_api_artist_events.py`: Provider-Funktionen monkeypatchen; Dedupe, Sortierung,
  Überspringen ohne Key, Fehler eines Providers bricht nicht den Endpoint.
- Mapping-Tests mit kleinen JSON-Fixtures je Provider.

### Doku
- `AGENTS.md`: Abschnitt „Eventim proxy" um die Provider-Architektur und Env-Variablen
  ergänzen; README-Hinweis zu den Keys.
