import uuid


def test_get_artists_empty(client):
    resp = client.get("/api/artists")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_get_artists_after_create(client):
    client.post("/api/artists", json={"name": "New Artist", "followed": True})
    resp = client.get("/api/artists")
    assert resp.status_code == 200
    artists = resp.get_json()
    assert len(artists) == 1
    a = artists[0]
    assert set(a.keys()) == {
        "id",
        "name",
        "logo",
        "photo",
        "followed",
        "eventim_name",
        "eventim_id",
        "logo_mono",
    }
    assert a["name"] == "New Artist"
    assert a["followed"] is True
    assert a["logo"] is None
    assert a["photo"] is None
    assert a["eventim_name"] is None
    assert a["eventim_id"] is None
    assert a["logo_mono"] is None


def test_get_artists_merge_with_events(client):
    client.post("/api/artists", json={"name": "Alpha Band"})
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Live Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    resp = client.get("/api/artists")
    assert resp.status_code == 200
    artists = resp.get_json()
    real = [a for a in artists if a.get("id")]
    stubs = [a for a in artists if a.get("derived")]
    assert any(a["name"] == "Alpha Band" for a in real)
    stub = next(a for a in stubs if a["name"] == "Live Band")
    assert stub["id"] is None
    assert stub["logo"] is None
    assert stub["followed"] is False
    assert stub["derived"] is True
    names = [a["name"] for a in artists]
    assert names == sorted(names, key=str.casefold)


def test_get_artists_sorted_casefold(client):
    client.post("/api/artists", json={"name": "Berlin"})
    client.post("/api/artists", json={"name": "apple"})
    resp = client.get("/api/artists")
    artists = resp.get_json()
    names = [a["name"] for a in artists]
    assert names == ["apple", "Berlin"]


def test_post_artist_minimal(client):
    resp = client.post("/api/artists", json={"name": "New Artist", "followed": True})
    assert resp.status_code == 201
    data = resp.get_json()
    assert "id" in data
    assert data["name"] == "New Artist"
    assert data["followed"] is True


def test_post_artist_with_all_fields(client):
    logo_id = str(uuid.uuid4())
    photo_id = str(uuid.uuid4())
    resp = client.post(
        "/api/artists",
        json={
            "name": "Full Artist",
            "logo": logo_id,
            "photo": photo_id,
            "followed": True,
            "eventim_name": "Full Artist Eventim",
            "eventim_id": "evt-123",
        },
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["name"] == "Full Artist"
    assert data["logo"] == logo_id
    assert data["photo"] == photo_id
    assert data["followed"] is True
    assert data["eventim_name"] == "Full Artist Eventim"
    assert data["eventim_id"] == "evt-123"


def test_put_artist_update(client):
    create = client.post("/api/artists", json={"name": "Old", "followed": False})
    aid = create.get_json()["id"]
    resp = client.put(
        f"/api/artists/{aid}",
        json={
            "name": "New",
            "logo": str(uuid.uuid4()),
            "followed": True,
        },
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["name"] == "New"
    assert data["followed"] is True
    assert data["logo"] is not None


def test_put_artist_logo_mono_persists(client):
    create = client.post("/api/artists", json={"name": "Band"})
    aid = create.get_json()["id"]
    mono_id = str(uuid.uuid4())
    resp = client.put(f"/api/artists/{aid}", json={"logo_mono": mono_id})
    assert resp.status_code == 200
    assert resp.get_json()["logo_mono"] == mono_id
    # Confirmed persisted across a fresh GET.
    got = client.get("/api/artists").get_json()[0]
    assert got["logo_mono"] == mono_id


def test_put_artist_nonexistent(client):
    resp = client.put("/api/artists/00000000-0000-0000-0000-000000000000", json={"name": "X"})
    assert resp.status_code == 404


def test_put_artist_followed_falsy(client):
    create = client.post("/api/artists", json={"name": "A", "followed": True})
    aid = create.get_json()["id"]
    resp = client.put(f"/api/artists/{aid}", json={"followed": 0})
    assert resp.status_code == 200
    assert resp.get_json()["followed"] is False


def test_delete_artist(client):
    create = client.post("/api/artists", json={"name": "Doomed"})
    aid = create.get_json()["id"]
    resp = client.delete(f"/api/artists/{aid}")
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}
    artists = client.get("/api/artists").get_json()
    assert not any(a.get("id") == aid for a in artists)


def test_delete_artist_nonexistent(client):
    resp = client.delete("/api/artists/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_delete_artist_invalid_uuid(client):
    resp = client.delete("/api/artists/not-a-uuid")
    assert resp.status_code == 404


def test_get_venues_catalogue_empty(client):
    resp = client.get("/api/venues-catalogue")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_get_venues_catalogue_after_create(client):
    client.post("/api/venues-catalogue", json={"name": "Hall", "city": "München"})
    resp = client.get("/api/venues-catalogue")
    assert resp.status_code == 200
    venues = resp.get_json()
    assert len(venues) == 1
    v = venues[0]
    assert set(v.keys()) == {"id", "name", "city"}
    assert v["name"] == "Hall"
    assert v["city"] == "München"


def test_get_venues_catalogue_merge_with_events(client):
    client.post(
        "/api/events",
        json={
            "event_type": "tour",
            "artist": ["Some Band"],
            "tour_name": "T",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    resp = client.get("/api/venues-catalogue")
    assert resp.status_code == 200
    venues = resp.get_json()
    stub = next(v for v in venues if v.get("derived"))
    assert stub["name"] == "Arena"
    assert stub["city"] == "Berlin"
    assert stub["id"] is None
    assert stub["derived"] is True


def test_get_venues_catalogue_sorted_casefold(client):
    client.post("/api/venues-catalogue", json={"name": "Zeppelin", "city": "Hamburg"})
    client.post("/api/venues-catalogue", json={"name": "arena", "city": "Berlin"})
    resp = client.get("/api/venues-catalogue")
    venues = resp.get_json()
    names = [v["name"] for v in venues]
    assert names == ["arena", "Zeppelin"]


def test_post_venue(client):
    resp = client.post("/api/venues-catalogue", json={"name": "Hall", "city": "München"})
    assert resp.status_code == 201
    data = resp.get_json()
    assert "id" in data
    assert data["name"] == "Hall"
    assert data["city"] == "München"


def test_put_venue_update(client):
    create = client.post("/api/venues-catalogue", json={"name": "Hall", "city": "München"})
    vid = create.get_json()["id"]
    resp = client.put(f"/api/venues-catalogue/{vid}", json={"name": "Halle", "city": "Berlin"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["name"] == "Halle"
    assert data["city"] == "Berlin"
    assert data["id"] == vid


def test_put_venue_nonexistent(client):
    resp = client.put(
        "/api/venues-catalogue/00000000-0000-0000-0000-000000000000", json={"name": "X"}
    )
    assert resp.status_code == 404


def test_delete_venue(client):
    create = client.post("/api/venues-catalogue", json={"name": "Hall", "city": "Berlin"})
    vid = create.get_json()["id"]
    resp = client.delete(f"/api/venues-catalogue/{vid}")
    assert resp.status_code == 200
    assert resp.get_json() == {"ok": True}
    venues = client.get("/api/venues-catalogue").get_json()
    assert not any(v.get("id") == vid for v in venues)


def test_delete_venue_nonexistent(client):
    resp = client.delete("/api/venues-catalogue/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
