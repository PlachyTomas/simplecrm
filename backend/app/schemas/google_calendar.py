from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class GoogleCalendarAuthorizeUrlOut(BaseModel):
    """Google consent-screen URL the frontend redirects the browser to.

    Fetched via authenticated XHR (a plain `<a href>` redirect can't carry
    the Bearer token), then `window.location.assign(url)`.
    """

    url: str


class GoogleCalendarStatusOut(BaseModel):
    connected: bool
    google_email: str | None = None
    # True when Google reported the grant revoked (`invalid_grant`) —
    # the UI prompts a reconnect.
    sync_broken: bool = False
    connected_at: datetime | None = None
