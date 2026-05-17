"""Parse uploaded CSV bytes into header + row dicts.

We accept only UTF-8 (with or without BOM). Czech CSVs exported from
older Excel installs default to Windows-1250; we reject those upfront
with a clear "Uložte CSV jako UTF-8" so the admin doesn't end up with
corrupted accents in their imported names.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ROWS = 50_000
UTF8_BOM = b"\xef\xbb\xbf"


class CsvReadError(Exception):
    """Raised when the uploaded blob cannot be parsed as a CSV.

    The message is user-facing and shows up verbatim in the API 4xx
    response, so keep it in Czech-leaning English (the founder is the
    only operator running imports today).
    """


@dataclass(frozen=True)
class ParsedCsv:
    headers: list[str]
    rows: list[dict[str, str]]
    """Each row maps the CSV header to the raw string cell (stripped)."""


def _strip_bom(blob: bytes) -> bytes:
    if blob.startswith(UTF8_BOM):
        return blob[len(UTF8_BOM) :]
    return blob


def _decode_utf8(blob: bytes) -> str:
    try:
        return blob.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CsvReadError(
            "CSV must be UTF-8 encoded (the file looks like Windows-1250). "
            "Re-save it as UTF-8 and try again."
        ) from exc


def parse_csv_bytes(blob: bytes, *, max_rows: int = MAX_ROWS) -> ParsedCsv:
    """Decode `blob` as UTF-8 CSV and return headers + row dicts.

    Raises :class:`CsvReadError` on any structural failure (oversized,
    wrong encoding, no headers, no rows).
    """
    if len(blob) > MAX_FILE_BYTES:
        raise CsvReadError(
            f"CSV is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB. Split it into smaller files."
        )

    text = _decode_utf8(_strip_bom(blob))
    if not text.strip():
        raise CsvReadError("CSV is empty.")

    # csv.Sniffer is fiddly with single-column files; let DictReader fall
    # back to the comma default and let the operator pick a different
    # delimiter (semicolon) by re-saving — handling all delimiters
    # transparently is more risk than reward here.
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = list(reader.fieldnames or [])
    if not headers:
        raise CsvReadError("CSV has no header row.")
    # Strip surrounding whitespace from headers — Excel exports sometimes
    # add a trailing space after the comma which then breaks mapping.
    headers = [h.strip() for h in headers]

    rows: list[dict[str, str]] = []
    for idx, raw_row in enumerate(reader, start=2):  # start=2 → row 1 was the header
        if idx - 1 > max_rows:
            raise CsvReadError(
                f"CSV has more than {max_rows} data rows. Split it into smaller files."
            )
        # DictReader keys carry the original (unstripped) header strings;
        # re-key into the stripped headers for downstream consistency.
        row = {}
        for original_header, stripped in zip(reader.fieldnames or [], headers, strict=True):
            cell = raw_row.get(original_header)
            row[stripped] = (cell or "").strip()
        rows.append(row)

    if not rows:
        raise CsvReadError("CSV has a header row but no data rows.")

    return ParsedCsv(headers=headers, rows=rows)
