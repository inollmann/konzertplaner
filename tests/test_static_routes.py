def test_index(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"<html" in resp.data.lower()


def test_design_tool(client):
    resp = client.get("/design-tool")
    assert resp.status_code == 200
    assert b"<html" in resp.data.lower()


def test_export_css(client):
    resp = client.get(
        "/api/design/export-css",
        query_string={"vars": "--color-bg:#fff;--color-fg:#000"},
    )
    assert resp.status_code == 200
    assert resp.mimetype == "text/css"
    body = resp.get_data(as_text=True)
    assert ":root {" in body
    assert "--color-bg: #fff;" in body
    assert "--color-fg: #000;" in body
    assert resp.headers.get("Content-Disposition") == "attachment; filename=konzertplaner-theme.css"


def test_export_css_no_vars(client):
    resp = client.get("/api/design/export-css")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "No vars"}


def test_export_css_skip_no_colon(client):
    resp = client.get(
        "/api/design/export-css",
        query_string={"vars": "invalid;--x:1"},
    )
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert "--x: 1;" in body
    assert "invalid" not in body
