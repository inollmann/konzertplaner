import io
import uuid


def test_upload_poster_success(client):
    resp = client.post(
        "/api/upload-poster",
        data={
            "poster": (io.BytesIO(b"\x89PNG\r\n\x1a\n fakepng"), "test.png"),
        },
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert "id" in data
    uuid.UUID(data["id"])


def test_upload_poster_no_file(client):
    resp = client.post("/api/upload-poster", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "No file"}


def test_upload_poster_disallowed_extension(client):
    resp = client.post(
        "/api/upload-poster",
        data={
            "poster": (io.BytesIO(b"hello"), "file.txt"),
        },
        content_type="multipart/form-data",
    )
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Type not allowed"}


def test_upload_poster_allowed_extensions(client):
    for fn in ("a.png", "b.webp"):
        resp = client.post(
            "/api/upload-poster",
            data={
                "poster": (io.BytesIO(b"data"), fn),
            },
            content_type="multipart/form-data",
        )
        assert resp.status_code == 200
        uuid.UUID(resp.get_json()["id"])


def test_upload_logo_success(client):
    resp = client.post(
        "/api/upload-logo",
        data={
            "logo": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "logo.png"),
        },
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    uuid.UUID(resp.get_json()["id"])


def test_upload_logo_with_type_photo(client):
    resp = client.post(
        "/api/upload-logo",
        data={
            "logo": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "photo.png"),
            "type": "photo",
        },
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    uuid.UUID(resp.get_json()["id"])


def test_upload_logo_no_file(client):
    resp = client.post("/api/upload-logo", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "No file"}


def test_upload_festival_logo_success(client):
    resp = client.post(
        "/api/upload-festival-logo",
        data={
            "logo": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "fest.png"),
        },
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    uuid.UUID(resp.get_json()["id"])


def test_upload_festival_logo_no_file(client):
    resp = client.post("/api/upload-festival-logo", data={}, content_type="multipart/form-data")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "No file"}


def test_serve_image(client):
    upload = client.post(
        "/api/upload-poster",
        data={
            "poster": (io.BytesIO(b"\x89PNG\r\n\x1a\n fakepng"), "test.png"),
        },
        content_type="multipart/form-data",
    )
    img_id = upload.get_json()["id"]
    resp = client.get(f"/api/img/{img_id}")
    assert resp.status_code == 200
    assert resp.data == b"\x89PNG\r\n\x1a\n fakepng"
    assert resp.mimetype == "image/png"


def test_serve_image_nonexistent(client):
    resp = client.get("/api/img/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_serve_image_invalid_uuid(client):
    resp = client.get("/api/img/not-a-uuid")
    assert resp.status_code == 404
