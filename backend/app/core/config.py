from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "SimpleCRM"
    app_env: str = "dev"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://simplecrm:simplecrm@postgres:5432/simplecrm"

    cors_origins: list[str] = ["http://localhost:5173"]

    # JWT / session. Override via env in any non-dev deployment.
    jwt_secret: str = "dev-secret-change-me-in-prod"  # noqa: S105
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60
    refresh_token_ttl_days: int = 30

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    # Google Calendar integration reuses the same OAuth client but runs its
    # own consent flow (scope calendar.events + offline refresh token). The
    # redirect URI must be whitelisted in Google Cloud Console alongside the
    # login one, and the Calendar API must be enabled for the project.
    google_calendar_redirect_uri: str = (
        "http://localhost:8000/api/v1/integrations/google-calendar/callback"
    )

    # Where to send the user after a successful login.
    frontend_success_redirect: str = "http://localhost:5173/app"
    # Where to send them when they log out or hit an error.
    frontend_login_redirect: str = "http://localhost:5173/login"

    # Email verification + password reset link paths on the frontend. The
    # backend builds links as `{origin}{path}?token=...` using the origin
    # of `frontend_success_redirect`.
    frontend_verify_email_path: str = "/verify-email"
    frontend_reset_password_path: str = "/reset-password"  # noqa: S105 — URL path, not a credential

    # ComGate payment processor. All paid-plan billing — initial activation,
    # recurring renewals, and mid-period seat upgrades — flows through
    # ComGate. Comp + enterprise subscriptions still bypass billing entirely
    # via the super-admin set_comp / set_enterprise routes. Setup walkthrough
    # in docs/comgate-setup.md.
    #
    # Defaults are empty so the app boots in environments that don't
    # exercise billing (tests, the demo-seeded comp org). services/comgate
    # .ComGateClient surfaces a clear 503 when billing endpoints are hit
    # without these populated.
    comgate_merchant_id: str = ""
    comgate_secret: str = ""
    comgate_base_url: str = "https://payments.comgate.cz/v2.0"
    comgate_test_mode: bool = True
    comgate_return_url: str = "http://localhost:8000/api/v1/payments/return"

    # Zoho Mail SMTP — single account, two send-as identities:
    #   * faktury@simplecrm.cz for invoice delivery (PDF attached)
    #   * info@simplecrm.cz   for everything else (feedback, verification,
    #                          password reset, freed-company digest, etc.)
    # Both identities are added in Zoho Mail Admin → Send-As; SMTP
    # auth still uses the primary account credentials in `smtp_username`
    # / `smtp_password`. Defaults point at the EU data center because
    # the rest of the stack is hosted in Hetzner FSN1.
    #
    # When `smtp_host` is empty the email service falls back to logging
    # payloads (`app.services.email.send_email`) — that keeps dev/test
    # working without secrets.
    smtp_host: str = "smtp.zoho.eu"
    smtp_port: int = 465
    smtp_username: str = ""
    smtp_password: str = ""
    # Zoho's port 465 is implicit-TLS; STARTTLS sits on 587. Pick exactly
    # one based on the chosen port.
    smtp_use_ssl: bool = True
    smtp_use_starttls: bool = False

    # `From:` headers per sender role. Falls back to `smtp_username`
    # when unset so a misconfigured deployment still produces a valid
    # message instead of a "From: " blank.
    smtp_from_invoices: str = "faktury@simplecrm.cz"
    smtp_from_info: str = "info@simplecrm.cz"

    # Inbox the /api/v1/feedback endpoint forwards bug reports and
    # improvement suggestions to.
    feedback_recipient_email: str = "podpora@simplecrm.cz"

    # Tax-invoice archival storage (commit #4 of INVOICES_TASK.md).
    # When `s3_endpoint_url` is set, the storage layer writes invoice
    # PDFs/ISDOCs to a Hetzner Object Storage bucket via the S3 API.
    # When unset, the layer falls back to the local filesystem under
    # `invoice_storage_local_root` — fine for dev, not durable enough
    # for prod once the bucket is provisioned.
    s3_endpoint_url: str = ""
    s3_bucket_invoices: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "fsn1"  # Hetzner Falkenstein default
    invoice_storage_local_root: str = "var"


@lru_cache
def get_settings() -> Settings:
    return Settings()
