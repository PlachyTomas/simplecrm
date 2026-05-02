"""Per-widget service modules for the configurable Reports dashboard.

Each module owns one widget's data fetch + math, returning a typed
dict-like response that the route layer hands back unchanged. This
keeps route handlers as thin shells and makes the math testable in
isolation (REPORTS_TASK §6.1, R0.4).

Real implementations land in R2/R3/R4. Stubs return plausibly-shaped
empty data so the route plumbing in R1+ can be wired against the same
contract.
"""

from app.services.reports.default_layout import default_dashboard_config

__all__ = ["default_dashboard_config"]
