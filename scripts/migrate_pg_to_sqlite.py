"""One-off migration: copy all Konzertplaner data from PostgreSQL to SQLite.

The app now defaults to a local SQLite database (``data/konzertplaner.db``) but
still supports PostgreSQL via the ``DATABASE_URL`` environment variable. This
script copies the existing rows of every mapped table from a source database
(typically PostgreSQL) into a target SQLite file.

All primary keys are UUIDs and there are no foreign-key constraints between
tables, so the copy order does not matter. Rows are written with
``Session.merge`` to make the migration idempotent (safe to re-run).

Usage examples::

    # From PostgreSQL into a SQLite file (plain path is converted automatically)
    uv run python scripts/migrate_pg_to_sqlite.py \\
        --source postgresql+psycopg://kp:kp@localhost:5432/kp \\
        --target data/konzertplaner.db

    # Using an explicit SQLite URL
    uv run python scripts/migrate_pg_to_sqlite.py \\
        --source postgresql+psycopg://kp:kp@localhost:5432/kp \\
        --target sqlite:///data/konzertplaner.db

    # Overwrite a target that already contains rows
    uv run python scripts/migrate_pg_to_sqlite.py \\
        --source postgresql+psycopg://kp:kp@localhost:5432/kp \\
        --target data/konzertplaner.db --force
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, func  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402
from sqlmodel import Session, SQLModel, select  # noqa: E402

from models import ArtistRow, EventRow, Image, KvRow, VenueRow  # noqa: E402

# Fixed copy order: images first, then events, artists, venues and the kv store.
MODELS = [Image, EventRow, ArtistRow, VenueRow, KvRow]


def _target_url_and_path(target: str) -> tuple[str, Path | None]:
    """Return the SQLite URL and (when derivable) the filesystem path."""
    if target.startswith("sqlite"):
        raw = target.split(":///", 1)[-1]
        return target, (Path(raw) if raw else None)
    path = Path(target).resolve()
    return f"sqlite:///{path.as_posix()}", path


def _is_missing_table(exc: OperationalError) -> bool:
    """True when the source simply lacks the table (empty/uninitialised DB)."""
    text = str(exc).lower()
    return "no such table" in text or "does not exist" in text


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy all Konzertplaner data from PostgreSQL to SQLite.",
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Source database URL, e.g. postgresql+psycopg://kp:kp@localhost:5432/kp",
    )
    parser.add_argument(
        "--target",
        required=True,
        help="Target SQLite URL (sqlite:///...) or a plain filesystem path.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow overwriting a target that already contains rows.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()

    target_url, db_path = _target_url_and_path(args.target)
    if db_path is not None:
        db_path.parent.mkdir(parents=True, exist_ok=True)

    source_engine = create_engine(args.source)
    target_engine = create_engine(target_url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(target_engine)

    # Pre-flight: refuse to touch a target that already has data unless --force.
    with Session(target_engine) as target_session:
        for model in MODELS:
            count = target_session.exec(select(func.count()).select_from(model)).one()
            if count and not args.force:
                print(
                    f"error: target table '{model.__tablename__}' already contains "
                    f"{count} rows; re-run with --force to overwrite",
                    file=sys.stderr,
                )
                return 1

    total = 0
    for model in MODELS:
        try:
            with Session(source_engine) as source_session:
                rows = source_session.exec(select(model)).all()
        except OperationalError as exc:
            if _is_missing_table(exc):
                rows = []
            else:
                print(f"error: cannot read from source database: {exc}", file=sys.stderr)
                return 1

        with Session(target_engine) as target_session:
            for row in rows:
                target_session.merge(model(**row.model_dump()))
            target_session.commit()

        print(f"{model.__tablename__}: copied {len(rows)} rows")
        total += len(rows)

    print(f"total: copied {total} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
