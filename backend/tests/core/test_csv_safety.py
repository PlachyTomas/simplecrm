"""CSV / formula-injection sanitizer (review R3 P2)."""

from __future__ import annotations

import csv
import io

from app.core.csv_safety import SafeCsvWriter, csv_safe


def test_csv_safe_prefixes_formula_triggers() -> None:
    assert csv_safe("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert csv_safe("+1") == "'+1"
    assert csv_safe("-1+2") == "'-1+2"
    assert csv_safe("@SUM(A1)") == "'@SUM(A1)"
    assert csv_safe("\tTAB") == "'\tTAB"


def test_csv_safe_leaves_normal_values_untouched() -> None:
    assert csv_safe("Acme s.r.o.") == "Acme s.r.o."
    assert csv_safe("") == ""
    assert csv_safe(1234) == 1234
    assert csv_safe(None) is None


def test_safe_writer_neutralizes_malicious_cell() -> None:
    buffer = io.StringIO()
    writer = SafeCsvWriter(buffer)
    writer.writerow(["name", "value"])
    writer.writerow(['=cmd|"/c calc"!A1', "9900"])
    buffer.seek(0)
    rows = list(csv.reader(buffer))
    # The dangerous cell is stored/parsed with the neutralizing leading quote.
    assert rows[1][0] == "'=cmd|\"/c calc\"!A1"
    assert rows[1][1] == "9900"
