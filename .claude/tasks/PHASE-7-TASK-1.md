# Task 7.1 — Team CRUD endpoints

`GET/POST /api/v1/teams` for listing (any auth'd user in the org) and
creating (admin-only). `PUT /teams/:id` and `PUT /teams/:id/members`
accept either admin or the team's own manager — everyone else gets 403.
`DELETE /teams/:id` is admin-only and clears members' `team_id` before
dropping the row. Cross-org user references in member lists / manager
slot 400.

Phase 7's invite flow (7.2), team-management UI (7.3), user-management
UI (7.4), and billing card (7.5) deferred to a later session.
