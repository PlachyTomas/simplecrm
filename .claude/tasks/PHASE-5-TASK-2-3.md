# Task 5.2 + 5.3 — Kanban + optimistic stage move

Backend adds `POST /api/v1/deals/{id}/move-stage` with a single-field
`{stage_id}` body. Stage validation reuses the cross-org helper from the
CRUD endpoints; visibility-first 404 for foreign deals; 400 for cross-org
stage references; writes an `Activity` row with
`from_stage_id`/`to_stage_id`.

Frontend Kanban sits at `/app/pipeline`:
- `usePipelineBoard` fetches `/pipelines/default/board`.
- `useMoveDealStage` is a TanStack Query mutation with optimistic
  `onMutate` (moves the card locally before the request) and rollback via
  `onError`.
- dnd-kit `DndContext` wraps the columns; `useDraggable` on cards,
  `useDroppable` on stage columns, `DragOverlay` renders the picked card.
- Empty board renders a Czech empty state pointing at the firms / quick
  actions.
