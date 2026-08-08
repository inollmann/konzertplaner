"""Smoke test verifying the test harness boots the app against sqlite."""


def test_client_serves_index(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"<html" in resp.data.lower()


def test_events_empty_initially(client):
    resp = client.get("/api/events")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_create_and_fetch_event(client):
    payload = {
        "event_type": "tour",
        "artist": ["Smoke Band"],
        "tour_name": "Smoke Tour",
        "concerts": [
            {"date": "2026-09-01", "city": "Berlin", "venue": "Arena"},
        ],
    }
    resp = client.post("/api/events", json=payload)
    assert resp.status_code == 201
    created = resp.get_json()
    assert created["artist"] == ["Smoke Band"]
    eid = created["id"]

    resp = client.get("/api/events")
    events = resp.get_json()
    assert len(events) == 1
    assert events[0]["id"] == eid


def test_isolation_no_leak_between_tests(client):
    """After the previous test created an event, this one starts clean."""
    resp = client.get("/api/events")
    assert resp.get_json() == []
