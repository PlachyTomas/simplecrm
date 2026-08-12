"""Global search — the app-wide top-bar lookup.

One endpoint, three independent ILIKE queries, up to five hits each. No ranking
and no full-text index: the point is a fast "jump to the thing I'm thinking of"
affordance over a few thousand rows, which a sequential scan serves fine.
Matching is case- and diacritic-insensitive via `app.db.search`.

Visibility is per-entity and matches whatever each resource's own list endpoint
does, so search can never become a side channel around row-level scoping:

  * companies / deals — org filter + `scope_by_owner` (a salesperson never sees
    a teammate-outside-their-team's rows here either)
  * contacts — org filter only; contacts have no `owner_user_id` and
    `GET /contacts` is likewise org-wide (see `api/v1/contacts.py`)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.scoping import scope_by_owner
from app.db import get_db
from app.db.models import Company, Contact, Deal, User
from app.db.search import folded_ilike_contains, ilike_contains
from app.schemas.search import GlobalSearchResults, SearchHit

router = APIRouter(prefix="/search", tags=["search"])

# Per-entity cap. Five keeps the dropdown scannable without scrolling; a user
# who needs more is better served by the entity's own filtered list page.
_PER_ENTITY_LIMIT = 5

# Matches the frontend's own gate. Enforced here too — the endpoint is public
# API surface and a 1-char query would scan the whole org for nothing.
_MIN_QUERY_LENGTH = 2


@router.get("", response_model=GlobalSearchResults)
async def global_search(
    q: str = Query(min_length=_MIN_QUERY_LENGTH, max_length=120, description="Search term."),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> GlobalSearchResults:
    term = q.strip()
    # `min_length` counts the raw value, so "  a " passes validation but is a
    # 1-char search. Empty results beat a full-table scan.
    if len(term) < _MIN_QUERY_LENGTH:
        return GlobalSearchResults()

    company_stmt = select(Company).where(
        Company.organization_id == user.organization_id,
        or_(
            folded_ilike_contains(Company.name, term),
            ilike_contains(Company.ico, term),
        ),
    )
    company_stmt = await scope_by_owner(
        company_stmt, session=session, user=user, owner_col=Company.owner_user_id
    )
    companies = (
        (await session.execute(company_stmt.order_by(Company.name).limit(_PER_ENTITY_LIMIT)))
        .scalars()
        .all()
    )

    # Left join so a company-less contact is still findable; its subtitle is
    # simply empty.
    contact_stmt = (
        select(Contact, Company.name)
        .outerjoin(Company, Company.id == Contact.company_id)
        .where(
            Contact.organization_id == user.organization_id,
            or_(
                folded_ilike_contains(Contact.first_name, term),
                folded_ilike_contains(Contact.last_name, term),
                ilike_contains(Contact.email, term),
                # Lets "jan nov" match "Jan Novák" — people type full names.
                folded_ilike_contains(Contact.first_name + " " + Contact.last_name, term),
            ),
        )
        .order_by(Contact.last_name, Contact.first_name)
        .limit(_PER_ENTITY_LIMIT)
    )
    contact_rows = (await session.execute(contact_stmt)).all()

    deal_stmt = (
        select(Deal, Company.name)
        .join(Company, Company.id == Deal.company_id)
        .where(
            Deal.organization_id == user.organization_id,
            folded_ilike_contains(Deal.name, term),
        )
    )
    deal_stmt = await scope_by_owner(
        deal_stmt, session=session, user=user, owner_col=Deal.owner_user_id
    )
    deal_rows = (
        await session.execute(deal_stmt.order_by(Deal.created_at.desc()).limit(_PER_ENTITY_LIMIT))
    ).all()

    return GlobalSearchResults(
        companies=[SearchHit(id=c.id, name=c.name, subtitle=c.ico) for c in companies],
        contacts=[
            SearchHit(
                id=contact.id,
                name=f"{contact.first_name} {contact.last_name}".strip(),
                subtitle=company_name,
            )
            for contact, company_name in contact_rows
        ],
        deals=[
            SearchHit(id=deal.id, name=deal.name, subtitle=company_name)
            for deal, company_name in deal_rows
        ],
    )
