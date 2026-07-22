"""Reports / KPI endpoints."""

from __future__ import annotations

import dataclasses
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_leaderboard_visibility, require_role
from app.core.scoping import assert_report_scope, scope_by_owner
from app.db import get_db
from app.db.models import Company, Deal, Organization, Stage, Team, User
from app.db.models.enums import StageType, UserRole
from app.schemas.reports import (
    DashboardConfig,
    KpiSummary,
    Leaderboard,
    LeaderboardRow,
    LossReasonRow,
    LossReasons,
    MySummary,
    TeamLeaderboard,
    TeamLeaderboardRow,
    TeamMetric,
    Velocity,
    VelocityByStage,
)
from app.services.reports import default_dashboard_config
from app.services.reports.csv_export import render_widget_csv

router = APIRouter(prefix="/reports", tags=["reports"])


def _start_of_month_utc() -> datetime:
    now = datetime.now(tz=UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _date_window(
    from_date: date | None, to_date: date | None
) -> tuple[date, date, datetime, datetime]:
    """Normalize a date range; defaults to the trailing 90 days."""
    today = datetime.now(tz=UTC).date()
    resolved_to = to_date or today
    resolved_from = from_date or date.fromordinal(resolved_to.toordinal() - 89)
    start = datetime.combine(resolved_from, time.min, tzinfo=UTC)
    end = datetime.combine(resolved_to, time.max, tzinfo=UTC)
    return resolved_from, resolved_to, start, end


@router.get("/kpi-summary", response_model=KpiSummary)
async def kpi_summary(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> KpiSummary:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")

    stmt = (
        select(Deal, Stage)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(Deal.organization_id == user.organization_id)
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)
    rows = (await session.execute(scoped)).all()

    open_count = 0
    open_value = Decimal("0")
    won_count = 0
    won_value = Decimal("0")
    month_start = _start_of_month_utc()

    for deal, stage in rows:
        if deal.closed_at is None:
            open_count += 1
            if deal.currency == org.currency:
                open_value += deal.value
        if (
            deal.closed_at is not None
            and deal.closed_at >= month_start
            and stage.stage_type is StageType.won
        ):
            won_count += 1
            if deal.currency == org.currency:
                won_value += deal.value

    return KpiSummary(
        currency=org.currency,
        open_deal_count=open_count,
        open_pipeline_value=open_value,
        won_this_month_count=won_count,
        won_this_month_value=won_value,
    )


async def _assert_team_visible(*, session: AsyncSession, user: User, team_id: uuid.UUID) -> Team:
    """Ensure the caller is allowed to drill into `team_id`.

    Admins always pass. Managers pass only for teams they manage.
    Salespeople would already be blocked by `require_leaderboard_visibility`
    on the routes that accept this filter, but we still scope to "their own
    team only" defensively in case the gate is opened.
    """
    team = await session.get(Team, team_id)
    if team is None or team.organization_id != user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if user.role is UserRole.admin:
        return team
    if user.role is UserRole.manager and team.manager_user_id == user.id:
        return team
    if user.role is UserRole.salesperson and user.team_id == team_id:
        return team
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")


@router.get("/leaderboard", response_model=Leaderboard)
async def leaderboard(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    team_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(require_leaderboard_visibility),
    session: AsyncSession = Depends(get_db),
) -> Leaderboard:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    if team_id is not None:
        await _assert_team_visible(session=session, user=user, team_id=team_id)

    stmt = (
        select(Deal, Stage, User)
        .join(Stage, Stage.id == Deal.stage_id)
        .join(User, User.id == Deal.owner_user_id, isouter=True)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.closed_at.is_not(None),
            Deal.closed_at >= start,
            Deal.closed_at <= end,
            Stage.stage_type == StageType.won,
        )
    )
    if team_id is not None:
        stmt = stmt.where(User.team_id == team_id)
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)

    @dataclasses.dataclass
    class _OwnerAgg:
        name: str = "—"
        count: int = 0
        value: Decimal = Decimal("0")

    totals: dict[uuid.UUID, _OwnerAgg] = defaultdict(_OwnerAgg)
    for deal, _stage, owner in (await session.execute(scoped)).all():
        if owner is None:
            continue
        bucket = totals[owner.id]
        bucket.name = owner.name
        bucket.count += 1
        if deal.currency == org.currency:
            bucket.value += deal.value

    rows = [
        LeaderboardRow(
            user_id=user_id,
            name=bucket.name,
            won_count=bucket.count,
            won_value=bucket.value,
        )
        for user_id, bucket in totals.items()
    ]
    rows.sort(key=lambda r: (r.won_value, r.won_count), reverse=True)
    return Leaderboard(
        currency=org.currency,
        from_date=resolved_from,
        to_date=resolved_to,
        rows=rows,
    )


@router.get("/loss-reasons", response_model=LossReasons)
async def loss_reasons(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> LossReasons:
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    stmt = select(Deal).where(
        Deal.organization_id == user.organization_id,
        Deal.closed_at.is_not(None),
        Deal.closed_at >= start,
        Deal.closed_at <= end,
        Deal.lost_reason.is_not(None),
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)

    @dataclasses.dataclass
    class _ReasonAgg:
        count: int = 0
        value: Decimal = Decimal("0")

    buckets: dict[str, _ReasonAgg] = defaultdict(_ReasonAgg)
    for deal in (await session.execute(scoped)).scalars():
        reason = deal.lost_reason or "Neuvedeno"
        buckets[reason].count += 1
        if deal.currency == org.currency:
            buckets[reason].value += deal.value
    rows = [
        LossReasonRow(lost_reason=reason, count=b.count, total_value=b.value)
        for reason, b in buckets.items()
    ]
    rows.sort(key=lambda r: (r.count, r.total_value), reverse=True)
    return LossReasons(
        currency=org.currency,
        from_date=resolved_from,
        to_date=resolved_to,
        rows=rows,
    )


@router.get("/pipeline-velocity", response_model=Velocity)
async def pipeline_velocity(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Velocity:
    """Average days from `created_at` to `closed_at` for deals that finished
    inside the window, grouped by the final stage. MVP proxy for "time in
    stage" — the activity-log-driven accurate version is a later task.
    """
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    stmt = (
        select(Deal, Stage)
        .join(Stage, Stage.id == Deal.stage_id)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.closed_at.is_not(None),
            Deal.closed_at >= start,
            Deal.closed_at <= end,
        )
    )
    scoped = await scope_by_owner(stmt, session=session, user=user, owner_col=Deal.owner_user_id)

    @dataclasses.dataclass
    class _StageAgg:
        stage_id: uuid.UUID | None = None
        name: str = ""
        sum_days: float = 0.0
        count: int = 0

    per_stage: dict[uuid.UUID, _StageAgg] = defaultdict(_StageAgg)
    for deal, stage in (await session.execute(scoped)).all():
        if deal.closed_at is None:
            continue
        # Defensive clamp: a corrupt/back-dated row where closed_at < created_at
        # would otherwise produce a negative cycle. We don't error — we floor at
        # zero so the chart still renders sensibly.
        days = max(0.0, (deal.closed_at - deal.created_at).total_seconds() / 86400.0)
        bucket = per_stage[stage.id]
        bucket.stage_id = stage.id
        bucket.name = stage.name
        bucket.sum_days += days
        bucket.count += 1

    stages = [
        VelocityByStage(
            stage_id=b.stage_id,  # type: ignore[arg-type]
            stage_name=b.name,
            avg_days_in_stage=(b.sum_days / b.count) if b.count else None,
            deal_count=b.count,
        )
        for b in per_stage.values()
    ]
    stages.sort(key=lambda v: v.stage_name)
    return Velocity(from_date=resolved_from, to_date=resolved_to, stages=stages)


# NOTE: export-csv used to live here. It now lives in `api/v1/data_export.py`
# and is mounted on a separate router so the trial gate doesn't apply —
# users must be able to walk away with their data even after their trial
# ends. See the module docstring there.


@router.get("/team-leaderboard", response_model=TeamLeaderboard)
async def team_leaderboard(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    metric: TeamMetric = Query(default=TeamMetric.won_value),
    user: User = Depends(require_leaderboard_visibility),
    session: AsyncSession = Depends(get_db),
) -> TeamLeaderboard:
    """Aggregate stats grouped by team for the date window.

    Every metric is computed on every row so the frontend can switch the
    chart's metric without re-fetching. `metric` only seeds the row sort.
    """
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    # Teams the caller may see. Admins see all teams in the org; managers
    # see only the teams they manage. Salespeople reach this point only
    # when the org has the leaderboard opened up — and even then we limit
    # them to their own team for consistency with the user-leaderboard.
    teams_stmt = select(Team).where(Team.organization_id == user.organization_id)
    if user.role is UserRole.manager:
        teams_stmt = teams_stmt.where(Team.manager_user_id == user.id)
    elif user.role is UserRole.salesperson:
        if user.team_id is None:
            return TeamLeaderboard(
                currency=org.currency,
                from_date=resolved_from,
                to_date=resolved_to,
                metric=metric,
                rows=[],
            )
        teams_stmt = teams_stmt.where(Team.id == user.team_id)
    teams = (await session.execute(teams_stmt)).scalars().all()
    team_ids = [t.id for t in teams]

    # Manager-name lookup. We resolve it from the User table so we don't
    # rely on a relationship being eagerly loaded.
    manager_ids = [t.manager_user_id for t in teams if t.manager_user_id is not None]
    manager_names: dict[uuid.UUID, str] = {}
    if manager_ids:
        manager_rows = (
            await session.execute(select(User.id, User.name).where(User.id.in_(manager_ids)))
        ).all()
        manager_names = {row[0]: row[1] for row in manager_rows}

    # Member counts per team.
    member_counts: dict[uuid.UUID, int] = dict.fromkeys(team_ids, 0)
    if team_ids:
        member_rows = (
            await session.execute(
                select(User.team_id).where(
                    User.organization_id == user.organization_id,
                    User.team_id.in_(team_ids),
                )
            )
        ).all()
        for (tid,) in member_rows:
            if tid in member_counts:
                member_counts[tid] += 1

    @dataclasses.dataclass
    class _TeamAgg:
        won_count: int = 0
        won_value: Decimal = Decimal("0")
        open_value: Decimal = Decimal("0")
        closed_count: int = 0  # won + lost (denominator for conversion_rate)
        cycle_days_sum: float = 0.0
        cycle_days_count: int = 0

    aggs: dict[uuid.UUID, _TeamAgg] = {tid: _TeamAgg() for tid in team_ids}
    if not team_ids:
        return TeamLeaderboard(
            currency=org.currency,
            from_date=resolved_from,
            to_date=resolved_to,
            metric=metric,
            rows=[],
        )

    # Closed deals in window — drives won_count/value, conversion, cycle.
    closed_stmt = (
        select(Deal, Stage, User.team_id)
        .join(Stage, Stage.id == Deal.stage_id)
        .join(User, User.id == Deal.owner_user_id)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.closed_at.is_not(None),
            Deal.closed_at >= start,
            Deal.closed_at <= end,
            User.team_id.in_(team_ids),
        )
    )
    closed_scoped = await scope_by_owner(
        closed_stmt, session=session, user=user, owner_col=Deal.owner_user_id
    )
    for deal, stage, tid in (await session.execute(closed_scoped)).all():
        bucket = aggs.get(tid)
        if bucket is None:
            continue
        # Per the brief, a lost deal stays in its current (open-type) stage
        # with `closed_at` and `lost_reason` set. So "closed in window" is
        # the conversion-rate denominator; only `won`-type stages count as
        # wins.
        bucket.closed_count += 1
        if stage.stage_type is StageType.won:
            bucket.won_count += 1
            if deal.currency == org.currency:
                bucket.won_value += deal.value
        # Defensive clamp: a corrupt/back-dated row where closed_at < created_at
        # would otherwise produce a negative cycle. We don't error — we floor at
        # zero so the chart still renders sensibly.
        days = max(0.0, (deal.closed_at - deal.created_at).total_seconds() / 86400.0)
        bucket.cycle_days_sum += days
        bucket.cycle_days_count += 1

    # Open pipeline value — deals not closed yet, owned by anyone in the team.
    open_stmt = (
        select(Deal, User.team_id)
        .join(User, User.id == Deal.owner_user_id)
        .where(
            Deal.organization_id == user.organization_id,
            Deal.closed_at.is_(None),
            User.team_id.in_(team_ids),
        )
    )
    open_scoped = await scope_by_owner(
        open_stmt, session=session, user=user, owner_col=Deal.owner_user_id
    )
    for deal, tid in (await session.execute(open_scoped)).all():
        bucket = aggs.get(tid)
        if bucket is None:
            continue
        if deal.currency == org.currency:
            bucket.open_value += deal.value

    rows: list[TeamLeaderboardRow] = []
    for team in teams:
        agg = aggs[team.id]
        rows.append(
            TeamLeaderboardRow(
                team_id=team.id,
                team_name=team.name,
                manager_user_id=team.manager_user_id,
                manager_name=(
                    manager_names.get(team.manager_user_id)
                    if team.manager_user_id is not None
                    else None
                ),
                member_count=member_counts.get(team.id, 0),
                won_count=agg.won_count,
                won_value=agg.won_value,
                open_pipeline_value=agg.open_value,
                conversion_rate=(agg.won_count / agg.closed_count if agg.closed_count else None),
                avg_cycle_days=(
                    agg.cycle_days_sum / agg.cycle_days_count if agg.cycle_days_count else None
                ),
            )
        )

    sort_key = {
        TeamMetric.won_value: lambda r: (r.won_value, r.won_count),
        TeamMetric.won_count: lambda r: (r.won_count, r.won_value),
        TeamMetric.open_pipeline_value: lambda r: (r.open_pipeline_value, r.won_value),
        TeamMetric.conversion_rate: lambda r: (
            r.conversion_rate if r.conversion_rate is not None else -1.0,
            r.won_value,
        ),
        # Faster cycle is better — sort ascending (so we negate for the
        # `reverse=True` below). Teams with no data sort to the bottom.
        TeamMetric.avg_cycle_days: lambda r: (
            -r.avg_cycle_days if r.avg_cycle_days is not None else float("-inf"),
            r.won_value,
        ),
    }[metric]
    rows.sort(key=sort_key, reverse=True)
    return TeamLeaderboard(
        currency=org.currency,
        from_date=resolved_from,
        to_date=resolved_to,
        metric=metric,
        rows=rows,
    )


@router.get("/my-summary", response_model=MySummary)
async def my_summary(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> MySummary:
    """Personal rollup for the caller across the date window.

    `companies_added` is the count of `Company` rows the caller owns whose
    `created_at` falls in the window — i.e. "leads I added to the pipeline".
    """
    org = await session.get(Organization, user.organization_id)
    if org is None:
        raise RuntimeError("current user points at a missing organization")
    resolved_from, resolved_to, start, end = _date_window(from_date, to_date)

    companies_added = (
        await session.execute(
            select(Company.id).where(
                Company.organization_id == user.organization_id,
                Company.owner_user_id == user.id,
                Company.created_at >= start,
                Company.created_at <= end,
            )
        )
    ).all()

    deals_rows = (
        await session.execute(
            select(Deal, Stage)
            .join(Stage, Stage.id == Deal.stage_id)
            .where(
                Deal.organization_id == user.organization_id,
                Deal.owner_user_id == user.id,
                Deal.closed_at.is_not(None),
                Deal.closed_at >= start,
                Deal.closed_at <= end,
            )
        )
    ).all()

    won_count = 0
    won_value = Decimal("0")
    closed_count = 0
    cycle_sum = 0.0
    cycle_count = 0
    for deal, stage in deals_rows:
        # Already filtered to closed_at IN window; per the brief, lost deals
        # stay in their current stage with closed_at + lost_reason set, so
        # every row here counts toward conversion's denominator.
        closed_count += 1
        if stage.stage_type is StageType.won:
            won_count += 1
            if deal.currency == org.currency:
                won_value += deal.value
        if deal.closed_at is not None:
            cycle_sum += max(0.0, (deal.closed_at - deal.created_at).total_seconds() / 86400.0)
            cycle_count += 1

    return MySummary(
        currency=org.currency,
        from_date=resolved_from,
        to_date=resolved_to,
        companies_added=len(companies_added),
        deals_won_count=won_count,
        deals_won_value=won_value,
        conversion_rate=(won_count / closed_count if closed_count else None),
        avg_cycle_days=(cycle_sum / cycle_count if cycle_count else None),
    )


# ---------------------------------------------------------------------------
# Configurable widget dashboard — layout persistence (R1)
# ---------------------------------------------------------------------------


def _serialize_dashboard_config(cfg: DashboardConfig) -> dict[str, object]:
    """Return the wire-format dict (camelCase aliases) the frontend expects.

    DashboardConfig uses Field aliases (`from`, `dateRange`, `teamId`,
    `ownerUserId`, `globalFilters`) so we always dump with by_alias=True.
    """

    return cfg.model_dump(by_alias=True, mode="json")


@router.get("/dashboard-config")
async def get_dashboard_config(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Return the user's persisted layout, or the 8-widget default.

    Empty `{}` (column-default for new rows) means "first visit — give
    them the starter set." We don't persist on first read; the frontend
    PUTs once the user makes a modification.
    """

    raw = user.reports_dashboard_config or {}
    if not raw:
        return _serialize_dashboard_config(default_dashboard_config())
    # Re-validate persisted JSON on read so a deploy that tightens a
    # widget config doesn't return stale-shaped data to the client.
    try:
        cfg = DashboardConfig.model_validate(raw)
    except ValidationError:
        # Fall back to defaults rather than blowing up the page. The
        # next PUT will overwrite the bad row.
        cfg = default_dashboard_config()
    return _serialize_dashboard_config(cfg)


@router.put("/dashboard-config")
async def put_dashboard_config(
    payload: DashboardConfig,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """Validate and persist the user's layout. Returns the round-tripped value."""

    user.reports_dashboard_config = payload.model_dump(by_alias=True, mode="json")
    await session.commit()
    return _serialize_dashboard_config(payload)


@router.delete("/dashboard-config", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard_config(
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Reset the user's layout to the default. The empty `{}` triggers the
    GET endpoint's default-layout fallback on the next read."""

    user.reports_dashboard_config = {}
    await session.commit()


class _ExportWidgetItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: str
    config: dict[str, object] = Field(default_factory=dict)


class _ExportCsvRequest(BaseModel):
    """Multi-widget CSV export body. Frontend sends the resolved
    `from`/`to` ISO date pair (it already does the preset → range
    resolution per widget request) plus the widget set + scope.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    widgets: list[_ExportWidgetItem]
    from_: date = Field(alias="from")
    to: date
    team_id: uuid.UUID | None = Field(default=None, alias="teamId")
    owner_user_id: uuid.UUID | None = Field(default=None, alias="ownerUserId")


@router.post("/export-csv")
async def export_widgets_csv(
    payload: _ExportCsvRequest,
    user: User = Depends(require_role(UserRole.manager)),
    session: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Render the visible widget set + filters as a single CSV.

    REPORTS_TASK §R7: one section per widget separated by a blank
    line and a header row, UTF-8 with BOM so Excel renders Czech
    diacritics. The legacy `GET /reports/export-csv` (deals data
    export, mounted in `data_export.py`) is intentionally a different
    endpoint — same path, distinct method.
    """

    if user.organization_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if payload.to < payload.from_:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="`to` must be on or after `from`",
        )
    # Reject filters outside the caller's team/rep visibility (review R1 P2) —
    # same guard the widget endpoints get at the router level.
    await assert_report_scope(
        session, user, team_id=payload.team_id, owner_user_id=payload.owner_user_id
    )

    body = await render_widget_csv(
        session,
        organization_id=user.organization_id,
        widgets=[w.model_dump() for w in payload.widgets],
        from_=payload.from_,
        to=payload.to,
        team_id=payload.team_id,
        owner_user_id=payload.owner_user_id,
    )

    today = datetime.now(tz=UTC).date().isoformat()
    filename = f"reporty-{today}.csv"
    return StreamingResponse(
        iter([body]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
