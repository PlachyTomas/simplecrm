from enum import StrEnum


class UserRole(StrEnum):
    salesperson = "salesperson"
    manager = "manager"
    admin = "admin"


class PlanInterval(StrEnum):
    monthly = "monthly"
    annual = "annual"


class Region(StrEnum):
    eu_cz = "eu-cz"


class OwnershipChangeReason(StrEnum):
    initial = "initial"
    reassigned = "reassigned"
    freed_timeout = "freed_timeout"
    won_deal_refresh = "won_deal_refresh"


class StageType(StrEnum):
    open = "open"
    won = "won"
    lost = "lost"
