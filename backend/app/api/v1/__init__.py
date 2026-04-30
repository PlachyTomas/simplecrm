from fastapi import APIRouter, Depends

from app.api.v1 import (
    activities,
    auth,
    companies,
    contacts,
    data_export,
    deals,
    health,
    organizations,
    pipelines,
    reports,
    teams,
    users,
)
from app.core.deps import require_active_trial_or_subscription

# Trial-gated mounts: any user belonging to an org whose trial has ended and
# has no `stripe_customer_id` set will receive a 402 with the trial payload
# the frontend's `ProtectedRoute` reads to render `<TrialExpiredGate />`.
# Auth + health routes intentionally bypass — users must still be able to
# log out, hit /auth/google/login, and check service health when expired.
PROTECTED_DEPS = [Depends(require_active_trial_or_subscription)]

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
# Data export is intentionally **not** trial-gated — users must always be
# able to walk away with their data, even after the trial expires. Auth
# is still required (handler-level `Depends(get_current_user)`).
api_router.include_router(data_export.router)
api_router.include_router(organizations.router, dependencies=PROTECTED_DEPS)
api_router.include_router(companies.router, dependencies=PROTECTED_DEPS)
api_router.include_router(contacts.router, dependencies=PROTECTED_DEPS)
api_router.include_router(deals.router, dependencies=PROTECTED_DEPS)
api_router.include_router(pipelines.router, dependencies=PROTECTED_DEPS)
api_router.include_router(reports.router, dependencies=PROTECTED_DEPS)
api_router.include_router(teams.router, dependencies=PROTECTED_DEPS)
api_router.include_router(users.router, dependencies=PROTECTED_DEPS)
api_router.include_router(activities.router, dependencies=PROTECTED_DEPS)
