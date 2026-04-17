from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TrialExpiredError(BaseModel):
    """402 payload returned when an organization's trial has ended and no
    paid subscription is active. The frontend renders the trial-expiry gate
    from these fields.
    """

    detail: str = "Trial expired"
    trial_ends_at: datetime
    organization_id: str
