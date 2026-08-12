from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.deal import Deal
    from app.db.models.organization import Organization
    from app.db.models.user import User


class TodoList(Base):
    """One personal list of todos, iOS-Reminders style.

    Private to `user_id` — no endpoint ever returns another user's list,
    even inside the same org, and a foreign id answers 404 rather than
    403. `organization_id` rides along for tenant sweeps and export, not
    for access control.

    A list may point at a deal. That link **wins** over any per-todo link
    (see `Todo.deal_id`), so "this whole list is about deal X" is one
    switch instead of tagging every item.
    """

    __tablename__ = "todo_lists"
    __table_args__ = (
        Index("ix_todo_lists_user_id", "user_id"),
        Index("ix_todo_lists_deal_id", "deal_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # SET NULL, never CASCADE: a deleted deal must not take the user's
    # notes with it — the chip just disappears.
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("deals.id", ondelete="SET NULL"),
        nullable=True,
    )

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
    user: Mapped[User] = relationship()
    deal: Mapped[Deal | None] = relationship()
    todos: Mapped[list[Todo]] = relationship(
        back_populates="todo_list", cascade="all, delete-orphan"
    )


class Todo(Base):
    """A single line of text with a checkbox, owned through its list.

    `deal_id` is the per-todo link, used only while the parent list has
    none: `effective_deal = list.deal_id or todo.deal_id`. It is not
    erased when the list gains a link — merely overridden — so unlinking
    the list brings it back.

    `position` is the manual order inside a list (new todos append). No
    UI reorders todos yet; the column is what makes that a later UI-only
    change.
    """

    __tablename__ = "todos"
    __table_args__ = (
        Index("ix_todos_list_id", "list_id"),
        Index("ix_todos_deal_id", "deal_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    list_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("todo_lists.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(String(500), nullable=False)
    is_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("deals.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    todo_list: Mapped[TodoList] = relationship(back_populates="todos")
    deal: Mapped[Deal | None] = relationship()
