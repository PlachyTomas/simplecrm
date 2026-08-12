"""Personal todo lists (`/api/v1/todo-lists`, `/api/v1/todos`) and the
deal-scoped views (`/api/v1/deals/{deal_id}/todos`).

Lists are **private to their creator**, not shared org vocabulary: every
query filters on `TodoList.user_id == caller`, so a teammate opening your
deal never reads your notes. A row owned by someone else answers 404, not
403 — the house rule: don't confirm that an id exists outside your scope.

One rule runs through the whole module: **the list's deal link wins.**
`effective_deal = list.deal_id or todo.deal_id`, which is why the
deal-scoped query has two arms and why setting a per-todo link inside a
deal-linked list is a 422 instead of dead config.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import get_current_user
from app.db import get_db
from app.db.models import Deal, Todo, TodoList, User
from app.schemas.todo import (
    DealTodoCreate,
    TodoCreate,
    TodoListCreate,
    TodoListOut,
    TodoListUpdate,
    TodoOut,
    TodoUpdate,
)

router = APIRouter(tags=["todos"])

# The auto-created list behind `POST /deals/{id}/todos` for a user who has
# none yet. Named by org locale, mirroring
# `services/event_labels.default_event_label_seeds`.
_DEFAULT_LIST_NAME_CS = "Úkoly"
_DEFAULT_LIST_NAME_EN = "To-do"

_LIST_DEAL_LINKED = "Seznam už je propojený s obchodem; úkol propojení dědí."


def _default_list_name(locale: str | None) -> str:
    return (
        _DEFAULT_LIST_NAME_CS if (locale or "").lower().startswith("cs") else _DEFAULT_LIST_NAME_EN
    )


async def _get_owned_list(session: AsyncSession, user: User, list_id: uuid.UUID) -> TodoList:
    """The caller's list, or 404. Another user's id is indistinguishable
    from a missing one, by design."""
    row = (
        await session.execute(
            select(TodoList)
            .options(joinedload(TodoList.deal))
            .where(TodoList.id == list_id, TodoList.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo list not found")
    return row


async def _get_owned_todo(session: AsyncSession, user: User, todo_id: uuid.UUID) -> Todo:
    """The caller's todo — ownership runs through the parent list."""
    row = (
        await session.execute(
            select(Todo)
            .join(TodoList, Todo.list_id == TodoList.id)
            .options(joinedload(Todo.todo_list).joinedload(TodoList.deal), joinedload(Todo.deal))
            .where(Todo.id == todo_id, TodoList.user_id == user.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    return row


async def _resolve_deal(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    """A deal in the caller's org, or 400 — matching how calendar events
    reject a foreign `deal_id` on write."""
    deal = (
        await session.execute(
            select(Deal).where(Deal.id == deal_id, Deal.organization_id == user.organization_id)
        )
    ).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deal not found")
    return deal


async def _open_counts(session: AsyncSession, list_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """One grouped COUNT for the whole page — never a per-row query."""
    if not list_ids:
        return {}
    rows = (
        await session.execute(
            select(Todo.list_id, func.count())
            .where(Todo.list_id.in_(list_ids), Todo.is_done.is_(False))
            .group_by(Todo.list_id)
        )
    ).all()
    return {row[0]: row[1] for row in rows}


def _list_out(row: TodoList, open_count: int) -> TodoListOut:
    return TodoListOut(
        id=row.id,
        name=row.name,
        deal_id=row.deal_id,
        deal_name=row.deal.name if row.deal else None,
        open_count=open_count,
        created_at=row.created_at,
    )


def _todo_out(row: Todo) -> TodoOut:
    return TodoOut(
        id=row.id,
        list_id=row.list_id,
        list_name=row.todo_list.name,
        text=row.text,
        is_done=row.is_done,
        position=row.position,
        deal_id=row.deal_id,
        deal_name=row.deal.name if row.deal else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _todos_query() -> Select[tuple[Todo]]:
    """Todos with the joins `_todo_out` needs, in display order: open
    first, then by manual position."""
    return (
        select(Todo)
        .join(TodoList, Todo.list_id == TodoList.id)
        .options(joinedload(Todo.todo_list), joinedload(Todo.deal))
        .order_by(Todo.is_done, Todo.position, Todo.created_at)
    )


async def _next_position(session: AsyncSession, list_id: uuid.UUID) -> int:
    last = (
        await session.execute(select(func.max(Todo.position)).where(Todo.list_id == list_id))
    ).scalar()
    return 0 if last is None else last + 1


# lists ---------------------------------------------------------------------


@router.get("/todo-lists", response_model=list[TodoListOut])
async def list_todo_lists(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[TodoListOut]:
    """My lists, oldest first — the order they appear in the switcher.
    Not paginated: this is a picker, not a data set."""
    rows = (
        (
            await session.execute(
                select(TodoList)
                .options(joinedload(TodoList.deal))
                .where(TodoList.user_id == user.id)
                .order_by(TodoList.created_at, TodoList.id)
            )
        )
        .scalars()
        .all()
    )
    counts = await _open_counts(session, [row.id for row in rows])
    return [_list_out(row, counts.get(row.id, 0)) for row in rows]


@router.post("/todo-lists", response_model=TodoListOut, status_code=status.HTTP_201_CREATED)
async def create_todo_list(
    payload: TodoListCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TodoListOut:
    deal = await _resolve_deal(session, user, payload.deal_id) if payload.deal_id else None
    row = TodoList(
        organization_id=user.organization_id,
        user_id=user.id,
        name=payload.name,
        deal_id=deal.id if deal else None,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    row.deal = deal
    return _list_out(row, 0)


@router.patch("/todo-lists/{list_id}", response_model=TodoListOut)
async def update_todo_list(
    list_id: uuid.UUID,
    payload: TodoListUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TodoListOut:
    row = await _get_owned_list(session, user, list_id)
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] is not None:
        row.name = fields["name"]
    if "deal_id" in fields:
        # Tri-state: absent leaves the link alone, explicit null clears it.
        deal = await _resolve_deal(session, user, fields["deal_id"]) if fields["deal_id"] else None
        row.deal_id = deal.id if deal else None
        row.deal = deal
    await session.commit()
    await session.refresh(row, attribute_names=["name", "deal_id", "updated_at"])
    counts = await _open_counts(session, [row.id])
    return _list_out(row, counts.get(row.id, 0))


@router.delete("/todo-lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo_list(
    list_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    row = await _get_owned_list(session, user, list_id)
    await session.delete(row)
    await session.commit()


# todos ---------------------------------------------------------------------


@router.get("/todo-lists/{list_id}/todos", response_model=list[TodoOut])
async def list_todos(
    list_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[TodoOut]:
    await _get_owned_list(session, user, list_id)
    rows = (await session.execute(_todos_query().where(Todo.list_id == list_id))).scalars().all()
    return [_todo_out(row) for row in rows]


@router.post(
    "/todo-lists/{list_id}/todos", response_model=TodoOut, status_code=status.HTTP_201_CREATED
)
async def create_todo(
    list_id: uuid.UUID,
    payload: TodoCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TodoOut:
    todo_list = await _get_owned_list(session, user, list_id)
    if payload.deal_id and todo_list.deal_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=_LIST_DEAL_LINKED
        )
    deal = await _resolve_deal(session, user, payload.deal_id) if payload.deal_id else None
    row = Todo(
        list_id=todo_list.id,
        text=payload.text,
        position=await _next_position(session, todo_list.id),
        deal_id=deal.id if deal else None,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    row.todo_list = todo_list
    row.deal = deal
    return _todo_out(row)


@router.patch("/todos/{todo_id}", response_model=TodoOut)
async def update_todo(
    todo_id: uuid.UUID,
    payload: TodoUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TodoOut:
    row = await _get_owned_todo(session, user, todo_id)
    fields = payload.model_dump(exclude_unset=True)
    if "text" in fields and fields["text"] is not None:
        row.text = fields["text"]
    if "is_done" in fields and fields["is_done"] is not None:
        row.is_done = fields["is_done"]
    if "deal_id" in fields:
        # The list's link wins, so a per-todo one here would never show.
        # The UI disables the control; this is the backstop.
        if row.todo_list.deal_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=_LIST_DEAL_LINKED
            )
        deal = await _resolve_deal(session, user, fields["deal_id"]) if fields["deal_id"] else None
        row.deal_id = deal.id if deal else None
        row.deal = deal
    await session.commit()
    await session.refresh(row, attribute_names=["text", "is_done", "deal_id", "updated_at"])
    return _todo_out(row)


@router.delete("/todos/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    row = await _get_owned_todo(session, user, todo_id)
    await session.delete(row)
    await session.commit()


# deal-scoped ---------------------------------------------------------------


async def _deal_or_404(session: AsyncSession, user: User, deal_id: uuid.UUID) -> Deal:
    deal = (
        await session.execute(
            select(Deal).where(Deal.id == deal_id, Deal.organization_id == user.organization_id)
        )
    ).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deal not found")
    return deal


@router.get("/deals/{deal_id}/todos", response_model=list[TodoOut])
async def list_deal_todos(
    deal_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[TodoOut]:
    """My todos reaching this deal, by either link path.

    Scoped to the caller's own lists: deal detail is a shared page, but
    personal todos stay personal.
    """
    await _deal_or_404(session, user, deal_id)
    rows = (
        (
            await session.execute(
                _todos_query().where(
                    TodoList.user_id == user.id,
                    or_(
                        TodoList.deal_id == deal_id,
                        and_(TodoList.deal_id.is_(None), Todo.deal_id == deal_id),
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    return [_todo_out(row) for row in rows]


@router.post("/deals/{deal_id}/todos", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
async def create_deal_todo(
    deal_id: uuid.UUID,
    payload: DealTodoCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TodoOut:
    """Add a todo from the deal page: resolve my default list (the oldest,
    creating one if I have none) and stamp the deal link. One round trip,
    so the client never orchestrates create-list-then-create-todo."""
    deal = await _deal_or_404(session, user, deal_id)
    todo_list = (
        await session.execute(
            select(TodoList)
            .where(TodoList.user_id == user.id)
            .order_by(TodoList.created_at, TodoList.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if todo_list is None:
        await session.refresh(user, attribute_names=["organization"])
        todo_list = TodoList(
            organization_id=user.organization_id,
            user_id=user.id,
            name=_default_list_name(user.organization.locale if user.organization else None),
        )
        session.add(todo_list)
        await session.flush()

    # A deal-linked list already carries the link; leave the todo's own
    # `deal_id` null so the inheritance rule stays the single source.
    inherits = todo_list.deal_id is not None
    row = Todo(
        list_id=todo_list.id,
        text=payload.text,
        position=await _next_position(session, todo_list.id),
        deal_id=None if inherits else deal.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    row.todo_list = todo_list
    row.deal = None if inherits else deal
    return _todo_out(row)
