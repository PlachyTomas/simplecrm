import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.services.scheduler import (
    integrity_check_scheduler,
    recurring_charge_scheduler,
    renewal_draft_scheduler,
    scheduler,
)

_startup_logger = logging.getLogger("simplecrm.startup")


def _log_go_live_warnings(settings: object) -> None:
    """Loud startup warnings for configuration that's safe in dev but
    catastrophic in production. Surfaces them as ERROR-level logs so a
    standard monitoring filter notices, even though the app boots fine.
    """
    s = settings  # narrowed by the caller
    test_mode = getattr(s, "comgate_test_mode", False)
    if test_mode:
        _startup_logger.error(
            "ComGate is running in TEST MODE — every `create` call carries "
            "`test=true`. If this is the production deployment, set "
            "COMGATE_TEST_MODE=false in the environment before opening "
            "signups."
        )
    if not getattr(s, "smtp_host", ""):
        _startup_logger.error(
            "SMTP_HOST is not set — outbound email (invoices, feedback, "
            "verification, password reset) will log instead of deliver. "
            "If this is production, configure the Zoho SMTP block from "
            "docs/TODO.md."
        )


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Start background jobs on boot, stop them on shutdown. Tests use
    # `create_app` indirectly and patch the scheduler before dispatch.
    _log_go_live_warnings(get_settings())
    scheduler.start()
    recurring_charge_scheduler.start()
    renewal_draft_scheduler.start()
    integrity_check_scheduler.start()
    try:
        yield
    finally:
        await scheduler.stop()
        await recurring_charge_scheduler.stop()
        await renewal_draft_scheduler.stop()
        await integrity_check_scheduler.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url=f"{settings.api_v1_prefix}/docs",
        redoc_url=None,
        lifespan=_lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
