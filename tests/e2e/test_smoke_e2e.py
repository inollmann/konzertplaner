"""End-to-end smoke tests driven through a real browser (Playwright).

These exercise the full stack: HTTP server → DB → Flask routes → static SPA
→ DOM rendering. All marked `@pytest.mark.e2e` so the default pytest run
(configured with `-m "not e2e"` in pyproject.toml) skips them; run explicitly
with `uv run pytest -m e2e`.
"""

import pytest
from playwright.sync_api import expect

pytestmark = pytest.mark.e2e


def _goto(page, live_server):
    """Navigate to the app without waiting for external CDN resources."""
    page.goto(live_server, wait_until="domcontentloaded")


def test_app_loads(page, live_server):
    _goto(page, live_server)
    expect(page).to_have_title("Konzertplaner")
    expect(page.locator(".logo")).to_contain_text("KONZERT")
    for tab_name in ["Konzertliste", "Kalender", "Karte", "Shows", "Favoriten"]:
        expect(page.get_by_role("button", name=tab_name)).to_be_visible()


def test_empty_state_shown(page, live_server):
    _goto(page, live_server)
    expect(page.get_by_text("Keine anstehenden Events")).to_be_visible()


def test_tab_switching(page, live_server):
    _goto(page, live_server)
    # Default tab is the list
    expect(page.locator("#tab-list")).to_be_visible()
    # Switch to calendar
    page.get_by_role("button", name="Kalender").click()
    expect(page.locator("#tab-calendar")).to_be_visible()
    expect(page.locator("#tab-list")).to_be_hidden()
    # Switch back
    page.get_by_role("button", name="Konzertliste").click()
    expect(page.locator("#tab-list")).to_be_visible()
    expect(page.locator("#tab-calendar")).to_be_hidden()


def test_create_tour_via_api_appears_in_list(page, live_server):
    resp = page.request.post(
        f"{live_server}/api/events",
        data={
            "event_type": "tour",
            "artist": ["E2E Band"],
            "tour_name": "E2E Tour",
            "concerts": [{"date": "2026-09-01", "city": "Berlin", "venue": "Arena"}],
        },
    )
    assert resp.ok, f"API create failed: {resp.status}"
    _goto(page, live_server)
    expect(page.get_by_text("E2E Band")).to_be_visible()
    expect(page.get_by_text("Berlin")).to_be_visible()
    expect(page.get_by_text("E2E Tour")).to_be_visible()


def test_create_festival_via_api_appears_in_list(page, live_server):
    page.request.post(
        f"{live_server}/api/events",
        data={
            "event_type": "festival",
            "name": "Test Festival",
            "city": "Köln",
            "venue": "Rheinpark",
            "date": "2026-07-15",
        },
    )
    _goto(page, live_server)
    expect(page.get_by_text("Test Festival")).to_be_visible()
    expect(page.get_by_text("Köln")).to_be_visible()


def test_open_new_event_modal(page, live_server):
    _goto(page, live_server)
    page.locator("header .btn-new").click()
    expect(page.locator("#event-modal.open")).to_be_visible()
    expect(page.get_by_text("Tour / Konzert")).to_be_visible()
    expect(page.locator("#opt-festival")).to_be_visible()


def test_create_tour_via_ui(page, live_server):
    """Full UI flow: open modal → fill tour form → save → verify in list."""
    _goto(page, live_server)
    page.locator("header .btn-new").click()
    expect(page.locator("#event-modal.open")).to_be_visible()

    # Artist is a pill input — type + Enter adds it as a tag
    page.locator("#artist-input").fill("UI Band")
    page.locator("#artist-input").press("Enter")
    page.locator("#f-tourname").fill("UI Tour")

    # Add a concert block and fill required fields
    page.get_by_role("button", name="Konzert hinzufügen").click()
    page.locator(".cb-date").fill("2026-09-01")
    page.locator(".cb-city").fill("Hamburg")
    page.locator(".cb-venue").fill("Bar")

    # Save and wait for the modal to close (saveEvent removes .open on success)
    page.locator("#btn-save").click()
    expect(page.locator("#event-modal.open")).to_be_hidden()

    # The event should now appear in the list
    expect(page.get_by_text("UI Band")).to_be_visible()
    expect(page.get_by_text("Hamburg")).to_be_visible()
