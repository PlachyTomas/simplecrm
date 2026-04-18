from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class KpiSummary(BaseModel):
    """Reports snapshot for the caller (and their visibility scope).

    `won_this_month_*` reflect deals whose `closed_at` landed inside the
    current UTC month (start of month → now). Values are in the org's
    configured currency; deals in other currencies contribute to counts
    but not to currency-denominated totals.
    """

    currency: str
    open_deal_count: int
    open_pipeline_value: Decimal
    won_this_month_count: int
    won_this_month_value: Decimal
