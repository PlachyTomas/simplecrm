# Task 1.2 — Google OAuth flow

## Goal
End-to-end Google sign-in: a user visits `/api/v1/auth/google/login`, hits
Google's consent screen, comes back via the callback, and ends up with a
session — i.e., a `User` row (creating one on first login), an access JWT in
the response body, and an HTTP-only refresh-token cookie.

## Design notes
- **First login creates both a User and a placeholder Organization.** The org
  gets `trial_ends_at = now() + 30d` (from the model default) and a temporary
  `name` derived from the user's email domain. Task 1.5's onboarding flow
  later overwrites name + IČO + address once the user completes it. The user
  is made `admin` of that new org.
- **Existing user by `google_id` or `email`**: reuse their record, update
  `last_login_at` and `avatar_url`, reissue tokens.
- **Access JWT**: HS256, 1h TTL, claims `sub=user_id`, `org=org_id`, `role`.
- **Refresh token**: opaque random string, stored only as hash in… actually for
  MVP the refresh path isn't wired yet. Issue a refresh JWT (7d) in an
  HTTP-only cookie; the refresh endpoint lands in a follow-up. Writing the
  plumbing now keeps the model consistent.
- **State / CSRF**: sign the state with `itsdangerous.URLSafeTimedSerializer`
  (no new dep needed — it's Authlib's transitive). Round-trip the state via
  a short-lived HTTP-only cookie rather than Starlette session middleware.
- **Service-layer abstraction**: `app.services.google_oauth.GoogleOAuthClient`
  wraps Authlib's `OAuth2Client`. A FastAPI dependency `get_google_client()`
  returns it; tests override with a fake client that returns scripted tokens.

## Files in scope
- `backend/pyproject.toml` — add `authlib>=1.3`, `python-jose[cryptography]>=3.3`,
  `itsdangerous>=2.2`.
- `backend/app/core/config.py` — add `jwt_secret`, `jwt_algorithm` (default HS256),
  `access_token_ttl_minutes` (60), `refresh_token_ttl_days` (30),
  `google_client_id`, `google_client_secret`, `google_redirect_uri`,
  `frontend_success_redirect`.
- `backend/app/core/security.py` — JWT encode/decode helpers; hash/signer for state.
- `backend/app/services/__init__.py`
- `backend/app/services/google_oauth.py` — `GoogleOAuthClient` protocol +
  concrete `AuthlibGoogleOAuthClient` + dependency.
- `backend/app/services/auth.py` — `get_or_create_user_from_google_profile`
  business logic (the juicy bit — org creation, role assignment, updating
  existing users).
- `backend/app/schemas/__init__.py`
- `backend/app/schemas/auth.py` — `CurrentUser`, `AuthCallbackResponse`.
- `backend/app/api/v1/auth.py` — four endpoints:
  - `GET /auth/google/login` → 307 to Google's auth URL (signed state cookie).
  - `GET /auth/google/callback?code=&state=` → exchange code, upsert user,
    set refresh cookie, redirect to `frontend_success_redirect`.
  - `GET /auth/me` → requires bearer; returns current user info.
  - `POST /auth/logout` → clear refresh cookie; 204.
- `backend/app/api/v1/__init__.py` — mount the auth router.
- `backend/tests/services/__init__.py`
- `backend/tests/services/test_auth_service.py` — unit-test the upsert/org-creation.
- `backend/tests/api/v1/test_auth.py` — integration with a faked `GoogleOAuthClient`.

## Acceptance criteria
1. `alembic upgrade head` still clean (no schema changes in this task).
2. `GET /api/v1/auth/google/login` returns 307 with a `Location` pointing at
   `accounts.google.com` and a `state=...` HTTP-only cookie.
3. `GET /api/v1/auth/google/callback` with a valid code (faked Google) sets a
   `refresh_token` HTTP-only cookie and returns 302 to the configured
   frontend URL. Query the DB; the `User` and `Organization` are present.
4. `GET /api/v1/auth/me` with the issued access token returns user + org info.
5. `POST /auth/logout` clears the refresh cookie.
6. Tests cover: happy path first-login, happy path returning user,
   invalid-state rejection, missing-code rejection, expired access-token
   rejection on `/auth/me`.
7. Ruff / format / mypy strict / pytest all green.
8. Frontend `types:check` passes after regenerating (new schemas will surface).
9. One commit.

## Non-goals
- Refresh endpoint — the cookie is set so /auth/refresh in a later task can
  use it, but issuing new access tokens on refresh is out of scope here.
- Logout revocation of refresh tokens beyond clearing the cookie.
- Frontend wiring (Task 1.4).
- Onboarding form post-login (Task 1.5).
