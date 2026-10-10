# Konzertplaner Home Assistant Add-on

Verpackt den [Konzertplaner](https://github.com/inollmann/konzertplaner) als
Home Assistant Add-on. Die App-Quelle wird beim Build aus dem Repository
geklont; die Daten liegen in einer SQLite-Datenbank im persistenten
`/data`-Ordner.

Siehe [DOCS.md](DOCS.md) für Installation, Konfiguration und Zugriff.

## Struktur

| Datei | Zweck |
|---|---|
| `config.yaml` | Add-on-Metadaten (Name, Ports, Optionen, Schema). |
| `Dockerfile` | Baut das Add-on; klont das Repo und installiert die Abhängigkeiten. |
| `run.sh` | Liest `/data/options.json` und startet die App. |
| `translations/` | Beschriftungen der Optionen (en/de). |

Der Build-Kontext eines HA-Add-ons ist ausschließlich dieser Ordner. Da die
Anwendung im Repository-Root liegt, wird sie im `Dockerfile` per `git clone`
geholt (`--build-arg KP_REF=<tag>` pinnt eine Version).
