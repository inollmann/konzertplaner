# Konzertplaner

Lokaler Konzert- und Tourplaner als Home Assistant Add-on.

Die App ist eine Flask-Anwendung mit einer reinen JavaScript-Oberfläche. Alle
Daten (Events, Künstler, Venues und Bilder) liegen in einer SQLite-Datenbank im
persistenten `/data`-Ordner des Add-ons und werden dadurch automatisch in
Home-Assistant-Backups mitgesichert.

## Installation

1. In Home Assistant zu **Einstellungen → Add-ons → Add-on-Store** wechseln.
2. Oben rechts auf das Drei-Punkte-Menü → **Repositories** klicken.
3. `https://github.com/inollmann/konzertplaner` hinzufügen.
4. Das Add-on **Konzertplaner** installieren und starten.

## Zugriff

Die Weboberfläche ist nach dem Start über die Port-Weiterleitung erreichbar:

- Von außen: `http://<HA-HOST>:8069`
- Der Button **ÖFFNEN** in der Add-on-Ansicht nutzt die interne Weiterleitung.

Der Host-Port ist in `config.yaml` (`ports: 5000/tcp: 8069`) fest verdrahtet und
nicht über die Add-on-Optionen änderbar. Für einen anderen Port muss dieser Wert
im Repository angepasst werden.

## Konfiguration

| Option | Beschreibung |
|---|---|
| `log_level` | Ausführlichkeit der Logs (`trace` … `fatal`). |
| `database_url` | Optional. Leer lassen für die eingebaute SQLite-Datenbank. |

### PostgreSQL verwenden

Statt SQLite kann eine PostgreSQL-Datenbank genutzt werden. Dazu die Option
`database_url` setzen, z. B.:

```yaml
database_url: postgresql+psycopg://user:passwort@host:5432/konzertplaner
```

Zum Übernehmen bestehender PostgreSQL-Daten nach SQLite gibt es das Skript
`scripts/migrate_pg_to_sqlite.py` im Repository.

## Daten & Backup

- Datenbank: `/data/konzertplaner.db` (SQLite, inkl. WAL-Dateien)
- Bilder werden als BLOB in der Datenbank gespeichert.
- Da alles unter `/data` liegt, sind die Daten in jedem HA-Backup enthalten.

## Standalone-Betrieb

Dasselbe Projekt lässt sich unverändert eigenständig hosten (`python main.py`
oder `docker compose up`). SQLite ist dabei ebenfalls der Standard.
