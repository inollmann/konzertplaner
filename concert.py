"""
Data models for Konzertplaner.

Hierarchy
---------
  Event (base)
  ├── Tour     – artist, support acts, N Concert dates
  └── Festival – single venue/date, bands-to-watch list

Supporting catalogues (persisted separately in data/catalogue.json):
  Artist  – name, logo filename
  Venue   – name, city

AI poster-extraction hooks
--------------------------
Tour.from_poster_data(extracted)   and
Festival.from_poster_data(extracted)
are documented stubs ready for a future vision-model integration.
"""

import uuid


# ── Base ──────────────────────────────────────────────────────────────────────

class Event:
    event_type: str = ""

    def __init__(self, name: str, poster: str | None = None,
                 comment: str = ""):
        self.id: str = str(uuid.uuid4())
        self.name: str = name
        self.poster: str | None = poster
        self.comment: str = comment   # free-text note, shown only in detail view

    def set_poster(self, filename: str | None):
        self.poster = filename

    def _base_dict(self) -> dict:
        return {
            "id": self.id,
            "event_type": self.event_type,
            "name": self.name,
            "poster": self.poster,
            "comment": self.comment,
        }

    def to_dict(self) -> dict:
        raise NotImplementedError

    @classmethod
    def from_dict(cls, data: dict) -> "Event":
        et = data.get("event_type", "tour")
        if et == "festival":
            return Festival.from_dict(data)
        return Tour.from_dict(data)


# ── Tour ──────────────────────────────────────────────────────────────────────

class Tour(Event):
    event_type = "tour"

    def __init__(self, artist: str, support: list | None = None,
                 tour_name: str = "Tour", poster: str | None = None,
                 comment: str = ""):
        super().__init__(name=artist, poster=poster, comment=comment)
        self.artist: str = artist
        self.support: list = support or []   # list of act-name strings
        self.tour_name: str = tour_name
        self.concerts: list = []

    def add_concert(self, date: str, city: str, venue: str,
                    price=None, time: str | None = None,
                    end_date: str | None = None,
                    tags: list | None = None,
                    support_present: list | None = None,
                    ticket_link: str | None = None) -> "Concert":
        """
        support_present: subset of self.support that plays this specific date.
        Defaults to all support acts when omitted.
        """
        concert = Concert(
            date=date, city=city, venue=venue,
            price=price, time=time, end_date=end_date,
            tags=tags or [],
            tour_id=self.id, tour_name=self.tour_name, artist=self.artist,
            support_present=support_present if support_present is not None else list(self.support),
            ticket_link=ticket_link,
        )
        self.concerts.append(concert)
        return concert

    def to_dict(self) -> dict:
        d = self._base_dict()
        d.update({
            "artist": self.artist,
            "support": self.support,
            "tour_name": self.tour_name,
            "concerts": [c.to_dict() for c in self.concerts],
        })
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "Tour":
        tour = cls(
            artist=data.get("artist", data.get("name", "")),
            support=data.get("support", []),
            tour_name=data.get("tour_name", "Tour"),
            poster=data.get("poster"),
            comment=data.get("comment", ""),
        )
        tour.id = data["id"]
        tour.concerts = [Concert.from_dict(c) for c in data.get("concerts", [])]
        return tour

    @classmethod
    def from_poster_data(cls, extracted: dict) -> "Tour":
        """
        Stub for AI poster extraction.

        Expected keys in `extracted` (all optional):
          artist, tour_name, support (list), poster (filename),
          concerts (list of dicts: date, city, venue, time, end_date, tags,
                    support_present)

        Usage (future AI module):
            data = ai_extractor.analyse(image_bytes)
            tour = Tour.from_poster_data(data)
            events[tour.id] = tour
            save_events(events)
        """
        tour = cls(
            artist=extracted.get("artist", ""),
            support=extracted.get("support", []),
            tour_name=extracted.get("tour_name", "Tour"),
            poster=extracted.get("poster"),
        )
        for c in extracted.get("concerts", []):
            tour.add_concert(
                date=c.get("date", ""), city=c.get("city", ""),
                venue=c.get("venue", ""), time=c.get("time"),
                end_date=c.get("end_date"), tags=c.get("tags", []),
                support_present=c.get("support_present"),
            )
        return tour


# ── Festival ──────────────────────────────────────────────────────────────────

class Festival(Event):
    event_type = "festival"

    def __init__(self, name: str, city: str = "", venue: str = "",
                 date: str = "", end_date: str | None = None,
                 time: str | None = None, price=None,
                 ticket_link: str | None = None,
                 bands_to_watch: list | None = None,
                 tags: list | None = None,
                 poster: str | None = None,
                 comment: str = ""):
        super().__init__(name=name, poster=poster, comment=comment)
        self.city: str = city
        self.venue: str = venue
        self.date: str = date
        self.end_date: str | None = end_date
        self.time: str | None = time
        self.price = price
        self.ticket_link: str | None = ticket_link
        self.bands_to_watch: list = bands_to_watch or []
        self.tags: list = tags or []

    def to_dict(self) -> dict:
        d = self._base_dict()
        d.update({
            "city": self.city,
            "venue": self.venue,
            "date": self.date,
            "end_date": self.end_date,
            "time": self.time,
            "price": self.price,
            "ticket_link": self.ticket_link,
            "bands_to_watch": self.bands_to_watch,
            "tags": self.tags,
        })
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "Festival":
        fest = cls(
            name=data.get("name", ""),
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
            comment=data.get("comment", ""),
        )
        fest.id = data["id"]
        return fest

    @classmethod
    def from_poster_data(cls, extracted: dict) -> "Festival":
        """
        Stub for AI poster extraction.

        Expected keys: name, city, venue, date, end_date, time, price,
                       bands_to_watch (list), poster (filename)
        """
        return cls(
            name=extracted.get("name", ""),
            city=extracted.get("city", ""),
            venue=extracted.get("venue", ""),
            date=extracted.get("date", ""),
            end_date=extracted.get("end_date"),
            time=extracted.get("time"),
            price=extracted.get("price"),
            bands_to_watch=extracted.get("bands_to_watch", []),
            poster=extracted.get("poster"),
        )


# ── Concert (child of Tour) ───────────────────────────────────────────────────

class Concert:
    def __init__(self, date: str, city: str, venue: str,
                 price=None, time: str | None = None,
                 end_date: str | None = None, tags: list | None = None,
                 tour_id: str | None = None, tour_name: str | None = None,
                 artist: str | None = None,
                 support_present: list | None = None,
                 ticket_link: str | None = None):
        self.id: str = str(uuid.uuid4())
        self.date = date
        self.end_date = end_date
        self.time = time
        self.city = city
        self.venue = venue
        self.price = price
        self.tags: list = tags or []
        self.tour_id = tour_id
        self.tour_name = tour_name
        self.artist = artist
        # which support acts are present at this specific date
        self.support_present: list = support_present if support_present is not None else []
        self.ticket_link: str | None = ticket_link

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "date": self.date,
            "end_date": self.end_date,
            "time": self.time,
            "city": self.city,
            "venue": self.venue,
            "price": self.price,
            "tags": self.tags,
            "tour_id": self.tour_id,
            "tour_name": self.tour_name,
            "artist": self.artist,
            "support_present": self.support_present,
            "ticket_link": self.ticket_link,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Concert":
        c = cls(
            date=data["date"], city=data["city"], venue=data["venue"],
            price=data.get("price"), time=data.get("time"),
            end_date=data.get("end_date"), tags=data.get("tags", []),
            tour_id=data.get("tour_id"), tour_name=data.get("tour_name"),
            artist=data.get("artist"),
            support_present=data.get("support_present", []),
            ticket_link=data.get("ticket_link"),
        )
        c.id = data["id"]
        return c


# ── Catalogue models ──────────────────────────────────────────────────────────

class Artist:
    """Stand-alone artist entry with optional logo and photo."""
    def __init__(self, name: str, logo: str | None = None, photo: str | None = None):
        self.id: str = str(uuid.uuid4())
        self.name: str = name
        self.logo: str | None = logo
        self.photo: str | None = photo   # separate band photo / live shot

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "logo": self.logo, "photo": self.photo}

    @classmethod
    def from_dict(cls, data: dict) -> "Artist":
        a = cls(name=data["name"], logo=data.get("logo"), photo=data.get("photo"))
        a.id = data["id"]
        return a


class Venue:
    """Stand-alone venue entry linked to a city."""
    def __init__(self, name: str, city: str = ""):
        self.id: str = str(uuid.uuid4())
        self.name: str = name
        self.city: str = city

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "city": self.city}

    @classmethod
    def from_dict(cls, data: dict) -> "Venue":
        v = cls(name=data["name"], city=data.get("city", ""))
        v.id = data["id"]
        return v