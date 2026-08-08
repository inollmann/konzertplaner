import json
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

from concert import Artist, Event, Festival, Tour, Venue
from db import (
    create_image, delete_artist_db, delete_event_db, delete_venue_db,
    get_artist, get_event, get_image, init_db, list_artists, list_events,
    list_venues, upsert_artist, upsert_event, upsert_venue,
)

BASE_DIR = Path(__file__).parent

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}

app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "static"),
    static_url_path="/static",
)

init_db()


def allowed_file(fn: str) -> bool:
    return "." in fn and fn.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ── Helpers ───────────────────────────────────────────────────────────────────


def all_known_bands() -> list[str]:
    """All artist/band names from catalogue + events, deduplicated & sorted."""
    names: set[str] = {a.name for a in list_artists()}
    for ev in list_events():
        if isinstance(ev, Tour):
            if isinstance(ev.artist, list):
                names.update(ev.artist)
            else:
                names.add(ev.artist)
            names.update(ev.support)
        elif isinstance(ev, Festival):
            names.update(ev.bands_to_watch)
    return sorted(names, key=str.casefold)


def all_known_venues() -> list[dict]:
    """All venues from catalogue + events, deduplicated."""
    seen: dict[str, dict] = {}
    for v in list_venues():
        key = f"{v.name.lower()}|{v.city.lower()}"
        seen[key] = {"id": v.id, "name": v.name, "city": v.city}
    for ev in list_events():
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


@app.route("/invite/<eid>/<code>")
def handle_invite(eid, code):
    """Handle invite URL - import and redirect to events."""
    # Import the event
    import base64
    import json

    try:
        json_str = base64.urlsafe_b64decode(code.encode("utf-8")).decode("utf-8")
        invite_data = json.loads(json_str)

        if invite_data.get("v") != 2:
            return "Unbekannte Einladungsversion", 400

        event_type = invite_data.get("t", "tour")

        if event_type == "tour":
            from concert import Tour

            ev = Tour(
                artist=invite_data.get("a", ""),
                tour_name=invite_data.get("n", "Tour"),
            )
            for support in invite_data.get("s", []):
                ev.support.append(support)
            for c in invite_data.get("c", []):
                ev.add_concert(
                    date=c.get("d", ""),
                    city=c.get("y", ""),
                    venue=c.get("v", ""),
                    price=c.get("p"),
                    end_date=c.get("e"),
                )
        else:
            from concert import Festival

            ev = Festival(
                name=invite_data.get("n", ""),
                city=invite_data.get("c", [{}])[0].get("y", "")
                if invite_data.get("c")
                else "",
                venue=invite_data.get("c", [{}])[0].get("v", "")
                if invite_data.get("c")
                else "",
                time=invite_data.get("tm"),
                ticket_link=invite_data.get("tk"),
                bands_to_watch=invite_data.get("bw", []),
                tags=invite_data.get("tg", []),
                comment=invite_data.get("cm", ""),
            )
            if invite_data.get("c"):
                first_concert = invite_data["c"][0]
                ev.date = first_concert.get("d", "")
                if len(invite_data["c"]) > 1:
                    ev.end_date = invite_data["c"][-1].get("d", "")
                elif first_concert.get("e"):
                    ev.end_date = first_concert.get("e")

        # Save the event to DB
        import uuid

        new_eid = str(uuid.uuid4())[:8]
        ev.id = new_eid
        upsert_event(ev)

        # Redirect to main page with success message
        from flask import make_response

        resp = make_response("""
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="refresh" content="0;url=/">
                <script>localStorage.setItem('invite_success', 'Event wurde importiert!');</script>
            </head>
            <body>
                <p>Event wird importiert... <a href="/">Weiter</a></p>
            </body>
            </html>
        """)
        return resp

    except Exception as e:
        return f"Import fehlgeschlagen: {str(e)}", 400


@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR / "static"), "index.html")


@app.route("/design-tool")
def design_tool():
    return send_from_directory(str(BASE_DIR / "static"), "design_tool.html")


@app.route("/api/design/export-css", methods=["GET"])
def export_css():
    """Export current CSS variable overrides as a downloadable .css snippet."""
    vars_param = request.args.get("vars", "")
    if not vars_param:
        return jsonify({"error": "No vars"}), 400
    lines = [":root {"]
    for pair in vars_param.split(";"):
        if ":" in pair:
            k, v = pair.split(":", 1)
            lines.append(f"  {k.strip()}: {v.strip()};")
    lines.append("}")
    css = "\n".join(lines)
    from flask import Response

    return Response(
        css,
        mimetype="text/css",
        headers={"Content-Disposition": "attachment; filename=konzertplaner-theme.css"},
    )


# ── Image serving & upload ────────────────────────────────────────────────────


@app.route("/api/img/<img_id>")
def serve_image(img_id):
    """Serve an image stored in the DB by UUID."""
    img = get_image(img_id)
    if not img:
        return "Not found", 404
    return Response(img.data, mimetype=img.mime)


@app.route("/api/upload-poster", methods=["POST"])
def upload_poster():
    f = request.files.get("poster")
    if not f or not f.filename:
        return jsonify({"error": "No file"}), 400
    if not allowed_file(f.filename):
        return jsonify({"error": "Type not allowed"}), 400
    ext = f.filename.rsplit(".", 1)[1].lower() if "." in f.filename else "png"
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
    img_id = create_image(f.read(), "poster", mime, f.filename)
    return jsonify({"id": img_id})


@app.route("/api/upload-logo", methods=["POST"])
def upload_logo():
    f = request.files.get("logo")
    if not f or not f.filename:
        return jsonify({"error": "No file"}), 400
    if not allowed_file(f.filename):
        return jsonify({"error": "Type not allowed"}), 400
    img_type = request.form.get("type", "logo")
    ext = f.filename.rsplit(".", 1)[1].lower() if "." in f.filename else "png"
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
    img_id = create_image(f.read(), img_type, mime, f.filename)
    return jsonify({"id": img_id})


@app.route("/api/upload-festival-logo", methods=["POST"])
def upload_festival_logo():
    """Upload a festival logo (image). Optional `name` for a named file."""
    f = request.files.get("logo")
    if not f or not f.filename:
        return jsonify({"error": "No file"}), 400
    if not allowed_file(f.filename):
        return jsonify({"error": "Type not allowed"}), 400
    ext = f.filename.rsplit(".", 1)[1].lower() if "." in f.filename else "png"
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp"}.get(ext, "image/png")
    img_id = create_image(f.read(), "festival-logo", mime, f.filename)
    return jsonify({"id": img_id})


# ── Autocomplete ──────────────────────────────────────────────────────────────


@app.route("/api/bands")
def get_bands():
    q = request.args.get("q", "").strip().lower()
    bands = all_known_bands()
    if q:
        starts = [b for b in bands if b.lower().startswith(q)]
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


@app.route("/api/eventim/artist-search")
def eventim_artist_search():
    """
    Search Eventim for an artist by name — returns unique attraction names
    so the frontend can confirm which Eventim artist name matches a local artist.
    Query params: q (required), top (default 10)
    """
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "Missing q"}), 400
    data, status = _eventim_get(
        "/websearch/search/api/exploration/v1/products",
        {
            "webId": "web__eventim-de",
            "language": "de",
            "page": "1",
            "sort": "DateAsc",
            "top": "50",  # larger set for better name matching
            "search_term": q,
            "categories": "Konzerte",
            # NOTE: no in_stock filter — sold-out events still show artist info
        },
    )
    if "error" in data:
        return jsonify(data), status

    # Collect unique artist names from two sources:
    # 1. attractions[] field (large/verified artists)
    # 2. product name itself (small artists often appear here without attractions)
    seen: dict[str, dict] = {}
    q_lower = q.lower()

    def _add(name: str, group_id: str):
        key = name.lower()
        if not name:
            return
        if key not in seen:
            seen[key] = {"name": name, "group_id": group_id, "event_count": 0}
        seen[key]["event_count"] += 1

    for p in data.get("products", []):  # type: ignore[union-attr]
        gid = p.get("productGroupId", "")  # type: ignore[union-attr]
        atts = p.get("attractions", [])  # type: ignore[union-attr]
        if atts:
            for att in atts:
                _add(att.get("name", ""), gid)  # type: ignore[union-attr]
        else:
            # No attractions — use product name if it looks like an artist search hit
            pname = p.get("name", "")  # type: ignore[union-attr]
            if pname and q_lower in pname.lower():
                _add(pname, gid)

    # Sort: exact match first, then starts-with, then by event count
    def _rank(item):
        n = item["name"].lower()
        if n == q_lower:
            return (0, -item["event_count"])
        if n.startswith(q_lower):
            return (1, -item["event_count"])
        if q_lower in n:
            return (2, -item["event_count"])
        return (3, -item["event_count"])

    artists_list = sorted(seen.values(), key=_rank)
    return jsonify({"artists": artists_list[:15], "total": len(seen)})


@app.route("/api/eventim/artist-events")
def eventim_artist_events():
    """
    Fetch upcoming concerts for a specific Eventim artist name.
    Query params: name (required), page (default 1)
    """
    name = request.args.get("name", "").strip()
    page = request.args.get("page", "1")
    if not name:
        return jsonify({"error": "Missing name"}), 400
    today = __import__("datetime").date.today().isoformat()
    data, status = _eventim_get(
        "/websearch/search/api/exploration/v1/products",
        {
            "webId": "web__eventim-de",
            "language": "de",
            "page": page,
            "sort": "DateAsc",
            "top": "50",
            "search_term": name,
            "categories": "Konzerte",
            # no in_stock filter — artist may have future sold-out events
            "date_from": today,
        },
    )
    if "error" in data:
        return jsonify(data), status

    # Filter to products where this artist is an attraction
    name_lower = name.lower()
    concerts = []
    for p in data.get("products", []):  # type: ignore[union-attr]
        atts = [a["name"] for a in p.get("attractions", [])]  # type: ignore[union-attr]
        if not any(a.lower() == name_lower or name_lower in a.lower() for a in atts):
            continue
        live = p.get("typeAttributes", {}).get("liveEntertainment", {})
        loc = live.get("location", {})
        start = live.get("startDate", "")
        concerts.append(
            {
                "productId": p.get("productId"),  # type: ignore[union-attr]
                "name": p.get("name", ""),  # type: ignore[union-attr]
                "date": start[:10] if start else "",
                "time": start[11:16] if len(start) > 10 else "",
                "city": loc.get("city", ""),
                "venue": loc.get("name", ""),
                "link": p.get("link", ""),  # type: ignore[union-attr]
                "inStock": p.get("inStock", False),  # type: ignore[union-attr]
                "attractions": atts,
            }
        )
    return jsonify(
        {
            "artist": name,
            "concerts": concerts,
            "total": len(concerts),
            "page": data.get("page", 1),  # type: ignore[union-attr]
            "totalPages": data.get("totalPages", 1),  # type: ignore[union-attr]
        }
    )


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
    return jsonify([e.to_dict() for e in list_events()])


@app.route("/api/events", methods=["POST"])
def create_event():
    data = request.get_json()
    et = data.get("event_type", "tour")
    if et == "festival":
        ev = Festival(
            name=data["name"],
            city=data.get("city", ""),
            venue=data.get("venue", ""),
            date=data.get("date", ""),
            end_date=data.get("end_date"),
            time=data.get("time"),
            price=data.get("price"),
            ticket_link=data.get("ticket_link"),
            bands_to_watch=data.get("bands_to_watch", []),
            tags=data.get("tags", []),
            poster=data.get("poster"),
            logo=data.get("logo"),
            comment=data.get("comment", ""),
        )
    else:
        # Handle both single artist (string) and multiple artists (list)
        artist_data = data.get("artist")
        if isinstance(artist_data, list):
            artist_list = artist_data
        elif artist_data:
            artist_list = [artist_data]
        else:
            artist_list = []

        ev = Tour(
            artist=artist_list,
            support=data.get("support", []),
            tour_name=data.get("tour_name", "Tour"),
            poster=data.get("poster"),
            comment=data.get("comment", ""),
        )
        for c in data.get("concerts", []):
            ev.add_concert(
                date=c["date"],
                city=c["city"],
                venue=c["venue"],
                price=c.get("price"),
                time=c.get("time"),
                end_date=c.get("end_date"),
                tags=c.get("tags", []),
                support_present=c.get("support_present"),
                ticket_link=c.get("ticket_link"),
            )
    upsert_event(ev)
    return jsonify(ev.to_dict()), 201


@app.route("/api/events/<eid>", methods=["PUT"])
def update_event(eid):
    ev = get_event(eid)
    if not ev:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json()
    if isinstance(ev, Festival):
        ev.name = data.get("name", ev.name)
        ev.city = data.get("city", ev.city)
        ev.venue = data.get("venue", ev.venue)
        ev.date = data.get("date", ev.date)
        ev.end_date = data.get("end_date", ev.end_date)
        ev.time = data.get("time", ev.time)
        ev.price = data["price"] if "price" in data else ev.price
        ev.ticket_link = data.get("ticket_link", ev.ticket_link)
        ev.bands_to_watch = data.get("bands_to_watch", ev.bands_to_watch)
        ev.tags = data.get("tags", ev.tags)
        ev.comment = data.get("comment", ev.comment)
        if "logo" in data:
            ev.logo = data["logo"]
    else:
        # Handle both single artist (string) and multiple artists (list)
        artist_data = data.get("artist")
        if artist_data is not None:
            if isinstance(artist_data, list):
                ev.artist = artist_data  # type: ignore[attr-defined]
            else:
                ev.artist = [artist_data]  # type: ignore[attr-defined]
        # Update name to first artist for backward compatibility
        ev.name = ev.artist[0] if ev.artist else ""  # type: ignore[attr-defined]
        ev.support = data.get("support", ev.support)  # type: ignore[attr-defined]
        ev.tour_name = data.get("tour_name", ev.tour_name)  # type: ignore[attr-defined]
        ev.comment = data.get("comment", ev.comment)
        if "concerts" in data:
            ev.concerts = []  # type: ignore[attr-defined]
            for c in data["concerts"]:
                # Preserve existing concert ID if provided
                concert = ev.add_concert(  # type: ignore[attr-defined]
                    date=c["date"],
                    city=c["city"],
                    venue=c["venue"],
                    price=c.get("price"),
                    time=c.get("time"),
                    end_date=c.get("end_date"),
                    tags=c.get("tags", []),
                    support_present=c.get("support_present"),
                    ticket_link=c.get("ticket_link"),
                )
                # Use existing ID if provided, otherwise keep the new one
                if "id" in c:
                    concert.id = c["id"]
    if "poster" in data:
        ev.poster = data["poster"]
    upsert_event(ev)
    return jsonify(ev.to_dict())


@app.route("/api/events/<eid>", methods=["DELETE"])
def delete_event(eid):
    if not delete_event_db(eid):
        return jsonify({"error": "Not found"}), 404
    return jsonify({"ok": True})


@app.route("/api/events/<eid>/invite", methods=["GET"])
def get_event_invite(eid):
    """Generate an invitation link for an event."""
    ev = get_event(eid)
    if not ev:
        return jsonify({"error": "Event nicht gefunden"}), 404

    # Handle artist as list (for co-headlining) or string (backward compatibility)
    artist_for_invite = ev.artist if ev.event_type == "tour" else ""  # type: ignore[attr-defined]
    if isinstance(artist_for_invite, list):
        artist_for_invite = artist_for_invite[0] if artist_for_invite else ""

    # Build concerts list based on event type
    if ev.event_type == "tour":
        concerts_list = [
            {
                "d": c.date,
                "y": c.city,
                "v": c.venue,
                "p": c.price,
                "e": c.end_date,
                "tm": c.time,
                "tg": c.tags,
                "tk": c.ticket_link,
            }
            for c in ev.concerts  # type: ignore[attr-defined]
        ]
        invite_data = {
            "v": 2,
            "t": ev.event_type,
            "n": "",
            "a": artist_for_invite,
            "s": ev.support,  # type: ignore[attr-defined]
            "c": concerts_list,
            "cm": ev.comment,
        }
    else:  # festival
        concerts_list = [
            {
                "d": ev.date,  # type: ignore[attr-defined]
                "y": ev.city,  # type: ignore[attr-defined]
                "v": ev.venue,  # type: ignore[attr-defined]
                "p": ev.price,  # type: ignore[attr-defined]
                "e": ev.end_date,  # type: ignore[attr-defined]
            }
        ]
        invite_data = {
            "v": 2,
            "t": ev.event_type,
            "n": ev.name,
            "a": "",
            "s": [],
            "c": concerts_list,
            "tm": ev.time,  # type: ignore[attr-defined]
            "tk": ev.ticket_link,  # type: ignore[attr-defined]
            "bw": ev.bands_to_watch,  # type: ignore[attr-defined]
            "tg": ev.tags,  # type: ignore[attr-defined]
            "cm": ev.comment,
        }

    # Encode as base64 URL- safe string
    import base64
    import json

    json_str = json.dumps(invite_data, separators=(",", ":"))
    encoded = base64.urlsafe_b64encode(json_str.encode("utf-8")).decode("utf-8")

    # Generate the invite URL
    invite_url = f"/invite/{eid}/{encoded}"

    return jsonify(
        {
            "invite_url": invite_url,
            "event_name": ev.name if ev.event_type == "festival" else ev.artist,  # type: ignore[attr-defined]
        }
    )


@app.route("/api/invite/import", methods=["POST"])
def import_event_invite():
    """Import an event from an invitation."""
    data = request.get_json()
    invite_code = data.get("code", "").strip()

    if not invite_code:
        return jsonify({"error": "Kein Einladungscode angegeben"}), 400

    try:
        import base64
        import json

        # Decode the invitation
        # Handle both formats: /invite/eid/code and just the code
        if "/" in invite_code:
            # Extract the code part after the last /
            invite_code = invite_code.split("/")[-1]

        json_str = base64.urlsafe_b64decode(invite_code.encode("utf-8")).decode("utf-8")
        invite_data = json.loads(json_str)

        # Validate version
        if invite_data.get("v") != 2:
            return jsonify({"error": "Unbekannte Einladungsversion"}), 400

        event_type = invite_data.get("t", "tour")

        # Create the event
        if event_type == "tour":
            from concert import Tour

            ev = Tour(
                artist=invite_data.get("a", ""),
                tour_name=invite_data.get("n", "Tour"),
            )
            for support in invite_data.get("s", []):
                ev.support.append(support)
            for c in invite_data.get("c", []):
                ev.add_concert(
                    date=c.get("d", ""),
                    city=c.get("y", ""),
                    venue=c.get("v", ""),
                    price=c.get("p"),
                    end_date=c.get("e"),
                )
        else:  # festival
            from concert import Festival

            ev = Festival(
                name=invite_data.get("n", ""),
                city=invite_data.get("c", [{}])[0].get("y", "")
                if invite_data.get("c")
                else "",
                venue=invite_data.get("c", [{}])[0].get("v", "")
                if invite_data.get("c")
                else "",
                time=invite_data.get("tm"),
                ticket_link=invite_data.get("tk"),
                bands_to_watch=invite_data.get("bw", []),
                tags=invite_data.get("tg", []),
                comment=invite_data.get("cm", ""),
            )
            if invite_data.get("c"):
                first_concert = invite_data["c"][0]
                ev.date = first_concert.get("d", "")
                if len(invite_data["c"]) > 1:
                    ev.end_date = invite_data["c"][-1].get("d", "")
                elif first_concert.get("e"):
                    ev.end_date = first_concert.get("e")

        # Save the event to DB
        import uuid

        eid = str(uuid.uuid4())[:8]
        ev.id = eid
        upsert_event(ev)

        return jsonify(
            {
                "ok": True,
                "event_id": eid,
                "event": ev.to_dict(),
            }
        )

    except Exception as e:
        return jsonify({"error": f"Import fehlgeschlagen: {str(e)}"}), 400


# ── Catalogue: Artists ────────────────────────────────────────────────────────


@app.route("/api/artists", methods=["GET"])
def get_artists():
    """
    Returns catalogue artists merged with band names derived from events.
    Event-derived names not yet in the catalogue are returned as stub entries
    (id=None, logo=None, derived=True) so the frontend can display them and
    optionally save them as real catalogue entries.
    """
    artists = list_artists()
    cat_names = {a.name.casefold() for a in artists}
    result = [a.to_dict() for a in artists]
    for name in all_known_bands():
        if name.casefold() not in cat_names:
            result.append(
                {
                    "id": None,
                    "name": name,
                    "logo": None,
                    "followed": False,
                    "derived": True,
                }
            )
    result.sort(key=lambda x: x["name"].casefold())
    return jsonify(result)


@app.route("/api/artists", methods=["POST"])
def create_artist():
    data = request.get_json()
    a = Artist(
        name=data["name"],
        logo=data.get("logo"),
        photo=data.get("photo"),
        followed=data.get("followed", False),
        eventim_name=data.get("eventim_name"),
        eventim_id=data.get("eventim_id"),
    )
    upsert_artist(a)
    return jsonify(a.to_dict()), 201


@app.route("/api/artists/<aid>", methods=["PUT"])
def update_artist(aid):
    a = get_artist(aid)
    if not a:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json()
    a.name = data.get("name", a.name)
    if "logo" in data:
        a.logo = data["logo"]
    if "photo" in data:
        a.photo = data["photo"]
    if "followed" in data:
        a.followed = bool(data["followed"])
    if "eventim_name" in data:
        a.eventim_name = data["eventim_name"]
    if "eventim_id" in data:
        a.eventim_id = data["eventim_id"]
    upsert_artist(a)
    return jsonify(a.to_dict())


@app.route("/api/artists/<aid>", methods=["DELETE"])
def delete_artist(aid):
    if not delete_artist_db(aid):
        return jsonify({"error": "Not found"}), 404
    return jsonify({"ok": True})


# ── Catalogue: Venues ─────────────────────────────────────────────────────────


@app.route("/api/venues-catalogue", methods=["GET"])
def get_venues_catalogue():
    """
    Returns catalogue venues merged with venue/city pairs derived from events.
    Event-derived entries without a catalogue record are returned as stubs
    (id=None, derived=True) so the frontend can display and optionally save them.
    """
    venues = list_venues()
    cat_keys = {
        f"{v.name.casefold()}|{v.city.casefold()}" for v in venues
    }
    result = [v.to_dict() for v in venues]
    for ev in list_events():
        pairs = []
        if isinstance(ev, Tour):
            pairs = [(c.venue, c.city) for c in ev.concerts if c.venue]
        elif isinstance(ev, Festival):
            if ev.venue:
                pairs = [(ev.venue, ev.city)]
        for name, city in pairs:
            key = f"{name.casefold()}|{city.casefold()}"
            if key not in cat_keys:
                cat_keys.add(key)
                result.append({"id": None, "name": name, "city": city, "derived": True})
    result.sort(key=lambda x: (x["name"].casefold(), x["city"].casefold()))
    return jsonify(result)


@app.route("/api/venues-catalogue", methods=["POST"])
def create_venue():
    data = request.get_json()
    v = Venue(name=data["name"], city=data.get("city", ""))
    upsert_venue(v)
    return jsonify(v.to_dict()), 201


@app.route("/api/venues-catalogue/<vid>", methods=["PUT"])
def update_venue(vid):
    v = get_venue(vid)
    if not v:
        return jsonify({"error": "Not found"}), 404
    data = request.get_json()
    v.name = data.get("name", v.name)
    v.city = data.get("city", v.city)
    upsert_venue(v)
    return jsonify(v.to_dict())


@app.route("/api/venues-catalogue/<vid>", methods=["DELETE"])
def delete_venue(vid):
    if not delete_venue_db(vid):
        return jsonify({"error": "Not found"}), 404
    return jsonify({"ok": True})


# ── Eventim API Proxy ────────────────────────────────────────────────────────
# Routes as proxy to avoid CORS issues in the browser.
# Uses requests library for proper session handling, cookie support,
# and automatic decompression which urllib lacks.

try:
    import requests as _requests  # type: ignore[import]

    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

EVENTIM_BASE = "https://public-api.eventim.com"

# Full browser-like headers — Eventim checks Sec-Fetch-* and sec-ch-ua
EVENTIM_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    # Accept-Encoding intentionally omitted — requests handles gzip/br automatically
    "Referer": "https://www.eventim.de/",
    "Origin": "https://www.eventim.de",
    "Connection": "keep-alive",
    # Sec-Fetch headers that Chrome sends automatically
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    # Client hints
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

# Persistent session so cookies (e. g. consent) are preserved across requests
_session: "_requests.Session | None" = None  # type: ignore[valid-type]


def _get_session() -> "_requests.Session | None":  # type: ignore[valid-
    global _session
    if _REQUESTS_AVAILABLE and _session is None:
        _session = _requests.Session()  # type: ignore[union-attr]
        _session.headers.update(EVENTIM_HEADERS)
        # Prime the session: visit the main page once to pick up any cookies
        try:
            _session.get("https://www.eventim.de/", timeout=8)  # type: ignore[union-attr]
        except Exception:
            pass
    return _session


def _eventim_get(path: str, params: dict) -> tuple[dict | list, int]:
    """Fetch from Eventim public API, return (data, status_code)."""
    url = f"{EVENTIM_BASE}{path}"
    if _REQUESTS_AVAILABLE:
        sess = _get_session()
        try:
            r = sess.get(url, params=params, timeout=12)  # type: ignore[union-attr]
            # r.json() uses requests' built-in decompression — never touch raw bytes
            if r.status_code != 200:
                try:
                    body = r.json()
                except Exception:
                    body = {"error": f"HTTP {r.status_code}", "detail": r.text[:300]}
                return body, r.status_code
            return r.json(), 200
        except Exception as e:
            return {"error": str(e)}, 502
    else:
        # Fallback: urllib
        import urllib.parse
        import urllib.request

        qs = urllib.parse.urlencode(params, doseq=True)
        req = urllib.request.Request(f"{url}?{qs}", headers=EVENTIM_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=12) as r:
                return json.loads(r.read()), r.status
        except Exception as e:
            return {"error": str(e)}, 502


@app.route("/api/eventim/search")
def eventim_search():
    """
    Proxy: search Eventim for concerts by artist name.
    Query params:
      q       – search term (required)
      page    – page number (default 1)
    Returns filtered product list with relevant fields.
    """
    q = request.args.get("q", "").strip()
    page = request.args.get("page", "1")
    if not q:
        return jsonify({"error": "Missing search term"}), 400

    data, status = _eventim_get(
        "/websearch/search/api/exploration/v1/products",
        {
            "webId": "web__eventim-de",
            "language": "de",
            "page": page,
            "sort": "DateAsc",
            "top": "50",
            "search_term": q,
            "categories": "Konzerte",
            "in_stock": "true",
        },
    )
    if "error" in data:
        return jsonify(data), status

    # Group products by attraction (artist) → tour- like structure
    # Each unique attraction+productGroupId combination = one "tour entry"
    tours: dict[str, dict] = {}
    for p in data.get("products", []):  # type: ignore[union-attr]
        attractions = p.get("attractions", [])  # type: ignore[union-attr]
        artist_name = attractions[0]["name"] if attractions else p.get("name", "")  # type: ignore[union-attr]
        group_id = p.get("productGroupId") or p.get("productId", "")  # type: ignore[union-attr]
        key = f"{artist_name}|{group_id}"

        live = p.get("typeAttributes", {}).get("liveEntertainment", {})
        location = live.get("location", {})
        start_raw = live.get("startDate", "")

        concert_entry = {
            "productId": p.get("productId"),  # type: ignore[union-attr]
            "name": p.get("name", ""),  # type: ignore[union-attr]
            "date": start_raw[:10] if start_raw else "",
            "time": start_raw[11:16] if len(start_raw) > 10 else "",
            "city": location.get("city", ""),
            "venue": location.get("name", ""),
            "link": p.get("link", ""),  # type: ignore[union-attr]
            "inStock": p.get("inStock", False),  # type: ignore[union-attr]
            "status": p.get("status", ""),  # type: ignore[union-attr]
        }

        if key not in tours:
            tours[key] = {
                "artist": artist_name,
                "tour_name": p.get("name", ""),  # type: ignore[union-attr]
                "group_id": group_id,
                "concerts": [],
            }
        tours[key]["concerts"].append(concert_entry)
        # Use shortest product name as tour name (usually the tour title)
        if len(p.get("name", "")) < len(tours[key]["tour_name"]):  # type: ignore[union-attr]
            tours[key]["tour_name"] = p.get("name", "")  # type: ignore[union-attr]

    result = {
        "tours": list(tours.values()),
        "totalResults": data.get("totalResults", 0),  # type: ignore[union-attr]
        "page": data.get("page", 1),  # type: ignore[union-attr]
        "totalPages": data.get("totalPages", 1),  # type: ignore[union-attr]
    }
    return jsonify(result)


@app.route("/api/eventim/prices")
def eventim_prices():
    """
    Proxy: get min ticket price for a product.
    Query params:
      product_id – Eventim productId
      city       – city name (uppercase)
      date       – YYYY-MM-DD
    """
    product_id = request.args.get("product_id", "")
    city = request.args.get("city", "BERLIN").upper()
    date = request.args.get("date", "")
    if not product_id or not date:
        return jsonify({"error": "Missing params"}), 400

    data, status = _eventim_get(
        "/travel/flexhub/prod/api/v2/min-prices/",
        {
            "city": city,
            "firstEventDate": date,
            "lastEventDate": date,
            "language": "de",
            "ids": product_id,
        },
    )
    return jsonify(data), status


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
