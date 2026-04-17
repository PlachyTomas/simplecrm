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

    # Where to send the user after a successful login.
    frontend_success_redirect: str = "http://localhost:5173/app"
    # Where to send them when they log out or hit an error.
    frontend_login_redirect: str = "http://localhost:5173/login"


@lru_cache
def get_settings() -> Settings:
    return Settings()
