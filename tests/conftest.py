"""Shared pytest fixtures for the Konzertplaner test suite.

Test strategy
-------------
The production DB layer (`db.py`) creates its SQLAlchemy engine at import
time from `DATABASE_URL`, and `main.py` calls `init_db()` (which runs
`SQLModel.metadata.create_all` + `_auto_migrate`) at import time.

To run tests without a PostgreSQL server we:

1. Set `DATABASE_URL=sqlite:///:memory:` **before** importing `db`/`main`.
2. Monkeypatch `db._auto_migrate` to a no-op so the import-time `init_db()`
   never reads the gitignored `data/*.json` seed files (which don't exist in
   CI and would pollute the test DB locally).
3. Replace `db.engine` with a session-scoped in-memory sqlite engine that
   uses `StaticPool` (so every session shares one connection and thus one
   schema — plain `:memory:` gives a fresh DB per connection, which would
   lose the tables created by `create_all`).
   `db.session()` reads `engine` from its module globals at call time, so
   rebinding `db.engine` is enough — the CRUD functions pick it up.
4. After every test, delete all rows from every table for isolation.
"""

import os

# Must be set before `db` is first imported (which happens transitively when
# importing `main`).
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.setdefault("KP_TESTING", "1")

import db  # noqa: E402

# Prevent the import-time `init_db()` (triggered by `import main` below) from
# reading the gitignored `data/*.json` seed files. They don't exist in CI and
# would pollute / slow down the test DB locally.
db._auto_migrate = lambda: None

import pytest  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

import main  # noqa: E402


@pytest.fixture(scope="session")
def test_engine():
    """Session-scoped in-memory sqlite engine shared by all tests."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    # Rebind the production DB layer to the test engine. `db.session()` looks
    # up `engine` from module globals at call time, so this single assignment
    # redirects all CRUD calls.
    original_engine = db.engine
    db.engine = eng
    yield eng
    eng.dispose()
    original_engine.dispose()


@pytest.fixture(autouse=True)
def _clean_db(test_engine):
    """Delete all rows after every test for full isolation."""
    yield
    with Session(test_engine) as s:
        for table in reversed(SQLModel.metadata.sorted_tables):
            s.execute(table.delete())
        s.commit()


@pytest.fixture
def client(test_engine):
    """Flask test client backed by the in-memory sqlite DB."""
    return main.app.test_client()


@pytest.fixture
def app():
    """The Flask app instance (for direct app-level assertions)."""
    return main.app
