import pytest

import main


@pytest.fixture(autouse=True)
def _no_real_session(monkeypatch):
    monkeypatch.setattr(main, "_get_session", lambda: None)


def _product(
    pid="p1",
    gid="g1",
    name="Tool Live",
    attractions=None,
    city="Berlin",
    venue="Arena",
    start="2026-09-01T20:00:00",
    link="/event/tool",
    in_stock=True,
    status="available",
):
    if attractions is None:
        attractions = [{"name": "Tool"}]
    return {
        "productId": pid,
        "productGroupId": gid,
        "name": name,
        "attractions": attractions,
        "typeAttributes": {
            "liveEntertainment": {
                "location": {"city": city, "name": venue},
                "startDate": start,
            }
        },
        "link": link,
        "inStock": in_stock,
        "status": status,
    }


def test_artist_search_missing_q(client):
    resp = client.get("/api/eventim/artist-search")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Missing q"}


def test_artist_search_extracts_and_sorts(client, monkeypatch):
    captured = {}

    def fake_get(path, params):
        captured["path"] = path
        captured["params"] = params
        return {
            "products": [
                _product(pid="p1", gid="g1", attractions=[{"name": "Tool"}]),
                _product(pid="p2", gid="g1", attractions=[{"name": "Tool"}]),
                _product(pid="p3", gid="g2", attractions=[{"name": "Tool Tribute Band"}]),
                _product(pid="p4", gid="g3", attractions=[{"name": "Metal Tool Fans"}]),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-search?q=tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert captured["path"] == "/websearch/search/api/exploration/v1/products"
    assert captured["params"]["search_term"] == "tool"
    assert captured["params"]["categories"] == "Konzerte"
    assert body["total"] == 3
    names = [a["name"] for a in body["artists"]]
    assert names == ["Tool", "Tool Tribute Band", "Metal Tool Fans"]
    tool = body["artists"][0]
    assert tool["group_id"] == "g1"
    assert tool["event_count"] == 2
    tribute = body["artists"][1]
    assert tribute["event_count"] == 1
    metal = body["artists"][2]
    assert metal["event_count"] == 1


def test_artist_search_no_attractions_uses_product_name(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(pid="p1", gid="g1", name="Tool Solo Show", attractions=[]),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-search?q=tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["total"] == 1
    assert body["artists"] == [{"name": "Tool Solo Show", "group_id": "g1", "event_count": 1}]


def test_artist_search_multiple_attractions(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(
                    pid="p1",
                    gid="g1",
                    attractions=[{"name": "Tool"}, {"name": "Tool Band"}],
                ),
                _product(pid="p2", gid="g1", attractions=[{"name": "Tool"}]),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-search?q=tool")
    body = resp.get_json()
    assert body["total"] == 2
    by_name = {a["name"]: a for a in body["artists"]}
    assert by_name["Tool"]["event_count"] == 2
    assert by_name["Tool Band"]["event_count"] == 1


def test_artist_search_error_passthrough(client, monkeypatch):
    def fake_get(path, params):
        return {"error": "boom"}, 502

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-search?q=tool")
    assert resp.status_code == 502
    assert resp.get_json() == {"error": "boom"}


def test_artist_events_missing_name(client):
    resp = client.get("/api/eventim/artist-events")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Missing name"}


def test_artist_events_filters_by_name(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(
                    pid="p1",
                    gid="g1",
                    name="Tool Live",
                    attractions=[{"name": "Tool"}],
                    city="Berlin",
                    venue="Arena",
                    start="2099-09-01T20:00:00",
                    link="/event/tool",
                    in_stock=True,
                    status="available",
                ),
                _product(
                    pid="p2",
                    gid="g2",
                    name="Metallica Show",
                    attractions=[{"name": "Metallica"}],
                    city="Hamburg",
                    venue="Stadthalle",
                    start="2099-10-01T19:00:00",
                ),
                _product(
                    pid="p3",
                    gid="g3",
                    name="Tool Tribute",
                    attractions=[{"name": "Tool Tribute Band"}],
                    city="Köln",
                    venue="Lanxess",
                    start="2099-11-01T19:30:00",
                ),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-events?name=Tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["artist"] == "Tool"
    assert body["total"] == 1
    assert len(body["concerts"]) == 1
    c = body["concerts"][0]
    assert c["productId"] == "p1"
    assert c["name"] == "Tool Live"
    assert c["date"] == "2099-09-01"
    assert c["time"] == "20:00"
    assert c["city"] == "Berlin"
    assert c["venue"] == "Arena"
    assert c["link"] == "/event/tool"
    assert c["inStock"] is True
    assert c["attractions"] == ["Tool"]


def test_artist_events_error_passthrough(client, monkeypatch):
    def fake_get(path, params):
        return {"error": "boom"}, 502

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-events?name=Tool")
    assert resp.status_code == 502
    assert resp.get_json() == {"error": "boom"}


def test_artist_events_no_date_from_and_filters_past(client, monkeypatch):
    # date_from würde die Relevanz-Sortierung abschalten → Filter läuft in Python
    captured = {}

    def fake_get(path, params):
        captured["params"] = params
        return {
            "products": [
                _product(
                    pid="old",
                    gid="g0",
                    name="Tool Old",
                    attractions=[{"name": "Tool"}],
                    city="Berlin",
                    venue="Arena",
                    start="2000-01-01T20:00:00",
                ),
                _product(
                    pid="new",
                    gid="g1",
                    name="Tool New",
                    attractions=[{"name": "Tool"}],
                    city="Berlin",
                    venue="Arena",
                    start="2099-01-01T20:00:00",
                ),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/artist-events?name=Tool")
    assert resp.status_code == 200
    assert "date_from" not in captured["params"]
    assert [c["productId"] for c in resp.get_json()["concerts"]] == ["new"]


def test_search_missing_q(client):
    resp = client.get("/api/eventim/search")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Missing search term"}


def test_search_groups_by_artist_and_group(client, monkeypatch):
    captured = {}

    def fake_get(path, params):
        captured["path"] = path
        captured["params"] = params
        return {
            "products": [
                _product(
                    pid="p1",
                    gid="g1",
                    name="Tool Live",
                    attractions=[{"name": "Tool"}],
                    city="Berlin",
                    venue="Arena",
                    start="2026-09-01T20:00:00",
                    link="/event/tool",
                    in_stock=True,
                    status="available",
                ),
                _product(
                    pid="p2",
                    gid="g2",
                    name="Metallica Show",
                    attractions=[{"name": "Metallica"}],
                    city="Hamburg",
                    venue="Stadthalle",
                    start="2026-10-01T19:00:00",
                    link="/event/met",
                    in_stock=False,
                    status="sold_out",
                ),
            ],
            "totalResults": 2,
            "page": 1,
            "totalPages": 1,
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/search?q=tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert captured["path"] == "/websearch/search/api/exploration/v1/products"
    assert captured["params"]["search_term"] == "tool"
    assert captured["params"]["in_stock"] == "true"
    assert body["totalResults"] == 2
    assert body["page"] == 1
    assert body["totalPages"] == 1
    assert len(body["tours"]) == 2
    tool_tour = body["tours"][0]
    assert tool_tour["artist"] == "Tool"
    assert tool_tour["group_id"] == "g1"
    assert tool_tour["tour_name"] == "Tool Live"
    assert len(tool_tour["concerts"]) == 1
    c = tool_tour["concerts"][0]
    assert c["productId"] == "p1"
    assert c["name"] == "Tool Live"
    assert c["date"] == "2026-09-01"
    assert c["time"] == "20:00"
    assert c["city"] == "Berlin"
    assert c["venue"] == "Arena"
    assert c["link"] == "/event/tool"
    assert c["inStock"] is True
    assert c["status"] == "available"


def test_search_groups_multiple_products_same_group(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(
                    pid="p1",
                    gid="g1",
                    name="Tool Live 2026",
                    attractions=[{"name": "Tool"}],
                    city="Berlin",
                    venue="Arena",
                    start="2026-09-01T20:00:00",
                ),
                _product(
                    pid="p2",
                    gid="g1",
                    name="Tool Live",
                    attractions=[{"name": "Tool"}],
                    city="Munich",
                    venue="Olympiahalle",
                    start="2026-09-02T20:00:00",
                ),
            ],
            "totalResults": 2,
            "page": 1,
            "totalPages": 1,
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/search?q=tool")
    body = resp.get_json()
    assert len(body["tours"]) == 1
    tour = body["tours"][0]
    assert tour["artist"] == "Tool"
    assert tour["group_id"] == "g1"
    assert tour["tour_name"] == "Tool Live"
    assert len(tour["concerts"]) == 2
    cities = sorted(c["city"] for c in tour["concerts"])
    assert cities == ["Berlin", "Munich"]
    dates = sorted(c["date"] for c in tour["concerts"])
    assert dates == ["2026-09-01", "2026-09-02"]


def test_search_error_passthrough(client, monkeypatch):
    def fake_get(path, params):
        return {"error": "boom"}, 502

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/search?q=tool")
    assert resp.status_code == 502
    assert resp.get_json() == {"error": "boom"}


def test_prices_missing_product_id(client):
    resp = client.get("/api/eventim/prices?date=2026-09-01")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Missing params"}


def test_prices_missing_date(client):
    resp = client.get("/api/eventim/prices?product_id=p1")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Missing params"}


def test_prices_passthrough(client, monkeypatch):
    captured = {}

    def fake_get(path, params):
        captured["path"] = path
        captured["params"] = params
        return {"minPrice": 50.0, "currency": "EUR"}, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/prices?product_id=p1&date=2026-09-01")
    assert resp.status_code == 200
    assert resp.get_json() == {"minPrice": 50.0, "currency": "EUR"}
    assert captured["path"] == "/travel/flexhub/prod/api/v2/min-prices/"
    assert captured["params"]["ids"] == "p1"
    assert captured["params"]["language"] == "de"
    assert captured["params"]["city"] == "BERLIN"
    assert captured["params"]["firstEventDate"] == "2026-09-01"
    assert captured["params"]["lastEventDate"] == "2026-09-01"


def test_prices_city_uppercased(client, monkeypatch):
    captured = {}

    def fake_get(path, params):
        captured["params"] = params
        return {}, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/prices?product_id=p1&date=2026-09-01&city=berlin")
    assert resp.status_code == 200
    assert captured["params"]["city"] == "BERLIN"


def test_prices_error_passthrough(client, monkeypatch):
    def fake_get(path, params):
        return {"error": "boom"}, 502

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    resp = client.get("/api/eventim/prices?product_id=p1&date=2026-09-01")
    assert resp.status_code == 502
    assert resp.get_json() == {"error": "boom"}


def test_no_sort_param_sent(client, monkeypatch):
    seen = []

    def fake_get(path, params):
        seen.append(params)
        return {"products": []}, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    client.get("/api/eventim/artist-search?q=Allt")
    client.get("/api/eventim/artist-events?name=Allt")
    client.get("/api/eventim/search?q=Allt")
    assert len(seen) == 3
    assert all("sort" not in p for p in seen)


def test_artist_events_sorted_and_substring_fallback(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(
                    pid="b", attractions=[{"name": "Polaris Tribute"}], start="2026-12-01T20:00:00"
                ),
                _product(
                    pid="a", attractions=[{"name": "Polaris Tribute"}], start="2026-11-01T20:00:00"
                ),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    body = client.get("/api/eventim/artist-events?name=Polaris").get_json()
    assert [c["productId"] for c in body["concerts"]] == ["a", "b"]


def test_artist_events_exact_casefold_and_sorted(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(pid="late", attractions=[{"name": "ALLT"}], start="2026-12-01T20:00:00"),
                _product(
                    pid="sub", attractions=[{"name": "Allthing"}], start="2026-10-01T20:00:00"
                ),
                _product(pid="early", attractions=[{"name": "Allt"}], start="2026-11-01T20:00:00"),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    body = client.get("/api/eventim/artist-events?name=allt").get_json()
    assert [c["productId"] for c in body["concerts"]] == ["early", "late"]


def test_artist_events_fetches_up_to_three_pages(client, monkeypatch):
    pages = []

    def fake_get(path, params):
        pages.append(params["page"])
        n = params["page"]
        return {
            "products": [
                _product(
                    pid=f"p{n}", attractions=[{"name": "Allt"}], start=f"2026-1{n}-01T20:00:00"
                )
            ],
            "page": int(n),
            "totalPages": 9,
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    body = client.get("/api/eventim/artist-events?name=Allt").get_json()
    assert pages == ["1", "2", "3"]
    assert body["total"] == 3


def test_artist_events_stops_at_page_without_hits(client, monkeypatch):
    pages = []

    def fake_get(path, params):
        pages.append(params["page"])
        prods = [_product(attractions=[{"name": "Allt"}])] if params["page"] == "1" else []
        return {"products": prods, "totalPages": 9}, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    client.get("/api/eventim/artist-events?name=Allt")
    assert pages == ["1", "2"]


def test_search_tours_sorted_by_date(client, monkeypatch):
    def fake_get(path, params):
        return {
            "products": [
                _product(
                    pid="1", gid="gB", attractions=[{"name": "B"}], start="2026-12-01T20:00:00"
                ),
                _product(
                    pid="2", gid="gA", attractions=[{"name": "A"}], start="2026-10-01T20:00:00"
                ),
            ]
        }, 200

    monkeypatch.setattr(main, "_eventim_get", fake_get)
    tours = client.get("/api/eventim/search?q=x").get_json()["tours"]
    assert [t["artist"] for t in tours] == ["A", "B"]


def test_search_marks_festival_and_end_date(client, monkeypatch):
    prod = _product(
        pid="f1",
        gid="4185862",
        name="VAINSTREAM 2027 - Weekendticket",
        attractions=[{"name": "Vainstream"}, {"name": "Lorna Shore"}],
        city="Münster",
        venue="Festivalgelände am Hawerkamp",
        start="2027-06-25T12:00:00+02:00",
    )
    prod["typeAttributes"]["liveEntertainment"]["endDate"] = "2027-06-26T12:00:00+02:00"
    prod["categories"] = [
        {"name": "Konzerte"},
        {"name": "Festivals", "parentCategory": {"name": "Konzerte"}},
    ]
    plain = _product(pid="p9", gid="g9")
    plain["typeAttributes"]["liveEntertainment"]["endDate"] = "2026-09-01T23:00:00"
    monkeypatch.setattr(
        main, "_eventim_get", lambda path, params: ({"products": [prod, plain]}, 200)
    )
    tours = client.get("/api/eventim/search?q=vainstream").get_json()["tours"]
    fest = next(t for t in tours if t["group_id"] == "4185862")
    assert fest["is_festival"] is True
    assert fest["concerts"][0]["end_date"] == "2027-06-26"
    assert fest["concerts"][0]["attractions"] == ["Vainstream", "Lorna Shore"]
    other = next(t for t in tours if t["group_id"] == "g9")
    assert other["is_festival"] is False
    assert other["concerts"][0]["end_date"] == ""
