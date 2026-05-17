# SimpleCRM

> CRM pro prodej. Nic víc, nic míň.

Minimalistický český CRM pro malé prodejní týmy (5–25 obchodníků). Cheaper and simpler
than Czech incumbents (RAYNET, eWay-CRM, Anabix) and more Czech-native than
international alternatives (Pipedrive, Zoho).

## Repository layout

```
simplecrm/
├── backend/            # FastAPI + SQLAlchemy + Alembic (Python 3.12)
├── frontend/           # React 18 + Vite + Tailwind + shadcn/ui
├── docs/
│   └── adr/            # Architectural Decision Records
├── .claude/
│   ├── skills/         # Concentrated best-practice skill files
│   └── tasks/          # Per-task specs written by Claude
├── .docker/            # Dev container Dockerfile + entrypoint
├── scripts/            # Dev helpers
├── docker-compose.dev.yml
├── docs/                   # All project documentation
└── README.md
```

## Further reading

- `docs/local-development.md` — get the stack running on your machine.
- `docs/runbook.md` — production deploy, backup, rollback.
- `docs/manager-task.md` — the complete product brief and implementation plan.
- `docs/dev-container.md` — how to run the isolated Claude Code dev container.
- `docs/adr/` — architectural decisions with rationale.
- `docs/work-log.md` — what has been built so far.
- `docs/ERD.md` — auto-generated entity-relationship diagram (Mermaid).
  Regenerate after schema changes:
  `uv run --project backend python scripts/generate_erd.py`

## Quick start via dev container

```bash
docker compose -f docker-compose.dev.yml up -d
# wait ~5 seconds for migrations + first boot, then open:
#   http://localhost:5173   (frontend)
#   http://localhost:8000/api/v1/docs   (Swagger)
```

The dev compose file ships with a **dev-auth bypass** enabled (no Google
OAuth needed). The login page shows a "Dev login" panel — type any email
and you're in as an admin. Details and safety rationale in
[`docs/local-development.md`](docs/local-development.md#8-dev-mode-auth-bypass).

## Status

Under active construction. See `docs/work-log.md` for current state.
