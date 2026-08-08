"""Pure-logic tests for main.py helpers (no Flask request context needed)."""

from main import allowed_file

# ── allowed_file ───────────────────────────────────────────────────────────────


def test_allowed_file_png():
    assert allowed_file("poster.png") is True


def test_allowed_file_jpg_uppercase():
    assert allowed_file("PHOTO.JPG") is True


def test_allowed_file_jpeg():
    assert allowed_file("x.jpeg") is True


def test_allowed_file_webp():
    assert allowed_file("x.webp") is True


def test_allowed_file_gif():
    assert allowed_file("file.gif") is True


def test_allowed_file_gif_uppercase():
    assert allowed_file("file.GIF") is True


def test_allowed_file_txt_false():
    assert allowed_file("x.txt") is False


def test_allowed_file_no_extension_false():
    assert allowed_file("noext") is False


def test_allowed_file_unknown_extension_false():
    assert allowed_file("file.unknown") is False


def test_allowed_file_leading_dot_no_ext_false():
    assert allowed_file(".png") is True


def test_allowed_file_path_with_dots():
    assert allowed_file("a/b.c/poster.png") is True


def test_allowed_file_empty_string_false():
    assert allowed_file("") is False


def test_allowed_file_uppercase_extension_variants():
    assert allowed_file("A.PNG") is True
    assert allowed_file("A.JPEG") is True
    assert allowed_file("A.WEBP") is True
