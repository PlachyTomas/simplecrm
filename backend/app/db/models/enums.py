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
    email_sent = "email_sent"
    # Written by the Smart-BCC inbound pipeline (services/inbound_email.py)
    # when a forwarded message is filed on a company/deal.
    email_received = "email_received"
    deal_created = "deal_created"
    deal_updated = "deal_updated"
    company_updated = "company_updated"
    event_created = "event_created"
    # "Zaznamenat hovor" in the deal quick actions — a call that already
    # happened, with an optional summary. Distinct from `note` so the
    # timeline can tell "we spoke" from "I wrote something down".
    call_logged = "call_logged"
    # A closed (won/lost) deal brought back to play via POST /deals/{id}/reopen.
    # Distinct from `stage_change` because a lost deal in an open-type stage
    # reopens without moving anywhere.
    deal_reopened = "deal_reopened"
    # User-authored timeline entry: "what I did", with a caller-set
    # `occurred_at` and a kind drawn from the shared calendar-label
    # vocabulary. `note` and `call_logged` are its predecessors and stay
    # valid — all three are editable (services/activity_log.MANUAL_ACTIVITY_TYPES).
    manual_action = "manual_action"


class EmailRecipientStatus(StrEnum):
    sent = "sent"
    failed = "failed"
    skipped = "skipped"


class SentEmailStatus(StrEnum):
    """Outcome of a single user-composed email send (send-only mail client).

    Inbound (Smart-BCC) rows reuse `sent` to mean "recorded successfully" —
    there is no delivery attempt to fail. `EmailDirection` is what separates
    the two kinds of row.
    """

    sent = "sent"
    failed = "failed"


class SalesGoalMetric(StrEnum):
    """What a monthly sales goal counts.

    `won_value` — summed value of deals won in the month (org currency).
    `won_count` — how many deals were won in the month.

    Both read "won" exactly as the `deals_won` report widget does: a deal in
    a `won`-type stage whose `closed_at` falls inside the month.
    """

    won_value = "won_value"
    won_count = "won_count"


class ImportRunStatus(StrEnum):
    """Lifecycle of one committed CSV/migration import.

    `committed`        — the import wrote rows and nothing has been undone.
    `undone`           — undo removed every row the run created.
    `partially_undone` — undo ran but left some rows behind (edited since the
                         import, or carrying work created after it). Terminal:
                         v1 does not offer a second undo pass, because the
                         provenance stamp of the surviving rows no longer tells
                         us whether the user meant to keep them.
    """

    committed = "committed"
    undone = "undone"
    partially_undone = "partially_undone"


class EmailDirection(StrEnum):
    """Which way a `sent_emails` row travelled.

    `outbound` — composed and sent from the CRM (the original meaning of the
    table; every pre-F3 row backfills to this).
    `inbound`  — captured via Smart BCC: the user BCC'd their magic address
    from their own mail client and the MTA worker POSTed us the raw MIME.
    """

    outbound = "outbound"
    inbound = "inbound"
