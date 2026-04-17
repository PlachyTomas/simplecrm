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
