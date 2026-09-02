"""Endpoints for the deals resource."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, nulls_last, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, require_role
from app.core.scoping import can_write_row, scope_by_owner
from app.db import get_db
from app.db.models import (
    ActivityEntityType,
    ActivityType,
    CalendarEvent,
    Company,
    Contact,
    Deal,
    EventLabel,
    Organization,
    Pipeline,
    Stage,
    User,
    UserRole,
)
from app.db.models.enums import StageType
from app.db.search import folded_ilike_contains
from app.schemas.activity import ActivityOut
from app.schemas.deal import (
    DealActionCreate,
    DealCallCreate,
    DealCreate,
    DealDetailOut,
    DealListItemOut,
    DealMarkLost,
    DealNoteCreate,
    DealPaymentUpdate,
    DealStageMove,
    DealUpdate,
)
from app.schemas.event_label import EventLabelBrief
from app.schemas.pagination import Page, PaginationParams
from app.services.activity_log import record_activity, resolve_field_changes
from app.services.list_export import EXPORT_ROW_CAP, csv_date, csv_response

router = APIRouter(prefix="/deals", tags=["deals"])


async def _get_scoped(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    base = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.id == deal_id,
    )
    scoped = await scope_by_owner(base, session=session, user=user, owner_col=Deal.owner_user_id)
    deal: Deal | None = (await session.execute(scoped)).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


async def _assert_company_in_org(session: AsyncSession, user: User, company_id: uuid.UUID) -> None:
    exists = (
        await session.execute(
            select(Company.id).where(
                Company.organization_id == user.organization_id,
                Company.id == company_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="company_id does not exist in your organization",
        )


async def _assert_stage_in_org(session: AsyncSession, user: User, stage_id: uuid.UUID) -> None:
    exists = (
        await session.execute(
            select(Stage.id)
            .join(Pipeline, Pipeline.id == Stage.pipeline_id)
            .where(
                Pipeline.organization_id == user.organization_id,
                Stage.id == stage_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stage_id does not exist in your organization",
        )


async def _assert_contact_in_org(
    session: AsyncSession, user: User, contact_id: uuid.UUID | None
) -> None:
    if contact_id is None:
        return
    exists = (
        await session.execute(
            select(Contact.id).where(
                Contact.organization_id == user.organization_id,
                Contact.id == contact_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="primary_contact_id does not exist in your organization",
        )


_SORT_COLUMNS: dict[str, Any] = {
    "name": Deal.name,
    "value": Deal.value,
    "created_at": Deal.created_at,
    "expected_close_date": Deal.expected_close_date,
    "company_name": Company.name,
    # "stage" sorts by pipeline order, not alphabetically — `position` is what
    # the kanban board (and the user's mental model) treats as stage order.
    "stage": Stage.position,
}

# Sort keys whose underlying column is nullable. Those always push NULLs to the
# bottom regardless of direction so real data stays at the top (mirrors
# `list_companies`).
_NULLABLE_SORT_KEYS = frozenset({"expected_close_date"})


async def _scoped_deals_query(
    session: AsyncSession,
    user: User,
    *,
    company_id: uuid.UUID | None,
    search: str | None,
    stage_id: uuid.UUID | None,
    owner_user_id: uuid.UUID | None,
    deal_status: str | None,
) -> Select[tuple[Any, ...]]:
    """Build the visibility-scoped, filtered deal query shared by the list
    endpoint and the CSV export, so an export always matches what the user is
    looking at.

    `Company` and `Stage` are inner-joined unconditionally: both FKs are NOT
    NULL, so the join never drops a row, and having them in scope lets us
    filter/sort on company name and stage without a second query shape.
    """
    base = (
        select(Deal)
        .join(Company, Company.id == Deal.company_id)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == user.organization_id)
    )
    if company_id is not None:
        base = base.where(Deal.company_id == company_id)
    if search:
        base = base.where(
            or_(
                folded_ilike_contains(Deal.name, search),
                folded_ilike_contains(Company.name, search),
            )
        )
    if stage_id is not None:
        base = base.where(Deal.stage_id == stage_id)
    if owner_user_id is not None:
        base = base.where(Deal.owner_user_id == owner_user_id)
    if deal_status == "open":
        # Still in play: an open-type stage AND not yet closed. A LOST deal
        # lives in an open-type stage with `closed_at` set (see pipelines.py),
        # so the closed_at check is what keeps it out. Mirrored per-row (not
        # shared, since this is a SQL predicate over many rows) by
        # `DealListItemOut`'s `status` field — see `_derive_deal_status` in
        # `app.schemas.deal`.
        base = base.where(Stage.stage_type == StageType.open, Deal.closed_at.is_(None))
    elif deal_status == "won":
        base = base.where(Stage.stage_type == StageType.won)
    elif deal_status == "lost":
        # Either a dedicated lost-type stage, or the house convention: an
        # open-type stage stamped with closed_at. Together with the two
        # branches above this partitions every deal into exactly one status.
        base = base.where(
            or_(
                Stage.stage_type == StageType.lost,
                (Stage.stage_type == StageType.open) & Deal.closed_at.is_not(None),
            )
        )
    return await scope_by_owner(base, session=session, user=user, owner_col=Deal.owner_user_id)


def _order_deals(stmt: Select[tuple[Any, ...]], sort: str, order: str) -> Select[tuple[Any, ...]]:
    sort_col = _SORT_COLUMNS[sort]
    sort_expr = sort_col.asc() if order == "asc" else sort_col.desc()
    if sort in _NULLABLE_SORT_KEYS:
        sort_expr = nulls_last(sort_expr)
    # Stable tiebreakers keep pagination deterministic — deal names are far from
    # unique, so the id backstops them.
    return stmt.order_by(sort_expr, Deal.name, Deal.id)


def _assert_known_sort(sort: str) -> None:
    if sort not in _SORT_COLUMNS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown sort key: {sort}",
        )


_SORT_DESCRIPTION = (
    "Sort key. One of: name, value, created_at, expected_close_date, company_name, stage."
)
_STATUS_DESCRIPTION = (
    "Lifecycle filter. 'open' = open-type stage and not closed, 'won' = won-type "
    "stage, 'lost' = lost-type stage or an open-type stage already closed."
)
_SEARCH_DESCRIPTION = (
    "Case- and diacritic-insensitive partial match on the deal name or its company's name."
)


@router.get("", response_model=Page[DealListItemOut])
async def list_deals(
    pagination: PaginationParams = Depends(),
    company_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120, description=_SEARCH_DESCRIPTION),
    stage_id: uuid.UUID | None = Query(default=None, description="Filter to a single stage."),
    owner_user_id: uuid.UUID | None = Query(
        default=None, description="Filter to deals owned by this specific user."
    ),
    deal_status: str | None = Query(
        default=None, alias="status", pattern="^(open|won|lost)$", description=_STATUS_DESCRIPTION
    ),
    sort: str = Query(default="created_at", description=_SORT_DESCRIPTION),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Page[DealListItemOut]:
    _assert_known_sort(sort)
    scoped = await _scoped_deals_query(
        session,
        user,
        company_id=company_id,
        search=search,
        stage_id=stage_id,
        owner_user_id=owner_user_id,
        deal_status=deal_status,
    )
    count_stmt = select(func.count()).select_from(scoped.subquery())
    total = (await session.execute(count_stmt)).scalar_one()
    # Eager-load the display relationships so the response can carry names
    # (stage/owner/company/contact) without the client issuing per-row fetches.
    items_stmt = _order_deals(
        scoped.options(
            selectinload(Deal.company),
            selectinload(Deal.stage),
            selectinload(Deal.owner),
            selectinload(Deal.primary_contact),
        ),
        sort,
        order,
    ).limit(pagination.limit)
    items = (await session.execute(items_stmt.offset(pagination.offset))).scalars().all()

    # "Next step" for the page's rows in one grouped query (never per-row) —
    # the same earliest-upcoming-event rule as the pipeline board.
    next_events: dict[uuid.UUID, datetime] = {}
    if items:
        now = datetime.now(tz=UTC)
        rows = await session.execute(
            select(CalendarEvent.deal_id, func.min(CalendarEvent.starts_at))
            .where(
                CalendarEvent.deal_id.in_([d.id for d in items]),
                CalendarEvent.ends_at >= now,
            )
            .group_by(CalendarEvent.deal_id)
        )
        # `deal_id` is typed nullable on the model; the IN-filter above
        # guarantees it here — the guard is for the type checker.
        next_events = {
            deal_id: starts_at for deal_id, starts_at in rows.all() if deal_id is not None
        }

    out_items = []
    for d in items:
        out = DealListItemOut.from_deal(d)
        # Closed deals need no next step — mirror the board's rule.
        if out.status == "open":
            out.next_event_at = next_events.get(d.id)
        out_items.append(out)
    return Page[DealListItemOut](
        items=out_items,
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/export.csv")
async def export_deals_list_csv(
    company_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120, description=_SEARCH_DESCRIPTION),
    stage_id: uuid.UUID | None = Query(default=None),
    owner_user_id: uuid.UUID | None = Query(default=None),
    deal_status: str | None = Query(
        default=None, alias="status", pattern="^(open|won|lost)$", description=_STATUS_DESCRIPTION
    ),
    sort: str = Query(default="created_at", description=_SORT_DESCRIPTION),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """CSV of the deals list, honouring exactly the filters/sort the list
    endpoint takes — so the download matches the table on screen.

    Capped at `EXPORT_ROW_CAP` rows; see `csv_response` for how that's
    announced. Note this is the *list* export; the trial-ungated
    walk-away-with-your-data export still lives at `/reports/export-csv`.
    """
    _assert_known_sort(sort)
    scoped = await _scoped_deals_query(
        session,
        user,
        company_id=company_id,
        search=search,
        stage_id=stage_id,
        owner_user_id=owner_user_id,
        deal_status=deal_status,
    )
    stmt = _order_deals(
        scoped.options(
            selectinload(Deal.company),
            selectinload(Deal.stage),
            selectinload(Deal.owner),
            selectinload(Deal.primary_contact),
        ),
        sort,
        order,
        # One extra row is fetched purely to detect truncation.
    ).limit(EXPORT_ROW_CAP + 1)
    deals = list((await session.execute(stmt)).scalars().all())
    truncated = len(deals) > EXPORT_ROW_CAP
    if truncated:
        deals = deals[:EXPORT_ROW_CAP]

    rows: list[list[Any]] = [
        [
            "název",
            "firma",
            "fáze",
            "stav",
            "hodnota",
            "měna",
            "obchodník",
            "kontakt",
            "e-mail kontaktu",
            "očekávané uzavření",
            "uzavřeno",
            "důvod neúspěchu",
            "zaplaceno",
            "vytvořeno",
        ]
    ]
    state_label = {StageType.won: "vyhráno", StageType.lost: "prohráno", StageType.open: "otevřeno"}
    for deal in deals:
        stage_type = deal.stage.stage_type
        if stage_type is StageType.open and deal.closed_at is not None:
            state = state_label[StageType.lost]
        else:
            state = state_label[stage_type]
        contact = deal.primary_contact
        rows.append(
            [
                deal.name,
                deal.company.name,
                deal.stage.name,
                state,
                f"{deal.value:.2f}",
                deal.currency,
                deal.owner.name if deal.owner else "",
                f"{contact.first_name} {contact.last_name}".strip() if contact else "",
                (contact.email or "") if contact else "",
                csv_date(deal.expected_close_date),
                csv_date(deal.closed_at),
                deal.lost_reason or "",
                "ano" if deal.is_paid else "ne",
                csv_date(deal.created_at),
            ]
        )
    return csv_response(rows, filename_stem="deals", truncated=truncated)


@router.get("/{deal_id}", response_model=DealDetailOut)
async def get_deal(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    return await _get_scoped(session, user, deal_id)


@router.post("", response_model=DealDetailOut, status_code=status.HTTP_201_CREATED)
async def create_deal(
    payload: DealCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    owner_id = payload.owner_user_id
    if user.role is UserRole.salesperson and owner_id is not None and owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Salesperson can assign ownership only to themselves",
        )
    if owner_id is not None and not await can_write_row(session, user, owner_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot assign ownership outside your visibility scope",
        )

    await _assert_company_in_org(session, user, payload.company_id)
    await _assert_stage_in_org(session, user, payload.stage_id)
    await _assert_contact_in_org(session, user, payload.primary_contact_id)

    # Default currency to the org's configured currency.
    currency = payload.currency
    if currency is None:
        org = await session.get(Organization, user.organization_id)
        if org is None:
            raise RuntimeError("current user points at a missing organization")
        currency = org.currency

    deal = Deal(
        organization_id=user.organization_id,
        name=payload.name,
        company_id=payload.company_id,
        stage_id=payload.stage_id,
        owner_user_id=owner_id,
        primary_contact_id=payload.primary_contact_id,
        value=payload.value,
        currency=currency,
        probability_override=payload.probability_override,
        expected_close_date=payload.expected_close_date,
        note=payload.note,
    )
    session.add(deal)
    await session.flush()  # populate deal.id for the activity row

    stage = await session.get(Stage, deal.stage_id)
    record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.deal_created,
        payload={
            "deal_name": deal.name,
            "name": deal.name,
            "value": str(deal.value),
            "stage_name": stage.name if stage else None,
        },
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.put("/{deal_id}", response_model=DealDetailOut)
async def update_deal(
    deal_id: uuid.UUID,
    payload: DealUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot edit deals outside your visibility scope",
        )
    updates = payload.model_dump(exclude_unset=True)

    if "owner_user_id" in updates and updates["owner_user_id"] != deal.owner_user_id:
        new_owner = updates["owner_user_id"]
        if not await can_write_row(session, user, new_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot reassign ownership outside your scope",
            )
    if "company_id" in updates:
        if updates["company_id"] is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="company_id cannot be null",
            )
        await _assert_company_in_org(session, user, updates["company_id"])
    if "stage_id" in updates:
        if updates["stage_id"] is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="stage_id cannot be null",
            )
        await _assert_stage_in_org(session, user, updates["stage_id"])
    if "primary_contact_id" in updates:
        await _assert_contact_in_org(session, user, updates["primary_contact_id"])

    # Which submitted fields actually change a value — drives the activity log
    # so a no-op PUT (or a save with no edits) writes nothing. Capture the old
    # values BEFORE the setattr loop so we can render per-field from→to strings.
    changed = [field for field, value in updates.items() if getattr(deal, field) != value]
    raw_changes = {field: (getattr(deal, field), updates[field]) for field in changed}

    # A stage move is pipeline narrative, not a field edit: route it through
    # the shared transition (closed_at sync + a `stage_change` row the deal
    # timeline actually shows) instead of the plain setattr + deal_updated.
    dest_stage: Stage | None = None
    if "stage_id" in changed:
        del updates["stage_id"]
        changed.remove("stage_id")
        del raw_changes["stage_id"]
        dest_stage = await session.get(Stage, payload.stage_id)
        # _assert_stage_in_org already verified existence + org ownership.
        assert dest_stage is not None  # noqa: S101 — guaranteed by the assert above
        if dest_stage.stage_type is not StageType.lost:
            # The transition resets lost_reason on entering open/won; drop a
            # co-submitted value so the deal_updated log matches the DB.
            updates.pop("lost_reason", None)
            if "lost_reason" in changed:
                changed.remove("lost_reason")
                del raw_changes["lost_reason"]

    for field, value in updates.items():
        setattr(deal, field, value)

    if dest_stage is not None:
        await _transition_stage(session, user, deal, dest_stage)

    if changed:
        changes = await resolve_field_changes(
            session,
            raw_changes,
            user_fields=frozenset({"owner_user_id"}),
            contact_fields=frozenset({"primary_contact_id"}),
            company_fields=frozenset({"company_id"}),
        )
        record_activity(
            session,
            organization_id=deal.organization_id,
            entity_type=ActivityEntityType.deal,
            entity_id=deal.id,
            company_id=deal.company_id,
            user_id=user.id,
            activity_type=ActivityType.deal_updated,
            # `changed` (names only) kept for legacy renderers; `changes` is the
            # display-ready from→to map the current timeline UI consumes.
            payload={"deal_name": deal.name, "changed": changed, "changes": changes},
        )
    await session.commit()
    await session.refresh(deal)
    return deal


async def _transition_stage(
    session: AsyncSession, user: User, deal: Deal, dest_stage: Stage
) -> None:
    """Move the deal into `dest_stage` — the single owner of stage semantics,
    shared by the kanban drag endpoint and the edit-form PUT.

    Syncs `closed_at` and `lost_reason` to the destination stage's type:
      * Into a `won` stage  → set `closed_at = now`, clear lost_reason,
        refresh the company's last_order_at + ownership_expires_at (matches
        `mark-won` semantics; otherwise the deal would be invisible from
        the board's won-window filter).
      * Into a `lost` stage → set `closed_at = now` so the deal is marked
        terminal. `lost_reason` is left as-is — neither entry has a UI for
        capturing it; the founder can edit via the deal detail page.
      * Into an `open` stage → clear `closed_at` and `lost_reason`
        ("reopen"). Without this, moving a won deal back to an earlier
        stage would leave `closed_at` set, and the board's visibility
        filter would hide the row.

    Always logs a `stage_change` activity — the deal timeline shows those,
    not `deal_updated` rows. Callers have already checked scope, org
    ownership of the stage, and that the stage actually differs.
    """
    from datetime import UTC, datetime, timedelta

    previous_stage = await session.get(Stage, deal.stage_id)
    previous_type = previous_stage.stage_type if previous_stage else StageType.open

    previous_stage_id = deal.stage_id
    deal.stage_id = dest_stage.id

    now = datetime.now(tz=UTC)
    if previous_type is StageType.won and dest_stage.stage_type is not StageType.won:
        # `is_paid` only carries meaning in a won stage (mirrors reopen_deal);
        # left set, no UI could ever clear it — the payment endpoint 409s
        # outside won stages.
        deal.is_paid = False
        deal.paid_at = None
    if dest_stage.stage_type is StageType.won:
        # Match mark-won: set closed_at + refresh the owning company so
        # the auto-free clock resets. Only on transition INTO won; moves
        # between won stages (multi-won pipelines) don't double-refresh.
        if previous_type is not StageType.won:
            deal.closed_at = now
            company = await session.get(Company, deal.company_id)
            if company is not None:
                company.last_order_at = now
                window_days = user.organization.ownership_window_days if user.organization else 365
                company.ownership_expires_at = now + timedelta(days=window_days)
        deal.lost_reason = None
    elif dest_stage.stage_type is StageType.lost:
        if previous_type is not StageType.lost:
            deal.closed_at = now
    else:  # StageType.open
        deal.closed_at = None
        deal.lost_reason = None

    record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.stage_change,
        payload={
            "deal_name": deal.name,
            "from_stage_id": str(previous_stage_id),
            "to_stage_id": str(dest_stage.id),
            "from_stage_name": previous_stage.name if previous_stage else None,
            "to_stage_name": dest_stage.name,
        },
    )


@router.post("/{deal_id}/move-stage", response_model=DealDetailOut)
async def move_deal_stage(
    deal_id: uuid.UUID,
    payload: DealStageMove,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Drag-and-drop endpoint for the kanban board — see `_transition_stage`
    for the won/lost/open semantics."""

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot move deals outside your visibility scope",
        )
    await _assert_stage_in_org(session, user, payload.stage_id)

    if deal.stage_id == payload.stage_id:
        return deal  # no-op; UI sometimes sends it on drop

    dest_stage = await session.get(Stage, payload.stage_id)
    # _assert_stage_in_org already verified existence + org ownership.
    assert dest_stage is not None  # noqa: S101 — guaranteed by the assert above

    await _transition_stage(session, user, deal, dest_stage)
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/mark-won", response_model=DealDetailOut)
async def mark_deal_won(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Stamp the deal as won, move it to the pipeline's `won` stage, and
    refresh the company's last_order_at so the auto-free clock resets.
    """
    from datetime import UTC, datetime, timedelta

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot mark deals outside your visibility scope",
        )

    # Find the won stage in the same pipeline as the current stage.
    stmt = (
        select(Stage)
        .join(Pipeline, Pipeline.id == Stage.pipeline_id)
        .where(
            Pipeline.organization_id == user.organization_id,
            Stage.stage_type == StageType.won,
        )
        .order_by(Stage.position)
    )
    won_stage = (await session.execute(stmt)).scalars().first()
    if won_stage is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No won stage configured in your pipeline.",
        )

    now = datetime.now(tz=UTC)
    previous_stage_id = deal.stage_id
    deal.stage_id = won_stage.id
    deal.closed_at = now
    deal.lost_reason = None

    # Refresh the owning company's last_order_at + ownership_expires_at
    # using the org's configured release window.
    company = await session.get(Company, deal.company_id)
    if company is not None:
        company.last_order_at = now
        window_days = user.organization.ownership_window_days if user.organization else 365
        company.ownership_expires_at = now + timedelta(days=window_days)

    record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.deal_won,
        payload={
            "deal_name": deal.name,
            "from_stage_id": str(previous_stage_id),
            "to_stage_id": str(won_stage.id),
            "value": str(deal.value),
            "currency": deal.currency,
        },
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/mark-lost", response_model=DealDetailOut)
async def mark_deal_lost(
    deal_id: uuid.UUID,
    payload: DealMarkLost,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Stamp the deal as lost with a required reason. Stage stays the same
    unless a dedicated `lost` stage exists, in which case we move to it."""
    from datetime import UTC, datetime

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot mark deals outside your visibility scope",
        )

    previous_stage_id = deal.stage_id
    stmt = (
        select(Stage)
        .join(Pipeline, Pipeline.id == Stage.pipeline_id)
        .where(
            Pipeline.organization_id == user.organization_id,
            Stage.stage_type == StageType.lost,
        )
        .order_by(Stage.position)
    )
    lost_stage = (await session.execute(stmt)).scalars().first()
    if lost_stage is not None:
        deal.stage_id = lost_stage.id

    deal.closed_at = datetime.now(tz=UTC)
    deal.lost_reason = payload.lost_reason

    record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.deal_lost,
        payload={
            "deal_name": deal.name,
            "from_stage_id": str(previous_stage_id),
            "to_stage_id": str(deal.stage_id),
            "lost_reason": payload.lost_reason,
        },
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/reopen", response_model=DealDetailOut)
async def reopen_deal(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Bring a closed deal back into play.

    A lost deal sitting in an open-type stage just loses its terminal stamp
    (`closed_at` + `lost_reason`) and stays where it was. A deal parked in a
    won/lost-type stage also needs a playable home, so it moves to the
    pipeline's first open-type stage. The old detail-page "reopen" PATCHed
    only `{lost_reason: null}`, which cannot clear `closed_at` — the deal
    stayed terminal while the UI claimed success; this endpoint is the
    real thing.
    """
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot mark deals outside your visibility scope",
        )

    current_stage = await session.get(Stage, deal.stage_id)
    current_type = current_stage.stage_type if current_stage else StageType.open
    if current_type is StageType.open and deal.closed_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Deal is not closed.",
        )

    previous_stage_id = deal.stage_id
    previous_lost_reason = deal.lost_reason
    if current_type is not StageType.open:
        stmt = (
            select(Stage)
            .join(Pipeline, Pipeline.id == Stage.pipeline_id)
            .where(
                Pipeline.organization_id == user.organization_id,
                Stage.stage_type == StageType.open,
            )
            .order_by(Stage.position)
        )
        open_stage = (await session.execute(stmt)).scalars().first()
        if open_stage is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No open stage configured in your pipeline.",
            )
        deal.stage_id = open_stage.id

    deal.closed_at = None
    deal.lost_reason = None
    # `is_paid` only carries meaning while the deal sits in a won stage —
    # a reopened deal is outstanding again, not collected revenue.
    deal.is_paid = False
    deal.paid_at = None

    record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.deal_reopened,
        payload={
            "deal_name": deal.name,
            "from_stage_id": str(previous_stage_id),
            "to_stage_id": str(deal.stage_id),
            "lost_reason": previous_lost_reason,
        },
    )
    await session.commit()
    await session.refresh(deal)
    return deal


@router.post("/{deal_id}/payment", response_model=DealDetailOut)
async def update_deal_payment(
    deal_id: uuid.UUID,
    payload: DealPaymentUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Deal:
    """Toggle a won deal's paid/unpaid flag.

    The UI exposes the checkbox on cards in the won column. Trying to
    flip a deal that isn't in a won stage is a 409 — the flag only
    carries meaning there and we'd rather force the caller to mark-won
    first than have stale `is_paid=true` rows sitting in early stages.
    """
    from datetime import UTC, datetime

    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update payment on deals outside your visibility scope",
        )

    stage = await session.get(Stage, deal.stage_id)
    if stage is None or stage.stage_type is not StageType.won:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment status can only be set on deals in a won stage.",
        )

    if payload.paid:
        if not deal.is_paid:
            deal.paid_at = datetime.now(tz=UTC)
        deal.is_paid = True
    else:
        deal.is_paid = False
        deal.paid_at = None

    await session.commit()
    await session.refresh(deal)
    return deal


@router.post(
    "/{deal_id}/notes",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_deal_note(
    deal_id: uuid.UUID,
    payload: DealNoteCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityOut:
    """Log a free-text note on a deal.

    Notes live in the activity log (`ActivityType.note`) rather than a table of
    their own, so `GET /activities?entity_type=deal&entity_id=…` and the
    company timeline pick them up with no extra join. Writing is scoped like
    every other deal write — you can only note a deal you may edit.
    """
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot add notes to deals outside your visibility scope",
        )

    activity = record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.note,
        payload={"deal_name": deal.name, "note": payload.body},
    )
    await session.commit()
    await session.refresh(activity)
    out = ActivityOut.model_validate(activity)
    out.user_name = user.name
    return out


@router.post(
    "/{deal_id}/actions",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_deal_action(
    deal_id: uuid.UUID,
    payload: DealActionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityOut:
    """Log an action the user carried out, at a time they choose.

    The counterpart to the automatic pipeline rows: this is the half of the
    timeline the user writes. Body text lands under the `note` payload key so
    the one renderer covers `manual_action`, `note` and `call_logged` alike.
    """
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot log actions on deals outside your visibility scope",
        )

    label: EventLabel | None = None
    if payload.label_id is not None:
        label = (
            await session.execute(
                select(EventLabel).where(
                    EventLabel.id == payload.label_id,
                    EventLabel.organization_id == user.organization_id,
                )
            )
        ).scalar_one_or_none()
        if label is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Unknown label",
            )

    activity = record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.manual_action,
        occurred_at=payload.occurred_at,
        label_id=payload.label_id,
        payload={"deal_name": deal.name, **({"note": payload.body} if payload.body else {})},
    )
    await session.commit()
    await session.refresh(activity)
    # Built with explicit kwargs rather than `ActivityOut.model_validate(activity)`:
    # when `label` is set, SQLAlchemy's identity map resolves `activity.label` to
    # a real `EventLabel` ORM instance (no extra query needed — it was just
    # loaded above). `ActivityOut` declares `from_attributes`, but its nested
    # `label` field's type, `EventLabelBrief`, does not — so validating the
    # whole activity in one call raises a `model_type` error on that nested
    # field (`Input should be a valid dictionary or instance of
    # EventLabelBrief`). `events.py._label_briefs` sidesteps the same trap by
    # constructing `EventLabelBrief` from kwargs instead of `model_validate`.
    out = ActivityOut(
        id=activity.id,
        organization_id=activity.organization_id,
        entity_type=activity.entity_type,
        entity_id=activity.entity_id,
        user_id=activity.user_id,
        user_name=user.name,
        activity_type=activity.activity_type,
        payload=activity.payload,
        created_at=activity.created_at,
        occurred_at=activity.occurred_at,
        label=EventLabelBrief(id=label.id, name=label.name, color=label.color) if label else None,
        can_edit=True,
    )
    return out


@router.post(
    "/{deal_id}/calls",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_deal_call(
    deal_id: uuid.UUID,
    payload: DealCallCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ActivityOut:
    """Log a call that already happened on a deal.

    Same shape as `create_deal_note` — an activity row, not a table of its
    own — but a distinct `ActivityType` so the timeline can say "called"
    rather than burying it among written notes. The summary is optional.
    """
    deal = await _get_scoped(session, user, deal_id)
    if not await can_write_row(session, user, deal.owner_user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot log calls on deals outside your visibility scope",
        )

    note = (payload.body or "").strip()
    activity = record_activity(
        session,
        organization_id=deal.organization_id,
        entity_type=ActivityEntityType.deal,
        entity_id=deal.id,
        company_id=deal.company_id,
        user_id=user.id,
        activity_type=ActivityType.call_logged,
        payload={"deal_name": deal.name, **({"note": note} if note else {})},
    )
    await session.commit()
    await session.refresh(activity)
    out = ActivityOut.model_validate(activity)
    out.user_name = user.name
    return out


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin)),
    session: AsyncSession = Depends(get_db),
) -> None:
    deal = await _get_scoped(session, user, deal_id)
    await session.delete(deal)
    await session.commit()
