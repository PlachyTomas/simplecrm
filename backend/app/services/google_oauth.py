"""Thin protocol around the Google OAuth 2.0 code-exchange + userinfo flow.

The real implementation uses Authlib; tests swap in a stub. Keeping the
surface area narrow — one `build_authorize_url` and one
`exchange_code_for_profile` — so mocking it is trivial.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.core.config import get_settings

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 — URL endpoint, not a token
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPES = ("openid", "email", "profile")


@dataclass(frozen=True)
class GoogleProfile:
    google_id: str
    email: str
    name: str
    picture: str | None


class GoogleOAuthClient(Protocol):
    def build_authorize_url(self, state: str) -> str: ...

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile: ...


class AuthlibGoogleOAuthClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
    ) -> None:
        if not client_id or not client_secret:
            raise RuntimeError(
                "Google OAuth client_id/secret are not configured. "
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
            )
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri

    def build_authorize_url(self, state: str) -> str:
        client = AsyncOAuth2Client(
            client_id=self._client_id,
            client_secret=self._client_secret,
            scope=" ".join(GOOGLE_SCOPES),
            redirect_uri=self._redirect_uri,
        )
        url, _ = client.create_authorization_url(
            GOOGLE_AUTHORIZE_URL,
            state=state,
            access_type="offline",
            prompt="consent",
        )
        return str(url)

    async def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        async with AsyncOAuth2Client(
            client_id=self._client_id,
            client_secret=self._client_secret,
            redirect_uri=self._redirect_uri,
        ) as client:
            token = await client.fetch_token(
                GOOGLE_TOKEN_URL,
                code=code,
                grant_type="authorization_code",
            )
            access = token.get("access_token")
            if not access:
                raise RuntimeError("Google did not return an access token")
            async with httpx.AsyncClient() as http:
                resp = await http.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {access}"},
                )
                resp.raise_for_status()
                payload = resp.json()
        return GoogleProfile(
            google_id=str(payload["sub"]),
            email=str(payload["email"]),
            name=str(payload.get("name") or payload.get("email") or "Neznámý uživatel"),
            picture=payload.get("picture"),
        )


def get_google_oauth_client() -> GoogleOAuthClient:
    """FastAPI dependency returning a configured Google OAuth client."""
    settings = get_settings()
    return AuthlibGoogleOAuthClient(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
    )
