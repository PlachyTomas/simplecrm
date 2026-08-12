# Todo lists: dashboard widget + deal detail section

Personal, private todo lists on the home dashboard. Each widget shows one
list and switches between lists iOS-Reminders style; a todo (or a whole
list) can point at a deal, and the deal's detail page shows the viewer's
own todos for that deal.

## Goals

- A `todo_list` home-dashboard widget: text + checkbox items, add / tick /
  edit / delete inline.
- Multiple lists per user, switched from inside the widget; create,
  rename and delete lists there too.
- **Multiple todo widgets** on one dashboard, each remembering its own
  selected list.
- A todo may link to one deal; a whole list may link to one deal.
- The deal detail page shows the viewer's own todos reaching that deal,
  with an add input and working checkboxes.

## Non-goals (explicitly out)

- Due dates, reminders, notifications.
- Subtasks / nesting.
- Drag-reordering todos inside a list (`position` exists in the schema so
  a later pass is a UI change only).
- Sharing a list with teammates, or any cross-user visibility.
- Todos on companies or contacts.
- A standalone `/todos` page — the widget and the deal section are the
  whole surface.

## Ownership and privacy

Lists are **personal and private**: `todo_lists.user_id` is the sole
owner, and no endpoint ever returns another user's list or todo. A row
belonging to someone else answers **404, never 403** — the house rule
(`api/v1/event_labels.py`): don't confirm that an id exists outside your
scope. `organization_id` rides along on `todo_lists` for tenant sweeps
and export/erasure, not for access control.

This holds on the deal page too. `GET /deals/{id}/todos` filters by
`todo_lists.user_id == caller`, so opening a colleague's deal never
reveals their notes. Deals have one owner in practice, so the owner sees
a complete picture of their own work.

## Data model

Two new tables, one migration.

### `todo_lists`

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `organization_id` | UUID FK `organizations` ON DELETE CASCADE | tenancy only |
| `user_id` | UUID FK `users` ON DELETE CASCADE | the private owner |
| `name` | `String(80)` NOT NULL | duplicates allowed (iOS does) |
| `deal_id` | UUID FK `deals` ON DELETE **SET NULL**, nullable | whole-list link |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `ix_todo_lists_user_id`, `ix_todo_lists_deal_id`.
Switcher order: `created_at ASC` — the order you made them.

### `todos`

| column | type | notes |
|---|---|---|
| `id` | UUID pk | |
| `list_id` | UUID FK `todo_lists` ON DELETE CASCADE | |
| `text` | `String(500)` NOT NULL | trimmed, non-empty |
| `is_done` | bool NOT NULL default false | |
| `position` | int NOT NULL | append order; ties broken by `created_at` |
| `deal_id` | UUID FK `deals` ON DELETE **SET NULL**, nullable | per-todo link |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `ix_todos_list_id`, `ix_todos_deal_id`.

**`SET NULL`, not cascade, on both deal FKs.** A todo is a personal note;
deleting a deal must not silently delete the user's text. The chip simply
disappears.

### Effective deal — the one rule

```
effective_deal(todo) = todo.list.deal_id or todo.deal_id
```

A deal-linked list wins over the per-todo link. While a list carries a
deal, the per-todo link control is **disabled with a tooltip** saying the
list already links to that deal. An existing `todos.deal_id` is *not*
erased when its list gains a link — it is overridden while the list link
stands, and takes effect again if the list is unlinked. The server
enforces this: `PATCH /todos/{id}` with a `dealId` while the parent list
is deal-linked → **422**. The UI never sends it; this is the backstop.

## API

New router `backend/app/api/v1/todos.py`, mounted behind `PROTECTED_DEPS`.
Schemas in `backend/app/schemas/todo.py`, camelCase via `Field(alias=...)`.

### Lists

| method | path | body / notes |
|---|---|---|
| GET | `/todo-lists` | my lists, `created_at ASC`. Each: `id`, `name`, `dealId`, `dealName`, `openCount` (one grouped COUNT for the page — never per-row queries) |
| POST | `/todo-lists` | `{name, dealId?}` → 201 |
| PATCH | `/todo-lists/{id}` | `{name?, dealId?}`; explicit `null` clears the deal link |
| DELETE | `/todo-lists/{id}` | 204, cascades its todos |

### Todos

| method | path | body / notes |
|---|---|---|
| GET | `/todo-lists/{id}/todos` | ordered `is_done ASC, position ASC` |
| POST | `/todo-lists/{id}/todos` | `{text, dealId?}` → appended (`position = max+1`) |
| PATCH | `/todos/{id}` | `{text?, isDone?, dealId?}`; `dealId` while the list is linked → 422 |
| DELETE | `/todos/{id}` | 204 |

### Deal-scoped

| method | path | notes |
|---|---|---|
| GET | `/deals/{deal_id}/todos` | my todos reaching this deal by **either** path: `list.deal_id = :deal OR (list.deal_id IS NULL AND todo.deal_id = :deal)`. Each carries its `listName` |
| POST | `/deals/{deal_id}/todos` | `{text}` → resolves my default list (oldest; **creates one** if I have none) and stamps `todos.deal_id`. One round trip, no client orchestration |

The auto-created default list is named by the org's locale, following
`services/event_labels.default_event_label_seeds`: `cs*` → "Úkoly",
anything else (including a missing locale) → "To-do". It is an ordinary
row — renameable and deletable like any other.

Both live in the todos router, keyed by deal id. A deal outside the
caller's org answers 404.

## Widget

### Config

```python
class TodoListConfig(WidgetConfigBase):
    type: Literal["todo_list"] = "todo_list"
    list_id: str | None = None
```

Snake_case on the wire, like its sibling `date_preset` (and unlike
`mobileOrder`, the one aliased field on the config blob) — the frontend
reads `config.list_id`.

Added to the **home union only** (`schemas/home_dashboard.py`). It is
home-native, so the Reports union stays untouched — the widget never
appears in the Reports picker and there is no 422 trap. `list_id` is a
plain `str | None` (a client-written UUID string, validated by lookup at
read time, not by type).

### Duplicability

`isUnique()` in `homeWidgetCatalog.ts` currently returns
`isHomeNativeType(type)`, which would lock the widget after one. It gets
an explicit `todo_list` exception so the picker never locks it — that is
precisely what allows multiple todo widgets, each with its own
`list_id`.

Catalog wiring: entry in the "overview" picker group, icon
(`ListChecks`), label + description in cs & en, and dispatch in
`HomeWidgetByType`. Size: a `todo_list` branch in
`defaultHomeWidgetSize` returning `{ w: 4, h: 4 }` — narrower than the
velocity list (`w: 6`), tall enough for ~6 rows plus the add input.

### Persisting the selected list outside edit mode

Per-widget config today flows only through the edit draft
(`handlePresetChange` → `setDraft`), so a naive implementation would
require entering edit mode to switch lists — wrong for a control the user
touches constantly.

`DashboardPage` gains one handler:

```
handleListSelect(widgetId, listId):
  isEditMode ? setDraft(withListId(working, widgetId, listId))
             : save.mutateAsync(withListId(config.data, widgetId, listId))
```

The shared `useDashboardEditor` contract is unchanged. `withListId` is a
pure helper in `homeLayout.ts`, unit-tested.

### Behaviour

- **Header**: the list name is a button with a chevron, opening a
  switcher popover (house modal pattern via `useModalDialog`, bottom
  sheet on mobile): my lists with open counts, a checkmark on the
  current one, a "New list…" row, and rename / link-to-deal / delete for
  the current list.
- **Body**: an add-a-todo input (Enter submits, stays focused for the
  next one), then rows of checkbox + text + optional deal chip.
- **Deal chips truncate** and carry the full deal name as a native
  `title` tooltip, since deal names outrun a small chip.
- **Completed items sink** to the bottom, struck through and muted.
- Clicking a todo's text edits it inline (Enter saves, Escape reverts).
- Per-todo deal link: a small button opening a deal picker. `GET
  /api/v1/deals` has **no search param** — fetch one page (limit 100) and
  filter client-side, like the other pickers. Disabled with a tooltip
  when the list is deal-linked.
- **Empty / stale states**: a `list_id` naming a deleted list falls back
  to the first list without rewriting config; no lists at all renders a
  create-your-first-list empty state.

## Deal detail

`frontend/src/app/deals/DealTodosSection.tsx`, mirroring
`DealEventsSection` and mounted next to it in `DealDetail.tsx`
(~line 524). A heading, a one-line add input (`POST
/deals/{id}/todos`), then my deal-reaching todos with working
checkboxes, each showing its list name muted at the end of the row.
Empty state when I have none. Scoped to my own todos per the privacy
rule above.

## i18n

A new `todos` namespace, `frontend/src/locales/{cs,en}/todos.json`,
registered in `locales/cs/index.ts` (and the en index). Every string in
both catalogs, cs (vykání) as reference; `pnpm i18n:check` must pass.
The widget's picker label/description live in the `dashboard` namespace
alongside the other home-native widgets, matching how the existing
catalog resolves labels.

Every interactive element gets an id in `lib/testids.ts`: widget root,
list switcher trigger, switcher rows, new-list row, add input, todo row,
checkbox, deal chip, deal-link button, delete button, and the deal
section's add input and rows.

## Testing

**Backend** (`backend/tests/api/v1/test_todos.py`):

- CRUD happy paths for lists and todos.
- Another user's list / todo → 404 on GET, PATCH, DELETE (not 403).
- `PATCH /todos/{id}` with `dealId` while the parent list is deal-linked
  → 422.
- `GET /deals/{id}/todos` returns todos reached by *both* paths, excludes
  todos whose list link points elsewhere, and excludes another user's
  todos entirely.
- `POST /deals/{id}/todos` with no lists creates the default list; with
  lists, appends to the oldest.
- Deleting a deal leaves its todos alive with `deal_id IS NULL`.
- Deleting a list cascades its todos.
- `openCount` is correct and computed in one query.

**Frontend** (vitest):

- `effectiveDealId` helper: list link wins, todo link used only when the
  list has none.
- `withListId` helper: sets the id on the right widget only, leaves other
  widgets' configs untouched.
- Home config union accepts `todo_list` with and without `listId`.
- Widget rendered on the **mobile path** (<768px) — jsdom has no
  `ResizeObserver`, so react-grid-layout cannot render in tests.

## Verification

The owner verifies the UI manually (no screenshot loop). Routes to click:
`/` (dashboard — add the widget, add a second one, switch lists, link a
deal) and any deal detail page (todo section). The browser console is
checked for errors as part of the work.
