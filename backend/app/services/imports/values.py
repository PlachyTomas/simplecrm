"""Liberal parsers for the cell formats a foreign CRM export throws at us.

Rule of thumb, from the migration spec: *be liberal in what you accept and
record failures as row errors*. Everything here either returns a parsed
value or raises :class:`ValueParseError` with a user-facing Czech message —
never a silent ``None`` that would look like an empty cell.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation

# `Numeric(14, 2)` on `deals.value` — anything wider blows up at INSERT time,
# so we catch it during mapping and report the row instead.
MAX_MONEY = Decimal("999999999999.99")

# Excel stores dates as days since 1899-12-30. Pipedrive's own sample CSV
# leaks these (`Activity - Due date` = `45631.0`), so a bare 5-digit number
# in a date column is far more likely a serial than a year.
_EXCEL_EPOCH = date(1899, 12, 30)
_EXCEL_SERIAL_MIN = 20000  # 1954-10-19
_EXCEL_SERIAL_MAX = 80000  # 2118-12-31

_CURRENCY_SYMBOLS: dict[str, str] = {
    "$": "USD",
    "us$": "USD",
    "€": "EUR",
    "£": "GBP",
    "kč": "CZK",
    "kc": "CZK",
    "zł": "PLN",
    "zl": "PLN",
    "ft": "HUF",
    "₽": "RUB",
    "chf": "CHF",
    "¥": "JPY",
}

_MULTI_VALUE_SPLIT = re.compile(r"[,;\n]+")
_NUMBER_KEEP = re.compile(r"[^0-9,.\-]")
_ISO_DATE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})")
_NUMERIC_ONLY = re.compile(r"^\d+(?:[.,]0+)?$")


class ValueParseError(Exception):
    """The cell is non-empty but could not be interpreted."""


def split_multi_value(raw: str) -> list[str]:
    """``"a@x.cz, b@x.cz"`` → ``["a@x.cz", "b@x.cz"]``.

    Pipedrive collapses a person's several e-mails/phones into one
    comma-joined cell on export (research §3). Also tolerates semicolons and
    embedded newlines, which is what Excel produces when a user edits such a
    cell by hand.
    """
    return [part.strip() for part in _MULTI_VALUE_SPLIT.split(raw) if part.strip()]


def normalize_currency(raw: str) -> str:
    """``"$"`` / ``"czk"`` / ``"1 234 Kč"`` → an ISO-4217 code.

    Pipedrive documents the column as *"currency symbol (f.e. $, USD)"*, so
    both forms are in scope.
    """
    value = raw.strip()
    if not value:
        raise ValueParseError("Prázdná měna.")
    lowered = value.lower()
    if lowered in _CURRENCY_SYMBOLS:
        return _CURRENCY_SYMBOLS[lowered]
    letters = re.sub(r"[^A-Za-z]", "", value)
    if len(letters) == 3:
        return letters.upper()
    # Last resort: a symbol glued to the amount ("1 234 Kč").
    for symbol, code in _CURRENCY_SYMBOLS.items():
        if symbol in lowered:
            return code
    raise ValueParseError(f"Neznámá měna {raw!r}.")


def _decimal_separator(cleaned: str) -> str | None:
    """Decide which of ``,`` / ``.`` acts as the decimal point.

    * both present → the *last* one wins (``1.234,56`` and ``1,234.56``),
    * one present, more than once → it is a thousands grouper,
    * one present, once → a 3-digit tail reads as grouping (``1,234``),
      anything else reads as decimals (``100.0``, ``1 234,56``).
      Exactly the ambiguity flagged in research §7; the 3-digit rule is the
      convention both English and Czech exports actually follow for money.
    """
    has_comma = "," in cleaned
    has_dot = "." in cleaned
    if has_comma and has_dot:
        return "," if cleaned.rfind(",") > cleaned.rfind(".") else "."
    sep = "," if has_comma else ("." if has_dot else None)
    if sep is None:
        return None
    if cleaned.count(sep) > 1:
        return None
    tail = cleaned.rsplit(sep, 1)[1]
    return None if len(tail) == 3 else sep


def parse_money(raw: str) -> Decimal:
    """Parse a monetary cell in any of the locale spellings we expect."""
    # `_NUMBER_KEEP` drops every space variant (incl. the NBSP thousands
    # separator Czech Excel emits) along with currency symbols, so the raw
    # cell needs no pre-cleaning.
    value = raw.strip()
    if not value:
        raise ValueParseError("Prázdná částka.")
    negative = value.lstrip().startswith("-") or (value.startswith("(") and value.endswith(")"))
    cleaned = _NUMBER_KEEP.sub("", value).lstrip("-")
    if not cleaned or not any(ch.isdigit() for ch in cleaned):
        raise ValueParseError(f"Částku {raw!r} nelze přečíst.")
    sep = _decimal_separator(cleaned)
    if sep is None:
        digits = cleaned.replace(",", "").replace(".", "")
    else:
        other = "." if sep == "," else ","
        digits = cleaned.replace(other, "").replace(sep, ".")
    try:
        parsed = Decimal(digits)
    except InvalidOperation as exc:
        raise ValueParseError(f"Částku {raw!r} nelze přečíst.") from exc
    parsed = parsed.quantize(Decimal("0.01"))
    if negative:
        parsed = -parsed
    if abs(parsed) > MAX_MONEY:
        raise ValueParseError(f"Částka {raw!r} přesahuje povolený rozsah.")
    return parsed


def _from_excel_serial(value: str) -> date | None:
    if not _NUMERIC_ONLY.fullmatch(value):
        return None
    serial = int(value.split(".")[0].split(",")[0])
    if not _EXCEL_SERIAL_MIN <= serial <= _EXCEL_SERIAL_MAX:
        return None
    return _EXCEL_EPOCH + timedelta(days=serial)


def parse_import_date(raw: str) -> date:
    """Accept ISO, Czech (``31.12.2026``), slash forms and Excel serials.

    ``dd/mm`` beats ``mm/dd`` when both readings are possible — the audience
    is Czech, and an American export that trips this will show the wrong
    month in the preview rather than silently import it.
    """
    value = raw.strip()
    if not value:
        raise ValueParseError("Prázdné datum.")

    iso = _ISO_DATE.match(value)
    if iso:
        year, month, day = (int(part) for part in iso.groups())
        try:
            return date(year, month, day)
        except ValueError as exc:
            raise ValueParseError(f"Datum {raw!r} neexistuje.") from exc

    serial = _from_excel_serial(value)
    if serial is not None:
        return serial

    # Drop a trailing time component, then squeeze the spaces a Czech
    # writer leaves after the dots ("30. 9. 2026").
    head = re.split(r"T|\s+\d{1,2}:", value, maxsplit=1)[0]
    head = re.sub(r"\s+", "", head)
    parts = [p for p in re.split(r"[./\-]", head) if p != ""]
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        first, second, third = (int(p) for p in parts)
        candidates = (
            [(third, second, first)]  # dd.mm.yyyy — the Czech default
            if len(parts[2]) == 4
            else [(first, second, third)]  # yyyy?mm?dd
        )
        if len(parts[2]) == 4 and second > 12:
            candidates.append((third, first, second))  # mm/dd/yyyy
        for year, month, day in candidates:
            try:
                return date(year, month, day)
            except ValueError:
                continue
    raise ValueParseError(f"Datum {raw!r} nelze přečíst.")


def parse_import_datetime(raw: str) -> datetime:
    """Same tolerance as :func:`parse_import_date`, but timezone-aware.

    Times without an offset are read as UTC — an export never states its
    zone, and every consumer of ``deals.closed_at`` only cares about the
    day-level bucket.
    """
    value = raw.strip()
    if not value:
        raise ValueParseError("Prázdné datum.")
    normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        parsed = None
    if parsed is not None:
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)

    day = parse_import_date(value)
    time_match = re.search(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", value)
    hour, minute, second = 0, 0, 0
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2))
        second = int(time_match.group(3) or 0)
        if hour > 23 or minute > 59 or second > 59:
            hour = minute = second = 0
    return datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=UTC)
