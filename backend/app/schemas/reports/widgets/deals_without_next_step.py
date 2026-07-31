from __future__ import annotations

from typing import Literal

from app.schemas.reports.widgets._base import WidgetConfigBase


class DealsWithoutNextStepConfig(WidgetConfigBase):
    """Open deals with no upcoming calendar event — nobody has planned what
    happens next. The leading-indicator sibling of `stale_deals` (which is
    the lagging "nothing has happened"); see
    docs/research/2026-07-31-crm-user-wants-research.md.
    """

    type: Literal["deals_without_next_step"] = "deals_without_next_step"
