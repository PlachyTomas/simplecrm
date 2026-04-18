from fastapi import APIRouter

from app.api.v1 import (
    auth,
    companies,
    contacts,
    deals,
    health,
    organizations,
    pipelines,
    reports,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(companies.router)
api_router.include_router(contacts.router)
api_router.include_router(deals.router)
api_router.include_router(pipelines.router)
api_router.include_router(reports.router)
