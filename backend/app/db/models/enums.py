from enum import StrEnum


class UserRole(StrEnum):
    salesperson = "salesperson"
    manager = "manager"
    admin = "admin"


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


class ActivityEntityType(StrEnum):
    company = "company"
    contact = "contact"
    deal = "deal"
    organization = "organization"


class BlockedCompanyReason(StrEnum):
    """Why an IČO is on the org's blocked list.

    Free-form note is on the row itself; this enum keeps reporting
    buckets stable across orgs.
    """

    competitor = "competitor"
    do_not_contact = "do_not_contact"
    bankrupt = "bankrupt"
    legal_issue = "legal_issue"
    other = "other"


class GoogleSyncStatus(StrEnum):
    """Sync state of a calendar event against the owner's Google Calendar.

    `not_synced` — local-only (the default, or the Google copy was removed).
    `synced`     — a Google copy exists and matches the last local write.
    `error`      — the last push attempt failed; the local row is still the
                   source of truth and the UI surfaces a warning.
    """

    not_synced = "not_synced"
    synced = "synced"
    error = "error"


class ActivityType(StrEnum):
    note = "note"
    stage_change = "stage_change"
    owner_change = "owner_change"
    deal_won = "deal_won"
    deal_lost = "deal_lost"
    company_freed = "company_freed"
    ownership_reassigned = "ownership_reassigned"
    subscription_change = "subscription_change"
