from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import SalesGoalMetric

if TYPE_CHECKING:
    from app.db.models.organization import Organization
    from app.db.models.user import User


class SalesGoal(Base):
    """One monthly target for one metric, for one salesperson or the org.

    Deliberately not a goals *engine*: a row is a number and a month. Actual
    progress is never stored — it is derived on read from the same "won this
    month" definition the `deals_won` report widget uses, so a goal can never
    disagree with the report it sits next to.

    `user_id IS NULL` means an org-wide goal (the whole company's number for
    that month); a non-null `user_id` scopes the target to that salesperson.
    """

    __tablename__ = "sales_goals"
    __table_args__ = (
        # One target per (scope, month, metric). The partial-unique problem
        # with NULL user_id is handled by the accompanying index below.
        UniqueConstraint(
            "organization_id",
            "user_id",
            "period_month",
            "metric",
            name="uq_sales_goals_scope_month_metric",
        ),
        Index("ix_sales_goals_organization_id", "organization_id"),
        Index("ix_sales_goals_period_month", "period_month"),
        # Postgres treats NULLs as distinct in a UNIQUE constraint, so the
        # constraint above would happily allow two org-wide goals for the same
        # month+metric. This partial index closes that hole.
        Index(
            "uq_sales_goals_orgwide_month_metric",
            "organization_id",
            "period_month",
            "metric",
            unique=True,
            postgresql_where=text("user_id IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # NULL = an org-wide goal. CASCADE on the user FK: removing a salesperson
    # removes the personal targets that only made sense for them.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )

    # Always the first day of the month the goal covers.
    period_month: Mapped[date] = mapped_column(Date, nullable=False)
    metric: Mapped[SalesGoalMetric] = mapped_column(
        Enum(
            SalesGoalMetric,
            name="sales_goal_metric",
            values_callable=lambda e: [v.value for v in e],
        ),
        nullable=False,
    )
    # Numeric for both metrics — `won_count` targets are whole numbers stored
    # in the same column rather than a second nullable integer field.
    target_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    organization: Mapped[Organization] = relationship()
    user: Mapped[User | None] = relationship(foreign_keys=[user_id])
