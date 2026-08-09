"""Database layer for Konzertplaner (PostgreSQL via SQLModel).

Replaces the former JSON-file persistence (data/events.json, data/catalogue.json)
and on-disk image storage (static/posters/, static/logos/, static/festival-logos/).
On first boot, if the DB is empty and JSON files exist, data is auto-migrated.
"""

import json
import os
import uuid
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, SQLModel, create_engine, select

from concert import Artist, Concert, Event, Festival, Tour, Venue
from models import ArtistRow, EventRow, Image, KvRow, VenueRow

# ── Engine ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://kp:kp@localhost:5432/kp",  # local dev; Docker overrides via env
)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)


def session() -> Session:
    return Session(engine, expire_on_commit=False)


# ── Paths (read-only migration sources) ──────────────────────────────────────

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "data" / "events.json"
LEGACY_FILE = BASE_DIR / "data" / "tours.json"
CAT_FILE = BASE_DIR / "data" / "catalogue.json"
POSTER_DIR = BASE_DIR / "static" / "posters"
LOGO_DIR = BASE_DIR / "static" / "logos"
FESTIVAL_LOGO_DIR = BASE_DIR / "static" / "festival-logos"


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _img_id_to_uuid(s: str | None) -> uuid.UUID | None:
    if not s:
        return None
    try:
        return uuid.UUID(s)
    except ValueError:
        return None


def _str_to_uuid(s: str | None) -> uuid.UUID | None:
    if not s:
        return None
    try:
        return uuid.UUID(s)
    except ValueError:
        return None


_EXT_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
}


def _mime_from_ext(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _EXT_MIME.get(ext, "application/octet-stream")


# ── Mappers: domain ↔ DB rows ─────────────────────────────────────────────────


def row_to_event(row: EventRow) -> Event:
    poster_str = str(row.poster_id) if row.poster_id else None
    if row.event_type == "festival":
        attrs = row.attrs or {}
        fest = Festival(
            name=row.name,
            city=row.city or "",
            venue=row.venue or "",
            date=row.start_date.isoformat() if row.start_date else "",
            end_date=row.end_date.isoformat() if row.end_date else None,
            time=attrs.get("time"),
            price=attrs.get("price"),
            ticket_link=attrs.get("ticket_link"),
            bands_to_watch=attrs.get("bands_to_watch", []),
            tags=attrs.get("tags", []),
            poster=poster_str,
            logo=str(row.logo_id) if row.logo_id else None,
            comment=row.comment,
        )
        fest.id = row.id
        return fest
    else:
        attrs = row.attrs or {}
        artist = attrs.get("artist", [])
        if isinstance(artist, str):
            artist = [artist]
        tour = Tour(
            artist=artist,
            support=attrs.get("support", []),
            tour_name=attrs.get("tour_name", "Tour"),
            poster=poster_str,
            comment=row.comment,
        )
        tour.id = row.id
        tour.concerts = [Concert.from_dict(c) for c in attrs.get("concerts", [])]
        return tour


def event_to_row(event: Event) -> EventRow:
    if isinstance(event, Festival):
        attrs = {
            "time": event.time,
            "price": event.price,
            "ticket_link": event.ticket_link,
            "bands_to_watch": event.bands_to_watch,
            "tags": event.tags,
        }
        return EventRow(
            id=event.id,
            event_type="festival",
            name=event.name,
            city=event.city or None,
            venue=event.venue or None,
            start_date=_parse_date(event.date),
            end_date=_parse_date(event.end_date),
            poster_id=_img_id_to_uuid(event.poster),
            logo_id=_img_id_to_uuid(event.logo),
            comment=event.comment,
            attrs=attrs,
        )
    elif isinstance(event, Tour):
        attrs = {
            "artist": event.artist,
            "support": event.support,
            "tour_name": event.tour_name,
            "concerts": [c.to_dict() for c in event.concerts],
        }
        concert_dates = [c.date for c in event.concerts if c.date]
        start_str = min(concert_dates) if concert_dates else None
        end_dates = [c.end_date or c.date for c in event.concerts if c.date]
        end_str = max(end_dates) if end_dates else None
        return EventRow(
            id=event.id,
            event_type="tour",
            name=event.name,
            city=None,
            venue=None,
            start_date=_parse_date(start_str),
            end_date=_parse_date(end_str),
            poster_id=_img_id_to_uuid(event.poster),
            logo_id=None,
            comment=event.comment,
            attrs=attrs,
        )
    else:
        raise ValueError(f"Unknown event type: {type(event)}")


def row_to_artist(row: ArtistRow) -> Artist:
    a = Artist(
        name=row.name,
        logo=str(row.logo_id) if row.logo_id else None,
        photo=str(row.photo_id) if row.photo_id else None,
        followed=row.followed,
        eventim_name=row.eventim_name,
        eventim_id=row.eventim_id,
    )
    a.id = str(row.id)
    return a


def artist_to_row(artist: Artist) -> ArtistRow:
    return ArtistRow(
        id=uuid.UUID(artist.id) if artist.id else uuid.uuid4(),
        name=artist.name,
        logo_id=_img_id_to_uuid(artist.logo),
        photo_id=_img_id_to_uuid(artist.photo),
        followed=artist.followed,
        eventim_name=artist.eventim_name,
        eventim_id=artist.eventim_id,
    )


def row_to_venue(row: VenueRow) -> Venue:
    v = Venue(name=row.name, city=row.city)
    v.id = str(row.id)
    return v


def venue_to_row(venue: Venue) -> VenueRow:
    return VenueRow(
        id=uuid.UUID(venue.id) if venue.id else uuid.uuid4(),
        name=venue.name,
        city=venue.city,
    )


# ── CRUD: events ──────────────────────────────────────────────────────────────


def list_events() -> list[Event]:
    with session() as s:
        rows = s.exec(select(EventRow)).all()
        return [row_to_event(r) for r in rows]


def get_event(eid: str) -> Event | None:
    with session() as s:
        row = s.get(EventRow, eid)
        return row_to_event(row) if row else None


def upsert_event(event: Event) -> Event:
    row = event_to_row(event)
    with session() as s:
        existing = s.get(EventRow, row.id)
        if existing:
            for col in (
                "event_type",
                "name",
                "city",
                "venue",
                "start_date",
                "end_date",
                "poster_id",
                "logo_id",
                "comment",
                "attrs",
            ):
                setattr(existing, col, getattr(row, col))
            existing.updated_at = datetime.now(UTC)
        else:
            s.add(row)
        s.commit()
    return event


def delete_event_db(eid: str) -> bool:
    with session() as s:
        row = s.get(EventRow, eid)
        if row:
            s.delete(row)
            s.commit()
            return True
        return False


# ── CRUD: artists ────────────────────────────────────────────────────────────


def list_artists() -> list[Artist]:
    with session() as s:
        rows = s.exec(select(ArtistRow)).all()
        return [row_to_artist(r) for r in rows]


def get_artist(aid: str) -> Artist | None:
    with session() as s:
        uid = _str_to_uuid(aid)
        if not uid:
            return None
        row = s.get(ArtistRow, uid)
        return row_to_artist(row) if row else None


def upsert_artist(artist: Artist) -> Artist:
    row = artist_to_row(artist)
    with session() as s:
        existing = s.get(ArtistRow, row.id)
        if existing:
            for col in ("name", "logo_id", "photo_id", "followed", "eventim_name", "eventim_id"):
                setattr(existing, col, getattr(row, col))
            existing.updated_at = datetime.now(UTC)
        else:
            s.add(row)
        s.commit()
    return artist


def delete_artist_db(aid: str) -> bool:
    with session() as s:
        uid = _str_to_uuid(aid)
        if not uid:
            return False
        row = s.get(ArtistRow, uid)
        if row:
            s.delete(row)
            s.commit()
            return True
        return False


# ── CRUD: venues ─────────────────────────────────────────────────────────────


def list_venues() -> list[Venue]:
    with session() as s:
        rows = s.exec(select(VenueRow)).all()
        return [row_to_venue(r) for r in rows]


def get_venue(vid: str) -> Venue | None:
    with session() as s:
        uid = _str_to_uuid(vid)
        if not uid:
            return None
        row = s.get(VenueRow, uid)
        return row_to_venue(row) if row else None


def upsert_venue(venue: Venue) -> Venue:
    row = venue_to_row(venue)
    with session() as s:
        existing = s.get(VenueRow, row.id)
        if existing:
            existing.name = row.name
            existing.city = row.city
        else:
            s.add(row)
        s.commit()
    return venue


def delete_venue_db(vid: str) -> bool:
    with session() as s:
        uid = _str_to_uuid(vid)
        if not uid:
            return False
        row = s.get(VenueRow, uid)
        if row:
            s.delete(row)
            s.commit()
            return True
        return False


# ── CRUD: images ─────────────────────────────────────────────────────────────


def create_image(data: bytes, kind: str, mime: str, filename: str | None = None) -> str:
    img = Image(kind=kind, mime=mime, filename=filename, data=data)
    with session() as s:
        s.add(img)
        s.commit()
    return str(img.id)


def get_image(img_id: str) -> Image | None:
    with session() as s:
        uid = _str_to_uuid(img_id)
        if not uid:
            return None
        return s.get(Image, uid)


# ── CRUD: key-value store (syncable client state) ─────────────────────────────


def get_kv(key: str, default: Any = None) -> Any:
    """Return the stored value for `key`, or `default` (None when unset) if
    the row does not exist. Value shape is opaque (dict, list, scalar)."""
    with session() as s:
        row = s.get(KvRow, key)
        if row is None:
            return default
        return row.value


def set_kv(key: str, value: Any) -> None:
    """Upsert `value` under `key`, bumping `updated_at`."""
    with session() as s:
        row = s.get(KvRow, key)
        if row is None:
            s.add(KvRow(key=key, value=value))
        else:
            row.value = value
            row.updated_at = datetime.now(UTC)
        s.commit()


# ── Auto-migration from JSON + on-disk images ─────────────────────────────────


def _migrate_image_file(filename: str, dir_path: Path, kind: str, s: Session) -> str | None:
    """Read an image file from disk, insert into images table, return UUID."""
    file_path = dir_path / filename
    if not file_path.exists():
        return None
    data = file_path.read_bytes()
    mime = _mime_from_ext(filename)
    img = Image(kind=kind, mime=mime, filename=filename, data=data)
    s.add(img)
    return str(img.id)


def _auto_migrate():
    """If DB tables are empty and JSON files exist, migrate data into the DB."""
    migrated = False
    with session() as s:
        if (
            s.exec(select(EventRow)).first() is not None
            or s.exec(select(ArtistRow)).first() is not None
        ):
            return  # DB already has data

        # Migrate events
        events_path = (
            DATA_FILE if DATA_FILE.exists() else (LEGACY_FILE if LEGACY_FILE.exists() else None)
        )
        if events_path:
            with open(events_path, encoding="utf-8") as f:
                raw = json.load(f)
            for ev_dict in raw:
                ev = Event.from_dict(ev_dict)
                # Replace image filenames with DB image UUIDs
                if ev.poster:
                    ev.poster = _migrate_image_file(ev.poster, POSTER_DIR, "poster", s)
                if isinstance(ev, Festival) and ev.logo:
                    ev.logo = _migrate_image_file(ev.logo, FESTIVAL_LOGO_DIR, "festival-logo", s)
                s.add(event_to_row(ev))
            migrated = True

        # Migrate catalogue
        if CAT_FILE.exists():
            with open(CAT_FILE, encoding="utf-8") as f:
                raw = json.load(f)
            for a_dict in raw.get("artists", []):
                a = Artist.from_dict(a_dict)
                if a.logo:
                    a.logo = _migrate_image_file(a.logo, LOGO_DIR, "logo", s)
                if a.photo:
                    a.photo = _migrate_image_file(a.photo, LOGO_DIR, "photo", s)
                s.add(artist_to_row(a))
            for v_dict in raw.get("venues", []):
                v = Venue.from_dict(v_dict)
                s.add(venue_to_row(v))
            migrated = True

        if migrated:
            s.commit()
            print("[db] Auto-migrated data from JSON files into PostgreSQL")


# ── Init ──────────────────────────────────────────────────────────────────────


def init_db():
    SQLModel.metadata.create_all(engine)
    if os.environ.get("KP_TESTING") != "1":
        _auto_migrate()
