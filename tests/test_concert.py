"""Pure-logic tests for concert.py data models (no Flask, no DB, no IO)."""

import uuid

import pytest

from concert import Artist, Concert, Event, Festival, Tour, Venue

# ── Event base class ──────────────────────────────────────────────────────────


class _Concrete(Event):
    event_type = "concrete"

    def to_dict(self):
        return self._base_dict()


def test_event_init_generates_unique_uuid_ids():
    a = _Concrete(name="A")
    b = _Concrete(name="B")
    assert a.id != b.id
    assert isinstance(a.id, str)
    uuid.UUID(a.id)
    uuid.UUID(b.id)


def test_event_init_stores_base_fields():
    e = _Concrete(name="Festival X", poster="img.png", comment="note")
    assert e.name == "Festival X"
    assert e.poster == "img.png"
    assert e.comment == "note"


def test_event_to_dict_raises_not_implemented():
    e = Event(name="X")
    with pytest.raises(NotImplementedError):
        e.to_dict()


def test_event_from_dict_default_returns_tour():
    tour = Event.from_dict({"id": "x", "name": "Band", "artist": ["Band"]})
    assert isinstance(tour, Tour)


def test_event_from_dict_tour_type_returns_tour():
    tour = Event.from_dict({"event_type": "tour", "id": "x", "name": "Band"})
    assert isinstance(tour, Tour)


def test_event_from_dict_festival_returns_festival():
    fest = Event.from_dict({"event_type": "festival", "id": "x", "name": "F"})
    assert isinstance(fest, Festival)


def test_event_from_dict_unknown_type_falls_back_to_tour():
    tour = Event.from_dict({"event_type": "weird", "id": "x", "name": "Band"})
    assert isinstance(tour, Tour)


# ── Tour ──────────────────────────────────────────────────────────────────────


def test_tour_init_single_artist_string_wrapped_to_list():
    t = Tour(artist="Band")
    assert t.artist == ["Band"]
    assert t.name == "Band"


def test_tour_init_artist_list_kept_as_list():
    t = Tour(artist=["A", "B"])
    assert t.artist == ["A", "B"]
    assert t.name == "A"


def test_tour_init_none_artist_gives_empty_list_and_empty_name():
    t = Tour(artist=None)
    assert t.artist == []
    assert t.name == ""


def test_tour_init_empty_string_artist_gives_empty_list():
    t = Tour(artist="")
    assert t.artist == []
    assert t.name == ""


def test_tour_init_default_support_and_tour_name():
    t = Tour(artist="Band")
    assert t.support == []
    assert t.tour_name == "Tour"
    assert t.concerts == []


def test_tour_init_with_support_and_tour_name():
    t = Tour(artist="Band", support=["Opener"], tour_name="World Tour")
    assert t.support == ["Opener"]
    assert t.tour_name == "World Tour"


def test_tour_init_poster_and_comment():
    t = Tour(artist="Band", poster="p.png", comment="c")
    assert t.poster == "p.png"
    assert t.comment == "c"


def test_tour_add_concert_appends_and_returns_concert():
    t = Tour(artist="Band", support=["Opener"])
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    assert isinstance(c, Concert)
    assert c in t.concerts
    assert len(t.concerts) == 1


def test_tour_add_concert_links_tour_id_and_tour_name():
    t = Tour(artist="Band", tour_name="World Tour")
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    assert c.tour_id == t.id
    assert c.tour_name == "World Tour"


def test_tour_add_concert_sets_artist_to_first_tour_artist():
    t = Tour(artist=["A", "B"])
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    assert c.artist == "A"


def test_tour_add_concert_support_present_defaults_to_tour_support():
    t = Tour(artist="Band", support=["Op1", "Op2"])
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    assert c.support_present == ["Op1", "Op2"]


def test_tour_add_concert_explicit_support_present_overrides():
    t = Tour(artist="Band", support=["Op1", "Op2"])
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena", support_present=["Op1"])
    assert c.support_present == ["Op1"]


def test_tour_add_concert_passes_optional_fields():
    t = Tour(artist="Band")
    c = t.add_concert(
        date="2026-09-01",
        city="Berlin",
        venue="Arena",
        price=45.5,
        time="20:00",
        end_date="2026-09-02",
        tags=["rock"],
        ticket_link="http://x",
    )
    assert c.price == 45.5
    assert c.time == "20:00"
    assert c.end_date == "2026-09-02"
    assert c.tags == ["rock"]
    assert c.ticket_link == "http://x"


def test_tour_add_concert_empty_artist_gives_empty_main_artist():
    t = Tour(artist=None)
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    assert c.artist == ""


def test_tour_to_dict_keys_and_shape():
    t = Tour(artist=["A", "B"], support=["Op"], tour_name="T", poster="p.png", comment="c")
    t.add_concert(date="2026-09-01", city="Berlin", venue="Arena", price=30)
    d = t.to_dict()
    assert set(d.keys()) == {
        "id",
        "event_type",
        "name",
        "poster",
        "comment",
        "artist",
        "support",
        "tour_name",
        "concerts",
    }
    assert d["id"] == t.id
    assert d["event_type"] == "tour"
    assert d["name"] == "A"
    assert d["poster"] == "p.png"
    assert d["comment"] == "c"
    assert d["artist"] == ["A", "B"]
    assert d["support"] == ["Op"]
    assert d["tour_name"] == "T"
    assert isinstance(d["concerts"], list)
    assert len(d["concerts"]) == 1
    assert d["concerts"][0]["city"] == "Berlin"


def test_tour_to_dict_empty_concerts():
    t = Tour(artist="Band")
    assert t.to_dict()["concerts"] == []


def test_tour_round_trip_to_dict_from_dict():
    t = Tour(
        artist=["A", "B"],
        support=["Op1", "Op2"],
        tour_name="World Tour",
        poster="p.png",
        comment="note",
    )
    t.add_concert(
        date="2026-09-01", city="Berlin", venue="Arena", price=30, time="20:00", tags=["rock"]
    )
    t.add_concert(
        date="2026-10-05",
        city="Munich",
        venue="Hall",
        price=35,
        end_date="2026-10-06",
        ticket_link="http://x",
    )

    d = t.to_dict()
    t2 = Tour.from_dict(d)

    assert t2.id == t.id
    assert t2.artist == t.artist
    assert t2.support == t.support
    assert t2.tour_name == t.tour_name
    assert t2.poster == t.poster
    assert t2.comment == t.comment
    assert t2.name == t.name
    assert len(t2.concerts) == len(t.concerts)
    assert t2.concerts[0].id == t.concerts[0].id
    assert t2.concerts[0].city == "Berlin"
    assert t2.concerts[1].city == "Munich"
    assert t2.concerts[1].ticket_link == "http://x"


def test_tour_from_dict_legacy_single_string_artist_wrapped():
    data = {"id": "abc", "name": "Solo", "artist": "Solo", "tour_name": "T"}
    t = Tour.from_dict(data)
    assert t.artist == ["Solo"]
    assert t.id == "abc"


def test_tour_from_dict_none_artist_falls_back_to_name():
    data = {"id": "abc", "name": "SoloName", "artist": None, "tour_name": "T"}
    t = Tour.from_dict(data)
    assert t.artist == ["SoloName"]


def test_tour_from_dict_missing_artist_falls_back_to_name():
    data = {"id": "abc", "name": "SoloName", "tour_name": "T"}
    t = Tour.from_dict(data)
    assert t.artist == ["SoloName"]


def test_tour_from_dict_defaults_support_and_tour_name():
    data = {"id": "abc", "name": "Band", "artist": ["Band"]}
    t = Tour.from_dict(data)
    assert t.support == []
    assert t.tour_name == "Tour"
    assert t.comment == ""
    assert t.concerts == []


def test_tour_from_dict_reconstructs_concerts_with_ids():
    t = Tour(artist="Band")
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    t2 = Tour.from_dict(t.to_dict())
    assert t2.concerts[0].id == c.id
    assert t2.concerts[0].date == "2026-09-01"


def test_tour_from_poster_data_full():
    extracted = {
        "artist": ["Main", "Co"],
        "tour_name": "Big Tour",
        "support": ["Opener"],
        "poster": "poster.png",
        "concerts": [
            {
                "date": "2026-09-01",
                "city": "Berlin",
                "venue": "Arena",
                "time": "20:00",
                "tags": ["rock"],
                "support_present": ["Opener"],
            },
            {"date": "2026-10-05", "city": "Munich", "venue": "Hall", "end_date": "2026-10-06"},
        ],
    }
    t = Tour.from_poster_data(extracted)
    assert t.artist == ["Main", "Co"]
    assert t.tour_name == "Big Tour"
    assert t.support == ["Opener"]
    assert t.poster == "poster.png"
    assert len(t.concerts) == 2
    assert t.concerts[0].city == "Berlin"
    assert t.concerts[0].support_present == ["Opener"]
    assert t.concerts[1].end_date == "2026-10-06"
    assert t.concerts[0].tour_id == t.id
    assert t.concerts[0].tour_name == "Big Tour"
    assert t.concerts[0].artist == "Main"


def test_tour_from_poster_data_legacy_string_artist():
    extracted = {"artist": "Solo", "concerts": []}
    t = Tour.from_poster_data(extracted)
    assert t.artist == ["Solo"]


def test_tour_from_poster_data_empty():
    t = Tour.from_poster_data({})
    assert t.artist == []
    assert t.tour_name == "Tour"
    assert t.support == []
    assert t.concerts == []


# ── Festival ──────────────────────────────────────────────────────────────────


def test_festival_init_defaults():
    f = Festival(name="F")
    assert f.name == "F"
    assert f.city == ""
    assert f.venue == ""
    assert f.date == ""
    assert f.end_date is None
    assert f.time is None
    assert f.price is None
    assert f.ticket_link is None
    assert f.bands_to_watch == []
    assert f.tags == []
    assert f.poster is None
    assert f.logo is None
    assert f.comment == ""


def test_festival_init_full():
    f = Festival(
        name="F",
        city="Berlin",
        venue="Park",
        date="2026-07-01",
        end_date="2026-07-03",
        time="14:00",
        price=120.0,
        ticket_link="http://t",
        bands_to_watch=["A", "B"],
        tags=["outdoor"],
        poster="p.png",
        logo="l.png",
        comment="note",
    )
    assert f.city == "Berlin"
    assert f.venue == "Park"
    assert f.date == "2026-07-01"
    assert f.end_date == "2026-07-03"
    assert f.time == "14:00"
    assert f.price == 120.0
    assert f.ticket_link == "http://t"
    assert f.bands_to_watch == ["A", "B"]
    assert f.tags == ["outdoor"]
    assert f.poster == "p.png"
    assert f.logo == "l.png"
    assert f.comment == "note"


def test_festival_to_dict_keys_and_values():
    f = Festival(
        name="F",
        city="Berlin",
        venue="Park",
        date="2026-07-01",
        end_date="2026-07-03",
        time="14:00",
        price=120.0,
        ticket_link="http://t",
        bands_to_watch=["A", "B"],
        tags=["outdoor"],
        poster="p.png",
        logo="l.png",
        comment="note",
    )
    d = f.to_dict()
    assert d["id"] == f.id
    assert d["event_type"] == "festival"
    assert d["name"] == "F"
    assert d["city"] == "Berlin"
    assert d["venue"] == "Park"
    assert d["date"] == "2026-07-01"
    assert d["end_date"] == "2026-07-03"
    assert d["time"] == "14:00"
    assert d["price"] == 120.0
    assert d["ticket_link"] == "http://t"
    assert d["bands_to_watch"] == ["A", "B"]
    assert d["tags"] == ["outdoor"]
    assert d["poster"] == "p.png"
    assert d["logo"] == "l.png"
    assert d["comment"] == "note"


def test_festival_round_trip_to_dict_from_dict():
    f = Festival(
        name="F",
        city="Berlin",
        venue="Park",
        date="2026-07-01",
        end_date="2026-07-03",
        time="14:00",
        price=120.0,
        ticket_link="http://t",
        bands_to_watch=["A", "B"],
        tags=["outdoor"],
        poster="p.png",
        logo="l.png",
        comment="note",
    )
    f2 = Festival.from_dict(f.to_dict())
    assert f2.id == f.id
    assert f2.name == "F"
    assert f2.city == "Berlin"
    assert f2.venue == "Park"
    assert f2.date == "2026-07-01"
    assert f2.end_date == "2026-07-03"
    assert f2.time == "14:00"
    assert f2.price == 120.0
    assert f2.ticket_link == "http://t"
    assert f2.bands_to_watch == ["A", "B"]
    assert f2.tags == ["outdoor"]
    assert f2.poster == "p.png"
    assert f2.logo == "l.png"
    assert f2.comment == "note"


def test_festival_from_dict_requires_id():
    data = {"name": "F", "city": "Berlin"}
    f = Festival.from_dict({**data, "id": "fixed-id"})
    assert f.id == "fixed-id"


def test_festival_from_dict_defaults():
    f = Festival.from_dict({"id": "x", "name": "F"})
    assert f.city == ""
    assert f.venue == ""
    assert f.date == ""
    assert f.bands_to_watch == []
    assert f.tags == []
    assert f.end_date is None


def test_festival_from_poster_data_full():
    extracted = {
        "name": "F",
        "city": "Berlin",
        "venue": "Park",
        "date": "2026-07-01",
        "end_date": "2026-07-03",
        "time": "14:00",
        "price": 99.0,
        "bands_to_watch": ["A", "B"],
        "poster": "p.png",
    }
    f = Festival.from_poster_data(extracted)
    assert f.name == "F"
    assert f.city == "Berlin"
    assert f.venue == "Park"
    assert f.date == "2026-07-01"
    assert f.end_date == "2026-07-03"
    assert f.time == "14:00"
    assert f.price == 99.0
    assert f.bands_to_watch == ["A", "B"]
    assert f.poster == "p.png"


def test_festival_from_poster_data_empty():
    f = Festival.from_poster_data({})
    assert f.name == ""
    assert f.city == ""
    assert f.date == ""


# ── Concert ───────────────────────────────────────────────────────────────────


def test_concert_init_defaults():
    c = Concert(date="2026-09-01", city="Berlin", venue="Arena")
    assert c.date == "2026-09-01"
    assert c.city == "Berlin"
    assert c.venue == "Arena"
    assert c.price is None
    assert c.time is None
    assert c.end_date is None
    assert c.tags == []
    assert c.tour_id is None
    assert c.tour_name is None
    assert c.artist is None
    assert c.support_present == []
    assert c.ticket_link is None
    assert isinstance(c.id, str)
    uuid.UUID(c.id)


def test_concert_init_full():
    c = Concert(
        date="2026-09-01",
        city="Berlin",
        venue="Arena",
        price=45,
        time="20:00",
        end_date="2026-09-02",
        tags=["rock"],
        tour_id="tid",
        tour_name="T",
        artist="Band",
        support_present=["Op"],
        ticket_link="http://x",
    )
    assert c.price == 45
    assert c.time == "20:00"
    assert c.end_date == "2026-09-02"
    assert c.tags == ["rock"]
    assert c.tour_id == "tid"
    assert c.tour_name == "T"
    assert c.artist == "Band"
    assert c.support_present == ["Op"]
    assert c.ticket_link == "http://x"


def test_concert_support_present_none_defaults_to_empty_list():
    c = Concert(date="d", city="c", venue="v", support_present=None)
    assert c.support_present == []


def test_concert_to_dict_keys_and_values():
    c = Concert(
        date="2026-09-01",
        city="Berlin",
        venue="Arena",
        price=45,
        time="20:00",
        end_date="2026-09-02",
        tags=["rock"],
        tour_id="tid",
        tour_name="T",
        artist="Band",
        support_present=["Op"],
        ticket_link="http://x",
    )
    d = c.to_dict()
    assert set(d.keys()) == {
        "id",
        "date",
        "end_date",
        "time",
        "city",
        "venue",
        "price",
        "tags",
        "tour_id",
        "tour_name",
        "artist",
        "support_present",
        "ticket_link",
    }
    assert d["date"] == "2026-09-01"
    assert d["end_date"] == "2026-09-02"
    assert d["time"] == "20:00"
    assert d["city"] == "Berlin"
    assert d["venue"] == "Arena"
    assert d["price"] == 45
    assert d["tags"] == ["rock"]
    assert d["tour_id"] == "tid"
    assert d["tour_name"] == "T"
    assert d["artist"] == "Band"
    assert d["support_present"] == ["Op"]
    assert d["ticket_link"] == "http://x"


def test_concert_round_trip_to_dict_from_dict():
    c = Concert(
        date="2026-09-01",
        city="Berlin",
        venue="Arena",
        price=45,
        time="20:00",
        end_date="2026-09-02",
        tags=["rock", "indie"],
        tour_id="tid",
        tour_name="T",
        artist="Band",
        support_present=["Op1", "Op2"],
        ticket_link="http://x",
    )
    c2 = Concert.from_dict(c.to_dict())
    assert c2.id == c.id
    assert c2.date == "2026-09-01"
    assert c2.end_date == "2026-09-02"
    assert c2.time == "20:00"
    assert c2.city == "Berlin"
    assert c2.venue == "Arena"
    assert c2.price == 45
    assert c2.tags == ["rock", "indie"]
    assert c2.tour_id == "tid"
    assert c2.tour_name == "T"
    assert c2.artist == "Band"
    assert c2.support_present == ["Op1", "Op2"]
    assert c2.ticket_link == "http://x"


def test_concert_from_dict_preserves_id():
    c = Concert.from_dict(
        {
            "id": "fixed-concert-id",
            "date": "d",
            "city": "c",
            "venue": "v",
        }
    )
    assert c.id == "fixed-concert-id"


def test_concert_from_dict_defaults():
    c = Concert.from_dict(
        {
            "id": "x",
            "date": "d",
            "city": "c",
            "venue": "v",
        }
    )
    assert c.tags == []
    assert c.support_present == []
    assert c.price is None
    assert c.time is None
    assert c.end_date is None
    assert c.tour_id is None
    assert c.tour_name is None
    assert c.artist is None
    assert c.ticket_link is None


# ── Artist ────────────────────────────────────────────────────────────────────


def test_artist_init_defaults():
    a = Artist(name="Band")
    assert a.name == "Band"
    assert a.logo is None
    assert a.photo is None
    assert a.followed is False
    assert a.eventim_name is None
    assert a.eventim_id is None
    assert isinstance(a.id, str)
    uuid.UUID(a.id)


def test_artist_init_full():
    a = Artist(
        name="Band",
        logo="l.png",
        photo="p.png",
        followed=True,
        eventim_name="The Band",
        eventim_id="12345",
    )
    assert a.logo == "l.png"
    assert a.photo == "p.png"
    assert a.followed is True
    assert a.eventim_name == "The Band"
    assert a.eventim_id == "12345"


def test_artist_unique_ids():
    a = Artist(name="A")
    b = Artist(name="B")
    assert a.id != b.id


def test_artist_to_dict_keys_and_values():
    a = Artist(
        name="Band",
        logo="l.png",
        photo="p.png",
        followed=True,
        eventim_name="The Band",
        eventim_id="12345",
    )
    d = a.to_dict()
    assert set(d.keys()) == {
        "id",
        "name",
        "logo",
        "photo",
        "followed",
        "eventim_name",
        "eventim_id",
    }
    assert d["id"] == a.id
    assert d["name"] == "Band"
    assert d["logo"] == "l.png"
    assert d["photo"] == "p.png"
    assert d["followed"] is True
    assert d["eventim_name"] == "The Band"
    assert d["eventim_id"] == "12345"


def test_artist_round_trip_to_dict_from_dict():
    a = Artist(
        name="Band",
        logo="l.png",
        photo="p.png",
        followed=True,
        eventim_name="The Band",
        eventim_id="12345",
    )
    a2 = Artist.from_dict(a.to_dict())
    assert a2.id == a.id
    assert a2.name == "Band"
    assert a2.logo == "l.png"
    assert a2.photo == "p.png"
    assert a2.followed is True
    assert a2.eventim_name == "The Band"
    assert a2.eventim_id == "12345"


def test_artist_from_dict_preserves_id():
    a = Artist.from_dict({"id": "fixed", "name": "Band"})
    assert a.id == "fixed"


def test_artist_from_dict_defaults():
    a = Artist.from_dict({"id": "x", "name": "Band"})
    assert a.logo is None
    assert a.photo is None
    assert a.followed is False
    assert a.eventim_name is None
    assert a.eventim_id is None


# ── Venue ─────────────────────────────────────────────────────────────────────


def test_venue_init_defaults():
    v = Venue(name="Arena")
    assert v.name == "Arena"
    assert v.city == ""
    assert isinstance(v.id, str)
    uuid.UUID(v.id)


def test_venue_init_with_city():
    v = Venue(name="Arena", city="Berlin")
    assert v.city == "Berlin"


def test_venue_unique_ids():
    a = Venue(name="A")
    b = Venue(name="B")
    assert a.id != b.id


def test_venue_to_dict():
    v = Venue(name="Arena", city="Berlin")
    d = v.to_dict()
    assert set(d.keys()) == {"id", "name", "city"}
    assert d["id"] == v.id
    assert d["name"] == "Arena"
    assert d["city"] == "Berlin"


def test_venue_round_trip_to_dict_from_dict():
    v = Venue(name="Arena", city="Berlin")
    v2 = Venue.from_dict(v.to_dict())
    assert v2.id == v.id
    assert v2.name == "Arena"
    assert v2.city == "Berlin"


def test_venue_from_dict_preserves_id():
    v = Venue.from_dict({"id": "fixed", "name": "Arena", "city": "Berlin"})
    assert v.id == "fixed"


def test_venue_from_dict_default_city():
    v = Venue.from_dict({"id": "x", "name": "Arena"})
    assert v.city == ""
