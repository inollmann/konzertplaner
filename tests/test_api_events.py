import base64
import json


def test_get_events_empty(client):
    resp = client.get("/api/events")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_get_events_after_create(client):
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band A"],
            "tour_name": "T1",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    client.post(
        "/api/events",
        json={
            "event_type": "festival",
            "name": "Rock Fest",
            "city": "Köln",
            "venue": "Park",
            "date": "2026-07-15",
        },
    )
    resp = client.get("/api/events")
    assert resp.status_code == 200
    events = resp.get_json()
    assert len(events) == 2
    assert all(isinstance(e, dict) for e in events)


def test_create_tour(client):
    payload = {
        "event_type": "tour",
        "artist": ["Band"],
        "tour_name": "T",
        "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
    }
    resp = client.post("/api/events", json=payload)
    assert resp.status_code == 201
    body = resp.get_json()
    assert "id" in body
    assert body["artist"] == ["Band"]
    assert len(body["concerts"]) == 1
    assert body["concerts"][0]["city"] == "Berlin"


def test_create_tour_artist_string(client):
    resp = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": "Solo",
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    assert resp.status_code == 201
    assert resp.get_json()["artist"] == ["Solo"]


def test_create_tour_artist_omitted(client):
    resp = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    assert resp.status_code == 201
    assert resp.get_json()["artist"] == []


def test_create_festival(client):
    resp = client.post(
        "/api/events",
        json={
            "event_type": "festival",
            "name": "Rock Fest",
            "city": "Köln",
            "venue": "Park",
            "date": "2026-07-15",
            "bands_to_watch": ["X"],
            "tags": ["rock"],
        },
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["event_type"] == "festival"
    assert body["name"] == "Rock Fest"
    assert body["bands_to_watch"] == ["X"]
    assert body["tags"] == ["rock"]


def test_put_update_tour(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "Old Tour",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]

    resp = client.put(
        f"/api/events/{eid}",
        json={
            "artist": ["New Band"],
            "tour_name": "New Tour",
            "concerts": [
                {"date": "2026-10-01", "city": "Hamburg", "venue": "Hall"},
                {"date": "2026-10-02", "city": "Munich", "venue": "Park"},
            ],
        },
    )
    assert resp.status_code == 200
    updated = resp.get_json()
    assert updated["artist"] == ["New Band"]
    assert updated["tour_name"] == "New Tour"
    assert len(updated["concerts"]) == 2

    events = client.get("/api/events").get_json()
    ev = next(e for e in events if e["id"] == eid)
    assert ev["artist"] == ["New Band"]
    assert ev["tour_name"] == "New Tour"
    assert len(ev["concerts"]) == 2


def test_put_nonexistent(client):
    resp = client.put("/api/events/nonexistent", json={"tour_name": "X"})
    assert resp.status_code == 404


def test_put_update_festival(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "festival",
            "name": "Rock Fest",
            "city": "Köln",
            "venue": "Park",
            "date": "2026-07-15",
            "bands_to_watch": ["X"],
            "tags": ["rock"],
        },
    )
    eid = create.get_json()["id"]

    resp = client.put(
        f"/api/events/{eid}",
        json={
            "name": "Rock Fest 2",
            "city": "Berlin",
            "date": "2026-08-01",
            "tags": ["metal"],
        },
    )
    assert resp.status_code == 200
    updated = resp.get_json()
    assert updated["name"] == "Rock Fest 2"
    assert updated["city"] == "Berlin"
    assert updated["date"] == "2026-08-01"
    assert updated["tags"] == ["metal"]


def test_put_tour_replace_concerts(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [
                {"date": "2026-09-01", "city": "Berlin", "venue": "Arena"},
                {"date": "2026-09-02", "city": "Hamburg", "venue": "Hall"},
            ],
        },
    )
    eid = create.get_json()["id"]

    resp = client.put(
        f"/api/events/{eid}",
        json={
            "concerts": [{"date": "2026-10-01", "city": "Munich", "venue": "Park"}],
        },
    )
    assert resp.status_code == 200
    concerts = resp.get_json()["concerts"]
    assert len(concerts) == 1
    assert concerts[0]["city"] == "Munich"


def test_put_tour_preserve_concert_ids(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]
    original_id = create.get_json()["concerts"][0]["id"]

    resp = client.put(
        f"/api/events/{eid}",
        json={
            "concerts": [
                {"id": original_id, "date": "2026-09-02", "city": "Hamburg", "venue": "Hall"},
            ],
        },
    )
    assert resp.status_code == 200
    concerts = resp.get_json()["concerts"]
    assert len(concerts) == 1
    assert concerts[0]["id"] == original_id
    assert concerts[0]["city"] == "Hamburg"


def test_delete_event(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]

    resp = client.delete(f"/api/events/{eid}")
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}

    assert client.get("/api/events").get_json() == []


def test_delete_nonexistent(client):
    resp = client.delete("/api/events/nonexistent")
    assert resp.status_code == 404


def test_get_invite_tour(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band", "Other"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]

    resp = client.get(f"/api/events/{eid}/invite")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["invite_url"].startswith(f"/invite/{eid}/")

    code = data["invite_url"].split("/")[-1]
    payload = json.loads(base64.urlsafe_b64decode(code.encode()).decode())
    assert payload["v"] == 2
    assert payload["t"] == "tour"
    assert payload["a"] == "Band"
    assert isinstance(payload["s"], list)
    assert isinstance(payload["c"], list)
    assert len(payload["c"]) == 1
    concert = payload["c"][0]
    for key in ("d", "y", "v", "p", "e"):
        assert key in concert


def test_get_invite_festival(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "festival",
            "name": "Rock Fest",
            "city": "Köln",
            "venue": "Park",
            "date": "2026-07-15",
            "bands_to_watch": ["X"],
            "tags": ["rock"],
        },
    )
    eid = create.get_json()["id"]

    resp = client.get(f"/api/events/{eid}/invite")
    assert resp.status_code == 200
    code = resp.get_json()["invite_url"].split("/")[-1]
    payload = json.loads(base64.urlsafe_b64decode(code.encode()).decode())
    assert payload["v"] == 2
    assert payload["t"] == "festival"
    assert payload["n"] == "Rock Fest"
    assert payload["bw"] == ["X"]
    assert payload["tg"] == ["rock"]


def test_get_invite_nonexistent(client):
    resp = client.get("/api/events/nonexistent/invite")
    assert resp.status_code == 404


def test_import_invite_tour(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]

    invite = client.get(f"/api/events/{eid}/invite").get_json()
    code = invite["invite_url"].split("/")[-1]

    resp = client.post("/api/invite/import", json={"code": code})
    assert resp.status_code == 200
    imported = resp.get_json()
    assert imported["ok"] is True
    new_eid = imported["event_id"]
    assert new_eid != eid

    events = client.get("/api/events").get_json()
    assert len(events) == 2
    imported_ev = next(e for e in events if e["id"] == new_eid)
    assert len(imported_ev["concerts"]) == 1
    assert imported_ev["concerts"][0]["date"] == "2026-09-01"
    assert imported_ev["concerts"][0]["city"] == "Berlin"
    assert imported_ev["concerts"][0]["venue"] == "Arena"


def test_import_invite_full_url(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]

    invite_url = client.get(f"/api/events/{eid}/invite").get_json()["invite_url"]

    resp = client.post("/api/invite/import", json={"code": invite_url})
    assert resp.status_code == 200
    assert resp.get_json()["ok"] is True
    assert resp.get_json()["event_id"] != eid


def test_import_invite_empty_code(client):
    resp = client.post("/api/invite/import", json={"code": ""})
    assert resp.status_code == 400


def test_import_invite_invalid_base64(client):
    resp = client.post("/api/invite/import", json={"code": "@@@@"})
    assert resp.status_code == 400
    assert "Import fehlgeschlagen" in resp.get_json()["error"]


def test_import_invite_bad_version(client):
    code = base64.urlsafe_b64encode(json.dumps({"v": 1, "t": "tour"}).encode()).decode()
    resp = client.post("/api/invite/import", json={"code": code})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "Unbekannte Einladungsversion"


def test_invite_page_tour(client):
    create = client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    eid = create.get_json()["id"]
    invite_url = client.get(f"/api/events/{eid}/invite").get_json()["invite_url"]

    resp = client.get(invite_url)
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert "localStorage.setItem('invite_success'" in body
    assert "url=/" in body


def test_invite_page_bad_version(client):
    code = base64.urlsafe_b64encode(json.dumps({"v": 1, "t": "tour"}).encode()).decode()
    resp = client.get(f"/invite/abc/{code}")
    assert resp.status_code == 400
    assert b"Unbekannte Einladungsversion" in resp.data


def test_invite_page_malformed(client):
    resp = client.get("/invite/abc/@@@@")
    assert resp.status_code == 400
    assert b"Import fehlgeschlagen" in resp.data


def test_get_bands(client):
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Pearl Jam"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    resp = client.get("/api/bands")
    assert resp.status_code == 200
    bands = resp.get_json()
    assert "Pearl Jam" in bands


def test_get_bands_query(client):
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Pearl Jam"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    resp = client.get("/api/bands?q=pearl")
    assert resp.status_code == 200
    bands = resp.get_json()
    assert "Pearl Jam" in bands


def test_get_venues(client):
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    resp = client.get("/api/venues")
    assert resp.status_code == 200
    venues = resp.get_json()
    assert any(v["name"] == "Arena" and v["city"] == "Berlin" for v in venues)
    assert all(set(v.keys()) == {"id", "name", "city"} for v in venues)


def test_get_venues_query(client):
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Band"],
            "tour_name": "T",
            "concerts": [
                {"date": "2026-09-01", "city": "Berlin", "venue": "Arena"},
                {"date": "2026-09-02", "city": "Hamburg", "venue": "Hall"},
            ],
        },
    )
    resp = client.get("/api/venues?city=berlin")
    assert resp.status_code == 200
    venues = resp.get_json()
    assert all(v["city"].lower() == "berlin" for v in venues)
    assert any(v["name"] == "Arena" for v in venues)
