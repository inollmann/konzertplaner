import json
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from concert import Artist, Concert, Event, Festival, Tour, Venue

BASE_DIR   = Path(__file__).parent
DATA_FILE  = BASE_DIR / "data" / "events.json"
CAT_FILE   = BASE_DIR / "data" / "catalogue.json"   # artists + venues
POSTER_DIR = BASE_DIR / "static" / "posters"
LOGO_DIR   = BASE_DIR / "static" / "logos"

for d in (DATA_FILE.parent, POSTER_DIR, LOGO_DIR):
    d.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "static"),
    static_url_path="/static",
)


def allowed_file(fn: str) -> bool:
    return "." in fn and fn.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ── Persistence: events ───────────────────────────────────────────────────────

def load_events() -> dict[str, Event]:
    legacy = BASE_DIR / "data" / "tours.json"
    path = DATA_FILE if DATA_FILE.exists() else (legacy if legacy.exists() else None)
    if path:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        return {e["id"]: Event.from_dict(e) for e in raw}
    return {}

def save_events(evts: dict[str, Event]):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump([e.to_dict() for e in evts.values()], f, ensure_ascii=False, indent=2)

events: dict[str, Event] = load_events()


# ── Persistence: catalogue ────────────────────────────────────────────────────

def load_catalogue() -> dict:
    if CAT_FILE.exists():
        with open(CAT_FILE, encoding="utf-8") as f:
            raw = json.load(f)
        return {
            "artists": {a["id"]: Artist.from_dict(a) for a in raw.get("artists", [])},
            "venues":  {v["id"]: Venue.from_dict(v)  for v in raw.get("venues",  [])},
        }
    return {"artists": {}, "venues": {}}

def save_catalogue():
    with open(CAT_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "artists": [a.to_dict() for a in catalogue["artists"].values()],
            "venues":  [v.to_dict() for v in catalogue["venues"].values()],
        }, f, ensure_ascii=False, indent=2)

catalogue = load_catalogue()


# ── Helpers ───────────────────────────────────────────────────────────────────

def all_known_bands() -> list[str]:
    """All artist/band names from catalogue + events, deduplicated & sorted."""
    names: set[str] = {a.name for a in catalogue["artists"].values()}
    for ev in events.values():
        if isinstance(ev, Tour):
            names.add(ev.artist)
            names.update(ev.support)
        elif isinstance(ev, Festival):
            names.update(ev.bands_to_watch)
    return sorted(names, key=str.casefold)

def all_known_venues() -> list[dict]:
    """All venues from catalogue + events, deduplicated."""
    seen: dict[str, dict] = {}
    for v in catalogue["venues"].values():
        key = f"{v.name.lower()}|{v.city.lower()}"
        seen[key] = {"id": v.id, "name": v.name, "city": v.city}
    for ev in events.values():
        if isinstance(ev, Tour):
            for c in ev.concerts:
                key = f"{c.venue.lower()}|{c.city.lower()}"
                if key not in seen:
                    seen[key] = {"id": None, "name": c.venue, "city": c.city}
        elif isinstance(ev, Festival):
            key = f"{ev.venue.lower()}|{ev.city.lower()}"
            if key not in seen:
                seen[key] = {"id": None, "name": ev.venue, "city": ev.city}
    return sorted(seen.values(), key=lambda x: x["name"].casefold())


# ── SPA ───────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR / "static"), "index.html")


# ── Image upload helpers ──────────────────────────────────────────────────────

def _save_upload(file, dest_dir: Path) -> str:
    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else "png"
    filename = f"{uuid.uuid4()}.{ext}"
    file.save(dest_dir / filename)
    return filename

@app.route("/api/upload-poster", methods=["POST"])
def upload_poster():
    f = request.files.get("poster")
    if not f or f.filename == "":
        return jsonify({"error": "No file"}), 400
    if not allowed_file(f.filename):
        return jsonify({"error": "Type not allowed"}), 400
    return jsonify({"filename": _save_upload(f, POSTER_DIR)})

@app.route("/api/upload-logo", methods=["POST"])
def upload_logo():
    f = request.files.get("logo")
    if not f or f.filename == "":
        return jsonify({"error": "No file"}), 400
    if not allowed_file(f.filename):
        return jsonify({"error": "Type not allowed"}), 400
    return jsonify({"filename": _save_upload(f, LOGO_DIR)})


# ── Autocomplete ──────────────────────────────────────────────────────────────

@app.route("/api/bands")
def get_bands():
    q = request.args.get("q", "").strip().lower()
    bands = all_known_bands()
    if q:
        starts   = [b for b in bands if b.lower().startswith(q)]
        contains = [b for b in bands if q in b.lower() and not b.lower().startswith(q)]
        bands = starts + contains
    return jsonify(bands)

@app.route("/api/venues")
def get_venues():
    city = request.args.get("city", "").strip().lower()
    venues = all_known_venues()
    if city:
        venues = [v for v in venues if v["city"].lower() == city]
    return jsonify(venues)


# ── AI extraction stub ────────────────────────────────────────────────────────

@app.route("/api/extract-poster", methods=["POST"])
def extract_poster():
    """
    Stub – not yet implemented.
    POST { filename, event_type } → 501
    Implementation: read image → AI vision → from_poster_data() → return dict
    """
    return jsonify({"status": "not_implemented"}), 501


# ── Events CRUD ───────────────────────────────────────────────────────────────

@app.route("/api/events", methods=["GET"])
def get_events():
    return jsonify([e.to_dict() for e in events.values()])

@app.route("/api/events", methods=["POST"])
def create_event():
    data = request.get_json()
    et = data.get("event_type", "tour")
    if et == "festival":
        ev = Festival(
            name=data["name"], city=data.get("city", ""),
            venue=data.get("venue", ""), date=data.get("date", ""),
            end_date=data.get("end_date"), time=data.get("time"),
            price=data.get("price"),
            bands_to_watch=data.get("bands_to_watch", []),
            tags=data.get("tags", []), poster=data.get("poster"),
            comment=data.get("comment", ""),
        )
    else:
        ev = Tour(
            artist=data["artist"], support=data.get("support", []),
            tour_name=data.get("tour_name", "Tour"),
            poster=data.get("poster"), comment=data.get("comment", ""),
        )
        for c in data.get("concerts", []):
            ev.add_concert(
                date=c["date"], city=c["city"], venue=c["venue"],
                price=c.get("price"), time=c.get("time"),
                end_date=c.get("end_date"), tags=c.get("tags", []),
                support_present=c.get("support_present"),
            )
    events[ev.id] = ev
    save_events(events)
    return jsonify(ev.to_dict()), 201

@app.route("/api/events/<eid>", methods=["PUT"])
def update_event(eid):
    if eid not in events:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json()
    ev = events[eid]
    if isinstance(ev, Festival):
        ev.name   = data.get("name",   ev.name)
        ev.city   = data.get("city",   ev.city)
        ev.venue  = data.get("venue",  ev.venue)
        ev.date   = data.get("date",   ev.date)
        ev.end_date = data.get("end_date", ev.end_date)
        ev.time   = data.get("time",   ev.time)
        ev.price  = data["price"] if "price" in data else ev.price
        ev.bands_to_watch = data.get("bands_to_watch", ev.bands_to_watch)
        ev.tags   = data.get("tags",   ev.tags)
        ev.comment = data.get("comment", ev.comment)
    else:
        ev.artist    = data.get("artist",    ev.artist)
        ev.name      = ev.artist
        ev.support   = data.get("support",   ev.support)
        ev.tour_name = data.get("tour_name", ev.tour_name)
        ev.comment   = data.get("comment",   ev.comment)
        if "concerts" in data:
            ev.concerts = []
            for c in data["concerts"]:
                ev.add_concert(
                    date=c["date"], city=c["city"], venue=c["venue"],
                    price=c.get("price"), time=c.get("time"),
                    end_date=c.get("end_date"), tags=c.get("tags", []),
                    support_present=c.get("support_present"),
                )
    if "poster" in data:
        ev.poster = data["poster"]
    save_events(events)
    return jsonify(ev.to_dict())

@app.route("/api/events/<eid>", methods=["DELETE"])
def delete_event(eid):
    if eid not in events:
        return jsonify({"error": "Not found"}), 404
    del events[eid]
    save_events(events)
    return jsonify({"ok": True})


# ── Catalogue: Artists ────────────────────────────────────────────────────────

@app.route("/api/artists", methods=["GET"])
def get_artists():
    """
    Returns catalogue artists merged with band names derived from events.
    Event-derived names not yet in the catalogue are returned as stub entries
    (id=None, logo=None, derived=True) so the frontend can display them and
    optionally save them as real catalogue entries.
    """
    cat_names = {a.name.casefold() for a in catalogue["artists"].values()}
    result = [a.to_dict() for a in catalogue["artists"].values()]
    for name in all_known_bands():
        if name.casefold() not in cat_names:
            result.append({"id": None, "name": name, "logo": None, "derived": True})
    result.sort(key=lambda x: x["name"].casefold())
    return jsonify(result)

@app.route("/api/artists", methods=["POST"])
def create_artist():
    data = request.get_json()
    a = Artist(name=data["name"], logo=data.get("logo"))
    catalogue["artists"][a.id] = a
    save_catalogue()
    return jsonify(a.to_dict()), 201

@app.route("/api/artists/<aid>", methods=["PUT"])
def update_artist(aid):
    if aid not in catalogue["artists"]:
        return jsonify({"error": "Not found"}), 404
    a = catalogue["artists"][aid]
    data = request.get_json()
    a.name = data.get("name", a.name)
    if "logo" in data:
        a.logo = data["logo"]
    save_catalogue()
    return jsonify(a.to_dict())

@app.route("/api/artists/<aid>", methods=["DELETE"])
def delete_artist(aid):
    if aid not in catalogue["artists"]:
        return jsonify({"error": "Not found"}), 404
    del catalogue["artists"][aid]
    save_catalogue()
    return jsonify({"ok": True})


# ── Catalogue: Venues ─────────────────────────────────────────────────────────

@app.route("/api/venues-catalogue", methods=["GET"])
def get_venues_catalogue():
    return jsonify([v.to_dict() for v in catalogue["venues"].values()])

@app.route("/api/venues-catalogue", methods=["POST"])
def create_venue():
    data = request.get_json()
    v = Venue(name=data["name"], city=data.get("city", ""))
    catalogue["venues"][v.id] = v
    save_catalogue()
    return jsonify(v.to_dict()), 201

@app.route("/api/venues-catalogue/<vid>", methods=["PUT"])
def update_venue(vid):
    if vid not in catalogue["venues"]:
        return jsonify({"error": "Not found"}), 404
    v = catalogue["venues"][vid]
    data = request.get_json()
    v.name = data.get("name", v.name)
    v.city = data.get("city", v.city)
    save_catalogue()
    return jsonify(v.to_dict())

@app.route("/api/venues-catalogue/<vid>", methods=["DELETE"])
def delete_venue(vid):
    if vid not in catalogue["venues"]:
        return jsonify({"error": "Not found"}), 404
    del catalogue["venues"][vid]
    save_catalogue()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)