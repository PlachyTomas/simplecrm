"""Pipedrive profile.

Sourced from `docs/research/2026-07-27-pipedrive-export-format.md`. The
English spellings marked ``[V]`` there come from Pipedrive's own sample
spreadsheet (the *import* vocabulary — export headers follow the same
``Entity - Field`` convention but were never obtainable verbatim).

**The Czech spellings are educated guesses.** Research §8 could not settle
whether export headers are localized at all. They cost nothing to carry: a
wrong guess simply fails to match and the column falls through to
``note_append`` / the manual mapper, which is the designed safety net.
Phase 4 replaces both tables from a real export.

Header matching is diacritics-, case- and punctuation-insensitive and strips
the trailing ``*`` Pipedrive puts on required columns, so each alias below
only needs one spelling per language — ``Organization - Name*``,
``organization name`` and ``Organization – Name`` all fold together.
"""

from __future__ import annotations

from app.services.imports.providers.base import FileRole, ProviderProfile, Side

_COMPANY_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("Organization - Name", "Organization Name", "Organizace - Název", "Název organizace"),
    "ico": ("Organization - IČO", "IČO", "Company ID number"),
    "dic": ("Organization - DIČ", "DIČ", "VAT number"),
    "email": ("Organization - Email", "Organizace - E-mail"),
    "phone": ("Organization - Phone", "Organizace - Telefon"),
    "website": ("Organization - Website", "Organizace - Web"),
    "industry": ("Organization - Industry", "Organizace - Obor"),
    # Most specific spelling first: the dedicated subfield beats the
    # catch-all address string when both columns are present.
    "address_street": (
        "Organization - Address - Street/road name of Address",
        "Organizace - Adresa - Ulice",
        "Organization - Address",
        "Organizace - Adresa",
    ),
    "address_city": (
        "Organization - Address - City/town/village/locality of Address",
        "Organizace - Adresa - Město",
        "Organization - Address - City",
    ),
    "address_zip": (
        "Organization - Address - ZIP/Postal code of Address",
        "Organizace - Adresa - PSČ",
        "Organization - Address - ZIP",
    ),
    "owner": ("Organization - Owner", "Organizace - Vlastník"),
}

_CONTACT_ALIASES: dict[str, tuple[str, ...]] = {
    "first_name": ("Person - First name", "Osoba - Jméno", "Kontakt - Jméno"),
    "last_name": ("Person - Last name", "Osoba - Příjmení", "Kontakt - Příjmení"),
    # Pipedrive's required column is the *full* name; first/last are
    # optional. Ours are both required, so the split target has to exist.
    "full_name": ("Person - Name", "Osoba - Jméno a příjmení", "Kontakt - Jméno a příjmení"),
    "email": (
        "Person - Email (Work)",
        "Person - Email",
        "Osoba - E-mail",
        "Person - Email (Home)",
    ),
    "phone": (
        "Person - Phone (Work)",
        "Person - Phone",
        "Osoba - Telefon",
        "Person - Phone (Mobile)",
    ),
    "position": ("Person - Job title", "Osoba - Pozice", "Person - Position"),
    "linkedin_url": ("Person - LinkedIn", "Osoba - LinkedIn"),
}

_DEAL_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("Deal - Title", "Obchod - Název", "Obchod - Nadpis"),
    "value": ("Deal - Value", "Obchod - Hodnota"),
    "currency": ("Deal - Currency of value", "Obchod - Měna hodnoty", "Deal - Currency"),
    "expected_close_date": (
        "Deal - Expected close date",
        "Obchod - Očekávané datum uzavření",
    ),
    "stage": ("Deal - Stage (pipeline)", "Deal - Stage", "Obchod - Fáze"),
    "status": ("Deal - Status", "Obchod - Stav"),
    "lost_reason": ("Deal - Lost reason", "Obchod - Důvod prohry"),
    "won_time": ("Deal - Won time", "Obchod - Datum výhry"),
    "lost_time": ("Deal - Lost time", "Obchod - Datum prohry"),
    "closed_on": ("Deal - Closed on", "Obchod - Uzavřeno dne"),
    # Bare, unprefixed columns — verified: a deal row references its org and
    # person by name, not id (research §6).
    "company": ("Organization", "Deal - Organization", "Organizace"),
    "contact": ("Contact person", "Deal - Contact person", "Kontaktní osoba"),
    "owner": ("Deal - Owner", "Obchod - Vlastník"),
    "external_id": ("Deal - Pipedrive System ID", "Deal - ID"),
}

_ALIASES: dict[Side, dict[str, tuple[str, ...]]] = {
    "company": _COMPANY_ALIASES,
    "contact": _CONTACT_ALIASES,
    "deal": _DEAL_ALIASES,
}

_ROLE_SIGNALS: dict[FileRole, tuple[str, ...]] = {
    "deals": (
        "Deal - Title",
        "Deal - Value",
        "Deal - Status",
        "Deal - Stage (pipeline)",
        "Obchod - Název",
        "Obchod - Hodnota",
        "Obchod - Stav",
    ),
    "combined": (
        "Organization - Name",
        "Person - Name",
        "Organizace - Název",
        "Osoba - Jméno a příjmení",
    ),
    "contacts": (
        "Person - Name",
        "Person - First name",
        "Person - Email",
        "Osoba - Jméno a příjmení",
        "Osoba - E-mail",
    ),
    "companies": (
        "Organization - Name",
        "Organization - Address",
        "Organizace - Název",
        "Organizace - Adresa",
    ),
}

PIPEDRIVE = ProviderProfile(
    key="pipedrive",
    label="Pipedrive",
    # Declaration order doubles as the tie-break for `detect_role`: a file
    # with both deal and organization columns is a deals export.
    roles=("deals", "combined", "contacts", "companies"),
    aliases=_ALIASES,
    role_signals=_ROLE_SIGNALS,
    contact_company_headers=(
        "Organization name",
        "Organization",
        "Person - Organization",
        "Organizace",
        "Název organizace",
    ),
)
