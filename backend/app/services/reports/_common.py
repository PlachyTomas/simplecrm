"""Shared helpers for widget service implementations.

`compute_previous_period(from_, to)` produces the previous-equal-length
window for the comparison object. The helper lives here so every
widget shares the same date math — REPORTS_TASK §6.1.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import NamedTuple


class PreviousPeriod(NamedTuple):
    from_: date
    to: date


def compute_previous_period(from_: date, to: date) -> PreviousPeriod:
    """Return the date range of equal length that ends at `from_ - 1 day`."""

    if to < from_:
        raise ValueError(f"to ({to}) must be on or after from ({from_})")
    span = to - from_  # inclusive width is `span + 1` days
    prev_to = from_ - timedelta(days=1)
    prev_from = prev_to - span
    return PreviousPeriod(prev_from, prev_to)
