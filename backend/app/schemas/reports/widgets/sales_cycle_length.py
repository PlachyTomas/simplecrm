from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class SalesCycleLengthConfig(WidgetConfigBase):
    """Days between Company.created_at and Deal.closed_at for won deals.

    Default `median` is more robust for SMB sample sizes — averages
    skew badly when one big-ticket deal sits at the long tail.
    """

    type: Literal["sales_cycle_length"] = "sales_cycle_length"
    metric: Literal["mean", "median"] = "median"
