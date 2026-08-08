"""Pure-logic tests for db.py helpers and mappers (no DB session needed)."""

import uuid
from datetime import date

import pytest

from concert import Artist, Festival, Tour, Venue
from db import (
    _img_id_to_uuid,
    _mime_from_ext,
    _parse_date,
    _str_to_uuid,
    artist_to_row,
    event_to_row,
    row_to_artist,
    row_to_event,
    row_to_venue,
    venue_to_row,
)
from models import ArtistRow, EventRow, VenueRow

# ── _parse_date ───────────────────────────────────────────────────────────────


def test_parse_date_valid_iso():
    assert _parse_date("2026-09-01") == date(2026, 9, 1)


def test_parse_date_none_returns_none():
    assert _parse_date(None) is None


def test_parse_date_empty_string_returns_none():
    assert _parse_date("") is None


def test_parse_date_invalid_returns_none():
    assert _parse_date("invalid") is None


def test_parse_date_garbage_returns_none():
    assert _parse_date("2026-13-99") is None


def test_parse_date_non_string_returns_none():
    assert _parse_date(20260901) is None


# ── _img_id_to_uuid ────────────────────────────────────────────────────────────


def test_img_id_to_uuid_valid():
    s = "550e8400-e29b-41d4-a716-446655440000"
    result = _img_id_to_uuid(s)
    assert isinstance(result, uuid.UUID)
    assert str(result) == s


def test_img_id_to_uuid_none_returns_none():
    assert _img_id_to_uuid(None) is None


def test_img_id_to_uuid_empty_returns_none():
    assert _img_id_to_uuid("") is None


def test_img_id_to_uuid_invalid_returns_none():
    assert _img_id_to_uuid("not-a-uuid") is None


# ── _str_to_uuid ───────────────────────────────────────────────────────────────


def test_str_to_uuid_valid():
    s = "550e8400-e29b-41d4-a716-446655440000"
    result = _str_to_uuid(s)
    assert isinstance(result, uuid.UUID)
    assert str(result) == s


def test_str_to_uuid_none_returns_none():
    assert _str_to_uuid(None) is None


def test_str_to_uuid_empty_returns_none():
    assert _str_to_uuid("") is None


def test_str_to_uuid_invalid_returns_none():
    assert _str_to_uuid("not-a-uuid") is None


# ── _mime_from_ext ─────────────────────────────────────────────────────────────


def test_mime_from_ext_png():
    assert _mime_from_ext("poster.png") == "image/png"


def test_mime_from_ext_jpg():
    assert _mime_from_ext("x.jpg") == "image/jpeg"


def test_mime_from_ext_jpeg():
    assert _mime_from_ext("x.jpeg") == "image/jpeg"


def test_mime_from_ext_gif():
    assert _mime_from_ext("x.gif") == "image/gif"


def test_mime_from_ext_webp():
    assert _mime_from_ext("x.webp") == "image/webp"


def test_mime_from_ext_no_extension():
    assert _mime_from_ext("noext") == "application/octet-stream"


def test_mime_from_ext_unknown_extension():
    assert _mime_from_ext("x.unknown") == "application/octet-stream"


def test_mime_from_ext_uppercase_extension():
    assert _mime_from_ext("PHOTO.PNG") == "image/png"


def test_mime_from_ext_mixed_case():
    assert _mime_from_ext("photo.JpG") == "image/jpeg"


def test_mime_from_ext_path_with_dots():
    assert _mime_from_ext("a/b.c/poster.png") == "image/png"


# ── row_to_event / event_to_row — Tour ─────────────────────────────────────────


def test_event_to_row_tour_basic_fields():
    t = Tour(artist=["Band"], support=["Op"], tour_name="World Tour", poster=None, comment="note")
    row = event_to_row(t)
    assert isinstance(row, EventRow)
    assert row.id == t.id
    assert row.event_type == "tour"
    assert row.name == "Band"
    assert row.city is None
    assert row.venue is None
    assert row.poster_id is None
    assert row.logo_id is None
    assert row.comment == "note"
    assert row.attrs["artist"] == ["Band"]
    assert row.attrs["support"] == ["Op"]
    assert row.attrs["tour_name"] == "World Tour"
    assert row.attrs["concerts"] == []


def test_event_to_row_tour_with_poster_uuid():
    poster_uuid = "550e8400-e29b-41d4-a716-446655440000"
    t = Tour(artist="Band", poster=poster_uuid)
    row = event_to_row(t)
    assert row.poster_id == uuid.UUID(poster_uuid)


def test_event_to_row_tour_invalid_poster_becomes_none():
    t = Tour(artist="Band", poster="not-a-uuid")
    row = event_to_row(t)
    assert row.poster_id is None


def test_event_to_row_tour_concerts_serialized():
    t = Tour(artist="Band")
    c = t.add_concert(date="2026-09-01", city="Berlin", venue="Arena", price=30)
    row = event_to_row(t)
    assert len(row.attrs["concerts"]) == 1
    assert row.attrs["concerts"][0]["city"] == "Berlin"
    assert row.attrs["concerts"][0]["id"] == c.id


def test_event_to_row_tour_dates_from_concerts():
    t = Tour(artist="Band")
    t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    t.add_concert(date="2026-10-15", city="Munich", venue="Hall")
    row = event_to_row(t)
    assert row.start_date == date(2026, 9, 1)
    assert row.end_date == date(2026, 10, 15)


def test_event_to_row_tour_dates_with_end_date():
    t = Tour(artist="Band")
    t.add_concert(date="2026-09-01", city="Berlin", venue="Arena", end_date="2026-09-03")
    t.add_concert(date="2026-10-15", city="Munich", venue="Hall")
    row = event_to_row(t)
    assert row.start_date == date(2026, 9, 1)
    assert row.end_date == date(2026, 10, 15)


def test_event_to_row_tour_end_date_uses_end_date_when_latest():
    t = Tour(artist="Band")
    t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    t.add_concert(date="2026-10-15", city="Munich", venue="Hall", end_date="2026-10-20")
    row = event_to_row(t)
    assert row.start_date == date(2026, 9, 1)
    assert row.end_date == date(2026, 10, 20)


def test_event_to_row_tour_end_date_falls_back_to_date_when_no_end_date():
    t = Tour(artist="Band")
    t.add_concert(date="2026-09-01", city="Berlin", venue="Arena", end_date="2026-09-03")
    row = event_to_row(t)
    assert row.start_date == date(2026, 9, 1)
    assert row.end_date == date(2026, 9, 3)


def test_event_to_row_tour_no_concerts_dates_none():
    t = Tour(artist="Band")
    row = event_to_row(t)
    assert row.start_date is None
    assert row.end_date is None


def test_tour_round_trip_event_to_row_row_to_event():
    t = Tour(
        artist=["Main", "Co"],
        support=["Op1", "Op2"],
        tour_name="World Tour",
        poster=None,
        comment="note",
    )
    t.add_concert(
        date="2026-09-01", city="Berlin", venue="Arena", price=30, time="20:00", tags=["rock"]
    )
    t.add_concert(
        date="2026-10-15",
        city="Munich",
        venue="Hall",
        price=35,
        end_date="2026-10-16",
        ticket_link="http://x",
    )

    row = event_to_row(t)
    t2 = row_to_event(row)

    assert isinstance(t2, Tour)
    assert t2.id == t.id
    assert t2.artist == ["Main", "Co"]
    assert t2.support == ["Op1", "Op2"]
    assert t2.tour_name == "World Tour"
    assert t2.comment == "note"
    assert len(t2.concerts) == 2
    assert t2.concerts[0].id == t.concerts[0].id
    assert t2.concerts[0].city == "Berlin"
    assert t2.concerts[0].price == 30
    assert t2.concerts[0].tags == ["rock"]
    assert t2.concerts[1].city == "Munich"
    assert t2.concerts[1].end_date == "2026-10-16"
    assert t2.concerts[1].ticket_link == "http://x"


def test_tour_round_trip_preserves_start_end_dates():
    t = Tour(artist="Band")
    t.add_concert(date="2026-09-01", city="Berlin", venue="Arena")
    t.add_concert(date="2026-10-15", city="Munich", venue="Hall")
    row = event_to_row(t)
    assert row.start_date == date(2026, 9, 1)
    assert row.end_date == date(2026, 10, 15)
    t2 = row_to_event(row)
    assert t2.concerts[0].date == "2026-09-01"


def test_row_to_event_legacy_string_artist_in_attrs():
    row = EventRow(
        id="legacy-id",
        event_type="tour",
        name="Band",
        attrs={"artist": "Band", "support": [], "tour_name": "T", "concerts": []},
        comment="",
    )
    t = row_to_event(row)
    assert isinstance(t, Tour)
    assert t.artist == ["Band"]


def test_row_to_event_missing_artist_in_attrs_falls_back_to_empty():
    row = EventRow(
        id="x",
        event_type="tour",
        name="Band",
        attrs={},
        comment="",
    )
    t = row_to_event(row)
    assert t.artist == []


# ── row_to_event / event_to_row — Festival ─────────────────────────────────────


def test_event_to_row_festival_basic_fields():
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
        poster=None,
        logo=None,
        comment="note",
    )
    row = event_to_row(f)
    assert isinstance(row, EventRow)
    assert row.id == f.id
    assert row.event_type == "festival"
    assert row.name == "F"
    assert row.city == "Berlin"
    assert row.venue == "Park"
    assert row.start_date == date(2026, 7, 1)
    assert row.end_date == date(2026, 7, 3)
    assert row.poster_id is None
    assert row.logo_id is None
    assert row.comment == "note"
    assert row.attrs["time"] == "14:00"
    assert row.attrs["price"] == 120.0
    assert row.attrs["ticket_link"] == "http://t"
    assert row.attrs["bands_to_watch"] == ["A", "B"]
    assert row.attrs["tags"] == ["outdoor"]


def test_event_to_row_festival_with_logo_uuid():
    logo_uuid = "550e8400-e29b-41d4-a716-446655440000"
    f = Festival(name="F", logo=logo_uuid)
    row = event_to_row(f)
    assert row.logo_id == uuid.UUID(logo_uuid)


def test_event_to_row_festival_invalid_logo_becomes_none():
    f = Festival(name="F", logo="not-a-uuid")
    row = event_to_row(f)
    assert row.logo_id is None


def test_event_to_row_festival_empty_city_venue_become_none():
    f = Festival(name="F")
    row = event_to_row(f)
    assert row.city is None
    assert row.venue is None


def test_festival_round_trip_event_to_row_row_to_event():
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
        poster=None,
        logo=None,
        comment="note",
    )
    row = event_to_row(f)
    f2 = row_to_event(row)
    assert isinstance(f2, Festival)
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
    assert f2.comment == "note"


def test_festival_round_trip_with_images():
    poster_uuid = "550e8400-e29b-41d4-a716-446655440000"
    logo_uuid = "660e8400-e29b-41d4-a716-446655440000"
    f = Festival(name="F", date="2026-07-01", poster=poster_uuid, logo=logo_uuid)
    row = event_to_row(f)
    assert row.poster_id == uuid.UUID(poster_uuid)
    assert row.logo_id == uuid.UUID(logo_uuid)
    f2 = row_to_event(row)
    assert f2.poster == poster_uuid
    assert f2.logo == logo_uuid


# ── event_to_row unknown type ──────────────────────────────────────────────────


def test_event_to_row_unknown_type_raises_value_error():
    from concert import Event

    e = Event(name="X")
    with pytest.raises(ValueError):
        event_to_row(e)


# ── row_to_artist / artist_to_row ──────────────────────────────────────────────


def test_artist_to_row_basic():
    a = Artist(name="Band", followed=True, eventim_name="The Band", eventim_id="123")
    row = artist_to_row(a)
    assert isinstance(row, ArtistRow)
    assert row.id == uuid.UUID(a.id)
    assert row.name == "Band"
    assert row.logo_id is None
    assert row.photo_id is None
    assert row.followed is True
    assert row.eventim_name == "The Band"
    assert row.eventim_id == "123"


def test_artist_to_row_converts_logo_and_photo_to_uuid():
    logo_uuid = "550e8400-e29b-41d4-a716-446655440000"
    photo_uuid = "660e8400-e29b-41d4-a716-446655440000"
    a = Artist(name="Band", logo=logo_uuid, photo=photo_uuid)
    row = artist_to_row(a)
    assert row.logo_id == uuid.UUID(logo_uuid)
    assert row.photo_id == uuid.UUID(photo_uuid)


def test_artist_to_row_invalid_logo_becomes_none():
    a = Artist(name="Band", logo="not-a-uuid")
    row = artist_to_row(a)
    assert row.logo_id is None


def test_artist_round_trip():
    logo_uuid = "550e8400-e29b-41d4-a716-446655440000"
    photo_uuid = "660e8400-e29b-41d4-a716-446655440000"
    a = Artist(
        name="Band",
        logo=logo_uuid,
        photo=photo_uuid,
        followed=True,
        eventim_name="The Band",
        eventim_id="12345",
    )
    row = artist_to_row(a)
    a2 = row_to_artist(row)
    assert a2.id == a.id
    assert a2.name == "Band"
    assert a2.logo == logo_uuid
    assert a2.photo == photo_uuid
    assert a2.followed is True
    assert a2.eventim_name == "The Band"
    assert a2.eventim_id == "12345"


def test_artist_round_trip_no_images():
    a = Artist(name="Band")
    row = artist_to_row(a)
    a2 = row_to_artist(row)
    assert a2.id == a.id
    assert a2.logo is None
    assert a2.photo is None
    assert a2.followed is False


# ── row_to_venue / venue_to_row ────────────────────────────────────────────────


def test_venue_to_row_basic():
    v = Venue(name="Arena", city="Berlin")
    row = venue_to_row(v)
    assert isinstance(row, VenueRow)
    assert row.id == uuid.UUID(v.id)
    assert row.name == "Arena"
    assert row.city == "Berlin"


def test_venue_round_trip():
    v = Venue(name="Arena", city="Berlin")
    row = venue_to_row(v)
    v2 = row_to_venue(row)
    assert v2.id == v.id
    assert v2.name == "Arena"
    assert v2.city == "Berlin"


def test_venue_round_trip_empty_city():
    v = Venue(name="Arena")
    row = venue_to_row(v)
    v2 = row_to_venue(row)
    assert v2.city == ""
    assert v2.id == v.id
