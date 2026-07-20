from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class SalesForecastConfig(WidgetConfigBase):
    """Currently-open deals bucketed by `expected_close_date` month.

    Forward-looking: ignores the global date range. `weighted` switches
    the displayed series to probability-weighted values.
    """

    type: Literal["sales_forecast"] = "sales_forecast"
    weighted: bool = False
