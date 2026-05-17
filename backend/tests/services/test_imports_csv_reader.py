"""Unit tests for the CSV reader layer."""

from __future__ import annotations

import pytest

from app.services.imports.csv_reader import (
    MAX_FILE_BYTES,
    CsvReadError,
    parse_csv_bytes,
)


def test_parses_basic_utf8_csv() -> None:
    blob = b"Name,IC\nAcme,12345678\nBeta,87654321\n"
    parsed = parse_csv_bytes(blob)
    assert parsed.headers == ["Name", "IC"]
    assert parsed.rows == [
        {"Name": "Acme", "IC": "12345678"},
        {"Name": "Beta", "IC": "87654321"},
    ]


def test_strips_utf8_bom() -> None:
    blob = b"\xef\xbb\xbfName,IC\nAcme,12345678\n"
    parsed = parse_csv_bytes(blob)
    assert parsed.headers == ["Name", "IC"]


def test_strips_header_whitespace() -> None:
    blob = b"Name , IC \nAcme,12345678\n"
    parsed = parse_csv_bytes(blob)
    assert parsed.headers == ["Name", "IC"]
    assert parsed.rows[0]["Name"] == "Acme"


def test_rejects_windows_1250_with_clear_message() -> None:
    # 'Příliš žluťoučký kůň' encoded as cp1250 — would round-trip if we
    # were sloppy.
    blob = "Name\nPříliš žluťoučký kůň\n".encode("cp1250")
    with pytest.raises(CsvReadError) as exc:
        parse_csv_bytes(blob)
    assert "UTF-8" in str(exc.value)


def test_rejects_empty_file() -> None:
    with pytest.raises(CsvReadError) as exc:
        parse_csv_bytes(b"")
    assert "empty" in str(exc.value).lower()


def test_rejects_header_only() -> None:
    with pytest.raises(CsvReadError) as exc:
        parse_csv_bytes(b"Name,IC\n")
    assert "no data" in str(exc.value).lower()


def test_rejects_oversized_blob() -> None:
    big = b"a" * (MAX_FILE_BYTES + 1)
    with pytest.raises(CsvReadError) as exc:
        parse_csv_bytes(big)
    assert "larger" in str(exc.value).lower()


def test_rejects_too_many_rows() -> None:
    header = b"Name,IC\n"
    rows = b"Acme,12345678\n" * 5
    with pytest.raises(CsvReadError):
        parse_csv_bytes(header + rows, max_rows=3)


def test_accepts_semicolon_delimiter() -> None:
    blob = b"Name;IC\nAcme;12345678\n"
    parsed = parse_csv_bytes(blob)
    assert parsed.headers == ["Name", "IC"]
    assert parsed.rows[0] == {"Name": "Acme", "IC": "12345678"}
