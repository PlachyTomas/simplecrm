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
├── MANAGER_TASK.md     # The full build brief
├── WORK_LOG.md         # Persistent session-by-session log
└── README.md
```

## Further reading

- `MANAGER_TASK.md` — the complete product brief and implementation plan.
- `README-dev-env.md` — how to run the isolated dev container.
- `docs/adr/` — architectural decisions with rationale.
- `WORK_LOG.md` — what has been built so far.

## Status

Under active construction. See `WORK_LOG.md` for current state.
