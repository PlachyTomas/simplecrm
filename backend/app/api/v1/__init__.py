from fastapi import APIRouter, Depends

from app.api.v1 import (
    activities,
    auth,
    companies,
    contacts,
    data_export,
    deals,
    health,
    invitations,
    onboarding,
    organizations,
    pipelines,
    reports,
    teams,
    users,
)
from app.core.deps import require_active_trial_or_subscription, require_org_membership

# Org-scoped + trial-gated mounts. `require_org_membership` ensures users
# without an org (post-signup, pre-create-org) get a clean 403 with
# `code="needs_org_setup"` instead of dereferencing a NULL FK; the trial
# gate then 402s when the org's trial has expired without a paid plan.
# Auth + health + onboarding routes intentionally bypass — users must still
# be able to log out, hit /auth/google/login, finish org setup, and accept
# invites in those states.
PROTECTED_DEPS = [
    Depends(require_org_membership),
    Depends(require_active_trial_or_subscription),
]

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
# Onboarding is auth-required but intentionally NOT org-gated — its whole
# purpose is to let a freshly-signed-up user create their org, or a public
# visitor preview an invitation before logging in.
api_router.include_router(onboarding.router)
# Data export is intentionally **not** trial-gated — users must always be
# able to walk away with their data, even after the trial expires. Auth
# is still required (handler-level `Depends(get_current_user)`).
api_router.include_router(data_export.router)
api_router.include_router(organizations.router, dependencies=PROTECTED_DEPS)
api_router.include_router(companies.router, dependencies=PROTECTED_DEPS)
api_router.include_router(contacts.router, dependencies=PROTECTED_DEPS)
api_router.include_router(deals.router, dependencies=PROTECTED_DEPS)
api_router.include_router(invitations.router, dependencies=PROTECTED_DEPS)
api_router.include_router(pipelines.router, dependencies=PROTECTED_DEPS)
api_router.include_router(reports.router, dependencies=PROTECTED_DEPS)
api_router.include_router(teams.router, dependencies=PROTECTED_DEPS)
api_router.include_router(users.router, dependencies=PROTECTED_DEPS)
api_router.include_router(activities.router, dependencies=PROTECTED_DEPS)
