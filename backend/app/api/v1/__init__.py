from fastapi import APIRouter, Depends

from app.api.v1 import (
    activities,
    admin,
    admin_invoices,
    auth,
    blocked_companies,
    companies,
    contacts,
    data_export,
    deals,
    feedback,
    health,
    imports,
    invitations,
    invoices,
    onboarding,
    organizations,
    payments,
    pipelines,
    plans,
    reports,
    reports_widgets,
    subscription,
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
# Feedback (bug reports / improvements). Auth-only — a user without an
# org or with an expired trial still needs to reach the founder.
api_router.include_router(feedback.router)
api_router.include_router(organizations.router, dependencies=PROTECTED_DEPS)
api_router.include_router(companies.router, dependencies=PROTECTED_DEPS)
api_router.include_router(contacts.router, dependencies=PROTECTED_DEPS)
api_router.include_router(deals.router, dependencies=PROTECTED_DEPS)
api_router.include_router(invitations.router, dependencies=PROTECTED_DEPS)
# Customer-facing tax-invoice surfaces. Org-membership gated; not trial-
# gated (a gated org must still be able to download their existing
# invoice PDFs from before they were gated).
api_router.include_router(invoices.router, dependencies=[Depends(require_org_membership)])
api_router.include_router(pipelines.router, dependencies=PROTECTED_DEPS)
api_router.include_router(reports.router, dependencies=PROTECTED_DEPS)
api_router.include_router(reports_widgets.router, dependencies=PROTECTED_DEPS)
api_router.include_router(teams.router, dependencies=PROTECTED_DEPS)
api_router.include_router(users.router, dependencies=PROTECTED_DEPS)
api_router.include_router(activities.router, dependencies=PROTECTED_DEPS)
api_router.include_router(blocked_companies.router, dependencies=PROTECTED_DEPS)
# Admin CSV import. Trial-gated because import-on-an-expired-trial would
# let a customer skirt the paywall by bulk-loading data after lockout.
api_router.include_router(imports.router, dependencies=PROTECTED_DEPS)
# Subscription read + choose-plan + contact-enterprise — auth + org-membership
# only, intentionally NOT trial-gated so a gated user can still escape the
# gate by picking a plan.
api_router.include_router(subscription.router, dependencies=[Depends(require_org_membership)])
# ComGate-backed payment endpoints. Intentionally NOT trial-gated:
# - `webhook` is server-to-server from ComGate, no user auth at all
# - `seat-change-init` must work for active orgs upgrading mid-period
# - `initial-payment-init` must work for trial-expired orgs escaping the gate
# Per-route auth is enforced inside the router (`require_role(admin)` on the
# customer-facing routes; signature on the webhook).
api_router.include_router(payments.router)
# Public pricing catalog — no auth, no trial gate.
api_router.include_router(plans.router)
# Super-admin surface — gated per-route by `require_super_admin`. Not under
# PROTECTED_DEPS because the trial gate is per-org and super-admins operate
# across orgs (and may themselves belong to a freshly-trialing test org).
api_router.include_router(admin.router)
api_router.include_router(admin_invoices.router)
