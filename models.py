"""SQLModel table definitions for Konzertplaner (PostgreSQL)."""

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import JSON, Column, LargeBinary
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class Image(SQLModel, table=True):
    __tablename__ = "images"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    kind: str = ""  # 'poster' | 'logo' | 'festival-logo' | 'photo'
    mime: str = ""
    filename: str | None = None
    data: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class EventRow(SQLModel, table=True):
    __tablename__ = "events"

    id: str = Field(primary_key=True)
    event_type: str = "tour"  # 'tour' | 'festival'
    name: str = ""
    city: str | None = None
    venue: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    poster_id: uuid.UUID | None = None
    logo_id: uuid.UUID | None = None
    comment: str = ""
    attrs: dict = Field(sa_column=Column(JSON().with_variant(JSONB, "postgresql")))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ArtistRow(SQLModel, table=True):
    __tablename__ = "artists"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = ""
    logo_id: uuid.UUID | None = None
    photo_id: uuid.UUID | None = None
    logo_mono_id: uuid.UUID | None = None
    followed: bool = False
    eventim_name: str | None = None
    eventim_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class VenueRow(SQLModel, table=True):
    __tablename__ = "venues"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = ""
    city: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class KvRow(SQLModel, table=True):
    """Generic key-value store for per-user client state that should sync
    across devices (ratings, notifications, location settings). Value is a
    JSONB blob (dict or list); structure is opaque to the server."""

    __tablename__ = "kv"

    key: str = Field(primary_key=True)
    value: Any = Field(sa_column=Column(JSON().with_variant(JSONB, "postgresql")))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
