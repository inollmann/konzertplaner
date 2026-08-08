"""E2E fixtures: live Flask server + Playwright browser.

Inherits `test_engine` / `_clean_db` / `client` / `app` from the parent
`tests/conftest.py`. The live server shares the same in-memory sqlite engine
(StaticPool, single shared connection) that the parent conftest binds to
`db.engine` — so events created via the API are visible to the browser, and
the `_clean_db` autouse fixture wipes them between tests.
"""

import threading

import pytest
from playwright.sync_api import sync_playwright
from werkzeug.serving import make_server

import main


@pytest.fixture(scope="session")
def live_server(test_engine):
    """Start the Flask app on a random port in a background thread.

    Depends on `test_engine` so the in-memory sqlite engine is bound to
    `db.engine` before the server starts handling requests.
    """
    server = make_server("127.0.0.1", 0, main.app, threaded=True)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{port}"
    yield base_url
    server.shutdown()


@pytest.fixture(scope="session")
def _pw():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(_pw):
    b = _pw.chromium.launch(headless=True)
    yield b
    b.close()


@pytest.fixture
def page(browser, live_server):
    """Fresh browser page per test (new context = no localStorage/cookies)."""
    context = browser.new_context()
    p = context.new_page()
    p.set_default_navigation_timeout(15000)
    yield p
    context.close()
