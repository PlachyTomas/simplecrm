# Task 5.1 — Pipeline board endpoint

`GET /api/v1/pipelines/default` returns the default pipeline + its stages.
`GET /api/v1/pipelines/default/board` returns the Kanban view: each stage
with `deal_count`, `total_value`, and the embedded deals (sorted by
created_at desc). Deals are filtered through `scope_by_owner`. Cross-
currency deals still appear in the list but only same-currency ones
contribute to the stage total.

Phase 5.5's filters (owner / date / value) will plumb into the same
endpoint as query params.
