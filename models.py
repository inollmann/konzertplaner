"""SQLModel table definitions for Konzertplaner (PostgreSQL)."""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import BYTEA, JSONB
from sqlmodel import Field, SQLModel


class Image(SQLModel, table=True):
    __tablename__ = "images"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    kind: str = ""            # 'poster' | 'logo' | 'festival-logo' | 'photo'
    mime: str = ""
    filename: str | None = None
    data: bytes = Field(sa_column=Column(BYTEA, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EventRow(SQLModel, table=True):
    __tablename__ = "events"

    id: str = Field(primary_key=True)
    event_type: str = "tour"    # 'tour' | 'festival'
    name: str = ""
    city: str | None = None
    venue: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    poster_id: uuid.UUID | None = None
    logo_id: uuid.UUID | None = None
    comment: str = ""
    attrs: dict = Field(sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ArtistRow(SQLModel, table=True):
    __tablename__ = "artists"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = ""
    logo_id: uuid.UUID | None = None
    photo_id: uuid.UUID | None = None
    followed: bool = False
    eventim_name: str | None = None
    eventim_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VenueRow(SQLModel, table=True):
    __tablename__ = "venues"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = ""
    city: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
